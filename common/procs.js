'use strict';
// Khởi động / kill PROCESS THẬT. Mỗi service là một process Node riêng, PID lưu ở run/<svc>.pid.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SCRIPTS = {
  inventory: 'services/inventory/server.js',
  payment: 'services/payment/server.js',
  order: 'services/order/server.js',
  ui: 'scripts/ui-server.js',
};
const ORDER = ['inventory', 'payment', 'order', 'ui'];

function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

function pidFile(runDir, svc) {
  return path.join(runDir, `${svc}.pid`);
}
function readPid(runDir, svc) {
  try {
    return Number(fs.readFileSync(pidFile(runDir, svc), 'utf8').trim()) || null;
  } catch {
    return null;
  }
}

function startProcess(root, svc, { runDir, logDir, env = {} }) {
  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });
  const old = readPid(runDir, svc);
  if (old && isAlive(old)) return { svc, pid: old, already: true };
  const out = fs.openSync(path.join(logDir, `${svc}.log`), 'a');
  const child = spawn(process.execPath, [path.join(root, SCRIPTS[svc])], {
    cwd: root,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', out, out],
    env: { ...process.env, ...env },
  });
  child.unref();
  fs.closeSync(out);
  fs.writeFileSync(pidFile(runDir, svc), String(child.pid));
  return { svc, pid: child.pid, already: false };
}

// Kill cứng: trên Windows là TerminateProcess (không chạy handler dọn dẹp), giống SIGKILL.
function killProcess(runDir, svc) {
  const pid = readPid(runDir, svc);
  let killed = false;
  if (pid && isAlive(pid)) {
    try {
      process.kill(pid, 'SIGKILL');
      killed = true;
    } catch {
      killed = false;
    }
  }
  try {
    fs.unlinkSync(pidFile(runDir, svc));
  } catch {
    /* không có pid file */
  }
  return { svc, pid, killed };
}

async function waitHealthy(url, timeoutMs = 8000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const r = await fetch(url + '/health', { signal: AbortSignal.timeout(800) });
      if (r.ok) return await r.json();
    } catch {
      /* chưa lên */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

async function waitDead(pid, timeoutMs = 5000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (!isAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return !isAlive(pid);
}

module.exports = { SCRIPTS, ORDER, isAlive, readPid, startProcess, killProcess, waitHealthy, waitDead };
