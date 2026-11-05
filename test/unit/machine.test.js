'use strict';
// Unit test state machine + guard (hàm thuần, không mạng, không DB).
const { apply, nextAction, opId, GuardError } = require('../../services/order/machine');

const S = (over = {}) => ({ saga_id: 'S1', order_id: 'O1', status: 'PENDING', intent: null, pending: [], ...over });

describe('Đường thành công', () => {
  test('PENDING → RESERVED → CHARGED → CONFIRMED', () => {
    let s = S({ intent: { step: 'reserve', op_id: 'S1:reserve' } });
    expect(nextAction(s)).toBe('reserve');
    s = apply(s, { type: 'RESERVE_OK', reservation_id: 'R1' });
    expect(s.status).toBe('RESERVED');
    expect(s.intent).toBeNull();
    expect(nextAction(s)).toBe('charge');
    s = apply(s, { type: 'CHARGE_OK', charge_id: 'C1' });
    expect(s.status).toBe('CHARGED');
    s = apply(s, { type: 'CONFIRM_OK' });
    expect(s.status).toBe('CONFIRMED');
    expect(nextAction(s)).toBeNull();
  });
  test('op ID xác định từ saga: retry/restart luôn ra cùng ID', () => {
    expect(opId('S7', 'charge')).toBe('S7:charge');
    expect(opId('S7', 'charge')).toBe(opId('S7', 'charge'));
  });
});

describe('Thất bại dứt khoát và bù', () => {
  test('F1: reserve bị từ chối → CANCELLED ngay, không có gì để bù, không đi charge', () => {
    const s = apply(S(), { type: 'RESERVE_REJECTED', reason: 'OUT_OF_STOCK' });
    expect(s.status).toBe('CANCELLED');
    expect(s.pending).toEqual([]);
    expect(() => apply(s, { type: 'CHARGE_OK', charge_id: 'C1' })).toThrow(GuardError);
  });
  test('F2: charge FAILED → COMPENSATING chỉ cần release', () => {
    const s = apply(S({ status: 'RESERVED', reservation_id: 'R1' }), { type: 'CHARGE_FAILED', reason: 'INSUFFICIENT_FUNDS' });
    expect(s.status).toBe('COMPENSATING');
    expect(s.pending).toEqual(['release']);
    expect(nextAction(s)).toBe('release');
  });
  test('F3: confirm bị từ chối → pending [refund, release] (refund trước)', () => {
    let s = apply(S({ status: 'CHARGED', reservation_id: 'R1', charge_id: 'C1' }), { type: 'CONFIRM_REJECTED' });
    expect(s.pending).toEqual(['refund', 'release']);
    s = apply(s, { type: 'REFUND_OK', refund_id: 'RF1' });
    expect(s.pending).toEqual(['release']);
    s = apply(s, { type: 'RELEASE_OK' });
    expect(nextAction(s)).toBe('cancel');
    s = apply(s, { type: 'CANCEL_OK' });
    expect(s.status).toBe('CANCELLED');
  });
});

describe('Guard chặn chuyển trạng thái thiếu bằng chứng', () => {
  const comp = S({ status: 'COMPENSATING', reservation_id: 'R1', charge_id: 'C1', pending: ['refund', 'release'] });
  test('không release trước refund', () => {
    expect(() => apply(comp, { type: 'RELEASE_OK' })).toThrow(/refund trước, release sau/);
  });
  test('không cancel khi còn pending', () => {
    expect(() => apply(comp, { type: 'CANCEL_OK' })).toThrow(/còn pending/);
  });
  test('không refund khi chưa biết charge CHARGED', () => {
    expect(() => apply({ ...comp, charge_id: null }, { type: 'REFUND_OK', refund_id: 'RF1' })).toThrow(GuardError);
  });
  test('không charge khi chưa giữ hàng', () => {
    expect(() => apply(S({ status: 'RESERVED' }), { type: 'CHARGE_OK', charge_id: 'C1' })).toThrow(/chưa giữ hàng/);
  });
  test('không confirm khi chưa CHARGED', () => {
    expect(() => apply(S({ status: 'RESERVED', reservation_id: 'R1' }), { type: 'CONFIRM_OK' })).toThrow(GuardError);
  });
  test('saga đã kết thúc thì không nhận sự kiện nào', () => {
    expect(() => apply(S({ status: 'CONFIRMED' }), { type: 'CONFIRM_REJECTED' })).toThrow(/đã kết thúc/);
  });
  test('lỗi tạm khi bù: giữ COMPENSATING, pending không đổi', () => {
    const s = apply(comp, { type: 'COMP_TEMP_FAIL', error: 'HTTP 503' });
    expect(s.status).toBe('COMPENSATING');
    expect(s.pending).toEqual(['refund', 'release']);
    expect(s.last_error).toBe('HTTP 503');
  });
});

describe('Kết quả chưa rõ (unknown outcome)', () => {
  const reserved = S({ status: 'RESERVED', reservation_id: 'R1', intent: { step: 'charge', op_id: 'S1:charge' } });
  test('charge timeout → RECOVERING, GIỮ intent + op ID cũ', () => {
    const s = apply(reserved, { type: 'CHARGE_UNKNOWN' });
    expect(s.status).toBe('RECOVERING');
    expect(s.intent).toEqual({ step: 'charge', op_id: 'S1:charge' });
    expect(nextAction(s)).toBe('recover');
  });
  test('RECOVERING không có đường đi thẳng tới CANCELLED (không terminal giả)', () => {
    const s = apply(reserved, { type: 'CHARGE_UNKNOWN' });
    expect(() => apply(s, { type: 'CANCEL_OK' })).toThrow(GuardError);
    expect(() => apply(s, { type: 'CONFIRM_OK' })).toThrow(GuardError);
  });
  test('RECOVERING + biết CHARGED → CHARGED (policy lab: tiếp tục confirm)', () => {
    const s = apply(apply(reserved, { type: 'CHARGE_UNKNOWN' }), { type: 'CHARGE_OK', charge_id: 'C1' });
    expect(s.status).toBe('CHARGED');
    expect(nextAction(s)).toBe('confirm');
  });
  test('RECOVERING + biết FAILED → COMPENSATING [release]', () => {
    const s = apply(apply(reserved, { type: 'CHARGE_UNKNOWN' }), { type: 'CHARGE_FAILED', reason: 'X' });
    expect(s.pending).toEqual(['release']);
  });
});
