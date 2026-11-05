'use strict';
// Web UI là process riêng (cổng 3000): file tĩnh, slide, báo cáo và Swagger UI.
// Trình duyệt gọi THẲNG API của từng service => service nào chết thì phần của service đó báo "không truy cập được".
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yaml');
const { PORTS, HOST, URLS } = require('../config');

const app = express();
const root = path.join(__dirname, '..');
const specFile = path.join(root, 'docs', 'openapi.yaml');

app.get('/health', (req, res) => res.json({ service: 'ui', status: 'UP', pid: process.pid }));
app.get('/config.js', (req, res) => {
  res.type('application/javascript').send(`window.LAB_CONFIG = ${JSON.stringify({ urls: URLS })};`);
});
app.get('/oracle.js', (req, res) => res.sendFile(path.join(root, 'common', 'oracle.js')));

// Tài liệu API: đặc tả OpenAPI 3.1 viết tay + Swagger UI ("Try it out" gọi thẳng 3001/3002/3003)
app.get('/openapi.yaml', (req, res) => res.type('text/yaml').sendFile(specFile));
app.use('/docs', swaggerUi.serve, (req, res, next) => {
  const spec = YAML.parse(fs.readFileSync(specFile, 'utf8')); // đọc mỗi lần => sửa spec không cần restart
  return swaggerUi.setup(spec, { customSiteTitle: 'Saga Shop API' })(req, res, next);
});

app.use('/slides', express.static(path.join(root, 'presentation'), { index: 'slides.html' })); // slide trình chiếu
app.get('/report', (req, res) => res.sendFile(path.join(root, 'REPORT.html'))); // báo cáo dạng slide
app.use('/presentation', express.static(path.join(root, 'presentation'))); // ảnh dùng trong REPORT.html
app.use(express.static(path.join(root, 'ui')));
app.listen(PORTS.ui, HOST, () => console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'ui', event: 'LISTEN', url: URLS.ui })));
