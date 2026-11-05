'use strict';
// Web UI là process riêng (cổng 3000): chỉ phục vụ file tĩnh.
// Trình duyệt gọi THẲNG API của từng service => service nào chết thì phần của service đó báo "không truy cập được".
const path = require('node:path');
const express = require('express');
const { PORTS, HOST, URLS } = require('../config');

const app = express();
const root = path.join(__dirname, '..');
app.get('/health', (req, res) => res.json({ service: 'ui', status: 'UP', pid: process.pid }));
app.get('/config.js', (req, res) => {
  res.type('application/javascript').send(`window.LAB_CONFIG = ${JSON.stringify({ urls: URLS })};`);
});
app.get('/oracle.js', (req, res) => res.sendFile(path.join(root, 'common', 'oracle.js')));
app.use('/slides', express.static(path.join(root, 'presentation'), { index: 'slides.html' })); // slide trình chiếu
app.use(express.static(path.join(root, 'ui')));
app.listen(PORTS.ui, HOST, () => console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'ui', event: 'LISTEN', url: URLS.ui })));
