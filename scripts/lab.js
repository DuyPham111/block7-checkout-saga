'use strict';
// Công cụ điều khiển lab: start / stop / kill / restart / status / reset / resume / fault / snapshot / wait-marker / logs
//   npm run lab -- start all            npm run lab -- kill payment
//   npm run lab -- fault payment charge.afterCommit freeze
//   npm run lab -- snapshot O3 truoc-kill
const fs = require('node:fs');
const path = require('node:path');
const cfg = require('../config');
const P = require('../common/procs');
const { snapshot, brief } = require('../common/snapshot');

const ROOT = cfg.ROOT;
const opts = { runDir: cfg.RUN_DIR, logDir: cfg.LOG_DIR };
const SVC_URL = { order: cfg.URLS.order, inventory: cfg.URLS.inventory, payment: cfg.URLS.payment, ui: cfg.URLS.ui };
const ts = () => new Date().toISOString();
const say = (msg) => console.log(`[${ts()}] ${msg}`);
const list = (arg) => (!arg || arg === 'all' ? P.ORDER : [arg]);

async function start(arg) {
  for (const svc of list(arg)) {
    const r = P.startProcess(ROOT, svc, opts);
    const h = await P.waitHealthy(SVC_URL[svc]);
    say(`START ${svc.padEnd(9)} pid=${r.pid}${r.already ? ' (đang chạy sẵn)' : ''}  ${h ? 'UP ' + SVC_URL[svc] : 'CHƯA LÊN — xem logs/' + svc + '.log'}`);
  }
}
async function kill(arg, label = 'KILL') {
  for (const svc of list(arg).slice().reverse()) {
    const r = P.killProcess(cfg.RUN_DIR, svc);
    if (r.pid) await P.waitDead(r.pid);
    say(`${label} ${svc.padEnd(9)} ${r.killed ? `pid=${r.pid} đã bị kill (process thật dừng ngay)` : 'không chạy'}`);
  }
}
async function status() {
  for (const svc of P.ORDER) {
    const pid = P.readPid(cfg.RUN_DIR, svc);
    let h = null;
    try {
      const r = await fetch(SVC_URL[svc] + '/health', { signal: AbortSignal.timeout(1000) });
      h = r.ok ? await r.json().catch(() => ({})) : null;
    } catch {
      h = null;
    }
    console.log(`${svc.padEnd(10)} pid=${String(pid || '-').padEnd(7)} process=${P.isAlive(pid) ? 'sống' : 'chết'}  http=${h ? 'UP' : 'KHÔNG TRUY CẬP ĐƯỢC'}  ${SVC_URL[svc]}`);
  }
}
async function post(url, body, method = 'POST') {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(3000) });
  return { status: r.status, data: await r.json().catch(() => null) };
}

async function main() {
  const [cmd, a, b, c, d] = process.argv.slice(2);
  switch (cmd) {
    case 'start':
      return start(a);
    case 'stop':
      return kill(a || 'all', 'STOP');
    case 'kill':
      if (!a) throw new Error('cần tên service: order | inventory | payment | ui');
      return kill(a, 'KILL');
    case 'restart':
      await kill(a, 'KILL');
      return start(a);
    case 'status':
      return status();
    case 'reset': {
      await kill('all', 'STOP');
      // Chỉ xóa file DB lúc chạy (giữ data/seed/*.json). Windows nhả khóa file chậm sau khi kill => retry.
      const dbFiles = fs.existsSync(cfg.DATA_DIR) ? fs.readdirSync(cfg.DATA_DIR).filter((f) => /\.db(-wal|-shm)?$/.test(f)) : [];
      for (const f of dbFiles) fs.rmSync(path.join(cfg.DATA_DIR, f), { force: true, maxRetries: 20, retryDelay: 250 });
      fs.rmSync(path.join(cfg.RUN_DIR, 'markers'), { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
      say('RESET đã xóa data/*.db và run/markers — khởi động lại với dữ liệu từ data/seed/*.json');
      return start('all');
    }
    case 'resume': {
      const r = await post(`${cfg.URLS.order}/sagas/${a}/resume`);
      say(`RESUME ${a}: HTTP ${r.status} ${JSON.stringify(r.data)}`);
      return;
    }
    case 'fault': {
      // fault <svc> <point> <mode> [times|sticky]    |   fault clear [svc]   |   fault list
      if (a === 'list' || !a) {
        for (const svc of ['order', 'inventory', 'payment']) {
          try {
            const r = await fetch(`${SVC_URL[svc]}/__lab/faults`, { signal: AbortSignal.timeout(1000) });
            console.log(svc.padEnd(10), JSON.stringify((await r.json()).faults));
          } catch {
            console.log(svc.padEnd(10), 'không truy cập được');
          }
        }
        return;
      }
      if (a === 'clear') {
        for (const svc of b ? [b] : ['order', 'inventory', 'payment']) {
          const r = await post(`${SVC_URL[svc]}/__lab/faults`, null, 'DELETE').catch((e) => ({ status: 0, data: e.message }));
          say(`FAULT CLEAR ${svc}: ${r.status}`);
        }
        return;
      }
      const times = d === 'sticky' ? null : d ? Number(d) : 1;
      const r = await post(`${SVC_URL[a]}/__lab/faults`, { point: b, mode: c, times });
      say(`FAULT SET ${a} ${b}=${c} (${times === null ? 'tới khi gỡ' : times + ' lần'}): HTTP ${r.status}`);
      return;
    }
    case 'snapshot': {
      if (!a) throw new Error('cần order_id, ví dụ O1');
      const s = await snapshot(cfg.URLS, a, { dataDir: cfg.DATA_DIR });
      console.log(brief(s));
      const dir = path.join(ROOT, 'evidence', 'snapshots');
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${a}-${b || Date.now()}.json`);
      fs.writeFileSync(file, JSON.stringify(s, null, 2));
      say(`đã lưu ${path.relative(ROOT, file)}`);
      return;
    }
    case 'wait-marker': {
      const file = path.join(cfg.RUN_DIR, 'markers', `${a}.json`);
      const until = Date.now() + (Number(b) || 30) * 1000;
      while (Date.now() < until) {
        if (fs.existsSync(file)) {
          say(`MARKER ${fs.readFileSync(file, 'utf8').replace(/\s+/g, ' ')}`);
          return;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error(`không thấy marker ${a}`);
    }
    case 'logs': {
      const f = path.join(cfg.LOG_DIR, `${a}.log`);
      const lines = fs.readFileSync(f, 'utf8').trim().split('\n');
      console.log(lines.slice(-(Number(b) || 20)).join('\n'));
      return;
    }
    default:
      console.log(`Lệnh: start|stop [svc|all], kill <svc>, restart <svc>, status, reset, resume <saga_id>,
      fault <svc> <point> <mode> [times|sticky], fault clear [svc], fault list,
      snapshot <order_id> [nhãn], wait-marker <tên> [giây], logs <svc> [n]
Service: order | inventory | payment | ui`);
  }
  void c;
}

main().catch((e) => {
  console.error('LỖI:', e.message);
  process.exit(1);
});
