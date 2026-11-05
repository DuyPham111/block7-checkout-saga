'use strict';
// STATE MACHINE của Saga checkout — hàm THUẦN (không DB, không mạng) => unit test được.
// apply(saga, event) trả saga mới, hoặc ném GuardError khi chuyển trạng thái thiếu bằng chứng.
//
//   PENDING --reserve OK--> RESERVED --charge OK--> CHARGED --confirm OK--> CONFIRMED
//   PENDING --reserve bị từ chối--> CANCELLED (chưa có gì để bù)
//   RESERVED --charge FAILED--> COMPENSATING [release]
//   RESERVED --charge không rõ--> RECOVERING --biết CHARGED--> CHARGED
//                                            --biết FAILED--> COMPENSATING [release]
//                                            --vẫn chưa rõ--> RECOVERING
//   CHARGED --confirm bị từ chối--> COMPENSATING [refund, release]
//   COMPENSATING --bù xong từng bước (refund trước, release sau)--> ... --pending rỗng: cancel--> CANCELLED

const TERMINAL = new Set(['CONFIRMED', 'CANCELLED']);
const STATUSES = ['PENDING', 'RESERVED', 'CHARGED', 'CONFIRMED', 'RECOVERING', 'COMPENSATING', 'CANCELLED'];

class GuardError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GuardError';
  }
}

const waitingFor = (s, step, base) => s.status === base || (s.status === 'RECOVERING' && s.intent && s.intent.step === step);

function apply(saga, ev) {
  const s = { ...saga, pending: [...(saga.pending || [])] };
  const deny = (why) => {
    throw new GuardError(`Guard chặn ${saga.status} + ${ev.type}: ${why}`);
  };
  if (TERMINAL.has(saga.status)) deny('saga đã kết thúc');

  switch (ev.type) {
    // ----- reserve -----
    case 'RESERVE_OK':
      if (!waitingFor(saga, 'reserve', 'PENDING')) deny('không đang chờ kết quả reserve');
      if (!ev.reservation_id) deny('thiếu reservation_id');
      return { ...s, status: 'RESERVED', reservation_id: ev.reservation_id, intent: null };
    case 'RESERVE_REJECTED':
      if (!waitingFor(saga, 'reserve', 'PENDING')) deny('không đang chờ kết quả reserve');
      return { ...s, status: 'CANCELLED', reason: ev.reason, intent: null };
    case 'RESERVE_UNKNOWN':
      if (!waitingFor(saga, 'reserve', 'PENDING')) deny('không đang chờ kết quả reserve');
      return { ...s, status: 'RECOVERING', intent: saga.intent };

    // ----- charge -----
    case 'CHARGE_OK':
      if (!waitingFor(saga, 'charge', 'RESERVED')) deny('không đang chờ kết quả charge');
      if (!saga.reservation_id) deny('chưa giữ hàng thì không được thu tiền');
      if (!ev.charge_id) deny('thiếu charge_id');
      return { ...s, status: 'CHARGED', charge_id: ev.charge_id, intent: null };
    case 'CHARGE_FAILED':
      if (!waitingFor(saga, 'charge', 'RESERVED')) deny('không đang chờ kết quả charge');
      // Thất bại dứt khoát: không có tiền để hoàn, chỉ cần nhả hàng.
      return { ...s, status: 'COMPENSATING', failed_charge_id: ev.charge_id || null, reason: ev.reason, pending: ['release'], intent: null };
    case 'CHARGE_UNKNOWN':
      if (!waitingFor(saga, 'charge', 'RESERVED')) deny('không đang chờ kết quả charge');
      // Timeout KHÔNG phải thất bại: giữ intent + op ID để hỏi lại / gửi lại đúng ID cũ.
      return { ...s, status: 'RECOVERING', intent: saga.intent };

    // ----- confirm (local trong Order DB) -----
    case 'CONFIRM_OK':
      if (saga.status !== 'CHARGED' || !saga.charge_id) deny('chỉ confirm khi đã biết CHARGED');
      return { ...s, status: 'CONFIRMED' };
    case 'CONFIRM_REJECTED':
      if (saga.status !== 'CHARGED') deny('chỉ xử lý confirm khi đang CHARGED');
      // Thứ tự bù của lab: refund trước, release sau.
      return { ...s, status: 'COMPENSATING', reason: ev.reason, pending: ['refund', 'release'] };

    // ----- compensation -----
    case 'REFUND_OK':
      if (saga.status !== 'COMPENSATING' || s.pending[0] !== 'refund') deny('không có refund nào đang chờ ở đầu hàng');
      if (!saga.charge_id) deny('chỉ refund charge đã biết là CHARGED');
      s.pending.shift();
      return { ...s, refund_id: ev.refund_id, intent: null };
    case 'RELEASE_OK':
      if (saga.status !== 'COMPENSATING' || !s.pending.includes('release')) deny('không có release nào đang chờ');
      if (s.pending[0] !== 'release') deny('thứ tự lab là refund trước, release sau');
      if (!saga.reservation_id) deny('không có reservation để nhả');
      s.pending.shift();
      return { ...s, intent: null };
    case 'COMP_TEMP_FAIL':
      if (saga.status !== 'COMPENSATING') deny('chỉ dùng khi đang bù');
      // Bù lỗi tạm thời: giữ COMPENSATING, pending KHÔNG đổi, thử lại sau.
      return { ...s, last_error: ev.error };
    case 'CANCEL_OK':
      if (saga.status !== 'COMPENSATING') deny('chỉ cancel sau khi bù');
      if (s.pending.length) deny(`còn pending: ${s.pending.join(', ')}`);
      return { ...s, status: 'CANCELLED' };
    default:
      return deny('sự kiện không hợp lệ');
  }
}

// Việc tiếp theo cần làm, suy ra từ trạng thái đã lưu bền (không từ RAM).
function nextAction(saga) {
  switch (saga.status) {
    case 'PENDING':
      return 'reserve';
    case 'RESERVED':
      return 'charge';
    case 'CHARGED':
      return 'confirm';
    case 'RECOVERING':
      return 'recover';
    case 'COMPENSATING':
      return saga.pending.length ? saga.pending[0] : 'cancel';
    default:
      return null;
  }
}

const opId = (sagaId, step) => `${sagaId}:${step}`; // op ID xác định từ saga => retry/restart luôn dùng lại ID cũ

module.exports = { apply, nextAction, opId, GuardError, TERMINAL, STATUSES };
