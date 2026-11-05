'use strict';
// Môi trường test: cổng 400x + thư mục tạm riêng => không đụng dữ liệu demo đang mở trên UI (300x).
const os = require('node:os');
const path = require('node:path');

const BASE = path.join(os.tmpdir(), 'block7-saga-test');
const PORTS = { order: 4001, inventory: 4002, payment: 4003, ui: 4000 };
const URLS = Object.fromEntries(Object.entries(PORTS).map(([k, v]) => [k, `http://127.0.0.1:${v}`]));
const DIRS = { dataDir: path.join(BASE, 'data'), runDir: path.join(BASE, 'run'), logDir: path.join(BASE, 'logs') };
const ENV = {
  ORDER_PORT: String(PORTS.order),
  INVENTORY_PORT: String(PORTS.inventory),
  PAYMENT_PORT: String(PORTS.payment),
  UI_PORT: String(PORTS.ui),
  DATA_DIR: DIRS.dataDir,
  RUN_DIR: DIRS.runDir,
  LOG_DIR: DIRS.logDir,
  LAB_FAULTS: '1',
};
module.exports = { BASE, PORTS, URLS, DIRS, ENV, ROOT: path.join(__dirname, '..') };
