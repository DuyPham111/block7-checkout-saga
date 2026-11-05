'use strict';
// Log JSON từng dòng ra stdout (lab.js chuyển stdout vào logs/<service>.log).
// marker(): điểm dừng có tên, ghi đồng bộ ra file để script demo chờ được trước khi kill.
const fs = require('node:fs');
const path = require('node:path');
const { RUN_DIR } = require('../config');

function makeLogger(service) {
  const write = (level, event, data) => {
    const line = JSON.stringify({ ts: new Date().toISOString(), service, pid: process.pid, level, event, ...data });
    process.stdout.write(line + '\n');
  };
  return {
    info: (event, data = {}) => write('info', event, data),
    warn: (event, data = {}) => write('warn', event, data),
    error: (event, data = {}) => write('error', event, data),
    marker(name, data = {}) {
      const rec = { ts: new Date().toISOString(), service, pid: process.pid, marker: name, ...data };
      process.stdout.write(JSON.stringify({ ...rec, level: 'marker', event: 'MARKER' }) + '\n');
      const dir = path.join(RUN_DIR, 'markers');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(rec, null, 2));
      return rec;
    },
  };
}

// Đóng băng TOÀN BỘ process (chặn event loop) — giống process bị treo/SIGSTOP.
// Dùng tại điểm dừng để script kill process thật đúng vị trí.
function freeze(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

module.exports = { makeLogger, freeze };
