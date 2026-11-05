'use strict';
// Idempotency theo operation ID.
// Bảng operations nằm trong DB của chính service, ghi CÙNG local transaction với thay đổi nghiệp vụ.
const crypto = require('node:crypto');

const OPS_SCHEMA = `
CREATE TABLE IF NOT EXISTS operations (
  op_id        TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('PENDING','SUCCEEDED','FAILED')),
  http_status  INTEGER NOT NULL,
  result_json  TEXT NOT NULL,
  at           TEXT NOT NULL
);`;

const hashOf = (obj) => crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16);

class OpError extends Error {
  constructor(http, code, message, extra = {}) {
    super(message);
    this.http = http;
    this.code = code;
    this.extra = extra;
  }
}

// Gọi BÊN TRONG transaction. Nếu op đã có: trả kết quả cũ (replay) hoặc 409 nếu payload khác.
function findReplay(db, opId, kind, payload) {
  const row = db.prepare('SELECT * FROM operations WHERE op_id = ?').get(opId);
  if (!row) return null;
  if (row.kind !== kind || row.request_hash !== hashOf(payload)) {
    throw new OpError(409, 'OP_PAYLOAD_MISMATCH', `operation ${opId} đã dùng với nội dung khác`);
  }
  return { http: row.http_status, body: { ...JSON.parse(row.result_json), replayed: true } };
}

function recordOp(db, { opId, kind, payload, status, http, result }) {
  db.prepare(
    'INSERT INTO operations(op_id, kind, request_hash, status, http_status, result_json, at) VALUES (?,?,?,?,?,?,?)'
  ).run(opId, kind, hashOf(payload), status, http, JSON.stringify(result), new Date().toISOString());
}

function getOp(db, opId) {
  const row = db.prepare('SELECT * FROM operations WHERE op_id = ?').get(opId);
  if (!row) return null;
  return { op_id: row.op_id, kind: row.kind, status: row.status, result: JSON.parse(row.result_json), at: row.at };
}

module.exports = { OPS_SCHEMA, OpError, findReplay, recordOp, getOp, hashOf };
