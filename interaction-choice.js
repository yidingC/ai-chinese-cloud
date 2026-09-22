/* 快速选择 · 看词选大图 —— 页面脚本（点图选中，提交后判分）
   题干给一个词 + 拼音，四个大图里点一张选中（紫），点【提交答案】才判分；提交前可以改选。
   页面给事实（对错 + 正确图的意思），弹窗给情绪（句池来自 shared/feedback-copy.js）。 */
(function (global) {
  "use strict";

  const MODAL_DELAY = 1400;          // 结果条先出场，弹窗后到

  // 示范题：题干是「能被图清楚表达的具象名词」；选项只有图和印尼语意思，不放中文字
  const QUESTION = {
    id: "choice-drink-1",
    word: "一杯茶",
    pinyin: "Yì bēi chá",
    options: [
      { emoji: "🍚", word: "一碗米饭", translate: "Semangkuk nasi" },
      { emoji: "👕", word: "一件衣服", translate: "Sebuah baju" },
      { emoji: "📚", word: "一本书", translate: "Sebuah buku" },
      { emoji: "🍵", word: "一杯茶", translate: "Secangkir teh", correct: true }
    ]
  };

  const el = {};
  const modal = global.AICloudFeedbackModal || null;
  const copy = global.AICloudFeedbackCopy || {};

  let tiles = [];
  let selectedId = "";
  let submitted = false;
  let finished = false;
  let attempts = 0; // 判分次数：第 1 次就对 = 一次全对
  let lastCorrect = false;
  let lastSeconds = 0;
  let startedAt = 0;
  let modalTimer = 0;

  function setText(node, text) {
    if (node) node.textContent = text;
  }

  function setHidden(node, hidden) {
    if (node) node.classList.toggle("hidden", !!hidden);
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
    el.word = document.querySelector("[data-choice-word]");
    el.pinyin = document.querySelector("[data-choice-pinyin]");
    el.options = document.querySelector("[data-choice-options]");
    el.submit = document.querySelector("[data-choice-submit]");
    el.submitLabel = document.querySelector("[data-choice-submit-label]");
    el.submitLabelId = document.querySelector("[data-choice-submit-label-id]");
    el.feedback = document.querySelector("[data-choice-feedback]");
    el.feedbackTitleRow = document.querySelector(".choice-feedback-title");
    el.feedbackIcon = document.querySelector("[data-choice-feedback-icon]");
    el.feedbackTitle = document.querySelector("[data-choice-feedback-title]");
    el.feedbackAnswer = document.querySelector("[data-choice-feedback-answer]");
  }

  function activityBridge() {
    return global.AICloudActivity || null;
  }

  function mode() {
    const bridge = activityBridge();
    if (!bridge || typeof bridge.context !== "function") return "solo";
    return bridge.context().mode;
  }

  function applyShellText() {
    const back = document.querySelector("[data-activity-back]");
    if (!back) return;
    const isClass = mode() === "class";
    back.setAttribute("href", "classroom.html");
    back.setAttribute("aria-label", isClass ? "返回课堂互动" : "返回课堂");
  }

  function tileNode(id) {
    return el.options ? el.options.querySelector('[data-choice-id="' + id + '"]') : null;
  }

  function closeModal() {
    if (modal && typeof modal.close === "function") modal.close();
  }

  function resetFeedback() {
    if (!el.feedback) return;
    el.feedback.classList.add("hidden");
    el.feedback.classList.remove("is-correct", "is-wrong");
    setText(el.feedbackIcon, "");
    setText(el.feedbackTitle, "");
    setHidden(el.feedbackTitleRow, false);
    setText(el.feedbackAnswer, "");
    setHidden(el.feedbackAnswer, true);
  }

  function resetSubmit() {
    if (!el.submit) return;
    el.submit.disabled = true;
    setText(el.submitLabel, "提交");
    setText(el.submitLabelId, "Kirim");
  }

  /* 选中态：紫描边 + 硬底；提交按钮跟着选中亮起来 */
  function paintSelection() {
    tiles.forEach(function (tile) {
      const button = tileNode(tile.id);
      if (!button) return;
      const isSelected = tile.id === selectedId;
      button.classList.toggle("selected", isSelected);
      button.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
    if (el.submit && !submitted) el.submit.disabled = !selectedId;
  }

  function renderOptions() {
    if (!el.options) return;
    el.options.innerHTML = "";
    tiles = shuffle(QUESTION.options).map(function (option, index) {
      return {
        id: "choice-" + index,
        emoji: option.emoji,
        word: option.word,
        translate: option.translate,
        correct: option.correct === true
      };
    });
    tiles.forEach(function (tile) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice-tile";
      button.dataset.choiceId = tile.id;
      button.dataset.word = tile.word;
      button.setAttribute("aria-label", tile.translate);
      button.setAttribute("aria-pressed", "false");

      const emoji = document.createElement("span");
      emoji.className = "choice-emoji";
      emoji.setAttribute("aria-hidden", "true");
      emoji.textContent = tile.emoji;

      button.appendChild(emoji);
      button.addEventListener("click", function () {
        selectTile(tile.id);
      });
      el.options.appendChild(button);
    });
  }

  function startQuestion() {
    global.clearTimeout(modalTimer);
    closeModal();
    selectedId = "";
    submitted = false;
    finished = false;
    attempts = 0;
    lastCorrect = false;
    startedAt = Date.now();

    setText(el.pinyin, QUESTION.pinyin || "");
    setHidden(el.pinyin, !QUESTION.pinyin);
    setText(el.word, QUESTION.word);

    renderOptions();
    resetFeedback();
    resetSubmit();
  }

  /* 再练一次：清空作答、回到本题初始状态（选项不重排） */
  function restartQuestion() {
    global.clearTimeout(modalTimer);
    closeModal();
    selectedId = "";
    submitted = false;
    finished = false;
    lastCorrect = false;
    startedAt = Date.now();
    tiles.forEach(function (tile) {
      const button = tileNode(tile.id);
      if (!button) return;
      button.disabled = false;
      button.classList.remove("selected", "correct", "wrong");
      button.setAttribute("aria-pressed", "false");
    });
    resetFeedback();
    resetSubmit();
  }

  /* 点图 = 选中 / 换选 / 再点一下取消；真正的判分在【提交答案】 */
  function selectTile(id) {
    if (submitted) return;
    selectedId = selectedId === id ? "" : id;
    paintSelection();
  }

  function showFeedback(isCorrect, correctTile) {
    if (!el.feedback) return;
    el.feedback.classList.remove("is-correct", "is-wrong");
    el.feedback.classList.add(isCorrect ? "is-correct" : "is-wrong");
    setText(el.feedbackIcon, isCorrect ? "✓" : "");
    setText(el.feedbackTitle, isCorrect ? "答对了！" : "");
    setHidden(el.feedbackTitleRow, !isCorrect); // 有错时框里只有意思行，没有标题行
    // 结果框只写图和它的意思（印尼语），不加中文标签：让学生把"这个词＝这个东西"连起来
    setText(el.feedbackAnswer, correctTile.emoji + " " + correctTile.translate);
    setHidden(el.feedbackAnswer, false);
    el.feedback.classList.remove("hidden");
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

  /* 矮屏退路：动画落定后回执底边要是还在屏幕下沿外，补滚一小段让它完整露出来；
     常见屏（≥700 高）算下来不用滚，页面不动。 */
  function revealReceipt() {
    if (!el.feedback || el.feedback.classList.contains("hidden") || typeof global.scrollBy !== "function") return;
    const overlap = el.feedback.getBoundingClientRect().bottom + 12 - global.innerHeight;
    if (overlap > 0) global.scrollBy({ top: overlap, behavior: "smooth" });
  }

  function submit() {
    if (submitted || !selectedId) return;
    const chosen = tiles.filter(function (tile) { return tile.id === selectedId; })[0];
    const correctTile = tiles.filter(function (tile) { return tile.correct; })[0];
    if (!chosen || !correctTile) return;

    submitted = true;
    attempts += 1;
    lastSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));

    const isCorrect = chosen.id === correctTile.id;
    const firstTry = isCorrect && attempts === 1;
    const tier = isCorrect ? (firstTry ? "correctFirstTry" : "correct") : "wrong";
    const praise = typeof copy.draw === "function" ? copy.draw(tier, { single: true }) : null;
    lastCorrect = isCorrect;

    // 判分时收起选中态，只留对错；之后不能再改
    tiles.forEach(function (tile) {
      const button = tileNode(tile.id);
      if (!button) return;
      button.disabled = true;
      button.classList.remove("selected");
      button.setAttribute("aria-pressed", "false");
      if (tile.correct) button.classList.add("correct");
      else if (tile.id === chosen.id) button.classList.add("wrong");
    });

    if (el.submit) {
      el.submit.disabled = true;
      setText(el.submitLabel, "已提交");
      setText(el.submitLabelId, "Terkirim");
    }

    showFeedback(isCorrect, correctTile);
    if (el.feedback && typeof el.feedback.scrollIntoView === "function") {
      /* 一屏放得下时不动页面；回执条被屏幕下沿裁掉才滚最小距离（跟其他页同一条退路） */
      el.feedback.scrollIntoView({ block: "nearest" });
      /* 出场的 0.28s 还没跑完，这会儿量到的位置是收在半截的；等它落定再补看一眼 */
      global.setTimeout(revealReceipt, 300);
    }

    completeOnce(); /* 课堂模式记进度；完成弹窗两种模式都走，跳转由弹窗按钮负责 */

    modalTimer = global.setTimeout(function () {
      openModal(tier, praise);
    }, MODAL_DELAY);
  }

  function bindEvents() {
    if (el.submit) el.submit.addEventListener("click", submit);
  }

  function boot() {
    cache();
    applyShellText();
    bindEvents();
    startQuestion();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  global.AICloudChoicePage = { boot: boot };
})(typeof window !== "undefined" ? window : globalThis);
