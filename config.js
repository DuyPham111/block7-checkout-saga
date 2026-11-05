'use strict';
// Cấu hình chung. Mọi con số thời gian ở đây được ghi trong báo cáo (rubric: "cấu hình timeout, resume, retry").
const path = require('node:path');

const env = process.env;
const ROOT = __dirname;
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

const HOST = '127.0.0.1'; // chỉ bind loopback (yêu cầu của slide)

const PORTS = {
  ui: num(env.UI_PORT, 3000),
  order: num(env.ORDER_PORT, 3001),
  inventory: num(env.INVENTORY_PORT, 3002),
  payment: num(env.PAYMENT_PORT, 3003),
};

const url = (svc) => `http://${HOST}:${PORTS[svc]}`;

module.exports = {
  ROOT,
  HOST,
  PORTS,
  URLS: { order: url('order'), inventory: url('inventory'), payment: url('payment'), ui: url('ui') },
  DATA_DIR: env.DATA_DIR || path.join(ROOT, 'data'), // file DB lúc chạy: data/order.db, inventory.db, payment.db
  SEED_DIR: env.SEED_DIR || path.join(ROOT, 'data', 'seed'), // dữ liệu ban đầu nộp kèm: data/seed/*.json
  RUN_DIR: env.RUN_DIR || path.join(ROOT, 'run'),
  LOG_DIR: env.LOG_DIR || path.join(ROOT, 'logs'),
  LAB_FAULTS: env.LAB_FAULTS !== '0', // hook tạo lỗi chỉ dùng trong lab; tắt bằng LAB_FAULTS=0

  HTTP_TIMEOUT_MS: num(env.HTTP_TIMEOUT_MS, 2000), // timeout mỗi lời gọi service -> service
  RECOVERY_POLL_MS: num(env.RECOVERY_POLL_MS, 1000), // vòng quét saga chưa kết thúc
  BACKOFF_MS: [1000, 2000, 4000, 5000], // retry khi lỗi tạm thời; tối đa 5 giây
  FREEZE_MS: num(env.FREEZE_MS, 10 * 60 * 1000), // thời gian "đóng băng" process tại điểm dừng
};
