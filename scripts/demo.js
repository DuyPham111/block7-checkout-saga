'use strict';
// Chạy kịch bản trên lab đang mở (cổng 300x, UI ở http://127.0.0.1:3000) và lưu evidence.
//   npm run demo -- f4            chạy F4 (kill/start Payment thật), giữ nguyên dữ liệu cũ để UI thấy lịch sử
//   npm run demo -- f6 --reset    reset dữ liệu lab trước
//   npm run evidence              = demo all: reset rồi chạy H0, F1..F6, ghi evidence/SUMMARY.md
const fs = require('node:fs');
const path = require('node:path');
const cfg = require('../config');
const P = require('../common/procs');
const { makeCtx, run } = require('./scenarios');
const Oracle = require('../common/oracle');

const args = process.argv.slice(2);
const which = (args.find((a) => !a.startsWith('--')) || '').toUpperCase();
const ids = which === 'ALL' ? Oracle.IDS : [which];
if (!ids.every((i) => Oracle.IDS.includes(i))) {
  console.log('Dùng: npm run demo -- <h0|f1|f2|f3|f4|f5|f6|all> [--reset]');
  process.exit(1);
}

const EVD = path.join(cfg.ROOT, 'evidence');
const ctx = makeCtx({
  root: cfg.ROOT,
  urls: cfg.URLS,
  dataDir: cfg.DATA_DIR,
  runDir: cfg.RUN_DIR,
  logDir: cfg.LOG_DIR,
  print: (s) => console.log(s),
});

async function ensureUp() {
  for (const svc of P.ORDER) {
    if (!(await P.waitHealthy(cfg.URLS[svc], 1500))) {
      P.startProcess(cfg.ROOT, svc, { runDir: cfg.RUN_DIR, logDir: cfg.LOG_DIR });
      if (!(await P.waitHealthy(cfg.URLS[svc], 15000))) throw new Error(`${svc} không chạy — thử: npm run lab -- start all`);
      console.log(`(đã start ${svc})`);
    }
  }
}

function writeResult(r) {
  const dir = path.join(EVD, r.id);
  fs.mkdirSync(dir, { recursive: true });
  const lines = [
    `# ${r.id} — ${Oracle.ORACLES[r.id].title}`,
    `Đơn ${r.order_id}, saga ${r.saga_id}. Oracle: ${Oracle.ORACLES[r.id].expect}`,
    '',
    ...r.timeline.map((t) => `[${t.at}] ${t.event}`),
    '',
    'Kiểm tra oracle:',
    ...r.check.checks.map((c) => `  ${c.ok ? '✓' : '✕'} ${c.label} (${c.actual})`),
    `KẾT LUẬN: ${r.check.ok ? 'ĐẠT' : 'CHƯA ĐẠT'}`,
  ];
  fs.writeFileSync(path.join(dir, 'timeline.txt'), lines.join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(r, null, 2));
}

function writeSummary(results) {
  const md = [
    '# Evidence tổng hợp — H0, F1–F6',
    '',
    `Chạy lúc ${new Date().toISOString()} bằng \`npm run evidence\` (reset dữ liệu lab, 3 process thật, kill/start thật cho F4 và F6).`,
    `Cấu hình: timeout gọi service ${cfg.HTTP_TIMEOUT_MS}ms · vòng phục hồi ${cfg.RECOVERY_POLL_MS}ms · backoff ${cfg.BACKOFF_MS.join('/')}ms.`,
    '',
    '| ID | Tình huống | Đơn | Trạng thái giữa chừng | Trạng thái cuối | Ledger của đơn | Oracle | Thời gian hội tụ |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const r of results) {
    const first = r.snaps[0];
    const last = r.snaps[r.snaps.length - 1];
    const mid = r.snaps.length > 1 ? `${first.order.status} (${first.label})` : '-';
    const led = (last.ledger || []).map((e) => `${e.entry_id} ${e.kind} ${e.status}`).join(', ') || 'trống';
    md.push(`| ${r.id} | ${Oracle.ORACLES[r.id].title} | ${r.order_id} | ${mid} | ${last.order.status} | ${led} | ${r.check.ok ? 'ĐẠT' : 'CHƯA ĐẠT'} ${r.check.checks.filter((c) => c.ok).length}/${r.check.checks.length} | ${r.extra.recovery_ms ? r.extra.recovery_ms + 'ms' : '-'} |`);
  }
  md.push('', 'Chi tiết từng tình huống: `evidence/<ID>/timeline.txt` (timeline + snapshot 3 kho) và `evidence/<ID>/result.json`.');
  fs.writeFileSync(path.join(EVD, 'SUMMARY.md'), md.join('\n') + '\n');
  fs.writeFileSync(
    path.join(EVD, 'summary.json'),
    JSON.stringify(results.map((r) => ({ id: r.id, order_id: r.order_id, ok: r.check.ok, passed: r.check.checks.filter((c) => c.ok).length, total: r.check.checks.length, mid: r.snaps.length > 1 ? r.snaps[0].order.status : null, final: r.snaps[r.snaps.length - 1].order.status, ledger: r.snaps[r.snaps.length - 1].ledger, extra: r.extra })), null, 2)
  );
}

(async () => {
  await ensureUp();
  if (which === 'ALL' || args.includes('--reset')) {
    await ctx.reset();
    console.log('(đã reset dữ liệu lab về seed)');
  }
  const results = [];
  for (const id of ids) {
    const r = await run(id, ctx);
    writeResult(r);
    results.push(r);
    console.log('');
  }
  if (which === 'ALL') {
    writeSummary(results);
    console.log(fs.readFileSync(path.join(EVD, 'SUMMARY.md'), 'utf8'));
  }
  process.exit(results.every((r) => r.check.ok) ? 0 : 1);
})().catch((e) => {
  console.error('LỖI DEMO:', e.message);
  process.exit(1);
});
