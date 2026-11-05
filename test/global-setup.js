'use strict';
// Khởi động 3 service THẬT (3 process, 3 file DB) trên cổng test trước khi chạy test.
const fs = require('node:fs');
const P = require('../common/procs');
const { BASE, URLS, DIRS, ENV, ROOT } = require('./env');

module.exports = async () => {
  for (const svc of ['order', 'payment', 'inventory']) P.killProcess(DIRS.runDir, svc);
  fs.rmSync(BASE, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  for (const svc of ['inventory', 'payment', 'order']) {
    P.startProcess(ROOT, svc, { runDir: DIRS.runDir, logDir: DIRS.logDir, env: ENV });
    const h = await P.waitHealthy(URLS[svc], 15000);
    if (!h) throw new Error(`test: ${svc} không khởi động được, xem ${DIRS.logDir}`);
  }
};
