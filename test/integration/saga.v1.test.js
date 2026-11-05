'use strict';
// V1 — H0 + 3 automated failure tests F1, F2, F3.
// Mỗi test: reset fixture, chạy Saga thật qua 3 process, chờ trạng thái terminal (tối đa 15s),
// rồi assert CẢ BA kho: Order (+ Saga record), Inventory, Payment ledger — kể cả "không có charge/refund ngoài dự kiến".
const { URLS, DIRS, ENV, ROOT } = require('../env');
const { makeCtx, run } = require('../../scripts/scenarios');

const ctx = makeCtx({ root: ROOT, urls: URLS, env: ENV, ...DIRS });
const get = async (url) => (await fetch(url)).json();

async function stores(orderId) {
  const order = await get(`${URLS.order}/orders/${orderId}/saga`);
  const reservations = (await get(`${URLS.inventory}/inventory/reservations?order_id=${orderId}`)).reservations;
  const ledgerAll = (await get(`${URLS.payment}/payments/ledger`)).entries.filter((e) => e.kind !== 'topup');
  const ledger = ledgerAll.filter((e) => e.order_id === orderId);
  const items = Object.fromEntries((await get(`${URLS.inventory}/inventory/items`)).items.map((i) => [i.sku, i]));
  const wallets = Object.fromEntries((await get(`${URLS.payment}/payments/wallets`)).wallets.map((w) => [w.customer_id, w.balance]));
  return { order, reservations, ledger, ledgerAll, items, wallets };
}

beforeEach(async () => {
  await ctx.reset();
});

test('H0 — thành công: CONFIRMED, 1 reservation ACTIVE, đúng 1 charge, không refund, không pending', async () => {
  const r = await run('H0', ctx);
  const s = await stores(r.order_id);
  expect(s.order.status).toBe('CONFIRMED');
  expect(s.order.saga.pending).toEqual([]);
  expect(s.reservations.map((x) => x.status)).toEqual(['ACTIVE']);
  expect(s.items['SKU-TAINGHE'].available).toBe(9);
  expect(s.ledger.map((e) => `${e.kind}:${e.status}`)).toEqual(['charge:CHARGED']);
  expect(s.ledgerAll).toHaveLength(1); // không có giao dịch ngoài dự kiến
  expect(s.wallets['CUS-AN']).toBe(2000000 - 350000);
  expect(r.check.ok).toBe(true);
});

test('F1 — kho từ chối (hết hàng): CANCELLED, không reservation, không gọi charge', async () => {
  const r = await run('F1', ctx);
  const s = await stores(r.order_id);
  expect(s.order.status).toBe('CANCELLED');
  expect(s.order.reason).toBe('OUT_OF_STOCK');
  expect(s.reservations).toHaveLength(0);
  expect(s.ledgerAll).toHaveLength(0); // ledger không có charge/refund nào
  expect(s.order.steps.some((x) => x.step === 'charge')).toBe(false); // không có intent/gọi charge sau reject
  const op = await fetch(`${URLS.payment}/payments/operations/${r.saga_id}:charge`);
  expect(op.status).toBe(404); // Payment chưa từng nhận op charge của saga này
  expect(s.wallets['CUS-AN']).toBe(2000000);
  expect(r.check.ok).toBe(true);
});

test('F2 — ví không đủ tiền sau khi đã giữ hàng: CANCELLED, reservation RELEASED, không charge thành công, không refund', async () => {
  const r = await run('F2', ctx);
  const s = await stores(r.order_id);
  expect(s.order.status).toBe('CANCELLED');
  expect(s.reservations.map((x) => x.status)).toEqual(['RELEASED']);
  expect(s.items['SKU-BANPHIM'].available).toBe(5); // hàng đã về kho
  const mv = (await get(`${URLS.inventory}/inventory/movements?order_id=${r.order_id}`)).movements.map((m) => m.kind).reverse();
  expect(mv).toEqual(['RESERVE', 'RELEASE']); // bằng chứng release
  expect(s.ledger.map((e) => `${e.kind}:${e.status}`)).toEqual(['charge:FAILED']);
  expect(s.ledgerAll.filter((e) => e.status === 'CHARGED' || e.kind === 'refund')).toHaveLength(0);
  expect(s.wallets['CUS-BINH']).toBe(300000); // mua thất bại nhưng tiền vẫn còn
  expect(r.check.ok).toBe(true);
});

test('F3 — confirm bị từ chối sau charge: refund đúng 1 lần rồi mới release, lịch sử charge còn nguyên', async () => {
  const r = await run('F3', ctx);
  const s = await stores(r.order_id);
  expect(s.order.status).toBe('CANCELLED');
  expect(s.order.saga.pending).toEqual([]);
  expect(s.reservations.map((x) => x.status)).toEqual(['RELEASED']);
  const charge = s.ledger.filter((e) => e.kind === 'charge');
  const refund = s.ledger.filter((e) => e.kind === 'refund');
  expect(charge.map((e) => e.status)).toEqual(['CHARGED']); // không xóa, không sửa charge
  expect(refund).toHaveLength(1);
  expect(refund[0].ref_charge_id).toBe(charge[0].entry_id);
  expect(refund[0].amount).toBe(charge[0].amount);
  expect(s.ledgerAll).toHaveLength(2);
  const seq = (step) => s.order.steps.find((x) => x.kind === 'OUTCOME' && x.step === step).seq;
  expect(seq('refund')).toBeLessThan(seq('release')); // trace: refund trước release
  expect(s.wallets['CUS-AN']).toBe(2000000);
  expect(s.items['SKU-TAINGHE'].available).toBe(10);
  expect(r.check.ok).toBe(true);
});

