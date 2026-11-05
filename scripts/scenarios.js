'use strict';
// Kịch bản H0, F1–F6 dùng chung cho automated tests (cổng 400x) và script demo/evidence (cổng 300x).
// F4, F6: kill/start PROCESS THẬT tại marker; F5: lỗi tạm thời rồi gỡ.
const fs = require('node:fs');
const path = require('node:path');
const P = require('../common/procs');
const { snapshot, brief } = require('../common/snapshot');
const Oracle = require('../common/oracle');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeCtx({ root, urls, dataDir, runDir, logDir, env = {}, print = () => {} }) {
  const timeline = [];
  const ctx = {
    urls, dataDir, runDir, logDir, timeline,
    note(event) {
      const rec = { at: new Date().toISOString(), event };
      timeline.push(rec);
      print(`[${rec.at}] ${event}`);
    },
    async http(method, url, body) {
      const r = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(5000) });
      return { status: r.status, data: await r.json().catch(() => null) };
    },
    async reset() {
      for (const s of ['order', 'inventory', 'payment']) await ctx.http('POST', `${urls[s]}/__lab/reset`);
      fs.rmSync(path.join(runDir, 'markers'), { recursive: true, force: true });
    },
    async fault(svc, point, mode, times = 1) {
      const r = await ctx.http('POST', `${urls[svc]}/__lab/faults`, { point, mode, times });
      ctx.note(`FAULT ${svc}: ${point}=${mode} (${times === null ? 'tới khi gỡ' : times + ' lần'}) → HTTP ${r.status}`);
    },
    async clearFault(svc, point) {
      const r = await ctx.http('DELETE', `${urls[svc]}/__lab/faults${point ? '?point=' + point : ''}`);
      ctx.note(`GỠ FAULT ${svc}${point ? ' ' + point : ''} → HTTP ${r.status}`);
    },
    async order(body) {
      const r = await ctx.http('POST', `${urls.order}/orders`, body);
      if (r.status !== 202) throw new Error(`tạo đơn lỗi HTTP ${r.status} ${JSON.stringify(r.data)}`);
      ctx.note(`ĐẶT HÀNG ${body.customer_id} mua ${body.sku} → ${r.data.order_id} / ${r.data.saga_id} (${r.data.amount}đ)`);
      return r.data;
    },
    async saga(orderId) {
      try {
        const r = await fetch(`${urls.order}/orders/${orderId}/saga`, { signal: AbortSignal.timeout(1500) });
        return r.ok ? await r.json() : null;
      } catch {
        return null;
      }
    },
    async waitStatus(orderId, statuses, timeoutMs = 15000) {
      const until = Date.now() + timeoutMs;
      while (Date.now() < until) {
        const s = await ctx.saga(orderId);
        if (s && statuses.includes(s.status)) return s;
        await sleep(150);
      }
      const s = await ctx.saga(orderId);
      throw new Error(`đơn ${orderId} không tới ${statuses.join('/')} trong ${timeoutMs}ms (đang ${s && s.status})`);
    },
    waitTerminal: (orderId, ms) => ctx.waitStatus(orderId, ['CONFIRMED', 'CANCELLED'], ms),
    async waitMarker(name, timeoutMs = 10000) {
      const file = path.join(runDir, 'markers', `${name}.json`);
      const until = Date.now() + timeoutMs;
      while (Date.now() < until) {
        if (fs.existsSync(file)) {
          const m = JSON.parse(fs.readFileSync(file, 'utf8'));
          ctx.note(`MARKER ${name} (pid ${m.pid}, op ${m.op_id}, ${m.charge_id || ''})`);
          return m;
        }
        await sleep(50);
      }
      throw new Error(`không thấy marker ${name}`);
    },
    async kill(svc) {
      const r = P.killProcess(runDir, svc);
      if (r.pid) await P.waitDead(r.pid);
      ctx.note(`KILL ${svc} pid=${r.pid} (process thật bị dừng)`);
      return r.pid;
    },
    async start(svc) {
      const r = P.startProcess(root, svc, { runDir, logDir, env });
      const h = await P.waitHealthy(urls[svc], 15000);
      if (!h) throw new Error(`${svc} không lên lại`);
      ctx.note(`START ${svc} pid=${r.pid} (process mới, cùng file DB)`);
      return r.pid;
    },
    async snap(orderId, label) {
      const s = await snapshot(urls, orderId, { dataDir });
      s.label = label;
      ctx.note(`SNAPSHOT ${label}\n${brief(s)}`);
      return s;
    },
  };
  return ctx;
}

const base = (id, customer, sku) => ({ customer_id: customer, sku, quantity: 1, scenario: id });

const SCENARIOS = {
  async H0(ctx) {
    const o = await ctx.order(base('H0', 'CUS-AN', 'SKU-TAINGHE'));
    await ctx.waitTerminal(o.order_id);
    return { o, snaps: [await ctx.snap(o.order_id, 'cuoi')] };
  },
  async F1(ctx) {
    const o = await ctx.order(base('F1', 'CUS-AN', 'SKU-LOA')); // Loa mini tồn 0 => từ chối tự nhiên
    await ctx.waitTerminal(o.order_id);
    return { o, snaps: [await ctx.snap(o.order_id, 'cuoi')] };
  },
  async F2(ctx) {
    const o = await ctx.order(base('F2', 'CUS-BINH', 'SKU-BANPHIM')); // ví 300k, giá 900k => không đủ tiền
    await ctx.waitTerminal(o.order_id);
    return { o, snaps: [await ctx.snap(o.order_id, 'cuoi')] };
  },
  async F3(ctx) {
    await ctx.fault('order', 'confirm', 'reject', 1);
    const o = await ctx.order(base('F3', 'CUS-AN', 'SKU-TAINGHE'));
    await ctx.waitTerminal(o.order_id);
    return { o, snaps: [await ctx.snap(o.order_id, 'cuoi')] };
  },
  async F4(ctx) {
    await ctx.fault('payment', 'charge.afterCommit', 'freeze', 1);
    const o = await ctx.order(base('F4', 'CUS-AN', 'SKU-TAINGHE'));
    await ctx.waitMarker('payment.charge.committed');
    const oldPid = await ctx.kill('payment');
    await ctx.waitStatus(o.order_id, ['RECOVERING'], 8000);
    const during = await ctx.snap(o.order_id, 'khi-payment-dung');
    await sleep(3000);
    const still = await ctx.saga(o.order_id);
    ctx.note(`Sau 3 giây Payment vẫn chết: đơn ${o.order_id} = ${still.status} (không terminal giả)`);
    const tStart = Date.now();
    const newPid = await ctx.start('payment');
    await ctx.waitTerminal(o.order_id, 20000);
    const recovery_ms = Date.now() - tStart;
    ctx.note(`Hội tụ sau ${recovery_ms}ms kể từ khi start Payment`);
    return { o, snaps: [during, await ctx.snap(o.order_id, 'cuoi')], extra: { recovery_ms, oldPid, newPid, stillStatus: still.status } };
  },
  async F5(ctx) {
    await ctx.fault('order', 'confirm', 'reject', 1);
    await ctx.fault('payment', 'refund', 'error503', null);
    const o = await ctx.order(base('F5', 'CUS-AN', 'SKU-TAINGHE'));
    const until = Date.now() + 10000;
    let s;
    while (Date.now() < until) {
      s = await ctx.saga(o.order_id);
      if (s && s.status === 'COMPENSATING' && s.saga.last_error) break;
      await sleep(150);
    }
    const during = await ctx.snap(o.order_id, 'khi-refund-loi');
    await sleep(2500);
    const still = await ctx.saga(o.order_id);
    ctx.note(`Sau 2.5 giây fault còn: ${still.status}, pending [${still.saga.pending.join(', ')}], lỗi gần nhất ${still.saga.last_error}`);
    const tClear = Date.now();
    await ctx.clearFault('payment', 'refund');
    await ctx.waitTerminal(o.order_id, 20000);
    const recovery_ms = Date.now() - tClear;
    ctx.note(`Hội tụ sau ${recovery_ms}ms kể từ khi gỡ fault`);
    return { o, snaps: [during, await ctx.snap(o.order_id, 'cuoi')], extra: { recovery_ms, stillStatus: still.status, stillPending: still.saga.pending } };
  },
  async F6(ctx) {
    await ctx.fault('order', 'orchestrator.afterChargeCall', 'freeze', 1);
    const o = await ctx.order(base('F6', 'CUS-AN', 'SKU-CHUOT'));
    const m = await ctx.waitMarker('order.charge.afterCall');
    const oldPid = await ctx.kill('order');
    const during = await ctx.snap(o.order_id, 'sau-khi-dung');
    const tStart = Date.now();
    const newPid = await ctx.start('order');
    await ctx.waitTerminal(o.order_id, 20000);
    const recovery_ms = Date.now() - tStart;
    ctx.note(`Hội tụ sau ${recovery_ms}ms kể từ khi start Order (pid ${oldPid} → ${newPid}), op trước restart ${m.op_id}`);
    return { o, snaps: [during, await ctx.snap(o.order_id, 'cuoi')], extra: { recovery_ms, oldPid, newPid, opBefore: m.op_id } };
  },
};

async function run(id, ctx) {
  ctx.timeline.length = 0;
  ctx.note(`===== ${id}: ${Oracle.ORACLES[id].title} =====`);
  const r = await SCENARIOS[id](ctx);
  const final = r.snaps[r.snaps.length - 1];
  const check = Oracle.check(id, final);
  ctx.note(`ORACLE ${id}: ${check.ok ? 'ĐẠT' : 'CHƯA ĐẠT'} ${check.checks.filter((c) => c.ok).length}/${check.checks.length}`);
  return { id, order_id: r.o.order_id, saga_id: r.o.saga_id, check, snaps: r.snaps, extra: r.extra || {}, timeline: ctx.timeline.slice() };
}

module.exports = { makeCtx, run, SCENARIOS, sleep };
