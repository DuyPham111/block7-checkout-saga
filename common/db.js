'use strict';
// Mở một file SQLite cho MỘT service. Mỗi service chỉ mở file của chính nó.
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

function openDb(file, schemaSql) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL'); // ghi log trước (write-ahead), đọc không chặn ghi
  db.pragma('synchronous = FULL'); // fsync khi COMMIT: commit xong = đã nằm trên đĩa
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 2000');
  db.exec(schemaSql);
  return db;
}

// Chạy fn trong MỘT local transaction. Ném lỗi -> ROLLBACK tự động.
function tx(db, fn) {
  return db.transaction(fn)();
}

const now = () => new Date().toISOString();

module.exports = { openDb, tx, now };
