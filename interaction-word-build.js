/* 拼字/组词 · interaction-word-build.html 页面脚本
   状态机：待作答 → 已选择 → 已提交 → 正确 / 错误（每题只判一次，不提供重试）。
   进度记账由 shared/activity-bridge.js 负责（课堂跳转由完成弹窗的按钮执行），本页只做界面并调用 finish()。
   页面只说事实（对错、正确答案），情绪交给公共弹窗；可见文案里只有一个“说话的人”——
   题目牌上的 emoji + 印尼语词。
   提示槽数据固定保留 icon / image / imageAlt 三个字段：image 有值时渲染真图，
   为空时渲染 emoji；以后换真图只改 QUESTION 数据，不改页面结构和样式。
   记账用「字块 id」而不是汉字本身：答案「妈妈」里有重复字，两个字块各自独立，
   判定时按位置逐字比对。 */
(function (global) {
  "use strict";

  const SOLO_MODAL_DELAY = 2000;      // 体验模式：提交后留多久看对错，再弹完成弹窗
  const modal = global.AICloudFeedbackModal || null;
  const copy = global.AICloudFeedbackCopy || {};

  /* 本页自带的示范题（题型体验用；字块顺序在进入页面时打乱）：
     字段结构与 round-content.js 里同题型的题目一致 */
  const DEMO_QUESTION = {
    id: "mother",
    icon: "👩",
    image: "",
    imageAlt: "一位妈妈 / seorang ibu",
    meaning: "ibu",
    answer: ["妈", "妈"],
    answerWord: "妈妈",
    answerPinyin: "māma",
    tiles: ["妈", "妈", "爸", "姐", "哥", "弟"]
  };

  /* 当前这道题（轮内来自 round-content.js，否则是上面那份示范题） */
  let QUESTION = DEMO_QUESTION;

  const el = {};
  let tiles = [];          // [{ id, text }]，打乱后的字块，重复字各有各的 id
  let slots = [];          // 每个作答槽存字块 id，空格是 null
  let submitted = false;
  let finished = false;
  let lastCorrect = false;
  let attempts = 0;
  let lastSeconds = 0;
  let startedAt = 0;
  let modalTimer = 0;
  let focusRequest = null; // { where: "slot" | "tile", key: Number | String }

  /* 跨页混题型一轮（链接带 q / total）：进度 / 下一题 / 记账与轮末弹窗交给 shared/round-flow.js */
  const roundFlow = global.AICloudRoundFlow || null;
  let roundState = { active: false };

  function setText(node, text) {
    if (node) node.textContent = text;
  }

  function shuffle(items) {
    const list = items.slice();
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const swap = list[i];
      list[i] = list[j];
      list[j] = swap;
    }
    return list;
  }

  function cache() {
    el.meaning = document.querySelector("[data-word-hint-meaning]");
    el.hintSlot = document.querySelector("[data-word-hint-slot]");
    el.slots = document.querySelector("[data-word-slots]");
    el.bank = document.querySelector("[data-word-bank]");
    el.submit = document.querySelector("[data-word-submit]");
    el.submitLabel = document.querySelector("[data-word-submit-label]");
    el.submitLabelId = document.querySelector("[data-word-submit-label-id]");
    el.reset = document.querySelector("[data-word-reset]");
    el.feedback = document.querySelector("[data-word-feedback]");
    el.feedbackTitle = document.querySelector(".word-feedback-title");
    el.feedbackIcon = document.querySelector("[data-word-feedback-icon]");
    el.verdict = document.querySelector("[data-word-verdict]");
    el.feedbackAnswer = document.querySelector("[data-word-feedback-answer]");
    el.live = document.querySelector("[data-activity-status]");
  }

  function activityBridge() {
    return global.AICloudActivity || null;
  }

  function mode() {
    const bridge = activityBridge();
    if (!bridge || typeof bridge.context !== "function") return "solo";
    return bridge.context().mode;
  }

  /* 返回键统一指向课堂页，只有提示语按模式区分（同其他题型页） */
  function applyShellText() {
    const back = document.querySelector("[data-activity-back]");
    if (!back) return;
    const isClass = mode() === "class";
    back.setAttribute("href", "classroom.html");
    back.setAttribute("aria-label", isClass ? "返回课堂互动" : "返回课堂");
  }

  function tileById(id) {
    return tiles.filter(function (tile) { return tile.id === id; })[0] || null;
  }

  function usedTileIds() {
    return slots.filter(function (id) { return !!id; });
  }

  function filledCount() {
    return usedTileIds().length;
  }

  function firstEmptySlot() {
    for (let index = 0; index < slots.length; index += 1) {
      if (!slots[index]) return index;
    }
    return -1;
  }

  /* 提示槽：image 有值渲染 <img src alt>，为空渲染套了 role="img" 的 emoji */
  function renderHint() {
    if (!el.hintSlot) return;
    el.hintSlot.textContent = "";
    if (QUESTION.image) {
      const image = document.createElement("img");
      image.src = QUESTION.image;
      image.alt = QUESTION.imageAlt || "";
      el.hintSlot.appendChild(image);
      return;
    }
    const emoji = document.createElement("span");
    emoji.className = "word-hint-emoji";
    emoji.setAttribute("role", "img");
    emoji.setAttribute("aria-label", QUESTION.imageAlt || "");
    emoji.textContent = QUESTION.icon;
    el.hintSlot.appendChild(emoji);
  }

  function buildSlot(index) {
    const wrap = document.createElement("div");
    wrap.className = "word-slot-wrap";

    const tileId = slots[index];
    const tile = tileId ? tileById(tileId) : null;
    const filled = !!tile;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "word-slot";
    button.dataset.wordSlot = String(index);
    if (filled) {
      button.classList.add("is-filled");
      button.textContent = tile.text;
    }
    if (!filled || submitted) button.disabled = true;
    button.setAttribute("aria-label", filled
      ? "第 " + (index + 1) + " 格：" + tile.text + "，点一下把这个字拿回字块区"
      : "第 " + (index + 1) + " 格：空着");

    if (submitted && filled) {
      const right = tile.text === QUESTION.answer[index];
      button.classList.add(right ? "is-correct" : "is-wrong");
      if (right) {
        const badge = document.createElement("span");
        badge.className = "word-slot-badge";
        badge.setAttribute("aria-hidden", "true");
        button.appendChild(badge);
      }
      button.setAttribute("aria-label", right
        ? "第 " + (index + 1) + " 格：" + tile.text + "，对了"
        : "第 " + (index + 1) + " 格：" + tile.text + "，不对；这一格应该是 " + QUESTION.answer[index]);
    }
    wrap.appendChild(button);

    /* 答错的格子：下面直接写这个位置正确的字，不加标签 */
    if (submitted && filled && tile.text !== QUESTION.answer[index]) {
      const fix = document.createElement("span");
      fix.className = "word-slot-fix";
      fix.textContent = QUESTION.answer[index];
      wrap.appendChild(fix);
    }
    return wrap;
  }

  function renderSlots() {
    if (!el.slots) return;
    el.slots.textContent = "";
    slots.forEach(function (tileId, index) {
      el.slots.appendChild(buildSlot(index));
    });
  }

  function buildTile(tile) {
    const used = usedTileIds().indexOf(tile.id) >= 0;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "word-tile";
    button.dataset.wordTile = tile.id;
    button.textContent = tile.text;
    if (used) button.classList.add("is-used");
    button.disabled = used || submitted;
    button.setAttribute("aria-label", used
      ? "字块 " + tile.text + "，已经用在空格里"
      : "字块 " + tile.text + "，点一下填进空格");
    return button;
  }

  function renderBank() {
    if (!el.bank) return;
    el.bank.textContent = "";
    tiles.forEach(function (tile) {
      el.bank.appendChild(buildTile(tile));
    });
  }

  function syncControls() {
    const full = filledCount() === slots.length;
    if (el.submit) {
      el.submit.disabled = submitted || !full;
    }
    if (el.submitLabel) setText(el.submitLabel, submitted ? "已提交" : "提交");
    if (el.submitLabelId) setText(el.submitLabelId, submitted ? "Terkirim" : "Kirim");
    if (el.reset) el.reset.disabled = submitted;
  }

  function applyFocus() {
    if (!focusRequest) return;
    const request = focusRequest;
    focusRequest = null;
    const selector = request.where === "slot"
      ? '[data-word-slot="' + request.key + '"]'
      : '[data-word-tile="' + request.key + '"]';
    const node = document.querySelector(selector);
    if (!node || node.disabled || typeof node.focus !== "function") return;
    node.focus({ preventScroll: true });
  }

  function render() {
    renderSlots();
    renderBank();
    syncControls();
    applyFocus();
  }

  /* 读屏专用播报：这一页所有状态都只说一遍 */
  function announce(message) {
    if (el.live) el.live.textContent = message;
  }

  function resetFeedback() {
    if (!el.feedback) return;
    el.feedback.classList.add("hidden");
    el.feedback.classList.remove("is-correct", "is-wrong");
    if (el.feedbackTitle) el.feedbackTitle.classList.remove("hidden");
    setText(el.feedbackIcon, "");
    setText(el.verdict, "");
    if (el.feedbackAnswer) {
      el.feedbackAnswer.classList.remove("hidden");
      el.feedbackAnswer.textContent = "";
    }
  }

  /* 结果条只说事实：全对＝绿框「✓ 答对了！」（字已经拼成绿块在上面，不再重复答案）；
     有错＝中性紫框，只放正确的词和读音，不加标签 */
  function showFeedback() {
    if (!el.feedback) return;
    el.feedback.classList.remove("hidden", "is-correct", "is-wrong");
    el.feedback.classList.add(lastCorrect ? "is-correct" : "is-wrong");
    if (el.feedbackTitle) el.feedbackTitle.classList.toggle("hidden", !lastCorrect);
    setText(el.feedbackIcon, lastCorrect ? "✓" : "");
    setText(el.verdict, lastCorrect ? "答对了！" : "");
    setText(el.feedbackAnswer, lastCorrect ? "" : QUESTION.answerWord + " " + QUESTION.answerPinyin);
    if (el.feedbackAnswer) el.feedbackAnswer.classList.toggle("hidden", lastCorrect);
    if (typeof el.feedback.scrollIntoView === "function") {
      el.feedback.scrollIntoView({ block: "nearest" });
    }
  }

  function placeTile(tileId) {
    if (submitted) return;
    const tile = tileById(tileId);
    if (!tile || usedTileIds().indexOf(tileId) >= 0) return;
    const index = firstEmptySlot();
    if (index < 0) return;
    slots[index] = tileId;
    focusRequest = { where: "slot", key: index };
    render();
    announce("已把「" + tile.text + "」填进第 " + (index + 1) + " 格，已填 " + filledCount() + " / " + slots.length + " 格");
  }

  function returnTile(index) {
    if (submitted) return;
    const tileId = slots[index];
    if (!tileId) return;
    const tile = tileById(tileId);
    slots[index] = null;
    focusRequest = { where: "tile", key: tileId };
    render();
    announce("已把「" + (tile ? tile.text : "") + "」放回字块区，已填 " + filledCount() + " / " + slots.length + " 格");
  }

  function resetAll() {
    if (submitted) return;
    if (filledCount() === 0) {
      announce("作答区已经是空的，可以直接点字块开始");
      return;
    }
    slots = slots.map(function () { return null; });
    focusRequest = null;
    render();
    announce("已把所有字块放回字块区，已填 0 / " + slots.length + " 格");
  }

  function completeOnce() {
    if (finished) return null;
    finished = true;
    const bridge = activityBridge();
    if (!bridge || typeof bridge.finish !== "function") return { recorded: false, next: "" };
    return bridge.finish({ correct: lastCorrect, seconds: lastSeconds });
  }

  function openModal(tier, praise) {
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
        { label: "再练一次", icon: "↻", onSelect: restartQuestion }
      ]
    });
  }

  function closeModal() {
    if (modal && typeof modal.close === "function") modal.close();
  }

  /* 再练一次：关掉弹窗，重新开始本题（字块重新打乱） */
  function restartQuestion() {
    closeModal();
    startQuestion();
  }

  function submitAnswer() {
    if (submitted || filledCount() !== slots.length) return;
    submitted = true;
    lastSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));

    /* 逐槽按位置比对：重复字不比文字，比这一格放的是不是这个字块该在的位置 */
    lastCorrect = slots.every(function (tileId, index) {
      const tile = tileById(tileId);
      return !!tile && tile.text === QUESTION.answer[index];
    });
    attempts += 1;
    const tier = lastCorrect ? (attempts === 1 ? "correctFirstTry" : "correct") : "wrong";
    const praise = typeof copy.draw === "function" ? copy.draw(tier) : null;

    focusRequest = null;
    render();
    showFeedback();
    announce(lastCorrect
      ? "答对了！" + QUESTION.answerWord + " " + QUESTION.answerPinyin + "。"
      : "再想想。正确答案是：" + QUESTION.answerWord + " " + QUESTION.answerPinyin + "。");

    /* 跨页那一轮：本页不记账、不弹窗——中间题只是「下一题」，最后一题交给 round-flow 结算 */
    if (roundState.active && roundFlow) {
      const step = roundFlow.afterAnswer(lastCorrect);
      const hasNext = step !== "finish";
      if (el.submit) el.submit.disabled = !hasNext;
      setText(el.submitLabel, hasNext ? "下一题" : "已提交");
      setText(el.submitLabelId, hasNext ? "Lanjut" : "Terkirim");
      return;
    }

    completeOnce();
    modalTimer = global.setTimeout(function () {
      openModal(tier, praise);
    }, SOLO_MODAL_DELAY);
  }

  function startQuestion() {
    global.clearTimeout(modalTimer);
    closeModal();
    resetFeedback();

    submitted = false;
    finished = false;
    lastCorrect = false;
    lastSeconds = 0;
    startedAt = Date.now();
    focusRequest = null;
    slots = QUESTION.answer.map(function () { return null; });
    tiles = shuffle(QUESTION.tiles).map(function (text, index) {
      return { id: "tile-" + index, text: text };
    });

    setText(el.meaning, QUESTION.meaning);
    renderHint();
    render();
    announce("点字块填进空格，点空格里的字可以拿回来。");
  }

  function bindEvents() {
    if (el.bank) {
      el.bank.addEventListener("click", function (event) {
        const button = event.target && event.target.closest ? event.target.closest("button.word-tile") : null;
        if (!button || button.disabled) return;
        placeTile(button.dataset.wordTile);
      });
    }
    if (el.slots) {
      el.slots.addEventListener("click", function (event) {
        const button = event.target && event.target.closest ? event.target.closest("button.word-slot") : null;
        if (!button || button.disabled) return;
        returnTile(Number(button.dataset.wordSlot));
      });
    }
    if (el.submit) el.submit.addEventListener("click", function () {
      /* 跨页那一轮：答完后这颗按钮是【下一题】，点它跳下一题那一页 */
      if (submitted && roundState.active && roundFlow) {
        roundFlow.goNext();
        return;
      }
      submitAnswer();
    });
    if (el.reset) el.reset.addEventListener("click", resetAll);
  }

  function boot() {
    cache();
    applyShellText();
    bindEvents();

    /* 轮内（跨页那一轮）→ 题目从 round-content.js 取；不是轮内 → 本页自带的那道示范题 */
    roundState = roundFlow && typeof roundFlow.init === "function" ? roundFlow.init("word-build") : { active: false };
    QUESTION = roundState.active && roundState.question ? roundState.question : DEMO_QUESTION;

    startQuestion();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  document.addEventListener("DOMContentLoaded", applyShellText);

  global.AICloudWordBuildPage = { boot: boot, startQuestion: startQuestion };
})(typeof window !== "undefined" ? window : globalThis);
