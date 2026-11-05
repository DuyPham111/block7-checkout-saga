'use strict';
// ORDER SERVICE — process riêng, DB riêng (data/order.db).
// Sở hữu: đơn hàng + Saga record + nhật ký bước. Orchestrator chạy trong process này.
const path = require('node:path');
const { PORTS, HOST, DATA_DIR, URLS } = require('../../config');
const { openDb, tx, now } = require('../../common/db');
const { makeLogger } = require('../../common/log');
const { createFaults } = require('../../common/faults');
const { createApp, finishApp } = require('../../common/app');
const { call } = require('../../common/http');
const { createOrchestrator } = require('./orchestrator');
const { TERMINAL } = require('./machine');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS orders (
  seq          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     TEXT NOT NULL UNIQUE,
  customer_id  TEXT NOT NULL,
  sku          TEXT NOT NULL,
  item_name    TEXT NOT NULL,
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  unit_price   INTEGER NOT NULL,
  amount       INTEGER NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('PENDING','RESERVED','CHARGED','CONFIRMED','RECOVERING','COMPENSATING','CANCELLED')),
  reason       TEXT,
  scenario     TEXT,
  create_op_id TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sagas (
  saga_id          TEXT PRIMARY KEY,
  order_id         TEXT NOT NULL UNIQUE REFERENCES orders(order_id),
  phase            TEXT NOT NULL,
  intent_step      TEXT,
  intent_op_id     TEXT,
  reservation_id   TEXT,
  charge_id        TEXT,
  failed_charge_id TEXT,
  refund_id        TEXT,
  pending_json     TEXT NOT NULL DEFAULT '[]',
  last_error       TEXT,
  attempts         INTEGER NOT NULL DEFAULT 0,
  next_attempt_at  TEXT,
  updated_at       TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS saga_steps (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  saga_id     TEXT NOT NULL,
  order_id    TEXT NOT NULL,
  at          TEXT NOT NULL,
  kind        TEXT NOT NULL,
  step        TEXT,
  op_id       TEXT,
  from_status TEXT,
  to_status   TEXT,
  detail      TEXT,
  pid         INTEGER
);`;

const log = makeLogger('order');
const faults = createFaults();
const db = openDb(path.join(DATA_DIR, 'order.db'), SCHEMA);

const clients = {
  inventory: (method, p, body) => call(method, URLS.inventory + p, body),
  payment: (method, p, body) => call(method, URLS.payment + p, body),
};
const orch = createOrchestrator({ db, log, faults, clients });

function wipe() {
  tx(db, () => {
    for (const t of ['saga_steps', 'sagas', 'orders']) db.prepare(`DELETE FROM ${t}`).run();
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('orders','saga_steps')").run();
  });
}

const app = createApp('order', { faults, log, onReset: () => orch.reset(wipe) });

const sagaView = (r) => ({
  saga_id: r.saga_id,
  status: r.status,
  phase: r.phase,
  intent: r.intent_step ? { step: r.intent_step, op_id: r.intent_op_id } : null,
  pending: JSON.parse(r.pending_json),
  reservation_id: r.reservation_id,
  charge_id: r.charge_id,
  failed_charge_id: r.failed_charge_id,
  refund_id: r.refund_id,
  last_error: r.last_error,
  attempts: r.attempts,
  next_attempt_at: r.next_attempt_at,
});
const orderView = (r) => ({
  order_id: r.order_id,
  customer_id: r.customer_id,
  sku: r.sku,
  item_name: r.item_name,
  quantity: r.quantity,
  unit_price: r.unit_price,
  amount: r.amount,
  status: r.status,
  terminal: TERMINAL.has(r.status),
  reason: r.reason,
  scenario: r.scenario,
  created_at: r.created_at,
  updated_at: r.updated_at,
  saga: sagaView(r),
});
const SELECT_JOINED = 'SELECT o.*, s.* , o.updated_at AS updated_at FROM orders o JOIN sagas s ON s.order_id = o.order_id';

// ---------- khách đặt hàng: bắt đầu Saga ----------
app.post('/orders', async (req, res, next) => {
  try {
    const { customer_id, sku, scenario } = req.body || {};
    const quantity = req.body && req.body.quantity !== undefined ? Number(req.body.quantity) : 1;
    if (!customer_id || !sku || !Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'cần customer_id, sku, quantity (>0)' });
    }
    const createOp = req.body.create_op_id;
    if (createOp) {
      const ex = db.prepare('SELECT o.order_id, s.saga_id, o.status FROM orders o JOIN sagas s ON s.order_id=o.order_id WHERE create_op_id = ?').get(createOp);
      if (ex) return res.status(200).json({ ...ex, replayed: true }); // retry tạo đơn cùng create_op_id => đơn cũ
    }
    // Đọc giá từ Inventory (chỉ đọc catalog, chưa phải bước Saga)
    const item = await call('GET', `${URLS.inventory}/inventory/items/${encodeURIComponent(sku)}`);
    if (item.status === 404) return res.status(400).json({ error: 'SKU_NOT_FOUND' });
    if (!item.ok) return res.status(503).json({ error: 'INVENTORY_UNAVAILABLE', message: 'Không đọc được giá sản phẩm từ Inventory' });

    const created = tx(db, () => {
      const n = db.prepare('SELECT COALESCE(MAX(seq),0)+1 n FROM orders').get().n;
      const order_id = `O${n}`;
      const saga_id = `S${n}`;
      const t = now();
      const amount = item.data.price * quantity;
      db.prepare(
        `INSERT INTO orders(order_id,customer_id,sku,item_name,quantity,unit_price,amount,status,scenario,create_op_id,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,'PENDING',?,?,?,?)`
      ).run(order_id, customer_id, sku, item.data.name, quantity, item.data.price, amount, scenario || null, createOp || `${saga_id}:create`, t, t);
      // Đơn và Saga record được tạo trong CÙNG một local transaction.
      db.prepare("INSERT INTO sagas(saga_id,order_id,phase,pending_json,updated_at) VALUES (?,?,'reserve','[]',?)").run(saga_id, order_id, t);
      db.prepare(
        "INSERT INTO saga_steps(saga_id,order_id,at,kind,step,op_id,to_status,detail,pid) VALUES (?,?,?,'CREATE','create',?,'PENDING',?,?)"
      ).run(saga_id, order_id, t, `${saga_id}:create`, `Tạo đơn ${order_id} (${quantity} × ${item.data.name}, ${amount.toLocaleString('vi-VN')}đ) + Saga record ${saga_id} trong 1 transaction`, process.pid);
      return { order_id, saga_id, status: 'PENDING', amount };
    });
    log.info('ORDER_CREATED', { ...created, customer_id, sku, quantity, scenario });
    res.status(202).json(created);
    setImmediate(() => orch.runSaga(created.saga_id)); // Saga chạy nền; UI theo dõi bằng polling
  } catch (e) {
    next(e);
  }
});

// ---------- đọc ----------
app.get('/orders', (req, res) => {
  const { customer_id, group, scenario } = req.query;
  const where = [];
  const args = [];
  if (customer_id) where.push('o.customer_id = ?') && args.push(customer_id);
  if (scenario) where.push('o.scenario = ?') && args.push(scenario);
  if (group === 'success') where.push("o.status = 'CONFIRMED'");
  if (group === 'cancelled') where.push("o.status = 'CANCELLED'");
  if (group === 'active') where.push("o.status NOT IN ('CONFIRMED','CANCELLED')");
  const sql = `${SELECT_JOINED} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY o.seq DESC LIMIT 200`;
  const rows = db.prepare(sql).all(...args);
  const counts = db.prepare('SELECT status, COUNT(*) n FROM orders GROUP BY status').all();
  res.json({ orders: rows.map(orderView), counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) });
});
app.get('/orders/:id', (req, res) => {
  const r = db.prepare(`${SELECT_JOINED} WHERE o.order_id = ?`).get(req.params.id);
  if (!r) return res.status(404).json({ error: 'ORDER_NOT_FOUND' });
  res.json(orderView(r));
});
app.get('/orders/:id/saga', (req, res) => {
  const r = db.prepare(`${SELECT_JOINED} WHERE o.order_id = ?`).get(req.params.id);
  if (!r) return res.status(404).json({ error: 'ORDER_NOT_FOUND' });
  const steps = db.prepare('SELECT * FROM saga_steps WHERE order_id = ? ORDER BY seq').all(r.order_id);
  res.json({ ...orderView(r), steps });
});
app.get('/sagas', (req, res) => {
  const rows = db.prepare(`${SELECT_JOINED} WHERE o.status NOT IN ('CONFIRMED','CANCELLED') ORDER BY o.seq`).all();
  res.json({ sagas: rows.map(orderView) });
});

// ---------- tiếp tục theo saga_id (đọc durable record, không tạo checkout mới) ----------
app.post('/sagas/:saga_id/resume', (req, res) => {
  const s = orch.resume(req.params.saga_id);
  if (!s) return res.status(404).json({ error: 'SAGA_NOT_FOUND' });
  res.json({ saga_id: s.saga_id, order_id: s.order_id, status: s.status, intent: s.intent, pending: s.pending });
});

finishApp(app, log);
app.listen(PORTS.order, HOST, () => {
  log.info('LISTEN', { url: `http://${HOST}:${PORTS.order}` });
  orch.start(); // đọc Saga record chưa xong và tiếp tục (F6)
});
