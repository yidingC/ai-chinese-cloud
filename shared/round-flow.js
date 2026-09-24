/* 轮内多题 · 跨页流程（试点版，四个题型页共用这一份；别在页面里各写一遍）

   一轮里的题分散在各自的题型页上，靠 URL 参数串成一整轮：
     ?type=<题型>&mode=class&slot=3&q=2&total=4
   本文件只管四件事：
     1) 读 URL（slot / q / total）——不是轮内（solo、缺参数、数据里没有这一轮）就整体关掉，
        页面照旧走"这一页就一道题"的老行为；
     2) 画卡片顶部的进度行（第 N 题 / 共 M 题 + 小点）；
     3) 中间题答完 → 按钮变【下一题 / Lanjut】，点一下跳下一题那一页；
     4) 最后一题答完 → 记一次账（整轮用时 + 整轮有没有错）+ 1.4 秒后完成弹窗。

   整轮计时存在 localStorage（key: ai-chinese-cloud-round-start-v1），形如：
     { "3": { startedAt, total, missed } }
   missed = 这一轮有没有答错过（决定轮末弹窗走哪档句池）；
   中途点返回课堂会清掉这一轮的备忘（不记账，下次进来从第 1 题重新计时）；
   开始时间超过 10 分钟也当过期，下一次进页面重新计时。

   正式接后台后只改 round-content.js（题目数据）和这里的两处 finish/链接拼法。 */
(function (global) {
  "use strict";

  const START_KEY = "ai-chinese-cloud-round-start-v1";
  const EXPIRE_MS = 10 * 60 * 1000;   // 一轮超过 10 分钟没做完：当过期，重新计时
  const MODAL_DELAY = 1400;           // 回执条先出场，完成弹窗后到

  let current = { active: false, slot: 0, index: 0, total: 0, questions: [], question: null };
  let answeredNow = false;            // 当前这一题已经判完分（进度行的点变绿）
  let modalTimer = 0;
  let backBound = false;

  function doc() {
    return global.document || null;
  }

  function readParams() {
    try {
      const params = new URLSearchParams(global.location && global.location.search ? global.location.search : "");
      return {
        mode: params.get("mode") === "class" ? "class" : "solo",
        slot: Number(params.get("slot")) || 0,
        index: Number(params.get("q")) || 0,
        total: Number(params.get("total")) || 0
      };
    } catch (error) {
      return { mode: "solo", slot: 0, index: 0, total: 0 };
    }
  }

  /* 这一轮的题目（来自 round-content.js）；没有对应的一轮就返回空 */
  function questionsFor(slot) {
    const content = global.AICloudRoundContent;
    const rounds = content && Array.isArray(content.rounds) ? content.rounds : [];
    const round = rounds.filter(function (item) {
      return item && Number(item.slot) === slot;
    })[0];
    return round && Array.isArray(round.questions) ? round.questions : [];
  }

  /* 题型 → 页面文件名：查 shared/activity-types.js 那张表 */
  function pageOf(type) {
    const api = global.AICloudActivityTypes;
    const meta = api && typeof api.get === "function" ? api.get(type) : null;
    return meta && meta.page ? meta.page : "";
  }

  function hrefFor(slot, index, total, type) {
    const page = pageOf(type);
    if (!page) return "";
    return page + "?type=" + encodeURIComponent(type) + "&mode=class&slot=" + slot +
      "&q=" + index + "&total=" + total;
  }

  /* 是不是轮内：课堂模式 + 四个参数齐 + 数据里这一轮在、题数对得上、这一题的题型就是本页题型 */
  function context(type) {
    const params = readParams();
    const questions = questionsFor(params.slot);
    const question = questions[params.index - 1] || null;
    const active = params.mode === "class" && params.slot > 0 && params.index >= 1 && params.total >= 1 &&
      questions.length === params.total && !!question && (!type || question.type === type);
    return {
      active: active,
      slot: params.slot,
      index: params.index,
      total: params.total,
      questions: active ? questions : [],
      question: active ? question : null
    };
  }

  /* ---------- 整轮计时备忘 ---------- */

  function readStore() {
    try {
      const raw = global.localStorage.getItem(START_KEY);
      const store = raw ? JSON.parse(raw) : {};
      return store && typeof store === "object" ? store : {};
    } catch (error) {
      return {};
    }
  }

  function writeStore(store) {
    try {
      global.localStorage.setItem(START_KEY, JSON.stringify(store));
    } catch (error) {
      /* 浏览器挡住 localStorage 时只影响计时，页面照常 */
    }
  }

  function entryFor(slot) {
    const entry = readStore()[slot];
    return entry && typeof entry === "object" ? entry : null;
  }

  /* 进页面时确保这一轮有开始时间：没有 / 过期 / 题数变了 → 重新计 */
  function ensureStarted(ctx) {
    const store = readStore();
    const entry = store[ctx.slot];
    const startedAt = entry ? Number(entry.startedAt) : 0;
    const fresh = startedAt > 0 && Number(entry.total) === ctx.total && (Date.now() - startedAt) < EXPIRE_MS;
    if (fresh) return;
    store[ctx.slot] = { startedAt: Date.now(), total: ctx.total, missed: false };
    writeStore(store);
  }

  function clearStart(slot) {
    if (!slot) return;
    const store = readStore();
    if (!(slot in store)) return;
    delete store[slot];
    writeStore(store);
  }

  /* 整轮用时：进第 1 题那刻开始，最后一题结算 */
  function roundSeconds(entry) {
    const startedAt = Number(entry && entry.startedAt) || 0;
    if (startedAt <= 0) return 1;
    return Math.max(1, Math.round((Date.now() - startedAt) / 1000));
  }

  /* ---------- 进度行 ---------- */

  function renderProgress() {
    if (!current.active) return;
    const document = doc();
    if (!document) return;
    const wrap = document.querySelector("[data-round-progress]");
    const dots = document.querySelector("[data-round-dots]");
    const text = document.querySelector("[data-round-text]");
    if (text) text.textContent = "第 " + current.index + " 题 / 共 " + current.total + " 题";
    if (wrap) wrap.classList.remove("hidden");
    if (!dots) return;
    dots.innerHTML = "";
    for (let i = 0; i < current.total; i += 1) {
      const dot = document.createElement("i");
      const done = i < current.index - 1 || (i === current.index - 1 && answeredNow);
      dot.classList.toggle("is-done", done);
      dot.classList.toggle("is-now", i === current.index - 1 && !done);
      dots.appendChild(dot);
    }
  }

  function nextHref() {
    if (!current.active || current.index >= current.total) return "";
    const next = current.questions[current.index];
    return next ? hrefFor(current.slot, current.index + 1, current.total, next.type) : "";
  }

  function firstHref() {
    if (!current.active) return "";
    const first = current.questions[0];
    return first ? hrefFor(current.slot, 1, current.total, first.type) : "";
  }

  /* 中途点返回课堂：清掉这一轮的计时备忘（不记账） */
  function bindBack() {
    if (backBound) return;
    const document = doc();
    if (!document) return;
    const back = document.querySelector("[data-activity-back]") ||
      document.querySelector(".page-header .icon-button");
    if (!back) return;
    backBound = true;
    back.addEventListener("click", function () {
      if (current.active) clearStart(current.slot);
    });
  }

  /* ---------- 完成弹窗 ---------- */

  function openRoundModal(tier, praise) {
    const modal = global.AICloudFeedbackModal;
    if (!modal || typeof modal.open !== "function") return;
    modal.open({
      tier: tier,
      badge: praise ? praise.emoji : "",
      titleZh: praise ? praise.zh : "",
      titleId: praise ? praise.id : "",
      actions: [
        {
          label: "返回课堂",
          onSelect: function () {
            if (global.location) global.location.href = "classroom.html";
          }
        },
        /* 印尼语副行显式给（"再做一次"不在公共弹窗的标准动作表里，不给就没有第二行小字） */
        { label: "再做一次", icon: "↻", subLabel: "Coba lagi", onSelect: restart }
      ]
    });
  }

  /* 最后一题：整轮结算——只在这一次记账，再出完成弹窗 */
  function finishRound() {
    const entry = entryFor(current.slot) || {};
    const missed = entry.missed === true;
    const seconds = roundSeconds(entry);
    clearStart(current.slot);

    const bridge = global.AICloudActivity;
    if (bridge && typeof bridge.finish === "function") {
      bridge.finish({ correct: !missed, seconds: seconds });
    }

    const copy = global.AICloudFeedbackCopy || {};
    const tier = missed ? "correct" : "correctFirstTry";
    const praise = typeof copy.draw === "function"
      ? (tier === "correctFirstTry" ? copy.draw(tier, { single: true }) : copy.draw(tier))
      : null;
    global.clearTimeout(modalTimer);
    modalTimer = global.setTimeout(function () {
      openRoundModal(tier, praise);
    }, MODAL_DELAY);
  }

  /* ---------- 页面用 ---------- */

  /* 页面启动时调一次：算轮内/轮外、画进度行、开始计时、盯住返回键 */
  function init(type) {
    current = context(type);
    answeredNow = false;
    if (!current.active) return current;
    ensureStarted(current);
    renderProgress();
    bindBack();
    return current;
  }

  /* 页面判完分、显示完回执条后调：中间题返回 "next"，最后一题返回 "finish"（已记账 + 弹窗在路上） */
  function afterAnswer(correct) {
    if (!current.active) return "off";
    answeredNow = true;
    if (correct !== true) {
      const store = readStore();
      const entry = store[current.slot];
      if (entry) {
        entry.missed = true;
        writeStore(store);
      }
    }
    renderProgress();
    if (current.index >= current.total) {
      finishRound();
      return "finish";
    }
    return "next";
  }

  function goNext() {
    const href = nextHref();
    if (href && global.location) global.location.href = href;
  }

  /* 再做一次 = 整轮重做：清掉计时备忘，回第 1 题那一页（重新计时） */
  function restart() {
    const modal = global.AICloudFeedbackModal;
    if (modal && typeof modal.close === "function") modal.close();
    if (current.slot) clearStart(current.slot);
    const href = firstHref();
    if (href && global.location) global.location.href = href;
  }

  global.AICloudRoundFlow = {
    START_KEY: START_KEY,
    context: context,
    init: init,
    renderProgress: renderProgress,
    afterAnswer: afterAnswer,
    goNext: goNext,
    restart: restart,
    isActive: function () { return !!current.active; },
    clearStart: function () { if (current.slot) clearStart(current.slot); }
  };
})(typeof window !== "undefined" ? window : globalThis);
