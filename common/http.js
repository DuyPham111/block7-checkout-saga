'use strict';
// Gọi HTTP sang service khác, LUÔN có timeout. Không ném lỗi: trả về kết quả để phân loại.
//   { ok, status, data }            nhận được response
//   { ok:false, status:0, error }   không nhận được response (timeout, từ chối kết nối...) => UNKNOWN
const { HTTP_TIMEOUT_MS } = require('../config');

async function call(method, url, body, timeoutMs = HTTP_TIMEOUT_MS) {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    const code = e.name === 'TimeoutError' ? 'TIMEOUT' : e.cause?.code || e.name || 'NETWORK_ERROR';
    return { ok: false, status: 0, error: code };
  }
}

module.exports = { call };
