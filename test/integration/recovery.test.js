'use strict';
// V2/V3 tự động hóa thêm (slide: demo F4–F6 bắt buộc; tự động hóa là phần cộng thêm).
// F4, F6 kill PROCESS THẬT tại marker rồi start lại trên cùng file DB.
const { URLS, DIRS, ENV, ROOT } = require('../env');
const { makeCtx, run } = require('../../scripts/scenarios');

const ctx = makeCtx({ root: ROOT, urls: URLS, env: ENV, ...DIRS });
beforeEach(async () => {
  await ctx.reset();
});

test('F4 — kill Payment sau khi charge commit: RECOVERING khi Payment chết, rồi CONFIRMED với đúng 1 charge', async () => {
  const r = await run('F4', ctx);
  const [during, final] = r.snaps;
  expect(during.order.status).toBe('RECOVERING'); // không terminal giả
  expect(during.source.payment).toMatch(/db-file/); // Payment đang chết
  expect(during.ledger.map((e) => e.status)).toEqual(['CHARGED']); // nhưng charge đã commit
  expect(r.extra.stillStatus).toBe('RECOVERING');
  expect(r.extra.newPid).not.toBe(r.extra.oldPid);
  expect(final.order.status).toBe('CONFIRMED');
  expect(final.ledger.filter((e) => e.kind === 'charge')).toHaveLength(1); // không charge mới
  expect(r.extra.recovery_ms).toBeLessThan(15000);
  expect(r.check.ok).toBe(true);
}, 60000);

test('F5 — refund lỗi tạm thời: COMPENSATING + pending được lưu, gỡ lỗi thì refund 1 lần rồi release', async () => {
  const r = await run('F5', ctx);
  const [during, final] = r.snaps;
  expect(during.order.status).toBe('COMPENSATING');
  expect(during.order.saga.pending).toEqual(['refund', 'release']);
  expect(during.reservations.map((x) => x.status)).toEqual(['ACTIVE']); // chưa release khi refund chưa xong
  expect(r.extra.stillStatus).toBe('COMPENSATING');
  expect(final.order.status).toBe('CANCELLED');
  expect(final.ledger.filter((e) => e.kind === 'refund')).toHaveLength(1);
  expect(r.check.ok).toBe(true);
}, 60000);

test('F6 — kill orchestrator tại khoảng hở: restart cùng DB, dùng lại op ID cũ, CONFIRMED, không nhân đôi', async () => {
  const r = await run('F6', ctx);
  const [during, final] = r.snaps;
  expect(during.source.order).toMatch(/db-file/); // Order đang chết
  expect(during.order.saga.intent).toEqual({ step: 'charge', op_id: `${r.saga_id}:charge` });
  expect(during.ledger.map((e) => e.status)).toEqual(['CHARGED']); // Payment đã commit trong khoảng hở
  expect(r.extra.newPid).not.toBe(r.extra.oldPid);
  expect(final.order.status).toBe('CONFIRMED');
  expect(final.reservations).toHaveLength(1);
  expect(final.ledger.filter((e) => e.kind === 'charge').map((e) => e.op_id)).toEqual([r.extra.opBefore]);
  expect(r.check.ok).toBe(true);
}, 60000);
