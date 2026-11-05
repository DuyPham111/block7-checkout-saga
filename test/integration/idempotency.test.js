'use strict';
// Idempotency theo operation ID ở Inventory và Payment (process thật, cổng test).
const { URLS } = require('../env');

const http = async (method, url, body) => {
  const r = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
};
beforeEach(async () => {
  for (const s of ['order', 'inventory', 'payment']) await http('POST', `${URLS[s]}/__lab/reset`);
});

test('reserve gửi lại cùng op → cùng reservation, kho chỉ trừ 1 lần', async () => {
  const body = { order_id: 'X1', sku: 'SKU-TAINGHE', quantity: 2, reserve_op_id: 'T:reserve' };
  const a = await http('POST', `${URLS.inventory}/inventory/reservations`, body);
  const b = await http('POST', `${URLS.inventory}/inventory/reservations`, body);
  expect(a.status).toBe(201);
  expect(b.status).toBe(201);
  expect(b.data.reservation_id).toBe(a.data.reservation_id);
  expect(b.data.replayed).toBe(true);
  const item = await http('GET', `${URLS.inventory}/inventory/items/SKU-TAINGHE`);
  expect(item.data.available).toBe(8); // 10 - 2, không phải 10 - 4
});

test('cùng op ID nhưng payload khác → 409 OP_PAYLOAD_MISMATCH', async () => {
  await http('POST', `${URLS.inventory}/inventory/reservations`, { order_id: 'X1', sku: 'SKU-TAINGHE', quantity: 1, reserve_op_id: 'T:r2' });
  const b = await http('POST', `${URLS.inventory}/inventory/reservations`, { order_id: 'X1', sku: 'SKU-TAINGHE', quantity: 3, reserve_op_id: 'T:r2' });
  expect(b.status).toBe(409);
  expect(b.data.error).toBe('OP_PAYLOAD_MISMATCH');
});

test('charge gửi lại cùng op → 1 dòng ledger, ví chỉ trừ 1 lần; query op trả SUCCEEDED', async () => {
  const body = { order_id: 'X2', customer_id: 'CUS-AN', amount: 350000, charge_op_id: 'T:charge' };
  const a = await http('POST', `${URLS.payment}/payments/charges`, body);
  const b = await http('POST', `${URLS.payment}/payments/charges`, body);
  expect(a.status).toBe(201);
  expect(b.data.charge_id).toBe(a.data.charge_id);
  const led = await http('GET', `${URLS.payment}/payments/ledger?order_id=X2`);
  expect(led.data.entries).toHaveLength(1);
  const w = await http('GET', `${URLS.payment}/payments/wallets/CUS-AN`);
  expect(w.data.balance).toBe(2000000 - 350000);
  const op = await http('GET', `${URLS.payment}/payments/operations/T:charge`);
  expect(op.data.status).toBe('SUCCEEDED');
  const none = await http('GET', `${URLS.payment}/payments/operations/T:khong-co`);
  expect(none.status).toBe(404);
});

test('charge thiếu tiền → FAILED dứt khoát, ví không đổi, query op trả FAILED', async () => {
  const a = await http('POST', `${URLS.payment}/payments/charges`, { order_id: 'X3', customer_id: 'CUS-BINH', amount: 900000, charge_op_id: 'T:c3' });
  expect(a.status).toBe(402);
  expect(a.data.reason).toBe('INSUFFICIENT_FUNDS');
  const op = await http('GET', `${URLS.payment}/payments/operations/T:c3`);
  expect(op.data.status).toBe('FAILED');
  const w = await http('GET', `${URLS.payment}/payments/wallets/CUS-BINH`);
  expect(w.data.balance).toBe(300000);
});

test('refund: replay cùng op không hoàn 2 lần; op khác bị chặn ALREADY_REFUNDED; dòng charge vẫn còn', async () => {
  const c = await http('POST', `${URLS.payment}/payments/charges`, { order_id: 'X4', customer_id: 'CUS-AN', amount: 200000, charge_op_id: 'T:c4' });
  const r1 = await http('POST', `${URLS.payment}/payments/charges/${c.data.charge_id}/refund`, { refund_op_id: 'T:rf4' });
  const r2 = await http('POST', `${URLS.payment}/payments/charges/${c.data.charge_id}/refund`, { refund_op_id: 'T:rf4' });
  const r3 = await http('POST', `${URLS.payment}/payments/charges/${c.data.charge_id}/refund`, { refund_op_id: 'T:rf4-khac' });
  expect(r1.status).toBe(201);
  expect(r2.data.refund_id).toBe(r1.data.refund_id);
  expect(r3.status).toBe(409);
  expect(r3.data.error).toBe('ALREADY_REFUNDED');
  const led = await http('GET', `${URLS.payment}/payments/ledger?order_id=X4`);
  expect(led.data.entries.map((e) => `${e.kind}:${e.status}`).sort()).toEqual(['charge:CHARGED', 'refund:REFUNDED']);
  const w = await http('GET', `${URLS.payment}/payments/wallets/CUS-AN`);
  expect(w.data.balance).toBe(2000000);
});
