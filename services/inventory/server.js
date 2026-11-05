'use strict';
// INVENTORY SERVICE — process riêng, DB riêng (data/inventory.db).
// Sở hữu: sản phẩm + tồn kho, reservation (giữ hàng theo đơn), lịch sử vào/ra kho.
const path = require('node:path');
const { PORTS, HOST, DATA_DIR } = require('../../config');
const { openDb, tx, now } = require('../../common/db');
const { makeLogger } = require('../../common/log');
const { createFaults } = require('../../common/faults');
const { createApp, finishApp } = require('../../common/app');
const { OPS_SCHEMA, OpError, findReplay, recordOp, getOp } = require('../../common/ops');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS items (
  sku       TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  price     INTEGER NOT NULL CHECK (price > 0),
  available INTEGER NOT NULL CHECK (available >= 0)
);
CREATE TABLE IF NOT EXISTS reservations (
  seq            INTEGER PRIMARY KEY AUTOINCREMENT,
  reservation_id TEXT NOT NULL UNIQUE,
  order_id       TEXT NOT NULL,
  sku            TEXT NOT NULL REFERENCES items(sku),
  quantity       INTEGER NOT NULL CHECK (quantity > 0),
  status         TEXT NOT NULL CHECK (status IN ('ACTIVE','RELEASED')),
  reserve_op_id  TEXT NOT NULL UNIQUE,
  release_op_id  TEXT UNIQUE,
  created_at     TEXT NOT NULL,
  released_at    TEXT
);
CREATE TABLE IF NOT EXISTS movements (
  seq             INTEGER PRIMARY KEY AUTOINCREMENT,
  sku             TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('RESTOCK','RESERVE','RELEASE')),
  quantity        INTEGER NOT NULL,
  available_after INTEGER NOT NULL,
  order_id        TEXT,
  reservation_id  TEXT,
  note            TEXT,
  at              TEXT NOT NULL
);
${OPS_SCHEMA}`;

const SEED_ITEMS = [
  ['SKU-TAINGHE', 'Tai nghe Bluetooth', 350000, 10],
  ['SKU-BANPHIM', 'Bàn phím cơ', 900000, 5],
  ['SKU-CHUOT', 'Chuột không dây', 200000, 3],
  ['SKU-LOA', 'Loa mini', 500000, 0], // hết hàng sẵn => F1 tự nhiên
];

const log = makeLogger('inventory');
const faults = createFaults();
const db = openDb(path.join(DATA_DIR, 'inventory.db'), SCHEMA);

function seed() {
  tx(db, () => {
    for (const [sku, name, price, qty] of SEED_ITEMS) {
      db.prepare('INSERT INTO items(sku,name,price,available) VALUES (?,?,?,?)').run(sku, name, price, qty);
      db.prepare(
        "INSERT INTO movements(sku,kind,quantity,available_after,note,at) VALUES (?,'RESTOCK',?,?,?,?)"
      ).run(sku, qty, qty, 'Tồn kho ban đầu', now());
    }
  });
}
function wipe() {
  tx(db, () => {
    for (const t of ['operations', 'movements', 'reservations', 'items']) db.prepare(`DELETE FROM ${t}`).run();
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('movements','reservations')").run();
  });
}
if (!db.prepare('SELECT COUNT(*) n FROM items').get().n) seed();

const itemView = (it) => {
  const reserved = db
    .prepare("SELECT COALESCE(SUM(quantity),0) q FROM reservations WHERE sku = ? AND status = 'ACTIVE'")
    .get(it.sku).q;
  return { ...it, reserved };
};

const app = createApp('inventory', {
  faults,
  log,
  onReset: async () => {
    wipe();
    seed();
  },
});

// ---------- đọc (cho Web UI và orchestrator) ----------
app.get('/inventory/items', (req, res) => {
  res.json({ items: db.prepare('SELECT * FROM items ORDER BY sku').all().map(itemView) });
});
app.get('/inventory/items/:sku', (req, res) => {
  const it = db.prepare('SELECT * FROM items WHERE sku = ?').get(req.params.sku);
  if (!it) return res.status(404).json({ error: 'SKU_NOT_FOUND' });
  res.json(itemView(it));
});
app.get('/inventory/reservations', (req, res) => {
  const { order_id } = req.query;
  const rows = order_id
    ? db.prepare('SELECT * FROM reservations WHERE order_id = ? ORDER BY seq').all(order_id)
    : db.prepare('SELECT * FROM reservations ORDER BY seq DESC LIMIT 200').all();
  res.json({ reservations: rows });
});
app.get('/inventory/movements', (req, res) => {
  const { sku, order_id } = req.query;
  let sql = 'SELECT * FROM movements';
  const where = [];
  const args = [];
  if (sku) where.push('sku = ?') && args.push(sku);
  if (order_id) where.push('order_id = ?') && args.push(order_id);
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY seq DESC LIMIT 300';
  res.json({ movements: db.prepare(sql).all(...args) });
});
app.get('/inventory/operations/:op_id', (req, res) => {
  const op = getOp(db, req.params.op_id);
  if (!op) return res.status(404).json({ op_id: req.params.op_id, status: 'NOT_FOUND' });
  res.json(op);
});

// ---------- thủ kho nhập hàng (hàng vào) ----------
app.post('/inventory/items/:sku/restock', (req, res) => {
  const qty = Number(req.body?.quantity);
  if (!Number.isInteger(qty) || qty <= 0) return res.status(400).json({ error: 'quantity phải là số nguyên > 0' });
  const out = tx(db, () => {
    const it = db.prepare('SELECT * FROM items WHERE sku = ?').get(req.params.sku);
    if (!it) throw new OpError(404, 'SKU_NOT_FOUND', 'không có sản phẩm');
    db.prepare('UPDATE items SET available = available + ? WHERE sku = ?').run(qty, it.sku);
    const after = it.available + qty;
    db.prepare(
      "INSERT INTO movements(sku,kind,quantity,available_after,note,at) VALUES (?,'RESTOCK',?,?,?,?)"
    ).run(it.sku, qty, after, req.body?.note || 'Thủ kho nhập hàng', now());
    return { sku: it.sku, available: after };
  });
  log.info('RESTOCK', out);
  res.status(201).json(out);
});

// ---------- bước tiến: giữ hàng ----------
app.post('/inventory/reservations', (req, res) => {
  const { order_id, sku, quantity, reserve_op_id } = req.body || {};
  if (!order_id || !sku || !Number.isInteger(quantity) || quantity <= 0 || !reserve_op_id) {
    return res.status(400).json({ error: 'cần order_id, sku, quantity (>0), reserve_op_id' });
  }
  const payload = { order_id, sku, quantity };
  const faultMode = faults.peek('reserve');
  const out = tx(db, () => {
    const replay = findReplay(db, reserve_op_id, 'reserve', payload);
    if (replay) return replay;

    const it = db.prepare('SELECT * FROM items WHERE sku = ?').get(sku);
    let reason = null;
    if (faultMode === 'reject') reason = 'REJECTED_BY_FAULT';
    else if (!it) reason = 'SKU_NOT_FOUND';
    else if (it.available < quantity) reason = 'OUT_OF_STOCK';

    if (reason) {
      // Từ chối DỨT KHOÁT: ghi lại kết quả FAILED để query/replay trả đúng kết quả này.
      const result = { status: 'REJECTED', reason, order_id, sku, quantity, available: it ? it.available : 0 };
      recordOp(db, { opId: reserve_op_id, kind: 'reserve', payload, status: 'FAILED', http: 409, result });
      return { http: 409, body: { error: 'REJECTED', ...result } };
    }

    const n = db.prepare('SELECT COALESCE(MAX(seq),0)+1 n FROM reservations').get().n;
    const reservation_id = `R${n}`;
    const after = it.available - quantity;
    db.prepare('UPDATE items SET available = ? WHERE sku = ?').run(after, sku);
    db.prepare(
      "INSERT INTO reservations(reservation_id,order_id,sku,quantity,status,reserve_op_id,created_at) VALUES (?,?,?,?,'ACTIVE',?,?)"
    ).run(reservation_id, order_id, sku, quantity, reserve_op_id, now());
    db.prepare(
      "INSERT INTO movements(sku,kind,quantity,available_after,order_id,reservation_id,note,at) VALUES (?,'RESERVE',?,?,?,?,?,?)"
    ).run(sku, -quantity, after, order_id, reservation_id, `Giữ hàng cho đơn ${order_id}`, now());
    const result = { reservation_id, status: 'ACTIVE', order_id, sku, quantity, available: after };
    recordOp(db, { opId: reserve_op_id, kind: 'reserve', payload, status: 'SUCCEEDED', http: 201, result });
    return { http: 201, body: result };
  });
  if (faultMode === 'reject' && !out.body.replayed) faults.take('reserve');
  log.info('RESERVE', { op_id: reserve_op_id, http: out.http, ...out.body });
  res.status(out.http).json(out.body);
});

// ---------- bước bù: nhả hàng ----------
app.post('/inventory/reservations/:id/release', (req, res) => {
  const reservation_id = req.params.id;
  const { release_op_id } = req.body || {};
  if (!release_op_id) return res.status(400).json({ error: 'cần release_op_id' });
  const payload = { reservation_id };
  const out = tx(db, () => {
    const replay = findReplay(db, release_op_id, 'release', payload);
    if (replay) return replay;
    if (faults.take('release') === 'error503') {
      throw new OpError(503, 'TEMPORARY_UNAVAILABLE', 'Inventory tạm thời không release được (fault)');
    }
    const r = db.prepare('SELECT * FROM reservations WHERE reservation_id = ?').get(reservation_id);
    if (!r) throw new OpError(404, 'RESERVATION_NOT_FOUND', 'không có reservation');
    if (r.status === 'RELEASED') {
      // Đã nhả trước đó (bởi op khác): không tạo tác động thứ hai.
      const result = { reservation_id, status: 'RELEASED', already: true };
      recordOp(db, { opId: release_op_id, kind: 'release', payload, status: 'SUCCEEDED', http: 200, result });
      return { http: 200, body: result };
    }
    const it = db.prepare('SELECT * FROM items WHERE sku = ?').get(r.sku);
    const after = it.available + r.quantity;
    db.prepare('UPDATE items SET available = ? WHERE sku = ?').run(after, r.sku);
    db.prepare("UPDATE reservations SET status='RELEASED', release_op_id=?, released_at=? WHERE reservation_id=?").run(
      release_op_id,
      now(),
      reservation_id
    );
    db.prepare(
      "INSERT INTO movements(sku,kind,quantity,available_after,order_id,reservation_id,note,at) VALUES (?,'RELEASE',?,?,?,?,?,?)"
    ).run(r.sku, r.quantity, after, r.order_id, reservation_id, `Nhả hàng của đơn ${r.order_id} (bù)`, now());
    const result = { reservation_id, status: 'RELEASED', order_id: r.order_id, available: after };
    recordOp(db, { opId: release_op_id, kind: 'release', payload, status: 'SUCCEEDED', http: 200, result });
    return { http: 200, body: result };
  });
  log.info('RELEASE', { op_id: release_op_id, http: out.http, ...out.body });
  res.status(out.http).json(out.body);
});

finishApp(app, log);
app.listen(PORTS.inventory, HOST, () => log.info('LISTEN', { url: `http://${HOST}:${PORTS.inventory}` }));
