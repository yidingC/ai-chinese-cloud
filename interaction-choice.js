/* 快速选择 · 看词选大图 —— 页面脚本（两种轮：本页三道题 / 跨页混题型一轮里的这一道）
   题干给一个词 + 拼音，四个大图里点一张选中（紫），点【提交 / Kirim】才判分；提交前可以改选。
   页面给事实（对错 + 正确图的意思），弹窗给情绪（句池来自 shared/feedback-copy.js）。

   轮外（第 1 轮、题型体验）：本页自带三道示范题，页内换题——中间题答完按钮变【下一题 / Lanjut】，
   最后一题答完记账（整轮用时 + 整轮有没有错），1.4 秒后出完成弹窗。
   轮内（第 3 轮那种跨页混题型一轮，链接带 q / total）：本页只跑数据里的这一道题，
   进度行、跳下一题、记账与完成弹窗都交给 shared/round-flow.js。 */
(function (global) {
  "use strict";

  const MODAL_DELAY = 1400;          // 结果条先出场，弹窗后到

  /* 本页自带的示范题（第 1 轮 / 题型体验用）：题干是「能被图清楚表达的具象名词」；
     选项只有图和印尼语意思（挂在 aria-label），不放中文字。
     内容以后由后台给；跨页那一轮的题在 round-content.js 里。 */
  const DEMO_QUESTIONS = [
    {
      id: "choice-drink-1",
      word: "一杯茶",
      pinyin: "Yì bēi chá",
      options: [
        { emoji: "🍚", word: "一碗米饭", translate: "Semangkuk nasi" },
        { emoji: "👕", word: "一件衣服", translate: "Sebuah baju" },
        { emoji: "📚", word: "一本书", translate: "Sebuah buku" },
        { emoji: "🍵", word: "一杯茶", translate: "Secangkir teh", correct: true }
      ]
    },
    {
      id: "choice-book-2",
      word: "一本书",
      pinyin: "Yì běn shū",
      options: [
        { emoji: "🍵", word: "一杯茶", translate: "Secangkir teh" },
        { emoji: "📚", word: "一本书", translate: "Sebuah buku", correct: true },
        { emoji: "🍚", word: "一碗米饭", translate: "Semangkuk nasi" },
        { emoji: "👕", word: "一件衣服", translate: "Sebuah baju" }
      ]
    },
    {
      id: "choice-clothes-3",
      word: "一件衣服",
      pinyin: "Yí jiàn yī fu",
      options: [
        { emoji: "📚", word: "一本书", translate: "Sebuah buku" },
        { emoji: "👕", word: "一件衣服", translate: "Sebuah baju", correct: true },
        { emoji: "🍚", word: "一碗米饭", translate: "Semangkuk nasi" },
        { emoji: "🍵", word: "一杯茶", translate: "Secangkir teh" }
      ]
    }
  ];

  const el = {};
  const modal = global.AICloudFeedbackModal || null;
  const copy = global.AICloudFeedbackCopy || {};

  let tiles = [];
  let selectedId = "";
  let index = 0;              // 第几题（0 起）
  let submitted = false;      // 本题已判分
  let missedInRound = false;  // 整轮有没有答错过（决定轮末弹窗走哪档句池）
  let recorded = false;       // 整轮有没有记过账（只在最后一题记一次）
  let roundStartedAt = 0;     // 整轮计时：进第 1 题那刻开始
  let modalTimer = 0;

  /* 跨页混题型一轮（第 3 轮）：本页只是其中一道题，进度 / 下一题 / 记账都交给 round-flow */
  const roundFlow = global.AICloudRoundFlow || null;
  let roundState = { active: false };
  let questions = DEMO_QUESTIONS;

  const isLastQuestion = () => index >= questions.length - 1;

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
    el.card = document.querySelector("[data-choice-card]");
    el.word = document.querySelector("[data-choice-word]");
    el.pinyin = document.querySelector("[data-choice-pinyin]");
    el.options = document.querySelector("[data-choice-options]");
    el.progressDots = document.querySelector("[data-round-dots]");
    el.progressText = document.querySelector("[data-round-text]");
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

  /* 按钮三态（一页里循环）：没选＝灰【提交】、选了＝紫【提交】、
     答完中间题＝紫【下一题】、最后一题答完＝灰【已提交】 */
  function paintSubmit() {
    if (!el.submit) return;
    if (!submitted) {
      el.submit.disabled = !selectedId;
      setText(el.submitLabel, "提交");
      setText(el.submitLabelId, "Kirim");
      return;
    }
    const last = isLastQuestion();
    el.submit.disabled = last;
    setText(el.submitLabel, last ? "已提交" : "下一题");
    setText(el.submitLabelId, last ? "Terkirim" : "Lanjut");
  }

  /* 进度行：做完＝绿、当前＝紫、没做＝灰；右边第几题。
     跨页那一轮：整行由 round-flow 按 URL 里的 q / total 重画（本页只有一道题，自己算不出总数） */
  function renderProgress() {
    if (roundState.active && roundFlow) {
      roundFlow.renderProgress();
      return;
    }
    setText(el.progressText, "第 " + (index + 1) + " 题 / 共 " + questions.length + " 题");
    if (!el.progressDots) return;
    Array.prototype.forEach.call(el.progressDots.children, function (dot, i) {
      const done = i < index || (i === index && submitted);
      dot.classList.toggle("is-done", done);
      dot.classList.toggle("is-now", i === index && !done);
    });
  }

  function buildProgressDots() {
    if (!el.progressDots) return;
    el.progressDots.innerHTML = "";
    for (let i = 0; i < questions.length; i += 1) {
      el.progressDots.appendChild(document.createElement("i"));
    }
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
    paintSubmit();
  }

  function renderOptions(question) {
    if (!el.options) return;
    el.options.innerHTML = "";
    tiles = shuffle(question.options).map(function (option, i) {
      return {
        id: "choice-" + i,
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

  /* 渲染第 index 题：题干、选项、进度、按钮都按"本题还没答"重置 */
  function renderQuestion(animate) {
    const question = questions[index] || questions[0];
    selectedId = "";
    submitted = false;

    setText(el.pinyin, question.pinyin || "");
    setHidden(el.pinyin, !question.pinyin);
    setText(el.word, question.word);

    renderOptions(question);
    resetFeedback();
    renderProgress();
    paintSubmit();

    if (animate && el.card) {
      /* 换场：卡片淡入 + 上移 10px；先把类摘掉、读一次布局，动画才会重播 */
      el.card.classList.remove("is-enter");
      void el.card.offsetWidth;
      el.card.classList.add("is-enter");
    }
  }

  /* 答完中间题：进下一题——回执收起、选中和判分样式清空、按钮回"没选灰"、进度 +1 */
  function nextQuestion() {
    if (!submitted || isLastQuestion()) return;
    index += 1;
    renderQuestion(true);
    scrollTopIfNeeded();
  }

  /* 再练一次 = 整轮重做：回第 1 题、重新计时 */
  function restartRound() {
    global.clearTimeout(modalTimer);
    closeModal();
    index = 0;
    missedInRound = false;
    recorded = false;
    roundStartedAt = Date.now();
    renderQuestion(false);
    scrollTopIfNeeded();
  }

  /* 矮屏上回执条把页面顶下去过一段，换题时轻轻回到顶 */
  function scrollTopIfNeeded() {
    if (typeof global.scrollTo === "function" && global.scrollY > 0) {
      global.scrollTo({ top: 0, behavior: "smooth" });
    }
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
    if (recorded) return null;
    recorded = true;
    const bridge = activityBridge();
    if (!bridge || typeof bridge.finish !== "function") return { recorded: false, next: "" };
    return bridge.finish({ correct: !missedInRound, seconds: roundSeconds() });
  }

  /* 整轮用时：进第 1 题那刻开始，最后一题结算 */
  function roundSeconds() {
    return Math.max(1, Math.round((Date.now() - roundStartedAt) / 1000));
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
        { label: "再练一次", icon: "↻", onSelect: restartRound }
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
    const isCorrect = chosen.id === correctTile.id;
    if (!isCorrect) missedInRound = true;

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

    showFeedback(isCorrect, correctTile);
    renderProgress();   /* 本题的点变绿 */
    paintSubmit();      /* 中间题 →【下一题】；最后一题 →【已提交】 */
    if (el.feedback && typeof el.feedback.scrollIntoView === "function") {
      /* 一屏放得下时不动页面；回执条被屏幕下沿裁掉才滚最小距离（跟其他页同一条退路） */
      el.feedback.scrollIntoView({ block: "nearest" });
      /* 出场的 0.28s 还没跑完，这会儿量到的位置是收在半截的；等它落定再补看一眼 */
      global.setTimeout(revealReceipt, 300);
    }

    /* 跨页那一轮（本页只是其中一道题）：不记账、不弹窗。
       中间题按钮变【下一题】由 round-flow 定；最后一题才由它结算 + 弹窗 */
    if (roundState.active && roundFlow) {
      const step = roundFlow.afterAnswer(isCorrect);
      if (step === "finish") {
        el.submit.disabled = true;
        setText(el.submitLabel, "已提交");
        setText(el.submitLabelId, "Terkirim");
      } else {
        el.submit.disabled = false;
        setText(el.submitLabel, "下一题");
        setText(el.submitLabelId, "Lanjut");
      }
      return;
    }

    /* 中间题：不记账、不弹窗，等学生点【下一题】 */
    if (!isLastQuestion()) return;

    /* 最后一题：整轮结算——只在这一次记账（整轮用时 + 整轮有没有错），1.4 秒后出完成弹窗 */
    completeOnce();
    const tier = missedInRound ? "correct" : "correctFirstTry";
    const praise = typeof copy.draw === "function" ? copy.draw(tier, { single: true }) : null;

    modalTimer = global.setTimeout(function () {
      openModal(tier, praise);
    }, MODAL_DELAY);
  }

  function bindEvents() {
    if (!el.submit) return;
    /* 一颗按钮走完一轮：没答＝提交；中间题答完＝下一题；最后一题答完＝禁用 */
    el.submit.addEventListener("click", function () {
      if (submitted) {
        /* 跨页那一轮：这一题的收尾是"跳下一页"，不是页内换题 */
        if (roundState.active && roundFlow) roundFlow.goNext();
        else nextQuestion();
        return;
      }
      submit();
    });
  }

  function boot() {
    cache();
    applyShellText();

    /* 轮内（跨页那一轮）→ 只走数据里的这一道题；不是轮内 → 本页自带的三道示范题 */
    roundState = roundFlow && typeof roundFlow.init === "function" ? roundFlow.init("choice") : { active: false };
    questions = roundState.active ? [roundState.question] : DEMO_QUESTIONS;

    if (!roundState.active) buildProgressDots();
    bindEvents();
    roundStartedAt = Date.now();
    renderQuestion(false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  global.AICloudChoicePage = { boot: boot };
})(typeof window !== "undefined" ? window : globalThis);
