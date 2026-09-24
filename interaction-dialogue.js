/* 对话补全 · interaction-dialogue.html 页面脚本
   状态机：待作答 → 已选择 → 已提交 → 正确 / 错误（每题只判一次，不提供重试）。
   提交后把选中的句子填进右边气泡，学生能直接看出对话是否通顺。
   页面只留事实：答对只给 ✓「答对了！」；答错不给评判词，直接给"上一句 + 正确的那一句"的
   中文＋印尼语对照（不再出现解析和"正确答案："这类中文标签）。
   进度记账由 shared/activity-bridge.js 负责（课堂跳转由完成弹窗的按钮执行），本页只做界面并调用 finish()。 */
(function (global) {
  "use strict";

  const LETTERS = ["A", "B", "C", "D", "E", "F"];
  const SOLO_MODAL_DELAY = 2000;      // 体验模式：提交后留多久看对错，再弹完成弹窗
  const modal = global.AICloudFeedbackModal || null;
  const copy = global.AICloudFeedbackCopy || {};

  /* 本页自带的示范题（题型体验用）：候选句顺序固定 A / B / C，和任务书一致，不做打乱；
     textId 是答错时结果条里要显示的那一行印尼语。
     icon / image / imageAlt 是留给以后可选场景小图槽（72×72）的字段，
     本批不渲染图槽，样式位置已经在 interaction-dialogue.css 里留好；
     字段结构与 round-content.js 里同题型的题目一致。 */
  const DEMO_QUESTION = {
    id: "restroom",
    icon: "🚻",
    image: "",
    imageAlt: "洗手间的标志",
    options: [
      { id: "a", text: "在二楼，往左走。", textId: "Di lantai dua, jalan ke kiri.", correct: true },
      { id: "b", text: "我叫小明。", textId: "Nama saya Xiaoming." },
      { id: "c", text: "今天很热。", textId: "Hari ini panas." }
    ]
  };

  /* 当前这道题（轮内来自 round-content.js，否则是上面那份示范题） */
  let QUESTION = DEMO_QUESTION;

  const el = {};
  let options = [];
  let selectedId = "";
  let submitted = false;
  let finished = false;
  let lastCorrect = false;
  let attempts = 0;
  let lastSeconds = 0;
  let startedAt = 0;
  let modalTimer = 0;

  /* 跨页混题型一轮（链接带 q / total）：进度 / 下一题 / 记账与轮末弹窗交给 shared/round-flow.js */
  const roundFlow = global.AICloudRoundFlow || null;
  let roundState = { active: false };

  function setText(node, text) {
    if (node) node.textContent = text;
  }

  function setHidden(node, hidden) {
    if (node) node.classList.toggle("hidden", !!hidden);
  }

  function cache() {
    el.me = document.querySelector("[data-dialogue-me]");
    el.mark = document.querySelector("[data-dialogue-mark]");
    el.options = document.querySelector("[data-dialogue-options]");
    el.submit = document.querySelector("[data-dialogue-submit]");
    el.submitLabel = document.querySelector("[data-dialogue-submit-label]");
    el.submitLabelId = document.querySelector("[data-dialogue-submit-label-id]");
    el.feedback = document.querySelector("[data-dialogue-feedback]");
    el.feedbackIcon = document.querySelector("[data-dialogue-feedback-icon]");
    el.feedbackTitle = document.querySelector("[data-dialogue-feedback-title]");
    el.feedbackTitleRow = document.querySelector("[data-dialogue-feedback-title-row]");
    el.quote = document.querySelector("[data-dialogue-quote]");
    el.quoteQuestionZh = document.querySelector("[data-dialogue-quote-question-zh]");
    el.quoteQuestionId = document.querySelector("[data-dialogue-quote-question-id]");
    el.quoteAnswerZh = document.querySelector("[data-dialogue-quote-answer-zh]");
    el.quoteAnswerId = document.querySelector("[data-dialogue-quote-answer-id]");
    el.them = document.querySelector("[data-dialogue-them]");
    el.status = document.querySelector("[data-activity-status]");
  }

  function activityBridge() {
    return global.AICloudActivity || null;
  }

  function mode() {
    const bridge = activityBridge();
    if (!bridge || typeof bridge.context !== "function") return "solo";
    return bridge.context().mode;
  }

  /* 返回键：课堂模式回课堂互动，体验模式回课堂页 */
  function applyShellText() {
    const back = document.querySelector("[data-activity-back]");
    if (!back) return;
    const isClass = mode() === "class";
    back.setAttribute("href", "classroom.html");
    back.setAttribute("aria-label", isClass ? "返回课堂互动" : "返回课堂");
  }

  function eachOptionButton(callback) {
    if (!el.options) return;
    options.forEach(function (option) {
      const button = el.options.querySelector('[data-dialogue-id="' + option.id + '"]');
      if (button) callback(button, option);
    });
  }

  function renderOptions() {
    if (!el.options) return;
    el.options.innerHTML = "";
    options.forEach(function (option) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dialogue-option";
      button.dataset.dialogueId = option.id;
      button.setAttribute("aria-pressed", "false");

      const letter = document.createElement("span");
      letter.className = "dialogue-letter";
      letter.setAttribute("aria-hidden", "true");
      letter.textContent = option.letter;

      const text = document.createElement("span");
      text.className = "dialogue-option-text";
      text.textContent = option.text;

      button.appendChild(letter);
      button.appendChild(text);
      button.addEventListener("click", function () {
        selectOption(option.id);
      });
      el.options.appendChild(button);
    });
  }

  function paintSelection() {
    eachOptionButton(function (button, option) {
      const isSelected = option.id === selectedId;
      button.classList.toggle("selected", isSelected);
      button.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
    if (el.submit) el.submit.disabled = !selectedId || submitted;
  }

  function updateStatus() {
    if (!el.status) return;
    let text = "当前状态：待作答";
    if (submitted) text = "当前状态：已提交";
    else if (selectedId) text = "当前状态：已选择";
    setText(el.status, text);
  }

  function resetFeedback() {
    if (!el.feedback) return;
    el.feedback.classList.add("hidden");
    el.feedback.classList.remove("is-correct", "is-wrong");
    setHidden(el.feedbackTitleRow, true);
    setHidden(el.quote, true);
    setText(el.feedbackIcon, "");
    setText(el.feedbackTitle, "");
    setText(el.quoteQuestionZh, "");
    setText(el.quoteQuestionId, "");
    setText(el.quoteAnswerZh, "");
    setText(el.quoteAnswerId, "");
  }

  /* 提交后把选中的句子填进右边气泡；选对了保持主色并给对勾，选错了变红 */
  function fillBubble(picked, isCorrect) {
    if (!el.me) return;
    setText(el.me, picked ? picked.text : "？");
    el.me.classList.toggle("is-placeholder", !picked);
    el.me.classList.toggle("is-wrong", !isCorrect);
    setHidden(el.mark, !isCorrect);
  }

  /* 答对：绿色「答对了！」（不解释）；答错：红色结果条里只给中文＋印尼语对照 */
  function showFeedback(isCorrect, correctOption) {
    if (!el.feedback || !correctOption) return;
    el.feedback.classList.remove("is-correct", "is-wrong");
    el.feedback.classList.add(isCorrect ? "is-correct" : "is-wrong");
    setHidden(el.feedbackTitleRow, !isCorrect);
    setText(el.feedbackIcon, isCorrect ? "✓" : "");
    setText(el.feedbackTitle, isCorrect ? "答对了！" : "");
    setHidden(el.quote, isCorrect);
    if (!isCorrect) {
      setText(el.quoteQuestionZh, el.them ? el.them.textContent : "");
      setText(el.quoteQuestionId, el.them ? el.them.dataset.dialogueThemId || "" : "");
      setText(el.quoteAnswerZh, correctOption.text);
      setText(el.quoteAnswerId, correctOption.textId || "");
    }
    el.feedback.classList.remove("hidden");
  }

  function selectOption(id) {
    if (submitted) return;
    selectedId = selectedId === id ? "" : id;
    paintSelection();
    updateStatus();
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

  /* 再练一次：关掉弹窗，重新开始本题（候选句顺序不变） */
  function restartQuestion() {
    closeModal();
    startQuestion();
  }

  function submitAnswer() {
    if (submitted || !selectedId) return;
    submitted = true;
    lastSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));

    const correctOption = options.filter(function (option) {
      return option.correct;
    })[0];
    const picked = options.filter(function (option) {
      return option.id === selectedId;
    })[0];
    lastCorrect = !!correctOption && selectedId === correctOption.id;
    attempts += 1;
    const tier = lastCorrect ? (attempts === 1 ? "correctFirstTry" : "correct") : "wrong";
    const praise = typeof copy.draw === "function" ? copy.draw(tier, { single: true }) : null;

    eachOptionButton(function (button, option) {
      button.disabled = true;
      if (option.correct) button.classList.add("correct");
      else if (option.id === selectedId) button.classList.add("wrong");
    });

    if (el.submit) {
      el.submit.disabled = true;
      setText(el.submitLabel, "已提交");
      setText(el.submitLabelId, "Terkirim");
    }

    fillBubble(picked, lastCorrect);
    showFeedback(lastCorrect, correctOption);
    updateStatus();
    if (el.feedback) {
      if (typeof el.feedback.focus === "function") el.feedback.focus({ preventScroll: true });
      if (typeof el.feedback.scrollIntoView === "function") el.feedback.scrollIntoView({ block: "center" });
    }

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

    submitted = false;
    finished = false;
    lastCorrect = false;
    selectedId = "";
    startedAt = Date.now();
    options = QUESTION.options.map(function (option, index) {
      return {
        id: option.id,
        letter: LETTERS[index] || "?",
        text: option.text,
        textId: option.textId || "",
        correct: option.correct === true
      };
    });

    if (el.me) {
      setText(el.me, "？");
      el.me.classList.add("is-placeholder");
      el.me.classList.remove("is-wrong");
    }
    setHidden(el.mark, true);

    renderOptions();
    resetFeedback();
    if (el.submit) {
      el.submit.disabled = true;
      setText(el.submitLabel, "提交");
      setText(el.submitLabelId, "Kirim");
    }
    updateStatus();
  }

  function bindEvents() {
    if (el.submit) el.submit.addEventListener("click", function () {
      /* 跨页那一轮：答完后这颗按钮是【下一题】，点它跳下一题那一页 */
      if (submitted && roundState.active && roundFlow) {
        roundFlow.goNext();
        return;
      }
      submitAnswer();
    });
  }

  function boot() {
    cache();
    applyShellText();
    bindEvents();

    /* 轮内（跨页那一轮）→ 题目从 round-content.js 取；不是轮内 → 本页自带的那道示范题 */
    roundState = roundFlow && typeof roundFlow.init === "function" ? roundFlow.init("dialogue") : { active: false };
    QUESTION = roundState.active && roundState.question ? roundState.question : DEMO_QUESTION;

    startQuestion();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  document.addEventListener("DOMContentLoaded", applyShellText);

  global.AICloudDialoguePage = { boot: boot, startQuestion: startQuestion };
})(typeof window !== "undefined" ? window : globalThis);
