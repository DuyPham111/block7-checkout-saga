'use strict';
// Khung Express chung: JSON, CORS cho Web UI, /health, route lab (faults/reset), xử lý lỗi.
const express = require('express');
const { URLS, LAB_FAULTS, HOST } = require('../config');
const { OpError } = require('./ops');

const STARTED_AT = new Date().toISOString();

function createApp(service, { faults, onReset, log }) {
  const app = express();
  app.use(express.json());

  // UI chạy ở cổng 3000 và gọi thẳng từng service => cho phép origin của UI.
  const allowed = new Set([URLS.ui, URLS.ui.replace(HOST, 'localhost')]);
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowed.has(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Headers', 'content-type');
      res.set('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.get('/health', (req, res) => res.json({ service, status: 'UP', pid: process.pid, started_at: STARTED_AT }));

  if (LAB_FAULTS) {
    app.get('/__lab/faults', (req, res) => res.json({ service, faults: faults.all() }));
    app.post('/__lab/faults', (req, res) => {
      const { point, mode, times } = req.body || {};
      if (!point || !mode) return res.status(400).json({ error: 'cần point và mode' });
      faults.set(point, mode, times === undefined ? 1 : times);
      log.warn('FAULT_SET', { point, mode, times: times === undefined ? 1 : times });
      res.json({ service, faults: faults.all() });
    });
    app.delete('/__lab/faults', (req, res) => {
      faults.clear(req.query.point);
      log.warn('FAULT_CLEARED', { point: req.query.point || 'ALL' });
      res.json({ service, faults: faults.all() });
    });
    app.post('/__lab/reset', async (req, res, next) => {
      try {
        faults.clear();
        await onReset();
        log.warn('RESET', {});
        res.json({ service, reset: true });
      } catch (e) {
        next(e);
      }
    });
  }

  return app;
}

function finishApp(app, log) {
  app.use((req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof OpError) return res.status(err.http).json({ error: err.code, message: err.message, ...err.extra });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'BAD_JSON' });
    log.error('UNHANDLED', { message: err.message, stack: err.stack });
    res.status(500).json({ error: 'INTERNAL', message: err.message });
  });
}

module.exports = { createApp, finishApp };
