'use strict';
// Fault hook cho lab. Lưu trong RAM của process => restart là mất (đúng ý F4/F6).
// Mỗi fault: { point, mode, times } — times = số lần còn hiệu lực, null = tới khi gỡ.

function createFaults() {
  const list = new Map(); // point -> { mode, times, set_at }

  return {
    set(point, mode, times = 1) {
      list.set(point, { mode, times: times === null ? null : Number(times), set_at: new Date().toISOString() });
    },
    clear(point) {
      if (point) list.delete(point);
      else list.clear();
    },
    // Lấy mode của fault tại point và trừ một lượt (nếu có giới hạn lượt)
    take(point) {
      const f = list.get(point);
      if (!f) return null;
      if (f.times !== null) {
        f.times -= 1;
        if (f.times <= 0) list.delete(point);
      }
      return f.mode;
    },
    peek(point) {
      const f = list.get(point);
      return f ? f.mode : null;
    },
    all() {
      return [...list.entries()].map(([point, f]) => ({ point, ...f }));
    },
  };
}

module.exports = { createFaults };
