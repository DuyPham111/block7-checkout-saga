/* Saga Shop — Web UI. Chỉ ĐỌC/GHI qua API của từng service, không tự tính trạng thái đơn.
 * Mỗi 1 giây tải lại dữ liệu của tab đang mở => tự cập nhật khi trạng thái đổi. */
'use strict';
const U = window.LAB_CONFIG.urls;
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => (n === null || n === undefined ? '-' : `${Number(n).toLocaleString('vi-VN')}đ`);
const time = (iso) => (iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour12: false }) + '.' + String(new Date(iso).getMilliseconds()).padStart(3, '0') : '-');
const SVC_NAME = { order: 'Order', inventory: 'Inventory', payment: 'Payment' };

async function api(svc, path, opts = {}) {
  try {
    const r = await fetch(U[svc] + path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'content-type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(opts.timeout || 1500),
    });
    const data = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 0, error: e.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK' };
  }
}
const downBox = (svc, r) => `<div class="down-box">⚠ ${SVC_NAME[svc]} service không truy cập được (${esc(r.error || 'HTTP ' + r.status)}). Dữ liệu của ${SVC_NAME[svc]} tạm thời không hiển thị.</div>`;

// ---------- nhãn trạng thái ----------
const STATUS = {
  PENDING: ['Đang xử lý', 'info'],
  RESERVED: ['Đã giữ hàng', 'info'],
  CHARGED: ['Đã thanh toán', 'info'],
  CONFIRMED: ['Thành công', 'ok'],
  RECOVERING: ['Đang xác minh thanh toán', 'warn'],
  COMPENSATING: ['Đang hoàn tác', 'warn'],
  CANCELLED: ['Đã hủy', 'bad'],
};
const pill = (st) => {
  const [t, c] = STATUS[st] || [st, 'mute'];
  return `<span class="pill ${c}" title="${esc(st)}">${esc(t)}</span> <span class="code">${esc(st)}</span>`;
};
const REASON = {
  OUT_OF_STOCK: 'Hết hàng',
  REJECTED_BY_FAULT: 'Kho từ chối (fault)',
  INSUFFICIENT_FUNDS: 'Ví không đủ tiền',
  DECLINED_BY_FAULT: 'Thanh toán bị từ chối (fault)',
  WALLET_NOT_FOUND: 'Không có ví',
  CONFIRM_REJECTED: 'Xác nhận đơn bị từ chối',
  SKU_NOT_FOUND: 'Không có sản phẩm',
};
const reasonText = (r) => (r ? REASON[r] || r : '');

// ---------- trạng thái UI ----------
const state = {
  tab: 'shop',
  customer: 'CUS-AN',
  allCustomers: false,
  group: '',
  detail: null,
  moveSku: '',
  ledgerCustomer: '',
  wallets: [],
  items: [],
  health: {},
};

// ---------- header: trạng thái service ----------
async function refreshHealth() {
  const out = await Promise.all(['order', 'inventory', 'payment'].map(async (s) => [s, await api(s, '/health', { timeout: 1200 })]));
  state.health = Object.fromEntries(out);
  $('#health').innerHTML = out
    .map(([s, r]) =>
      r.ok
        ? `<span class="svc up"><span class="dot"></span>${SVC_NAME[s]}: chạy <small>pid ${r.data.pid}</small></span>`
        : `<span class="svc down"><span class="dot"></span>${SVC_NAME[s]}: không truy cập được</span>`
    )
    .join('');
}

// ---------- tab KHÁCH HÀNG ----------
async function loadCommon() {
  const [w, i] = await Promise.all([api('payment', '/payments/wallets'), api('inventory', '/inventory/items')]);
  if (w.ok) state.wallets = w.data.wallets;
  if (i.ok) state.items = i.data.items;
  return { w, i };
}

function fillCustomerSelects() {
  const sel = $('#customer');
  if (state.wallets.length && sel.options.length !== state.wallets.length) {
    sel.innerHTML = state.wallets.map((w) => `<option value="${w.customer_id}">${esc(w.name)} (${w.customer_id})</option>`).join('');
    sel.value = state.customer;
    $('#ledger-customer').innerHTML = '<option value="">Tất cả khách</option>' + state.wallets.map((w) => `<option value="${w.customer_id}">${esc(w.name)}</option>`).join('');
    $('#ledger-customer').value = state.ledgerCustomer;
  }
  const skuSel = $('#restock-sku');
  if (state.items.length && skuSel.options.length !== state.items.length) {
    skuSel.innerHTML = state.items.map((it) => `<option value="${it.sku}">${esc(it.name)}</option>`).join('');
    $('#move-sku').innerHTML = '<option value="">Tất cả sản phẩm</option>' + state.items.map((it) => `<option value="${it.sku}">${esc(it.name)}</option>`).join('');
    $('#move-sku').value = state.moveSku;
  }
}

async function renderShop() {
  const { w, i } = await loadCommon();
  fillCustomerSelects();
  const me = state.wallets.find((x) => x.customer_id === state.customer);
  $('#wallet-card').innerHTML = w.ok
    ? `<small>Số dư ví của ${esc(me ? me.name : state.customer)}</small><div class="bal">${money(me && me.balance)}</div><small>đọc từ Payment service</small>`
    : downBox('payment', w);

  $('#products').innerHTML = i.ok
    ? state.items
        .map(
          (it) => `<div class="prod">
            <div class="name">${esc(it.name)}</div>
            <div class="price">${money(it.price)}</div>
            <div class="stock ${it.available ? '' : 'out'}">${it.available ? `Còn ${it.available} sản phẩm` : 'Hết hàng'}${it.reserved ? ` · đang giữ ${it.reserved}` : ''}</div>
            <button class="primary" data-buy="${it.sku}">Mua</button>
          </div>`
        )
        .join('')
    : downBox('inventory', i);

  const qs = new URLSearchParams();
  if (!state.allCustomers) qs.set('customer_id', state.customer);
  if (state.group) qs.set('group', state.group);
  const [o, l] = await Promise.all([
    api('order', `/orders?${qs}`),
    api('payment', `/payments/ledger${state.allCustomers ? '' : '?customer_id=' + state.customer}`),
  ]);
  const groups = [['', 'Tất cả'], ['success', 'Thành công'], ['cancelled', 'Đã hủy'], ['active', 'Đang xử lý']];
  $('#order-filter').innerHTML = groups.map(([g, t]) => `<button data-group="${g}" class="${state.group === g ? 'on' : ''}">${t}</button>`).join('');
  if (!o.ok) return void ($('#orders').innerHTML = downBox('order', o));
  const byOrder = {};
  if (l.ok) for (const e of l.data.entries) (byOrder[e.order_id] = byOrder[e.order_id] || []).push(e);
  const rows = o.data.orders;
  $('#orders').innerHTML = rows.length
    ? `<div class="tw"><table><tr><th>Mã đơn</th>${state.allCustomers ? '<th>Khách</th>' : ''}<th>Sản phẩm</th><th>SL</th><th>Số tiền</th><th>Trạng thái</th><th>Tiền của khách</th><th>Lý do</th><th>Tạo lúc</th><th></th></tr>
      ${rows
        .map(
          (r) => `<tr><td><b>${r.order_id}</b>${r.scenario ? ` <span class="pill mute">${esc(r.scenario)}</span>` : ''}</td>
          ${state.allCustomers ? `<td>${esc(r.customer_id)}</td>` : ''}
          <td>${esc(r.item_name)}</td><td>${r.quantity}</td><td>${money(r.amount)}</td><td>${pill(r.status)}</td>
          <td>${l.ok ? moneyLine(byOrder[r.order_id] || []) : '<span class="code">Payment không truy cập được</span>'}</td>
          <td>${esc(reasonText(r.reason))}</td><td>${time(r.created_at)}</td>
          <td><button data-detail="${r.order_id}">Chi tiết</button></td></tr>`
        )
        .join('')}</table></div>`
    : '<div class="empty">Chưa có đơn nào.</div>';
}

// Tóm tắt tiền của khách cho 1 đơn — đọc thẳng từ các dòng ledger
function moneyLine(entries) {
  const charged = entries.filter((e) => e.kind === 'charge' && e.status === 'CHARGED');
  const failed = entries.filter((e) => e.kind === 'charge' && e.status === 'FAILED');
  const refunds = entries.filter((e) => e.kind === 'refund');
  const c = charged.reduce((s, e) => s + e.amount, 0);
  const r = refunds.reduce((s, e) => s + e.amount, 0);
  if (!entries.length) return '<span class="code">Không bị trừ tiền</span>';
  if (c && r) return `<span class="minus">−${money(c)}</span> → <span class="plus">+${money(r)}</span> <b>= ${money(c - r)}</b>`;
  if (c) return `<span class="minus">−${money(c)}</span>`;
  if (failed.length) return '<span class="code">Thanh toán thất bại, không bị trừ</span>';
  return '-';
}

async function buy(sku) {
  const qty = Number($('#qty').value) || 1;
  const r = await api('order', '/orders', { method: 'POST', body: { customer_id: state.customer, sku, quantity: qty } });
  const m = $('#buy-msg');
  if (r.ok) {
    m.className = 'msg ok';
    m.textContent = `Đã tạo đơn ${r.data.order_id} (${money(r.data.amount)}) — đang xử lý, xem trạng thái bên dưới.`;
  } else {
    m.className = 'msg bad';
    m.textContent = r.status ? `Không đặt được: ${r.data?.error || r.status}` : 'Order service không truy cập được — chưa tạo đơn.';
  }
  refresh();
}

// ---------- chi tiết đơn (cả 3 kho) ----------
async function renderDetail() {
  const id = state.detail;
  if (!id) return;
  const [o, i, p] = await Promise.all([
    api('order', `/orders/${id}/saga`),
    api('inventory', `/inventory/reservations?order_id=${id}`),
    api('payment', `/payments/ledger?order_id=${id}`),
  ]);
  $('#d-title').innerHTML = `Đơn ${esc(id)} ${o.ok ? pill(o.data.status) : ''}`;
  let html = '';
  if (o.ok) {
    const d = o.data;
    html += `<p>${esc(d.quantity)} × <b>${esc(d.item_name)}</b> — ${money(d.amount)} — khách <b>${esc(d.customer_id)}</b>${d.scenario ? ` — kịch bản <b>${esc(d.scenario)}</b>` : ''}</p>`;
  }
  if (p.ok) {
    const e = p.data.entries;
    const c = e.filter((x) => x.kind === 'charge' && x.status === 'CHARGED').reduce((s, x) => s + x.amount, 0);
    const r = e.filter((x) => x.kind === 'refund').reduce((s, x) => s + x.amount, 0);
    const st = o.ok ? o.data.status : '';
    let note;
    if (st === 'CONFIRMED') note = ['ok', `Mua thành công: ví bị trừ ${money(c - r)} đúng bằng giá trị đơn.`];
    else if (st === 'CANCELLED' && c === r) note = ['ok', c ? `Mua thất bại nhưng tiền vẫn còn: đã trừ ${money(c)} rồi hoàn lại ${money(r)}.` : 'Mua thất bại nhưng tiền vẫn còn: ví không bị trừ đồng nào.'];
    else if (st === 'RECOVERING') note = ['warn', 'Đang xác minh với Payment: hệ thống chưa biết đã thu tiền hay chưa nên CHƯA kết luận, không hủy và không thu lần hai.'];
    else if (st === 'COMPENSATING') note = ['warn', `Đang hoàn tác: còn việc ${(o.data.saga.pending || []).join(', ')} chưa xong — chưa báo đã hủy.`];
    else note = ['info', 'Đơn đang được xử lý.'];
    html += `<div class="money-note ${note[0]}">${esc(note[1])}</div>`;
  }
  html += '<div class="summary">';
  html += `<div class="box"><h4>Order DB</h4>${o.ok ? `${pill(o.data.status)}<br><span class="code">phase ${esc(o.data.saga.phase)}<br>intent ${esc(o.data.saga.intent ? o.data.saga.intent.step + ' ' + o.data.saga.intent.op_id : '-')}<br>pending [${esc(o.data.saga.pending.join(', '))}]${o.data.saga.last_error ? '<br>lỗi gần nhất: ' + esc(o.data.saga.last_error) : ''}</span>` : downBox('order', o)}</div>`;
  html += `<div class="box"><h4>Inventory DB</h4>${i.ok ? (i.data.reservations.length ? i.data.reservations.map((x) => `<div><b>${x.reservation_id}</b> ${x.quantity}× ${esc(x.sku)} <span class="pill ${x.status === 'ACTIVE' ? 'ok' : 'mute'}">${x.status}</span></div>`).join('') : '<span class="empty">không có reservation</span>') : downBox('inventory', i)}</div>`;
  html += `<div class="box"><h4>Payment DB (ledger)</h4>${p.ok ? (p.data.entries.length ? p.data.entries.slice().reverse().map((x) => `<div><b>${x.entry_id}</b> ${x.kind} ${money(x.amount)} <span class="pill ${x.status === 'CHARGED' ? 'info' : x.status === 'REFUNDED' ? 'ok' : 'bad'}">${x.status}</span>${x.ref_charge_id ? ' → ' + x.ref_charge_id : ''}</div>`).join('') : '<span class="empty">ledger trống</span>') : downBox('payment', p)}</div>`;
  html += '</div>';
  if (o.ok) {
    html += '<h2>Các bước Saga (Saga record trong Order DB)</h2><ul class="timeline">';
    html += o.data.steps
      .map((s) => `<li><span class="code">#${s.seq}</span><span><span class="k ${s.kind}">${s.kind}</span><br><span class="code">${time(s.at)}</span></span><span>${s.from_status && s.from_status !== s.to_status ? `<b>${s.from_status} → ${s.to_status}</b> ` : ''}${esc(s.detail)}<br><span class="code">${s.op_id ? 'op ' + esc(s.op_id) + ' · ' : ''}pid ${s.pid}</span></span></li>`)
      .join('');
    html += '</ul>';
  }
  $('#d-body').innerHTML = html;
}

// ---------- tab KHO ----------
async function renderStock() {
  const { i } = await loadCommon();
  fillCustomerSelects();
  const qs = state.moveSku ? `?sku=${state.moveSku}` : '';
  const [m, r] = await Promise.all([api('inventory', `/inventory/movements${qs}`), api('inventory', '/inventory/reservations')]);
  if (!i.ok) {
    $('#stock-stats').innerHTML = '';
    $('#items').innerHTML = downBox('inventory', i);
    $('#movements').innerHTML = '';
    $('#reservations').innerHTML = '';
    return;
  }
  const items = i.data.items;
  const totalAvail = items.reduce((s, x) => s + x.available, 0);
  const totalRes = items.reduce((s, x) => s + x.reserved, 0);
  const out = items.filter((x) => !x.available).length;
  $('#stock-stats').innerHTML = `
    <div class="stat"><small>Số mặt hàng</small><b>${items.length}</b></div>
    <div class="stat"><small>Tổng tồn khả dụng</small><b>${totalAvail}</b></div>
    <div class="stat"><small>Đang giữ cho đơn</small><b>${totalRes}</b></div>
    <div class="stat"><small>Mặt hàng hết</small><b>${out}</b></div>`;
  $('#items').innerHTML = `<div class="tw"><table><tr><th>SKU</th><th>Tên</th><th>Giá</th><th>Khả dụng</th><th>Đang giữ</th></tr>${items
    .map((x) => `<tr><td class="code">${x.sku}</td><td>${esc(x.name)}</td><td>${money(x.price)}</td><td><b>${x.available}</b>${x.available ? '' : ' <span class="pill bad">hết</span>'}</td><td>${x.reserved}</td></tr>`)
    .join('')}</table></div>`;
  const KIND = { RESTOCK: ['Nhập kho', 'ok', '↑ hàng vào'], RESERVE: ['Giữ cho đơn', 'info', '↓ hàng ra'], RELEASE: ['Nhả về kho (bù)', 'warn', '↑ hàng vào'] };
  $('#movements').innerHTML = m.ok
    ? m.data.movements.length
      ? `<div class="tw"><table><tr><th>#</th><th>Lúc</th><th>Sản phẩm</th><th>Loại</th><th>Số lượng</th><th>Tồn sau</th><th>Đơn</th><th>Reservation</th><th>Ghi chú</th></tr>${m.data.movements
          .map((x) => {
            const k = KIND[x.kind];
            return `<tr><td class="code">${x.seq}</td><td>${time(x.at)}</td><td>${esc(x.sku)}</td><td><span class="pill ${k[1]}">${k[0]}</span> <span class="code">${k[2]}</span></td><td class="${x.quantity > 0 ? 'plus' : 'minus'}">${x.quantity > 0 ? '+' : ''}${x.quantity}</td><td>${x.available_after}</td><td>${esc(x.order_id || '-')}</td><td>${esc(x.reservation_id || '-')}</td><td>${esc(x.note || '')}</td></tr>`;
          })
          .join('')}</table></div>`
      : '<div class="empty">Chưa có biến động.</div>'
    : downBox('inventory', m);
  $('#reservations').innerHTML = r.ok
    ? r.data.reservations.length
      ? `<div class="tw"><table><tr><th>Mã</th><th>Đơn</th><th>Sản phẩm</th><th>SL</th><th>Trạng thái</th><th>Op giữ / nhả</th></tr>${r.data.reservations
          .map((x) => `<tr><td><b>${x.reservation_id}</b></td><td>${x.order_id}</td><td>${esc(x.sku)}</td><td>${x.quantity}</td><td><span class="pill ${x.status === 'ACTIVE' ? 'ok' : 'mute'}">${x.status === 'ACTIVE' ? 'Đang giữ' : 'Đã nhả'}</span></td><td class="code">${esc(x.reserve_op_id)}<br>${esc(x.release_op_id || '')}</td></tr>`)
          .join('')}</table></div>`
      : '<div class="empty">Chưa giữ hàng cho đơn nào.</div>'
    : downBox('inventory', r);
}

async function restock() {
  const r = await api('inventory', `/inventory/items/${$('#restock-sku').value}/restock`, { method: 'POST', body: { quantity: Number($('#restock-qty').value) } });
  const m = $('#restock-msg');
  m.className = r.ok ? 'msg ok' : 'msg bad';
  m.textContent = r.ok ? `Đã nhập, tồn mới: ${r.data.available}` : `Lỗi: ${r.data?.error || r.error}`;
  refresh();
}

// ---------- tab VÍ ----------
async function renderWallet() {
  const { w } = await loadCommon();
  fillCustomerSelects();
  const l = await api('payment', `/payments/ledger${state.ledgerCustomer ? '?customer_id=' + state.ledgerCustomer : ''}`);
  if (!w.ok) {
    $('#pay-stats').innerHTML = '';
    $('#wallets').innerHTML = downBox('payment', w);
    $('#ledger').innerHTML = '';
    return;
  }
  if (l.ok) {
    $('#pay-stats').innerHTML = `
      <div class="stat"><small>Đã thu (charge thành công)</small><b>${money(l.data.total_charged)}</b></div>
      <div class="stat"><small>Đã hoàn (refund)</small><b>${money(l.data.total_refunded)}</b></div>
      <div class="stat"><small>Thu ròng</small><b>${money(l.data.net_collected)}</b></div>
      <div class="stat"><small>Số giao dịch</small><b>${l.data.entries.length}</b></div>`;
  }
  $('#wallets').innerHTML = w.data.wallets
    .map((x) => `<div class="w"><div>${esc(x.name)} <span class="code">${x.customer_id}</span></div><div class="bal">${money(x.balance)}</div><button data-topup="${x.customer_id}">Nạp 500.000đ</button></div>`)
    .join('');
  const KIND = { charge: 'Thu tiền đơn', refund: 'Hoàn tiền', topup: 'Nạp tiền' };
  $('#ledger').innerHTML = l.ok
    ? `<div class="tw"><table><tr><th>Mã GD</th><th>Lúc</th><th>Loại</th><th>Khách</th><th>Đơn</th><th>Số tiền</th><th>Trạng thái</th><th>Tham chiếu</th><th>Số dư sau</th><th>Lý do</th><th>Operation ID</th></tr>${l.data.entries
        .map((x) => {
          const sign = x.kind === 'charge' ? (x.status === 'CHARGED' ? 'minus' : '') : 'plus';
          const amt = x.kind === 'charge' ? (x.status === 'CHARGED' ? '−' : '') + money(x.amount) : '+' + money(x.amount);
          const st = { CHARGED: 'info', FAILED: 'bad', REFUNDED: 'ok', COMPLETED: 'mute' }[x.status];
          return `<tr><td><b>${x.entry_id}</b></td><td>${time(x.at)}</td><td>${KIND[x.kind]}</td><td>${esc(x.customer_id)}</td><td>${esc(x.order_id || '-')}</td><td class="${sign}">${amt}</td><td><span class="pill ${st}">${x.status}</span></td><td>${esc(x.ref_charge_id || '-')}</td><td>${money(x.balance_after)}</td><td>${esc(reasonText(x.reason) || x.reason || '')}</td><td class="code">${esc(x.op_id || '-')}</td></tr>`;
        })
        .join('')}</table></div>`
    : downBox('payment', l);
}

async function topup(cid) {
  await api('payment', `/payments/wallets/${cid}/topup`, { method: 'POST', body: { amount: 500000 } });
  refresh();
}

// ---------- tab MA TRẬN ----------
const SCEN = {
  H0: { customer: 'CUS-AN', sku: 'SKU-TAINGHE', faults: [], how: 'An mua tai nghe, không lỗi.' },
  F1: { customer: 'CUS-AN', sku: 'SKU-LOA', faults: [], how: 'An mua Loa mini đang <b>hết hàng</b> (tồn 0) → kho từ chối tự nhiên.', needStockZero: 'SKU-LOA' },
  F2: { customer: 'CUS-BINH', sku: 'SKU-BANPHIM', faults: [], how: 'Bình (ví 300.000đ) mua bàn phím 900.000đ → <b>ví không đủ</b>, thanh toán thất bại tự nhiên.', needPoor: true },
  F3: { customer: 'CUS-AN', sku: 'SKU-TAINGHE', faults: [['order', 'confirm', 'reject', 1]], how: 'Fault: Order từ chối bước xác nhận sau khi đã thu tiền.' },
  F4: { customer: 'CUS-AN', sku: 'SKU-TAINGHE', faults: [['payment', 'charge.afterCommit', 'freeze', 1]], how: 'Fault: Payment commit charge rồi <b>treo</b> trước khi trả response. Sau đó ở terminal:<br><code>npm run lab -- kill payment</code> → chờ thấy RECOVERING → <code>npm run lab -- start payment</code>' },
  F5: { customer: 'CUS-AN', sku: 'SKU-TAINGHE', faults: [['order', 'confirm', 'reject', 1], ['payment', 'refund', 'error503', null]], how: 'Fault: confirm bị từ chối + refund lỗi 503 (giữ tới khi gỡ). Thấy COMPENSATING rồi bấm <b>Gỡ lỗi refund</b>.', extra: '<button data-clear-refund>Gỡ lỗi refund</button>' },
  F6: { customer: 'CUS-AN', sku: 'SKU-CHUOT', faults: [['order', 'orchestrator.afterChargeCall', 'freeze', 1]], how: 'Fault: Order nhận CHARGED rồi <b>treo trước khi ghi outcome</b>. Sau đó ở terminal:<br><code>npm run lab -- kill order</code> → <code>npm run lab -- start order</code>' },
};

async function runScenario(id) {
  const sc = SCEN[id];
  const faults = sc.faults.slice();
  // Nếu dữ liệu đã bị đổi (nhập thêm loa, nạp thêm tiền) thì dùng fault để vẫn tái hiện đúng lỗi
  if (sc.needStockZero) {
    const it = state.items.find((x) => x.sku === sc.needStockZero);
    if (it && it.available > 0) faults.push(['inventory', 'reserve', 'reject', 1]);
  }
  if (sc.needPoor) {
    const w = state.wallets.find((x) => x.customer_id === sc.customer);
    const it = state.items.find((x) => x.sku === sc.sku);
    if (w && it && w.balance >= it.price) faults.push(['payment', 'charge', 'fail', 1]);
  }
  for (const [svc, point, mode, times] of faults) await api(svc, '/__lab/faults', { method: 'POST', body: { point, mode, times } });
  await api('order', '/orders', { method: 'POST', body: { customer_id: sc.customer, sku: sc.sku, quantity: 1, scenario: id } });
  refresh();
}

async function scenarioSnapshot(orderId) {
  const [o, i, p] = await Promise.all([
    api('order', `/orders/${orderId}/saga`),
    api('inventory', `/inventory/reservations?order_id=${orderId}`),
    api('payment', `/payments/ledger?order_id=${orderId}`),
  ]);
  if (!o.ok || !i.ok || !p.ok) return { down: [!o.ok && 'Order', !i.ok && 'Inventory', !p.ok && 'Payment'].filter(Boolean) };
  return { order: o.data, reservations: i.data.reservations, ledger: p.data.entries.slice().reverse() };
}

async function renderMatrix() {
  await loadCommon();
  const rows = await Promise.all(
    Oracle.IDS.map(async (id) => {
      const r = await api('order', `/orders?scenario=${id}`);
      const last = r.ok && r.data.orders[0];
      let check = null;
      let snap = null;
      if (last) {
        snap = await scenarioSnapshot(last.order_id);
        if (!snap.down && last.terminal) check = Oracle.check(id, snap);
      }
      return { id, last, check, snap, orderDown: !r.ok };
    })
  );
  $('#matrix').innerHTML = `<div class="tw"><table><tr><th>ID</th><th>Tình huống</th><th>Cách tạo lỗi</th><th>Oracle (kết quả phải đạt)</th><th></th><th>Đơn gần nhất</th><th>Kiểm tra oracle</th></tr>${rows
    .map(({ id, last, check, snap, orderDown }) => {
      const o = Oracle.ORACLES[id];
      let res = '<span class="code">chưa chạy</span>';
      if (orderDown) res = '<span class="pill bad">Order không truy cập được</span>';
      else if (last && snap && snap.down) res = `<span class="pill warn">chờ: ${snap.down.join(', ')} không truy cập được</span>`;
      else if (last && !last.terminal) res = '<span class="pill warn">chưa kết thúc — chưa chấm</span>';
      else if (check) res = `<details><summary><span class="pill ${check.ok ? 'ok' : 'bad'}">${check.ok ? 'ĐẠT' : 'CHƯA ĐẠT'} ${check.checks.filter((c) => c.ok).length}/${check.checks.length}</span></summary><ul class="oracle-list">${check.checks.map((c) => `<li>${c.ok ? '✅' : '❌'} ${esc(c.label)} <span class="code">(${esc(c.actual)})</span></li>`).join('')}</ul></details>`;
      return `<tr><td><b>${id}</b><br><span class="code">${esc(o.kind)}</span></td><td><b>${esc(o.title)}</b><br><span class="code">${esc(o.fault)}</span></td>
        <td class="howto">${SCEN[id].how}</td><td class="howto">${esc(o.expect)}</td>
        <td><button class="primary" data-run="${id}">Chạy</button> ${SCEN[id].extra || ''}</td>
        <td>${last ? `<button data-detail="${last.order_id}">${last.order_id}</button><br>${pill(last.status)}` : '-'}</td><td>${res}</td></tr>`;
    })
    .join('')}</table></div>`;

  const f = await Promise.all(['order', 'inventory', 'payment'].map(async (s) => [s, await api(s, '/__lab/faults')]));
  $('#faults').innerHTML = f
    .map(([s, r]) => `<div><b>${SVC_NAME[s]}</b>: ${r.ok ? (r.data.faults.length ? r.data.faults.map((x) => `<span class="pill warn">${esc(x.point)}=${esc(x.mode)} ${x.times === null ? '(tới khi gỡ)' : `(${x.times} lần)`}</span>`).join(' ') : '<span class="code">không có</span>') : '<span class="pill bad">không truy cập được</span>'}</div>`)
    .join('');
  const s = await api('order', '/sagas');
  $('#open-sagas').innerHTML = s.ok
    ? s.data.sagas.length
      ? `<table><tr><th>Saga</th><th>Đơn</th><th>Trạng thái</th><th>Intent</th><th>Pending</th><th>Lỗi gần nhất</th></tr>${s.data.sagas.map((x) => `<tr><td>${x.saga.saga_id}</td><td>${x.order_id}</td><td>${pill(x.status)}</td><td class="code">${esc(x.saga.intent ? x.saga.intent.step + ' ' + x.saga.intent.op_id : '-')}</td><td class="code">${esc(x.saga.pending.join(', ') || '-')}</td><td class="code">${esc(x.saga.last_error || '-')}</td></tr>`).join('')}</table>`
      : '<div class="empty">Không có saga nào đang dở.</div>'
    : downBox('order', s);
}

// ---------- điều phối ----------
let busy = false;
async function refresh() {
  if (busy) return;
  busy = true;
  try {
    await refreshHealth();
    if (state.tab === 'shop') await renderShop();
    if (state.tab === 'stock') await renderStock();
    if (state.tab === 'wallet') await renderWallet();
    if (state.tab === 'matrix') await renderMatrix();
    if (state.detail) await renderDetail();
  } finally {
    busy = false;
  }
}

function setTab(t) {
  state.tab = t;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('on', s.id === 'tab-' + t));
  try {
    localStorage.setItem('saga-tab', t);
  } catch {
    /* bỏ qua */
  }
  refresh();
}

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.tab) return setTab(t.dataset.tab);
  if (t.dataset.buy) return buy(t.dataset.buy);
  if (t.dataset.group !== undefined) {
    state.group = t.dataset.group;
    return refresh();
  }
  if (t.dataset.detail) {
    state.detail = t.dataset.detail;
    $('#drawer').hidden = false;
    return renderDetail();
  }
  if (t.dataset.run) return runScenario(t.dataset.run);
  if (t.dataset.topup) return topup(t.dataset.topup);
  if (t.hasAttribute('data-clear-refund')) {
    await api('payment', '/__lab/faults?point=refund', { method: 'DELETE' });
    return refresh();
  }
});
$('#d-close').onclick = () => {
  state.detail = null;
  $('#drawer').hidden = true;
};
$('#drawer').onclick = (e) => {
  if (e.target.id === 'drawer') $('#d-close').onclick();
};
$('#customer').onchange = (e) => {
  state.customer = e.target.value;
  refresh();
};
$('#all-customers').onchange = (e) => {
  state.allCustomers = e.target.checked;
  refresh();
};
$('#move-sku').onchange = (e) => {
  state.moveSku = e.target.value;
  refresh();
};
$('#ledger-customer').onchange = (e) => {
  state.ledgerCustomer = e.target.value;
  refresh();
};
$('#restock-btn').onclick = restock;
$('#clear-faults').onclick = async () => {
  for (const s of ['order', 'inventory', 'payment']) await api(s, '/__lab/faults', { method: 'DELETE' });
  refresh();
};
$('#reset-lab').onclick = async () => {
  if (!confirm('Xóa toàn bộ đơn, giao dịch, lịch sử kho và nạp lại dữ liệu ban đầu?')) return;
  for (const s of ['order', 'inventory', 'payment']) await api(s, '/__lab/reset', { method: 'POST', timeout: 10000 });
  refresh();
};
$('#resume-btn').onclick = async () => {
  const id = $('#resume-id').value.trim();
  const r = await api('order', `/sagas/${id}/resume`, { method: 'POST' });
  $('#resume-msg').textContent = r.ok ? `Đã resume ${id}: ${r.data.status}` : `Lỗi: ${r.data?.error || r.error}`;
  refresh();
};

try {
  const t = new URLSearchParams(location.search).get('tab') || localStorage.getItem('saga-tab');
  if (t) setTab(t);
} catch {
  /* bỏ qua */
}
refresh();
setInterval(refresh, 1000);
