'use strict';
// ORCHESTRATOR của Saga — chạy trong process Order, ghi Saga record vào Order DB.
// Mỗi bước gọi ra ngoài theo mẫu:  (1) ghi INTENT + op ID  ->  (2) gọi HTTP  ->  (3) ghi OUTCOME
// Process chết ở bất kỳ khoảng hở nào thì DB vẫn còn intent + op ID => restart dùng lại đúng ID cũ.
const { tx, now } = require('../../common/db');
const { freeze } = require('../../common/log');
const { BACKOFF_MS, RECOVERY_POLL_MS, FREEZE_MS } = require('../../config');
const { apply, nextAction, opId, GuardError, TERMINAL } = require('./machine');

const money = (n) => `${Number(n).toLocaleString('vi-VN')}đ`;
const describe = (r) => (r.status ? `HTTP ${r.status}${r.data?.error ? ' ' + r.data.error : ''}` : r.error);

function createOrchestrator({ db, log, faults, clients }) {
  const running = new Set();
  let paused = false;
  let generation = 0; // tăng khi reset dữ liệu lab => saga đang chạy dở không ghi vào dữ liệu mới

  // ---------------- đọc / ghi Saga record ----------------
  function load(sagaId) {
    const r = db
      .prepare('SELECT o.*, s.* FROM sagas s JOIN orders o ON o.order_id = s.order_id WHERE s.saga_id = ?')
      .get(sagaId);
    if (!r) return null;
    return {
      saga_id: r.saga_id,
      order_id: r.order_id,
      customer_id: r.customer_id,
      sku: r.sku,
      quantity: r.quantity,
      amount: r.amount,
      status: r.status,
      reason: r.reason,
      phase: r.phase,
      intent: r.intent_step ? { step: r.intent_step, op_id: r.intent_op_id } : null,
      reservation_id: r.reservation_id,
      charge_id: r.charge_id,
      failed_charge_id: r.failed_charge_id,
      refund_id: r.refund_id,
      pending: JSON.parse(r.pending_json),
      last_error: r.last_error,
      attempts: r.attempts,
      next_attempt_at: r.next_attempt_at,
    };
  }

  function addStep(s, kind, info = {}) {
    db.prepare(
      'INSERT INTO saga_steps(saga_id,order_id,at,kind,step,op_id,from_status,to_status,detail,pid) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).run(s.saga_id, s.order_id, now(), kind, info.step || null, info.op_id || null, info.from || null, info.to || null, info.detail || null, process.pid);
  }

  const phaseOf = (s) => {
    if (TERMINAL.has(s.status)) return 'done';
    if (s.status === 'COMPENSATING') return 'compensate';
    if (s.status === 'RECOVERING') return s.intent ? s.intent.step : 'recover';
    return nextAction(s);
  };

  // Một local transaction: trạng thái đơn + Saga record + nhật ký bước. Không bao giờ lệch nhau.
  function persist(gen, prev, next, info) {
    if (gen !== generation) throw new Error('STALE_GENERATION');
    tx(db, () => {
      db.prepare('UPDATE orders SET status=?, reason=?, updated_at=? WHERE order_id=?').run(next.status, next.reason || null, now(), next.order_id);
      db.prepare(
        `UPDATE sagas SET phase=?, intent_step=?, intent_op_id=?, reservation_id=?, charge_id=?, failed_charge_id=?, refund_id=?,
           pending_json=?, last_error=?, attempts=?, next_attempt_at=?, updated_at=? WHERE saga_id=?`
      ).run(
        phaseOf(next),
        next.intent ? next.intent.step : null,
        next.intent ? next.intent.op_id : null,
        next.reservation_id || null,
        next.charge_id || null,
        next.failed_charge_id || null,
        next.refund_id || null,
        JSON.stringify(next.pending || []),
        next.last_error || null,
        next.attempts || 0,
        next.next_attempt_at || null,
        now(),
        next.saga_id
      );
      if (info) addStep(next, info.kind, { ...info, from: prev.status, to: next.status });
    });
  }

  // (1) INTENT: ghi việc sắp làm + op ID xuống DB TRƯỚC khi gọi ra ngoài.
  function writeIntent(gen, saga, step) {
    const op = opId(saga.saga_id, step);
    if (saga.intent && saga.intent.op_id === op) return saga; // đã lưu bền từ lần trước (retry/restart)
    const next = { ...saga, intent: { step, op_id: op } };
    persist(gen, saga, next, { kind: 'INTENT', step, op_id: op, detail: `Ghi intent "${step}" + op ${op} vào Order DB trước khi gọi` });
    return next;
  }

  // (3) OUTCOME: áp sự kiện qua state machine (có guard) rồi lưu. retry=true => hẹn thử lại có backoff.
  function commit(gen, prev, ev, info, retry = false) {
    let next;
    try {
      next = ev ? apply(prev, ev) : { ...prev };
    } catch (e) {
      if (!(e instanceof GuardError)) throw e;
      tx(db, () => addStep(prev, 'GUARD', { detail: e.message, from: prev.status, to: prev.status }));
      log.warn('GUARD', { saga_id: prev.saga_id, message: e.message });
      return null;
    }
    if (retry) {
      const attempts = (prev.attempts || 0) + 1;
      const delay = BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)];
      next.attempts = attempts;
      next.next_attempt_at = new Date(Date.now() + delay).toISOString();
      info = { ...info, detail: `${info.detail} — thử lại sau ${delay / 1000}s (lần ${attempts})` };
    } else {
      next.attempts = 0;
      next.next_attempt_at = null;
      if (!ev || ev.type !== 'COMP_TEMP_FAIL') next.last_error = null;
    }
    persist(gen, prev, next, info);
    log.info('SAGA_STEP', { saga_id: prev.saga_id, from: prev.status, to: next.status, kind: info.kind, step: info.step, op_id: info.op_id, detail: info.detail });
    return next;
  }

  const go = (x) => (x ? 'continue' : 'wait');

  // ---------------- từng loại bước ----------------
  async function doReserve(gen, saga) {
    const s = writeIntent(gen, saga, 'reserve');
    const op = s.intent.op_id;
    const r = await clients.inventory('POST', '/inventory/reservations', {
      order_id: s.order_id, sku: s.sku, quantity: s.quantity, reserve_op_id: op,
    });
    return handleReserveResult(gen, s, op, r, 'call');
  }

  function handleReserveResult(gen, s, op, r, how) {
    const base = { kind: 'OUTCOME', step: 'reserve', op_id: op };
    if (r.status === 201 || r.status === 200) {
      return go(commit(gen, s, { type: 'RESERVE_OK', reservation_id: r.data.reservation_id },
        { ...base, detail: `Kho giữ hàng ${r.data.reservation_id} (còn ${r.data.available})${how !== 'call' ? ` — biết qua ${how}` : ''}` }));
    }
    if (r.status === 409 && r.data && r.data.error === 'REJECTED') {
      return go(commit(gen, s, { type: 'RESERVE_REJECTED', reason: r.data.reason },
        { ...base, detail: `Kho từ chối dứt khoát (${r.data.reason}) → không gọi thu tiền, chưa có gì để bù → hủy đơn` }));
    }
    commit(gen, s, s.status === 'RECOVERING' ? null : { type: 'RESERVE_UNKNOWN' },
      { ...base, kind: 'UNKNOWN', detail: `Chưa rõ kết quả reserve (${describe(r)}) → RECOVERING, sẽ hỏi lại bằng op cũ` }, true);
    return 'wait';
  }

  async function doCharge(gen, saga) {
    const s = writeIntent(gen, saga, 'charge');
    const op = s.intent.op_id;
    const r = await clients.payment('POST', '/payments/charges', {
      order_id: s.order_id, customer_id: s.customer_id, amount: s.amount, charge_op_id: op,
    });
    // F6: orchestrator đã nhận response CHARGED nhưng chưa ghi outcome => điểm dừng "khoảng hở".
    if (r.status === 201 && faults.take('orchestrator.afterChargeCall') === 'freeze') {
      log.marker('order.charge.afterCall', { saga_id: s.saga_id, op_id: op, charge_id: r.data.charge_id });
      freeze(FREEZE_MS);
    }
    return handleChargeResult(gen, s, op, r, 'call');
  }

  function handleChargeResult(gen, s, op, r, how) {
    const base = { kind: 'OUTCOME', step: 'charge', op_id: op };
    const via = how !== 'call' ? ` — biết qua ${how}` : '';
    if (r.status === 201 || r.status === 200) {
      return go(commit(gen, s, { type: 'CHARGE_OK', charge_id: r.data.charge_id },
        { ...base, detail: `Ví đã trừ ${money(r.data.amount ?? s.amount)} (charge ${r.data.charge_id})${via} → tiếp tục xác nhận` }));
    }
    if (r.status === 402) {
      return go(commit(gen, s, { type: 'CHARGE_FAILED', charge_id: r.data && r.data.charge_id, reason: r.data && r.data.reason },
        { ...base, detail: `Thanh toán thất bại dứt khoát (${r.data && r.data.reason})${via}, ví không bị trừ → bù: nhả hàng` }));
    }
    commit(gen, s, s.status === 'RECOVERING' ? null : { type: 'CHARGE_UNKNOWN' },
      { ...base, kind: 'UNKNOWN', detail: `Chưa rõ kết quả charge (${describe(r)}) → RECOVERING, KHÔNG coi là thất bại, KHÔNG charge ID mới` }, true);
    return 'wait';
  }

  // RECOVERING: hỏi kết quả của ĐÚNG op cũ; chưa đủ bằng chứng thì gửi lại cùng op + cùng payload.
  async function doRecover(gen, s) {
    if (!s.intent) {
      commit(gen, s, null, { kind: 'GUARD', detail: 'RECOVERING nhưng thiếu intent — cần xử lý thủ công' }, true);
      return 'wait';
    }
    const { step, op_id: op } = s.intent;
    const svc = step === 'charge' ? 'payment' : 'inventory';
    const base = svc === 'payment' ? '/payments' : '/inventory';
    const q = await clients[svc]('GET', `${base}/operations/${encodeURIComponent(op)}`);
    let r;
    let how;
    if (q.status === 200 && q.data.status === 'SUCCEEDED') {
      r = { status: 201, data: q.data.result };
      how = `query op ${op}: SUCCEEDED`;
    } else if (q.status === 200 && q.data.status === 'FAILED') {
      r = step === 'charge'
        ? { status: 402, data: { error: 'PAYMENT_FAILED', ...q.data.result } }
        : { status: 409, data: { error: 'REJECTED', ...q.data.result } };
      how = `query op ${op}: FAILED`;
    } else if (q.status === 404 || (q.status === 200 && q.data.status === 'PENDING')) {
      // NOT_FOUND chưa phải kết luận => gửi lại đúng op cũ, cùng payload (idempotent).
      tx(db, () => addStep(s, 'QUERY', { step, op_id: op, from: s.status, to: s.status, detail: `Query op ${op}: ${q.status === 404 ? 'NOT_FOUND' : 'PENDING'} → chưa đủ bằng chứng, gửi lại đúng op cũ` }));
      r = step === 'charge'
        ? await clients.payment('POST', '/payments/charges', { order_id: s.order_id, customer_id: s.customer_id, amount: s.amount, charge_op_id: op })
        : await clients.inventory('POST', '/inventory/reservations', { order_id: s.order_id, sku: s.sku, quantity: s.quantity, reserve_op_id: op });
      how = `gửi lại op ${op}`;
    } else {
      commit(gen, s, null, { kind: 'QUERY', step, op_id: op, detail: `Hỏi ${svc} về op ${op}: ${describe(q)} → vẫn RECOVERING (chưa có bằng chứng)` }, true);
      return 'wait';
    }
    return step === 'charge' ? handleChargeResult(gen, s, op, r, how) : handleReserveResult(gen, s, op, r, how);
  }

  function doConfirm(gen, s) {
    const op = opId(s.saga_id, 'confirm');
    if (faults.take('confirm') === 'reject') {
      return go(commit(gen, s, { type: 'CONFIRM_REJECTED', reason: 'CONFIRM_REJECTED' },
        { kind: 'OUTCOME', step: 'confirm', op_id: op, detail: 'Xác nhận đơn bị từ chối TRƯỚC khi commit CONFIRMED → bù: hoàn tiền rồi nhả hàng' }));
    }
    return go(commit(gen, s, { type: 'CONFIRM_OK' },
      { kind: 'OUTCOME', step: 'confirm', op_id: op, detail: 'Xác nhận đơn: CONFIRMED (local transaction trong Order DB)' }));
  }

  async function doRefund(gen, saga) {
    const s = writeIntent(gen, saga, 'refund');
    const op = s.intent.op_id;
    const r = await clients.payment('POST', `/payments/charges/${encodeURIComponent(s.charge_id)}/refund`, { refund_op_id: op });
    const base = { kind: 'OUTCOME', step: 'refund', op_id: op };
    if (r.status === 201 || r.status === 200 || (r.status === 409 && r.data && r.data.error === 'ALREADY_REFUNDED')) {
      const refundId = r.data.refund_id;
      return go(commit(gen, s, { type: 'REFUND_OK', refund_id: refundId },
        { ...base, detail: `Hoàn ${money(r.data.amount ?? s.amount)} về ví (refund ${refundId} → ${s.charge_id}); dòng charge vẫn giữ trong ledger` }));
    }
    commit(gen, s, { type: 'COMP_TEMP_FAIL', error: describe(r) },
      { ...base, kind: 'TEMP_FAIL', detail: `Hoàn tiền lỗi tạm thời (${describe(r)}) → giữ COMPENSATING, pending [${s.pending.join(', ')}]` }, true);
    return 'wait';
  }

  async function doRelease(gen, saga) {
    const s = writeIntent(gen, saga, 'release');
    const op = s.intent.op_id;
    const r = await clients.inventory('POST', `/inventory/reservations/${encodeURIComponent(s.reservation_id)}/release`, { release_op_id: op });
    const base = { kind: 'OUTCOME', step: 'release', op_id: op };
    if (r.status === 200 || r.status === 201) {
      return go(commit(gen, s, { type: 'RELEASE_OK' },
        { ...base, detail: `Nhả hàng ${s.reservation_id} về kho${r.data.available !== undefined ? ` (còn ${r.data.available})` : ''}` }));
    }
    commit(gen, s, { type: 'COMP_TEMP_FAIL', error: describe(r) },
      { ...base, kind: 'TEMP_FAIL', detail: `Nhả hàng lỗi tạm thời (${describe(r)}) → giữ COMPENSATING, pending [${s.pending.join(', ')}]` }, true);
    return 'wait';
  }

  function doCancel(gen, s) {
    const op = opId(s.saga_id, 'cancel');
    return go(commit(gen, s, { type: 'CANCEL_OK' },
      { kind: 'OUTCOME', step: 'cancel', op_id: op, detail: 'Hủy đơn: CANCELLED (mọi tác động đã được bù xong)' }));
  }

  async function execute(gen, saga) {
    switch (nextAction(saga)) {
      case 'reserve': return doReserve(gen, saga);
      case 'charge': return doCharge(gen, saga);
      case 'recover': return doRecover(gen, saga);
      case 'confirm': return doConfirm(gen, saga);
      case 'refund': return doRefund(gen, saga);
      case 'release': return doRelease(gen, saga);
      case 'cancel': return doCancel(gen, saga);
      default: return 'wait';
    }
  }

  // ---------------- vòng chạy ----------------
  async function runSaga(sagaId) {
    if (paused || running.has(sagaId)) return; // một orchestrator: không chạy trùng một saga
    running.add(sagaId);
    const gen = generation;
    try {
      for (let i = 0; i < 30; i++) {
        const saga = load(sagaId);
        if (!saga || TERMINAL.has(saga.status)) return;
        if (saga.next_attempt_at && Date.parse(saga.next_attempt_at) > Date.now()) return;
        if ((await execute(gen, saga)) !== 'continue') return;
      }
    } catch (e) {
      if (e.message !== 'STALE_GENERATION') log.error('SAGA_ERROR', { saga_id: sagaId, message: e.message, stack: e.stack });
    } finally {
      running.delete(sagaId);
    }
  }

  function tick() {
    if (paused) return;
    const rows = db
      .prepare(
        `SELECT s.saga_id FROM sagas s JOIN orders o ON o.order_id = s.order_id
         WHERE o.status NOT IN ('CONFIRMED','CANCELLED') AND (s.next_attempt_at IS NULL OR s.next_attempt_at <= ?)`
      )
      .all(now());
    for (const r of rows) runSaga(r.saga_id);
  }

  // Khi process Order khởi động: đọc Saga record từ DB và tiếp tục (F6).
  function start() {
    const open = db
      .prepare("SELECT s.saga_id FROM sagas s JOIN orders o ON o.order_id = s.order_id WHERE o.status NOT IN ('CONFIRMED','CANCELLED')")
      .all();
    for (const { saga_id } of open) {
      const s = load(saga_id);
      tx(db, () => {
        addStep(s, 'RESUME', {
          from: s.status, to: s.status, op_id: s.intent ? s.intent.op_id : null,
          detail: `Order khởi động (pid ${process.pid}): đọc Saga record — ${s.status}, intent ${s.intent ? `${s.intent.step} ${s.intent.op_id}` : 'không'}, pending [${s.pending.join(', ')}] → tiếp tục bằng op ID cũ`,
        });
        db.prepare('UPDATE sagas SET next_attempt_at = NULL WHERE saga_id = ?').run(saga_id);
      });
      log.info('RESUME_ON_START', { saga_id, status: s.status, intent: s.intent });
    }
    setInterval(tick, RECOVERY_POLL_MS).unref();
    tick();
  }

  function resume(sagaId) {
    const s = load(sagaId);
    if (!s) return null;
    if (!TERMINAL.has(s.status)) {
      tx(db, () => {
        addStep(s, 'RESUME', { from: s.status, to: s.status, detail: `Resume thủ công theo saga_id ${sagaId} (không tạo checkout mới, không đổi op ID)` });
        db.prepare('UPDATE sagas SET next_attempt_at = NULL WHERE saga_id = ?').run(sagaId);
      });
      runSaga(sagaId);
    }
    return load(sagaId);
  }

  async function reset(wipe) {
    paused = true;
    generation += 1;
    const until = Date.now() + 8000;
    while (running.size && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
    wipe();
    paused = false;
  }

  return { runSaga, start, resume, reset, load };
}

module.exports = { createOrchestrator };
