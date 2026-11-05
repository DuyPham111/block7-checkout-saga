'use strict';
// Snapshot 3 kho cho MỘT đơn: đọc qua API của từng service.
// Nếu service đang chết (demo F4/F6), đọc thẳng file DB ở chế độ read-only và ghi rõ nguồn = "db-file"
// (chỉ để làm evidence; Web UI và orchestrator KHÔNG bao giờ đọc DB của service khác).
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

async function getJson(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(1500) });
    if (!r.ok) return { ok: false, status: r.status, data: await r.json().catch(() => null) };
    return { ok: true, data: await r.json() };
  } catch (e) {
    return { ok: false, status: 0, error: e.name === 'TimeoutError' ? 'TIMEOUT' : e.cause?.code || e.message };
  }
}

function readDb(dataDir, file, fn) {
  const p = path.join(dataDir, file);
  if (!fs.existsSync(p)) return null;
  const db = new Database(p, { readonly: true, fileMustExist: true });
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

async function snapshot(urls, orderId, { dataDir } = {}) {
  const at = new Date().toISOString();
  const src = {};
  let order = null;
  const o = await getJson(`${urls.order}/orders/${orderId}/saga`);
  if (o.ok) {
    order = o.data;
    src.order = 'api';
  } else if (dataDir) {
    order = readDb(dataDir, 'order.db', (db) => {
      const r = db.prepare('SELECT o.*, s.*, o.updated_at AS updated_at FROM orders o JOIN sagas s ON s.order_id=o.order_id WHERE o.order_id=?').get(orderId);
      if (!r) return null;
      return {
        order_id: r.order_id, status: r.status, amount: r.amount, customer_id: r.customer_id,
        saga: { saga_id: r.saga_id, phase: r.phase, intent: r.intent_step ? { step: r.intent_step, op_id: r.intent_op_id } : null, pending: JSON.parse(r.pending_json), charge_id: r.charge_id, reservation_id: r.reservation_id, refund_id: r.refund_id },
        steps: db.prepare('SELECT * FROM saga_steps WHERE order_id=? ORDER BY seq').all(orderId),
      };
    });
    src.order = `db-file (Order không truy cập được: ${o.error || o.status})`;
  }

  let reservations = null;
  const i = await getJson(`${urls.inventory}/inventory/reservations?order_id=${orderId}`);
  if (i.ok) {
    reservations = i.data.reservations;
    src.inventory = 'api';
  } else if (dataDir) {
    reservations = readDb(dataDir, 'inventory.db', (db) => db.prepare('SELECT * FROM reservations WHERE order_id=? ORDER BY seq').all(orderId));
    src.inventory = `db-file (Inventory không truy cập được: ${i.error || i.status})`;
  }

  let ledger = null;
  const p = await getJson(`${urls.payment}/payments/ledger?order_id=${orderId}`);
  if (p.ok) {
    ledger = p.data.entries.slice().reverse();
    src.payment = 'api';
  } else if (dataDir) {
    ledger = readDb(dataDir, 'payment.db', (db) => db.prepare('SELECT * FROM ledger WHERE order_id=? ORDER BY seq').all(orderId));
    src.payment = `db-file (Payment không truy cập được: ${p.error || p.status})`;
  }
  return { at, order_id: orderId, source: src, order, reservations, ledger };
}

// In gọn 3 kho trên một màn hình (dùng trong terminal khi demo)
function brief(s) {
  const o = s.order || {};
  const sg = o.saga || {};
  const lines = [];
  lines.push(`[${s.at}] Snapshot đơn ${s.order_id}`);
  lines.push(`  Order DB    (${s.source.order}): ${o.status}  phase=${sg.phase}  intent=${sg.intent ? sg.intent.step + ' ' + sg.intent.op_id : '-'}  pending=[${(sg.pending || []).join(', ')}]`);
  lines.push(`  Inventory DB(${s.source.inventory}): ${(s.reservations || []).map((r) => `${r.reservation_id} ${r.status}`).join(', ') || 'không có reservation'}`);
  lines.push(`  Payment DB  (${s.source.payment}): ${(s.ledger || []).map((e) => `${e.entry_id} ${e.kind} ${e.amount} ${e.status}${e.ref_charge_id ? ' →' + e.ref_charge_id : ''} op=${e.op_id}`).join(' | ') || 'ledger trống'}`);
  return lines.join('\n');
}

module.exports = { snapshot, brief, getJson };
