'use strict';
// Chạy toàn bộ test và ghi evidence/test-output.txt dạng dễ đọc (để nộp + đưa vào slide).
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const json = path.join(root, 'evidence', 'test-results.json');
fs.mkdirSync(path.dirname(json), { recursive: true });
spawnSync(process.execPath, [require.resolve('jest/bin/jest'), '--runInBand', '--json', `--outputFile=${json}`], { cwd: root, stdio: 'inherit' });
const r = JSON.parse(fs.readFileSync(json, 'utf8'));
const out = [`Kết quả test — ${new Date(r.startTime).toISOString()}`];
for (const s of r.testResults) {
  out.push('', path.relative(root, s.name).split(path.sep).join('/'));
  for (const t of s.assertionResults) out.push(`  ${t.status === 'passed' ? '✓' : '✕'} ${[...t.ancestorTitles, t.title].join(' › ')} (${t.duration} ms)`);
}
out.push('', `Tests: ${r.numPassedTests} passed, ${r.numFailedTests} failed, ${r.numTotalTests} total · Suites: ${r.numPassedTestSuites}/${r.numTotalTestSuites}`);
fs.writeFileSync(path.join(root, 'evidence', 'test-output.txt'), out.join('\n') + '\n');
console.log(out.join('\n'));
process.exit(r.success ? 0 : 1);
