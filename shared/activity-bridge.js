(function (global) {
  "use strict";

  const types = global.AICloudActivityTypes || {
    get: function () { return null; }
  };
  const STORAGE_KEY = "ai-chinese-cloud-classroom-demo-v1";
  const CHANGE_EVENT = "classroom-state-change";
  const DEFAULTS = {
    phase: "live",
    task1Done: false,
    task2Done: false,
    task3Done: false,
    results: []
  };

  function read() {
    let stored = {};
    try {
      const raw = global.localStorage.getItem(STORAGE_KEY);
      stored = raw ? JSON.parse(raw) : {};
    } catch (error) {
      stored = {};
    }
    if (!stored || typeof stored !== "object") stored = {};
    const state = Object.assign({}, DEFAULTS, stored);
    if (!Array.isArray(state.results)) state.results = [];
    return state;
  }

  function write(patch) {
    const next = Object.assign(read(), patch || {});
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      next.storageBlocked = true;
    }
    if (typeof global.dispatchEvent === "function" && typeof global.CustomEvent === "function") {
      global.dispatchEvent(new global.CustomEvent(CHANGE_EVENT, { detail: next }));
    }
    return next;
  }

  function recordResult(result) {
    const state = read();
    const slot = Number(result && result.slot) || 0;
    /* 同一个 slot 再写（"再做一次"）：保留第一次的用时和完成时刻——速度榜只认第一次，
       其余字段（对错、明细）用这一次的。第一次没记到用时（＝0）时，才用这一次的补上。 */
    const previous = state.results.filter(function (item) { return item.slot === slot; })[0] || null;
    const entry = {
      slot: slot,
      type: (result && result.type) || "",
      correct: !(result && result.correct === false),
      seconds: Math.max(0, Number(result && result.seconds) || 0),
      detail: (result && result.detail) || "",
      completedAt: new Date().toISOString()
    };
    if (previous) {
      const firstSeconds = Number(previous.seconds);
      if (Number.isFinite(firstSeconds) && firstSeconds > 0) entry.seconds = firstSeconds;
      if (previous.completedAt) entry.completedAt = previous.completedAt;
    }
    const results = state.results
      .filter(function (item) { return item.slot !== slot; })
      .concat(entry)
      .sort(function (a, b) { return a.slot - b.slot; });
    const patch = { results: results };
    if (slot === 1) patch.task1Done = true;
    if (slot === 2) patch.task2Done = true;
    if (slot === 3) patch.task3Done = true;
    return write(patch);
  }

  function slotResult(slot) {
    return read().results.filter(function (item) { return item.slot === slot; })[0] || null;
  }

  function context() {
    let params;
    try {
      params = new URLSearchParams(global.location && global.location.search ? global.location.search : "");
    } catch (error) {
      params = new URLSearchParams("");
    }
    const mode = params.get("mode") === "class" ? "class" : "solo";
    const slot = Number(params.get("slot")) || 0;
    const type = params.get("type") || "";
    return {
      mode: mode,
      slot: slot,
      type: type,
      activity: types.get(type),
      state: read()
    };
  }

  function finish(result) {
    const ctx = context();
    const outcome = { recorded: false, next: "", slot: ctx.slot, type: ctx.type };
    if (ctx.mode !== "class" || ctx.slot <= 0) return outcome;
    recordResult(Object.assign({}, result || {}, { slot: ctx.slot, type: ctx.type }));
    outcome.recorded = true;
    outcome.next = "classroom.html";
    const delay = Math.max(0, Number(result && result.delay) || 0);
    /* 默认不自动跳转：课堂模式改由完成弹窗的【返回课堂】按钮负责；
       调用方明确传了正数 delay 时，仍保留定时跳转能力。 */
    if (delay > 0 && typeof global.setTimeout === "function" && global.location) {
      global.setTimeout(function () {
        global.location.href = outcome.next;
      }, delay);
    }
    return outcome;
  }

  const api = {
    STORAGE_KEY: STORAGE_KEY,
    CHANGE_EVENT: CHANGE_EVENT,
    read: read,
    write: write,
    recordResult: recordResult,
    slotResult: slotResult,
    context: context,
    finish: finish
  };

  global.AICloudActivity = api;
})(typeof window !== "undefined" ? window : globalThis);
