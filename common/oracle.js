/* Oracle của ma trận failure (slide 29) — dùng chung cho Web UI, automated tests và script demo.
 * snapshot = { order: GET /orders/:id/saga, reservations: [...Inventory], ledger: [...Payment, chỉ của đơn này] }
 * Chỉ ĐỌC dữ liệu đã lấy qua API để kiểm tra; không tự suy ra trạng thái đơn. */
(function (root) {
  'use strict';

  function summarize(snap) {
    const o = snap.order || {};
    const steps = o.steps || [];
    const res = snap.reservations || [];
    const led = snap.ledger || [];
    const charges = led.filter((e) => e.kind === 'charge');
    const charged = charges.filter((e) => e.status === 'CHARGED');
    const refunds = led.filter((e) => e.kind === 'refund');
    const seqOf = (step) => {
      const s = steps.find((x) => x.kind === 'OUTCOME' && x.step === step && x.to_status !== undefined);
      return s ? s.seq : null;
    };
    return {
      status: o.status,
      pending: (o.saga && o.saga.pending) || [],
      resActive: res.filter((r) => r.status === 'ACTIVE').length,
      resReleased: res.filter((r) => r.status === 'RELEASED').length,
      resTotal: res.length,
      charged: charged.length,
      chargeFailed: charges.filter((e) => e.status === 'FAILED').length,
      refunds: refunds.length,
      refundLinked: refunds.length === 1 && charged.length === 1 && refunds[0].ref_charge_id === charged[0].entry_id && refunds[0].amount === charged[0].amount,
      chargeOps: [...new Set(charges.map((c) => c.op_id))],
      sagaId: o.saga && o.saga.saga_id,
      net: charged.reduce((s, c) => s + c.amount, 0) - refunds.reduce((s, r) => s + r.amount, 0),
      amount: o.amount,
      seqRefund: seqOf('refund'),
      seqRelease: seqOf('release'),
      calledCharge: steps.some((x) => x.step === 'charge'),
      wentRecovering: steps.some((x) => x.to_status === 'RECOVERING'),
      refundTempFail: steps.some((x) => x.kind === 'TEMP_FAIL' && x.step === 'refund'),
      resumed: steps.some((x) => x.kind === 'RESUME'),
      pids: [...new Set(steps.map((x) => x.pid).filter(Boolean))],
    };
  }

  const C = (label, ok, actual) => ({ label, ok: !!ok, actual });

  function confirmedChecks(s) {
    return [
      C('Order CONFIRMED', s.status === 'CONFIRMED', s.status),
      C('Không còn pending', s.pending.length === 0, s.pending.join(', ') || '-'),
      C('Đúng 1 reservation ACTIVE', s.resActive === 1 && s.resTotal === 1, `${s.resActive}/${s.resTotal}`),
      C('Đúng 1 charge CHARGED', s.charged === 1, s.charged),
      C('Không refund', s.refunds === 0, s.refunds),
      C('Khách trả đúng tiền đơn', s.net === s.amount, s.net),
    ];
  }
  function cancelledMoneyCheck(s) {
    return C('Tiền khách không mất (thu − hoàn = 0)', s.net === 0, s.net);
  }

  const ORACLES = {
    H0: {
      title: 'Thành công',
      fault: 'Không fault',
      kind: 'Automated control',
      expect: 'CONFIRMED; 1 reservation ACTIVE; đúng 1 charge thành công, không refund; không pending.',
      checks: confirmedChecks,
    },
    F1: {
      title: 'Kho từ chối (hết hàng)',
      fault: 'Reserve reject dứt khoát',
      kind: 'Automated bắt buộc',
      expect: 'CANCELLED; không reservation active; không charge; không gọi charge sau reject.',
      checks: (s) => [
        C('Order CANCELLED', s.status === 'CANCELLED', s.status),
        C('Không reservation', s.resTotal === 0, s.resTotal),
        C('Ledger không có charge/refund', s.charged + s.chargeFailed + s.refunds === 0, s.charged + s.chargeFailed + s.refunds),
        C('Không gọi charge sau reject', !s.calledCharge, s.calledCharge ? 'có gọi' : 'không gọi'),
        cancelledMoneyCheck(s),
      ],
    },
    F2: {
      title: 'Thanh toán thất bại (ví không đủ)',
      fault: 'Charge FAILED dứt khoát sau reserve',
      kind: 'Automated bắt buộc',
      expect: 'CANCELLED; reservation đã release có bằng chứng; không charge thành công, không refund.',
      checks: (s) => [
        C('Order CANCELLED', s.status === 'CANCELLED', s.status),
        C('Reservation RELEASED, không ACTIVE', s.resReleased === 1 && s.resActive === 0, `released ${s.resReleased}, active ${s.resActive}`),
        C('Không charge thành công', s.charged === 0, s.charged),
        C('Không refund', s.refunds === 0, s.refunds),
        cancelledMoneyCheck(s),
      ],
    },
    F3: {
      title: 'Xác nhận đơn bị từ chối sau khi đã thu tiền',
      fault: 'Confirm reject trước commit, sau charge',
      kind: 'Automated bắt buộc',
      expect: 'CANCELLED; 1 charge được refund đúng 1 lần; reservation released; trace refund trước release.',
      checks: (s) => f3Checks(s),
    },
    F4: {
      title: 'Payment chết sau khi đã thu, trước response',
      fault: 'Kill Payment sau charge commit, trước response',
      kind: 'Demo bắt buộc',
      expect: 'Khi Payment dừng: RECOVERING. Restore, query cùng op thấy CHARGED, confirm; cuối như H0.',
      checks: (s) => [
        ...confirmedChecks(s),
        C('Đã qua RECOVERING (không terminal giả)', s.wentRecovering, s.wentRecovering ? 'có' : 'không'),
        C('Chỉ 1 charge op ID (không charge mới)', s.chargeOps.length === 1, s.chargeOps.join(', ')),
      ],
    },
    F5: {
      title: 'Hoàn tiền lỗi tạm thời',
      fault: 'Refund lỗi tạm thời trên flow F3',
      kind: 'Demo bắt buộc',
      expect: 'Khi fault còn: COMPENSATING, pending refund + release. Gỡ fault, resume: refund 1 lần rồi release; cuối như F3.',
      checks: (s) => [...f3Checks(s), C('Có lần refund lỗi tạm thời', s.refundTempFail, s.refundTempFail ? 'có' : 'không')],
    },
    F6: {
      title: 'Orchestrator chết tại khoảng hở',
      fault: 'Orchestrator crash, restart tại gap',
      kind: 'Demo bắt buộc',
      expect: 'Restart cùng DB, query/replay ID cũ. Cuối như H0; không nhân đôi charge, reservation; không mất việc.',
      checks: (s) => [
        ...confirmedChecks(s),
        C('Có RESUME sau restart', s.resumed, s.resumed ? 'có' : 'không'),
        C('Chạy trên ≥ 2 process (PID khác nhau)', s.pids.length >= 2, s.pids.join(', ')),
        C('Charge dùng lại op ID cũ', s.chargeOps.length === 1 && s.chargeOps[0] === `${s.sagaId}:charge`, s.chargeOps.join(', ')),
      ],
    },
  };

  function f3Checks(s) {
    return [
      C('Order CANCELLED', s.status === 'CANCELLED', s.status),
      C('Không còn pending', s.pending.length === 0, s.pending.join(', ') || '-'),
      C('Reservation RELEASED', s.resReleased === 1 && s.resActive === 0, `released ${s.resReleased}, active ${s.resActive}`),
      C('Charge vẫn còn trong ledger (không xóa)', s.charged === 1, s.charged),
      C('Đúng 1 refund, trỏ đúng charge', s.refunds === 1 && s.refundLinked, s.refunds),
      C('Refund trước release (theo seq)', s.seqRefund !== null && s.seqRelease !== null && s.seqRefund < s.seqRelease, `${s.seqRefund} < ${s.seqRelease}`),
      cancelledMoneyCheck(s),
    ];
  }

  function check(id, snap) {
    const o = ORACLES[id];
    const s = summarize(snap);
    const checks = o.checks(s);
    return { id, ok: checks.every((c) => c.ok), checks, summary: s };
  }

  const api = { ORACLES, summarize, check, IDS: Object.keys(ORACLES) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Oracle = api;
})(typeof window !== 'undefined' ? window : globalThis);
