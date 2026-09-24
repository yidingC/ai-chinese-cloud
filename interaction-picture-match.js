/* 图片—词语连线 · interaction-picture-match.html 页面脚本
   精简：页面不写字，只留一张作答卡——"说话"的是图卡和词卡本身。
   交互和原版连线题（app.js 的 initMatch）同一套判定：左右任一侧先点都行，
   点另一侧即判定；配对成功两边变绿打勾并锁定，配错两边红框抖动约 0.7 秒后复原。
   本题是纯点选配对、不画线：没有连线层（<svg>），也没有窗口尺寸重算逻辑。
   进度和结果不再显示成文字行，只通过视觉隐藏的播报区说给读屏软件。
   进度记账由 shared/activity-bridge.js 负责（课堂跳转由完成弹窗的按钮执行），本页只做界面并调用 finish()。
   跨页多题一轮（链接带 q / total）：进度行 / 下一题 / 记账与轮末弹窗交给 shared/round-flow.js。
   图槽数据固定保留 icon / image / imageAlt 三个字段：image 有值时渲染真图，
   为空时渲染 emoji；以后换真图只改 PAIRS 数据，不改页面结构和样式。 */
(function (global) {
  "use strict";

  /* 左列固定顺序：🏫 学校、🏥 医院、🏪 商店、🌳 公园 */
  const PAIRS = [
    { key: "school",   icon: "🏫", image: "", imageAlt: "学校的教学楼", word: "学校", pinyin: "xué xiào" },
    { key: "hospital", icon: "🏥", image: "", imageAlt: "医院的大楼",   word: "医院", pinyin: "yī yuàn" },
    { key: "shop",     icon: "🏪", image: "", imageAlt: "商店的门面",   word: "商店", pinyin: "shāng diàn" },
    { key: "park",     icon: "🌳", image: "", imageAlt: "公园里的大树", word: "公园", pinyin: "gōng yuán" }
  ];

  /* 右列固定顺序（乱序排列，自上而下）：公园、学校、商店、医院 */
  const RIGHT_ORDER = ["park", "school", "shop", "hospital"];

  const GROUP_TOTAL = PAIRS.length;
  const WRONG_RESET_DELAY = 720;      // 配错：红框和抖动保留 720ms 后复原（照原版连线题）
  const SOLO_MODAL_DELAY = 600;       // 体验模式：全部配对成功后约 0.6 秒弹完成弹窗
  const modal = global.AICloudFeedbackModal || null;
  const copy = global.AICloudFeedbackCopy || {};

  const el = {};
  const matched = new Set();
  let selected = null;
  let resolving = false;
  let finished = false;
  let lastSeconds = 0;
  let startedAt = 0;
  let modalTimer = 0;
  let madeMistake = false;

  /* 跨页多题一轮：进度行 / 下一题 / 记账都交给 shared/round-flow.js；不是轮内就照旧 */
  let roundFlow = null;
  let roundState = { active: false };

  function setText(node, text) {
    if (node) node.textContent = text;
  }

  function cache() {
    el.board = document.querySelector("[data-pm-board]");
    el.announcer = document.querySelector("[data-pm-announcer]");
    el.nextBox = document.querySelector("[data-pm-next]");
    el.nextButton = document.querySelector("[data-pm-next-btn]");
    el.nextLabel = document.querySelector("[data-pm-next-label]");
    el.nextLabelId = document.querySelector("[data-pm-next-label-id]");
  }

  function activityBridge() {
    return global.AICloudActivity || null;
  }

  function mode() {
    const bridge = activityBridge();
    if (!bridge || typeof bridge.context !== "function") return "solo";
    return bridge.context().mode;
  }

  /* 返回按钮跟着模式走（题型名由页头标题承担，页面里不再放角标） */
  function applyShellText() {
    const back = document.querySelector("[data-activity-back]");
    if (back) {
      const isClass = mode() === "class";
      back.setAttribute("href", "classroom.html");
      back.setAttribute("aria-label", isClass ? "返回课堂互动" : "返回课堂");
    }
  }

  function pairFor(key) {
    return PAIRS.filter(function (pair) { return pair.key === key; })[0] || null;
  }

  /* 图槽：image 有值渲染 <img src alt>，为空渲染套了 role="img" 的 emoji */
  function buildSlot(pair) {
    const slot = document.createElement("span");
    slot.className = "pm-slot";
    if (pair.image) {
      const image = document.createElement("img");
      image.src = pair.image;
      image.alt = pair.imageAlt || "";
      slot.appendChild(image);
      return slot;
    }
    slot.setAttribute("role", "img");
    slot.setAttribute("aria-label", pair.imageAlt || "");
    slot.textContent = pair.icon;
    return slot;
  }

  function buildLeftItem(pair) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "match-item";
    button.dataset.side = "left";
    button.dataset.key = pair.key;
    button.setAttribute("aria-label", "图片：" + pair.imageAlt);
    button.appendChild(buildSlot(pair));
    button.addEventListener("click", function () { onItemClick(button); });
    return button;
  }

  function buildRightItem(pair) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "match-item";
    button.dataset.side = "right";
    button.dataset.key = pair.key;
    button.setAttribute("aria-label", "词语：" + pair.word + " " + pair.pinyin);
    const word = document.createElement("strong");
    word.textContent = pair.word;
    const pinyin = document.createElement("span");
    pinyin.textContent = pair.pinyin;
    button.appendChild(word);
    button.appendChild(pinyin);
    button.addEventListener("click", function () { onItemClick(button); });
    return button;
  }

  function renderBoard() {
    if (!el.board) return;
    el.board.textContent = "";
    const leftColumn = document.createElement("div");
    leftColumn.className = "match-column";
    const rightColumn = document.createElement("div");
    rightColumn.className = "match-column";
    PAIRS.forEach(function (pair) {
      leftColumn.appendChild(buildLeftItem(pair));
    });
    RIGHT_ORDER.forEach(function (key) {
      const pair = pairFor(key);
      if (pair) rightColumn.appendChild(buildRightItem(pair));
    });
    el.board.appendChild(leftColumn);
    el.board.appendChild(rightColumn);
  }

  function markCorrect(key) {
    if (!el.board) return;
    el.board.querySelectorAll('[data-key="' + key + '"]').forEach(function (item) {
      item.classList.remove("selected", "wrong");
      item.classList.add("correct");
      item.disabled = true;
    });
  }

  function announce(message) {
    if (el.announcer) el.announcer.textContent = message || "";
  }

  function completeOnce(seconds) {
    if (finished) return null;
    finished = true;
    const bridge = activityBridge();
    if (!bridge || typeof bridge.finish !== "function") return { recorded: false, next: "" };
    return bridge.finish({ correct: true, seconds: seconds });
  }

  /* 完成弹窗：公共模具（从"通用＋配对专属"句池抽；一局没连错过走升级档） */
  function openModal() {
    if (!modal || typeof modal.open !== "function") return;
    const perfect = !madeMistake;
    const praise = (typeof copy.draw === "function" ? copy.draw("pair", { perfect: perfect }) : null)
      || { zh: "全部连对啦！", id: "Semua pasangan benar!", emoji: "🎉" };
    modal.open({
      tier: perfect ? "correctFirstTry" : "correct",
      badge: praise.emoji,
      titleZh: praise.zh,
      titleId: praise.id,
      actions: [
        {
          label: "返回课堂",
          onSelect: function () {
            if (global.location) global.location.href = "classroom.html";
          }
        },
        { label: "再练一次", icon: "↻", onSelect: restartBoard }
      ]
    });
  }

  function closeModal() {
    if (modal && typeof modal.close === "function") modal.close();
  }

  /* 再练一次：关掉弹窗，牌面重置，可以重新连一遍 */
  function restartBoard() {
    closeModal();
    startBoard();
  }

  /* 全部 4 组配对成功：调用 finish()（课堂模式记进度）；两种模式都弹完成弹窗 */
  function finishBoard() {
    lastSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    /* 轮内：不记账、不弹窗（结算由最后一题那页的 round-flow 做），只处理这颗按钮 */
    if (roundFlow && roundState.active) {
      const step = roundFlow.afterAnswer(!madeMistake);
      if (step === "next") {
        if (el.nextButton) el.nextButton.disabled = false;
      } else if (step === "finish") {
        if (el.nextLabel) el.nextLabel.textContent = "已提交";
        if (el.nextLabelId) el.nextLabelId.textContent = "Terkirim";
      }
      return;
    }
    completeOnce(lastSeconds);
    modalTimer = global.setTimeout(openModal, SOLO_MODAL_DELAY);
  }

  /* 点选流转（照 initMatch，去掉画线）：同一项再点＝取消；同侧另一项＝选中转移；另一侧＝判定 */
  function onItemClick(item) {
    if (!item || resolving || item.disabled || item.classList.contains("correct")) return;

    if (!selected) {
      selected = item;
      item.classList.add("selected");
      return;
    }

    if (selected === item) {
      item.classList.remove("selected");
      selected = null;
      return;
    }

    if (selected.dataset.side === item.dataset.side) {
      selected.classList.remove("selected");
      selected = item;
      item.classList.add("selected");
      return;
    }

    const left = selected.dataset.side === "left" ? selected : item;
    const right = selected.dataset.side === "right" ? selected : item;
    const key = left.dataset.key;
    const pair = pairFor(key);

    if (key === right.dataset.key) {
      matched.add(key);
      left.classList.remove("selected");
      right.classList.remove("selected");
      selected = null;
      markCorrect(key);
      announce("配对成功：" + (pair ? pair.word : key) + "，还剩 " + (GROUP_TOTAL - matched.size) + " 组");
      if (matched.size === GROUP_TOTAL) finishBoard();
      return;
    }

    resolving = true;
    left.classList.remove("selected");
    right.classList.remove("selected");
    left.classList.add("wrong");
    right.classList.add("wrong");
    madeMistake = true;
    selected = null;
    announce("这两个不是一对，再试试");

    global.setTimeout(function () {
      left.classList.remove("wrong");
      right.classList.remove("wrong");
      resolving = false;
    }, WRONG_RESET_DELAY);
  }

  function startBoard() {
    global.clearTimeout(modalTimer);
    closeModal();
    matched.clear();
    selected = null;
    resolving = false;
    finished = false;
    madeMistake = false;
    startedAt = Date.now();
    announce("");
    renderBoard();
  }

  function boot() {
    cache();
    applyShellText();
    /* 轮内多题：进度行 / 下一题 / 记账都交给 shared/round-flow.js；不是轮内就照旧 */
    roundFlow = global.AICloudRoundFlow || null;
    roundState = roundFlow && typeof roundFlow.init === "function" ? roundFlow.init("picture-match") : { active: false };
    if (roundState.active && el.nextBox) el.nextBox.classList.remove("hidden");
    if (roundState.active && el.nextButton) {
      el.nextButton.addEventListener("click", function () { roundFlow.goNext(); });
    }
    startBoard();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  document.addEventListener("DOMContentLoaded", applyShellText);

  global.AICloudPictureMatchPage = { boot: boot, startBoard: startBoard };
})(typeof window !== "undefined" ? window : globalThis);
