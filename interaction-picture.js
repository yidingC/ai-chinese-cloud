/* 看图单选 · interaction-picture.html 页面脚本
   状态机：待作答 → 已选择 → 已提交 → 正确 / 错误（每题只判一次，不提供重试）。
   页面只留事实：图和题干在说话，结果条写对错与正确词的意思；
   情绪交给公共弹窗（shared/feedback-modal.js ＋ shared/feedback-copy.js）。
   进度记账由 shared/activity-bridge.js 负责（课堂跳转由完成弹窗的按钮执行），本页只做界面并调用 finish()。
   图槽数据固定保留 icon / image / imageAlt 三个字段：image 有值时渲染真图，
  为空时渲染 emoji；以后换真图只改 QUESTION 数据，不改页面结构和样式。
  动效按《视觉打磨规范》第十二节：待作答时常驻摇摆，提交后停住，答对补跳一次。 */
(function (global) {
  "use strict";

  const LETTERS = ["A", "B", "C", "D", "E", "F"];
  const SOLO_MODAL_DELAY = 2000;      // 体验模式：提交后留多久看对错，再弹完成弹窗
  const modal = global.AICloudFeedbackModal || null;
  const copy = global.AICloudFeedbackCopy || {};

  /* 单题数据（题型体验用的模拟题目；选项顺序在进入页面时打乱） */
  const QUESTION = {
    id: "cat",
    icon: "🐱",
    image: "",
    imageAlt: "一只猫",
    prompt: "这是什么？",
    promptPinyin: "Zhè shì shénme?",
    options: [
      { id: "cat", text: "猫", pinyin: "māo", translate: "Kucing", correct: true },
      { id: "dog", text: "狗", pinyin: "gǒu", translate: "Anjing" },
      { id: "bird", text: "鸟", pinyin: "niǎo", translate: "Burung" },
      { id: "fish", text: "鱼", pinyin: "yú", translate: "Ikan" }
    ]
  };

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
    el.slot = document.querySelector("[data-picture-slot]");
    el.pinyin = document.querySelector("[data-picture-pinyin]");
    el.stem = document.querySelector("[data-picture-question]");
    el.options = document.querySelector("[data-picture-options]");
    el.submit = document.querySelector("[data-picture-submit]");
    el.submitLabel = document.querySelector("[data-picture-submit-label]");
    el.submitLabelId = document.querySelector("[data-picture-submit-label-id]");
    el.feedback = document.querySelector("[data-picture-feedback]");
    el.feedbackTitleRow = document.querySelector(".picture-feedback-title");
    el.feedbackIcon = document.querySelector("[data-picture-feedback-icon]");
    el.feedbackTitle = document.querySelector("[data-picture-feedback-title]");
    el.feedbackAnswer = document.querySelector("[data-picture-feedback-answer]");
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

  /* 返回键：课堂模式回课堂互动，体验模式也回课堂页（和其余题型页一致） */
  function applyShellText() {
    const back = document.querySelector("[data-activity-back]");
    if (back) {
      const isClass = mode() === "class";
      back.setAttribute("href", "classroom.html");
      back.setAttribute("aria-label", isClass ? "返回课堂互动" : "返回课堂");
    }
  }

  /* 图槽：image 有值渲染 <img src alt>，为空渲染套了 role="img" 的 emoji */
  function renderPictureSlot() {
    if (!el.slot) return;
    el.slot.innerHTML = "";
    if (QUESTION.image) {
      const image = document.createElement("img");
      image.src = QUESTION.image;
      image.alt = QUESTION.imageAlt || "";
      el.slot.appendChild(image);
      return;
    }
    const emoji = document.createElement("span");
    emoji.className = "picture-slot-emoji";
    emoji.setAttribute("role", "img");
    emoji.setAttribute("aria-label", QUESTION.imageAlt || "");
    emoji.textContent = QUESTION.icon;
    el.slot.appendChild(emoji);
  }

  /* 提交后：常驻摇摆停住；答对时补一次"角色呼应"的跳（第十二节：≤0.5s、一次性） */
  function settlePictureMove(isCorrect) {
    if (!el.slot) return;
    el.slot.classList.add("is-answered");
    if (isCorrect) el.slot.classList.add("is-hop");
  }

  /* 再练一次：把跳的痕迹清干净，摇摆重新开始 */
  function resetPictureMove() {
    if (!el.slot) return;
    el.slot.classList.remove("is-answered", "is-hop");
  }

  function eachOptionButton(callback) {
    if (!el.options) return;
    options.forEach(function (option) {
      const button = el.options.querySelector('[data-picture-id="' + option.id + '"]');
      if (button) callback(button, option);
    });
  }

  function renderOptions() {
    if (!el.options) return;
    el.options.innerHTML = "";
    options.forEach(function (option) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "picture-option";
      button.dataset.pictureId = option.id;
      button.setAttribute("aria-pressed", "false");

      const letter = document.createElement("span");
      letter.className = "picture-letter";
      letter.setAttribute("aria-hidden", "true");
      letter.textContent = option.letter;

      const text = document.createElement("span");
      text.className = "picture-option-text";
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
    setText(el.feedbackIcon, "");
    setText(el.feedbackTitle, "");
    setHidden(el.feedbackTitleRow, false);
    setText(el.feedbackAnswer, "");
    setHidden(el.feedbackAnswer, true);
  }

  function showFeedback(isCorrect, correctOption) {
    if (!el.feedback || !correctOption) return;
    el.feedback.classList.remove("is-correct", "is-wrong");
    el.feedback.classList.add(isCorrect ? "is-correct" : "is-wrong");
    setText(el.feedbackIcon, isCorrect ? "✓" : "");
    setText(el.feedbackTitle, isCorrect ? "正确" : "");
    setHidden(el.feedbackTitleRow, !isCorrect); // 答错时框里只有意思行，没有标题行
    // 结果条只写事实：答对给一句「正确」；答错给正确的词和它的印尼语意思，不加中文标签
    setText(el.feedbackAnswer, isCorrect ? "" : correctOption.text + " " + correctOption.translate);
    setHidden(el.feedbackAnswer, isCorrect);
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

  /* 再练一次：关掉弹窗，重新开始本题（选项重新打乱） */
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
    lastCorrect = !!correctOption && selectedId === correctOption.id;
    attempts += 1;
    settlePictureMove(lastCorrect);
    const tier = lastCorrect ? (attempts === 1 ? "correctFirstTry" : "correct") : "wrong";
    const praise = typeof copy.draw === "function" ? copy.draw(tier, { single: true }) : null;

    eachOptionButton(function (button, option) {
      button.disabled = true;
      button.classList.remove("selected");
      button.setAttribute("aria-pressed", "false");
      if (option.correct) button.classList.add("correct");
      else if (option.id === selectedId) button.classList.add("wrong");
    });

    if (el.submit) {
      el.submit.disabled = true;
      setText(el.submitLabel, "已提交");
      setText(el.submitLabelId, "Terkirim");
    }

    showFeedback(lastCorrect, correctOption);
    updateStatus();
    if (el.feedback) {
      if (typeof el.feedback.focus === "function") el.feedback.focus({ preventScroll: true });
      if (typeof el.feedback.scrollIntoView === "function") el.feedback.scrollIntoView({ block: "center" });
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
    options = shuffle(QUESTION.options).map(function (option, index) {
      return {
        id: option.id,
        letter: LETTERS[index] || "?",
        text: option.text,
        pinyin: option.pinyin || "",
        translate: option.translate || "",
        correct: option.correct === true
      };
    });

    setText(el.pinyin, QUESTION.promptPinyin || "");
    setHidden(el.pinyin, !QUESTION.promptPinyin);
    setText(el.stem, QUESTION.prompt);

    resetPictureMove();
    renderPictureSlot();
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
    if (el.submit) el.submit.addEventListener("click", submitAnswer);
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

  document.addEventListener("DOMContentLoaded", applyShellText);

  global.AICloudPicturePage = { boot: boot, startQuestion: startQuestion };
})(typeof window !== "undefined" ? window : globalThis);
