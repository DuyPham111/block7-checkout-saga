'use strict';
// PAYMENT SERVICE (ví tiền khách hàng) — process riêng, DB riêng (data/payment.db).
// Sở hữu: số dư ví và LEDGER (sổ cái). Ledger chỉ INSERT: charge, refund, nạp tiền — không sửa, không xóa.
const path = require('node:path');
const { PORTS, HOST, DATA_DIR, FREEZE_MS } = require('../../config');
const { openDb, tx, now } = require('../../common/db');
const { makeLogger, freeze } = require('../../common/log');
const { createFaults } = require('../../common/faults');
const { createApp, finishApp } = require('../../common/app');
const { OPS_SCHEMA, OpError, findReplay, recordOp, getOp } = require('../../common/ops');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS wallets (
  customer_id TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  balance     INTEGER NOT NULL CHECK (balance >= 0)
);
CREATE TABLE IF NOT EXISTS ledger (
  seq           INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id      TEXT NOT NULL UNIQUE,
  kind          TEXT NOT NULL CHECK (kind IN ('charge','refund','topup')),
  customer_id   TEXT NOT NULL,
  order_id      TEXT,
  amount        INTEGER NOT NULL CHECK (amount > 0),
  status        TEXT NOT NULL CHECK (status IN ('CHARGED','FAILED','REFUNDED','COMPLETED')),
  ref_charge_id TEXT,
  reason        TEXT,
  balance_after INTEGER NOT NULL,
  op_id         TEXT UNIQUE,
  at            TEXT NOT NULL
);
-- Mỗi charge chỉ được refund tối đa MỘT lần (bảo vệ bằng DB, không chỉ bằng code)
CREATE UNIQUE INDEX IF NOT EXISTS one_refund_per_charge ON ledger(ref_charge_id) WHERE kind = 'refund';
${OPS_SCHEMA}`;

const SEED_WALLETS = [
  ['CUS-AN', 'Nguyễn Văn An', 2000000],
  ['CUS-BINH', 'Trần Thị Bình', 300000], // ít tiền => F2 tự nhiên (không đủ số dư)
  ['CUS-CUONG', 'Lê Minh Cường', 1000000],
];

const log = makeLogger('payment');
const faults = createFaults();
const db = openDb(path.join(DATA_DIR, 'payment.db'), SCHEMA);

const nextId = (prefix, kind) =>
  `${prefix}${db.prepare('SELECT COUNT(*)+1 n FROM ledger WHERE kind = ?').get(kind).n}`;

function seed() {
  tx(db, () => {
    for (const [id, name, bal] of SEED_WALLETS) {
      db.prepare('INSERT INTO wallets(customer_id,name,balance) VALUES (?,?,?)').run(id, name, bal);
      db.prepare(
        "INSERT INTO ledger(entry_id,kind,customer_id,amount,status,reason,balance_after,at) VALUES (?,'topup',?,?,'COMPLETED',?,?,?)"
      ).run(nextId('TU', 'topup'), id, bal, 'Số dư ban đầu', bal, now());
    }
  });
}
function wipe() {
  tx(db, () => {
    for (const t of ['operations', 'ledger', 'wallets']) db.prepare(`DELETE FROM ${t}`).run();
    db.prepare("DELETE FROM sqlite_sequence WHERE name = 'ledger'").run();
  });
}
if (!db.prepare('SELECT COUNT(*) n FROM wallets').get().n) seed();

const app = createApp('payment', {
  faults,
  log,
  onReset: async () => {
    wipe();
    seed();
  },
});

function ledgerSummary(rows) {
  const charged = rows.filter((r) => r.kind === 'charge' && r.status === 'CHARGED').reduce((s, r) => s + r.amount, 0);
  const refunded = rows.filter((r) => r.kind === 'refund').reduce((s, r) => s + r.amount, 0);
  return { total_charged: charged, total_refunded: refunded, net_collected: charged - refunded };
}

// ---------- đọc (cho Web UI và orchestrator) ----------
app.get('/payments/ledger', (req, res) => {
  const { customer_id, order_id } = req.query;
  const where = [];
  const args = [];
  if (customer_id) where.push('customer_id = ?') && args.push(customer_id);
  if (order_id) where.push('order_id = ?') && args.push(order_id);
  const sql = `SELECT * FROM ledger ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY seq DESC LIMIT 500`;
  const entries = db.prepare(sql).all(...args);
  res.json({ entries, ...ledgerSummary(entries) });
});
app.get('/payments/wallets', (req, res) => {
  res.json({ wallets: db.prepare('SELECT * FROM wallets ORDER BY customer_id').all() });
});
app.get('/payments/wallets/:id', (req, res) => {
  const w = db.prepare('SELECT * FROM wallets WHERE customer_id = ?').get(req.params.id);
  if (!w) return res.status(404).json({ error: 'WALLET_NOT_FOUND' });
  const entries = db.prepare('SELECT * FROM ledger WHERE customer_id = ? ORDER BY seq DESC').all(w.customer_id);
  res.json({ ...w, entries });
});
app.get('/payments/operations/:op_id', (req, res) => {
  const op = getOp(db, req.params.op_id);
  if (!op) return res.status(404).json({ op_id: req.params.op_id, status: 'NOT_FOUND' });
  res.json(op);
});

// ---------- nạp tiền vào ví (cho góc nhìn "ví tiền") ----------
app.post('/payments/wallets/:id/topup', (req, res) => {
  const amount = Number(req.body?.amount);
  if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ error: 'amount phải là số nguyên > 0' });
  const out = tx(db, () => {
    const w = db.prepare('SELECT * FROM wallets WHERE customer_id = ?').get(req.params.id);
    if (!w) throw new OpError(404, 'WALLET_NOT_FOUND', 'không có ví');
    const after = w.balance + amount;
    db.prepare('UPDATE wallets SET balance = ? WHERE customer_id = ?').run(after, w.customer_id);
    const entry_id = nextId('TU', 'topup');
    db.prepare(
      "INSERT INTO ledger(entry_id,kind,customer_id,amount,status,reason,balance_after,at) VALUES (?,'topup',?,?,'COMPLETED','Nạp tiền',?,?)"
    ).run(entry_id, w.customer_id, amount, after, now());
    return { entry_id, customer_id: w.customer_id, balance: after };
  });
  log.info('TOPUP', out);
  res.status(201).json(out);
});

// ---------- bước tiến: thu tiền ----------
app.post('/payments/charges', (req, res) => {
  const { order_id, customer_id, amount, charge_op_id } = req.body || {};
  if (!order_id || !customer_id || !Number.isInteger(amount) || amount <= 0 || !charge_op_id) {
    return res.status(400).json({ error: 'cần order_id, customer_id, amount (>0), charge_op_id' });
  }
  const payload = { order_id, customer_id, amount };
  const failFault = faults.peek('charge') === 'fail';
  const out = tx(db, () => {
    const replay = findReplay(db, charge_op_id, 'charge', payload);
    if (replay) return replay;

    const w = db.prepare('SELECT * FROM wallets WHERE customer_id = ?').get(customer_id);
    let reason = null;
    if (failFault) reason = 'DECLINED_BY_FAULT';
    else if (!w) reason = 'WALLET_NOT_FOUND';
    else if (w.balance < amount) reason = 'INSUFFICIENT_FUNDS';

    const charge_id = nextId('C', 'charge');
    if (reason) {
      // Thất bại DỨT KHOÁT: ghi một dòng FAILED vào ledger, số dư không đổi.
      db.prepare(
        "INSERT INTO ledger(entry_id,kind,customer_id,order_id,amount,status,reason,balance_after,op_id,at) VALUES (?,'charge',?,?,?,'FAILED',?,?,?,?)"
      ).run(charge_id, customer_id, order_id, amount, reason, w ? w.balance : 0, charge_op_id, now());
      const result = { charge_id, status: 'FAILED', reason, order_id, amount, balance: w ? w.balance : 0 };
      recordOp(db, { opId: charge_op_id, kind: 'charge', payload, status: 'FAILED', http: 402, result });
      return { http: 402, body: { error: 'PAYMENT_FAILED', ...result } };
    }
    const after = w.balance - amount;
    db.prepare('UPDATE wallets SET balance = ? WHERE customer_id = ?').run(after, customer_id);
    db.prepare(
      "INSERT INTO ledger(entry_id,kind,customer_id,order_id,amount,status,balance_after,op_id,at) VALUES (?,'charge',?,?,?,'CHARGED',?,?,?)"
    ).run(charge_id, customer_id, order_id, amount, after, charge_op_id, now());
    const result = { charge_id, status: 'CHARGED', order_id, amount, balance: after };
    recordOp(db, { opId: charge_op_id, kind: 'charge', payload, status: 'SUCCEEDED', http: 201, result });
    return { http: 201, body: result };
  });
  if (failFault && !out.body.replayed) faults.take('charge');
  log.info('CHARGE', { op_id: charge_op_id, http: out.http, ...out.body });

  // F4: charge ĐÃ COMMIT xuống đĩa, nhưng response chưa rời Payment.
  if (!out.body.replayed && out.http === 201 && faults.take('charge.afterCommit') === 'freeze') {
    log.marker('payment.charge.committed', { op_id: charge_op_id, charge_id: out.body.charge_id, order_id });
    freeze(FREEZE_MS); // process treo hoàn toàn => script kill process thật tại đây
  }
  res.status(out.http).json(out.body);
});

// ---------- bước bù: hoàn tiền (một dòng MỚI, dòng charge giữ nguyên) ----------
app.post('/payments/charges/:id/refund', (req, res) => {
  const charge_id = req.params.id;
  const { refund_op_id } = req.body || {};
  if (!refund_op_id) return res.status(400).json({ error: 'cần refund_op_id' });
  const payload = { charge_id };
  const out = tx(db, () => {
    const replay = findReplay(db, refund_op_id, 'refund', payload);
    if (replay) return replay;
    if (faults.peek('refund') === 'error503') {
      faults.take('refund');
      // Lỗi TẠM THỜI: không commit gì, không ghi operation => có thể thử lại cùng op ID.
      throw new OpError(503, 'TEMPORARY_UNAVAILABLE', 'Payment tạm thời không hoàn tiền được (fault)');
    }
    const c = db.prepare("SELECT * FROM ledger WHERE entry_id = ? AND kind = 'charge'").get(charge_id);
    if (!c || c.status !== 'CHARGED') throw new OpError(409, 'NOT_REFUNDABLE', 'chỉ refund charge đã CHARGED');
    const existing = db.prepare("SELECT * FROM ledger WHERE kind='refund' AND ref_charge_id = ?").get(charge_id);
    if (existing) {
      throw new OpError(409, 'ALREADY_REFUNDED', 'charge đã được refund', { refund_id: existing.entry_id });
    }
    const w = db.prepare('SELECT * FROM wallets WHERE customer_id = ?').get(c.customer_id);
    const after = w.balance + c.amount;
    db.prepare('UPDATE wallets SET balance = ? WHERE customer_id = ?').run(after, c.customer_id);
    const refund_id = nextId('RF', 'refund');
    db.prepare(
      "INSERT INTO ledger(entry_id,kind,customer_id,order_id,amount,status,ref_charge_id,reason,balance_after,op_id,at) VALUES (?,'refund',?,?,?,'REFUNDED',?,?,?,?,?)"
    ).run(refund_id, c.customer_id, c.order_id, c.amount, charge_id, 'Hoàn tiền (bù)', after, refund_op_id, now());
    const result = { refund_id, charge_id, status: 'REFUNDED', amount: c.amount, balance: after };
    recordOp(db, { opId: refund_op_id, kind: 'refund', payload, status: 'SUCCEEDED', http: 201, result });
    return { http: 201, body: result };
  });
  log.info('REFUND', { op_id: refund_op_id, http: out.http, ...out.body });
  res.status(out.http).json(out.body);
});

finishApp(app, log);
app.listen(PORTS.payment, HOST, () => log.info('LISTEN', { url: `http://${HOST}:${PORTS.payment}` }));
