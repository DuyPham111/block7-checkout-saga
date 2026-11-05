'use strict';
// Tài liệu API phải khớp code: mọi route khai báo trong 3 service (và route chung) đều có trong docs/openapi.yaml, và ngược lại.
// Thêm route mà quên tài liệu (hoặc tài liệu một route không tồn tại) => test đỏ.
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const ROOT = path.join(__dirname, '..', '..');
const spec = YAML.parse(fs.readFileSync(path.join(ROOT, 'docs', 'openapi.yaml'), 'utf8'));
const SOURCES = ['common/app.js', 'services/order/server.js', 'services/inventory/server.js', 'services/payment/server.js'];

function routesInCode() {
  const out = new Set();
  for (const f of SOURCES) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(/app\.(get|post|delete)\('([^']+)'/g)) {
      out.add(`${m[1].toUpperCase()} ${m[2].replace(/:(\w+)/g, '{$1}')}`);
    }
  }
  return out;
}
function routesInSpec() {
  const out = new Set();
  for (const [p, item] of Object.entries(spec.paths)) {
    for (const method of ['get', 'post', 'delete']) if (item[method]) out.add(`${method.toUpperCase()} ${p}`);
  }
  return out;
}

test('mọi route trong code đều có trong OpenAPI và ngược lại', () => {
  const code = [...routesInCode()].sort();
  const doc = [...routesInSpec()].sort();
  expect(code.length).toBeGreaterThan(20);
  expect(doc).toEqual(code);
});

test('mỗi path chỉ đúng service sở hữu nó (servers theo cổng)', () => {
  const port = (p) => spec.paths[p].servers.map((s) => s.url.split(':').pop());
  expect(port('/orders')).toEqual(['3001']);
  expect(port('/inventory/reservations')).toEqual(['3002']);
  expect(port('/payments/charges')).toEqual(['3003']);
  expect(port('/health')).toEqual(['3001', '3002', '3003']);
});
