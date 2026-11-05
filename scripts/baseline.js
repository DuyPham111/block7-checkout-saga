'use strict';
// BASELINE (cố ý sai): checkout gọi tuần tự reserve → charge → confirm, KHÔNG có Saga/compensation.
// Dùng để trình bày phần "Vấn đề": confirm lỗi sau khi đã thu tiền => tiền mất, hàng bị giữ, không ai bù.
const fs = require('node:fs');
const path = require('node:path');
const cfg = require('../config');

const http = async (method, url, body) => {
  const r = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(3000) });
  return { status: r.status, data: await r.json().catch(() => null) };
};
const out = [];
const say = (s) => {
  const line = `[${new Date().toISOString()}] ${s}`;
  out.push(line);
  console.log(line);
};

(async () => {
  const orderId = `BASE-${Date.now() % 100000}`;
  const before = (await http('GET', `${cfg.URLS.payment}/payments/wallets/CUS-CUONG`)).data.balance;
  say(`Baseline checkout cho đơn ${orderId} — khách CUS-CUONG, số dư trước: ${before.toLocaleString('vi-VN')}đ`);
  say('function checkout() { reserve(); charge(); confirm(); }   // không prepare, không vote, không bù');

  const r = await http('POST', `${cfg.URLS.inventory}/inventory/reservations`, { order_id: orderId, sku: 'SKU-TAINGHE', quantity: 1, reserve_op_id: `${orderId}:reserve` });
  say(`1. reserve → HTTP ${r.status}: ${r.data.reservation_id} ACTIVE   (Inventory DB ĐÃ COMMIT)`);
  const c = await http('POST', `${cfg.URLS.payment}/payments/charges`, { order_id: orderId, customer_id: 'CUS-CUONG', amount: 350000, charge_op_id: `${orderId}:charge` });
  say(`2. charge  → HTTP ${c.status}: ${c.data.charge_id} CHARGED  (Payment DB ĐÃ COMMIT)`);
  say('3. confirm → LỖI (giả lập): checkout ném exception, Order "rollback" đơn của mình… và dừng ở đó.');

  const after = (await http('GET', `${cfg.URLS.payment}/payments/wallets/CUS-CUONG`)).data.balance;
  const res = (await http('GET', `${cfg.URLS.inventory}/inventory/reservations?order_id=${orderId}`)).data.reservations;
  say('KẾT QUẢ SAU "ROLLBACK":');
  say(`   Order DB     : không có đơn ${orderId} (đã rollback)`);
  say(`   Inventory DB : ${res.map((x) => `${x.reservation_id} ${x.status}`).join(', ')}  ← orphan reservation: hàng bị giữ cho đơn không tồn tại`);
  say(`   Payment DB   : ${c.data.charge_id} CHARGED 350.000đ, số dư ${before.toLocaleString('vi-VN')}đ → ${after.toLocaleString('vi-VN')}đ  ← orphan charge: khách mất tiền`);
  say('=> ROLLBACK của Order DB không chạm được tới DB của Inventory và Payment. Cần Saga + compensation.');
  fs.mkdirSync(path.join(cfg.ROOT, 'evidence'), { recursive: true });
  fs.writeFileSync(path.join(cfg.ROOT, 'evidence', 'baseline.txt'), out.join('\n') + '\n');
})().catch((e) => {
  console.error('LỖI:', e.message, '— lab đã chạy chưa? npm run lab -- start all');
  process.exit(1);
});
