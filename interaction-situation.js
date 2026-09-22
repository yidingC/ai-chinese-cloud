
/* 情景选择 · interaction-situation.html 页面脚本
   状态机：待作答 → 已选择 → 已提交 → 正确 / 错误（每题只判一次，不提供重试）。
   进度记账由 shared/activity-bridge.js 负责（课堂跳转由完成弹窗的按钮执行），本页只做界面并调用 finish()。
   图槽数据固定保留 icon / image / imageAlt 三个字段：image 有值时渲染真图，
   为空时渲染 emoji；以后换真图只改 QUESTION 数据，不改页面结构和样式。 */
(function (global) {
  "use strict";

  const LETTERS = ["A", "B", "C", "D", "E", "F"];
  const SOLO_MODAL_DELAY = 2000;      // 体验模式：提交后留多久看对错，再弹完成弹窗
  const modal = global.AICloudFeedbackModal || null;
  const copy = global.AICloudFeedbackCopy || {};

  /* 单题数据（题型体验用的模拟题目；选项顺序在进入页面时打乱） */
  const QUESTION = {
    id: "borrow-pen",
    icon: "✏️",
    image: "",
    imageAlt: "一支铅笔",
    scene: "你想借同学的笔。",
    sceneId: "Kamu mau meminjam pulpen temanmu.",
    options: [
      { id: "rude", text: "喂，给我笔！", textId: "Hei, kasih aku pulpen!" },
      { id: "polite", text: "请问，我可以借你的笔吗？", textId: "Permisi, boleh saya pinjam pulpenmu?", correct: true },
      { id: "blunt", text: "笔。", textId: "Pulpen." }
    ],
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
    el.slot = document.querySelector("[data-situation-slot]");
    el.sceneId = document.querySelector("[data-situation-scene-id]");
    el.scene = document.querySelector("[data-situation-scene-text]");
    el.options = document.querySelector("[data-situation-options]");
    el.submit = document.querySelector("[data-situation-submit]");
    el.submitLabel = document.querySelector("[data-situation-submit-label]");
    el.submitLabelId = document.querySelector("[data-situation-submit-label-id]");
    el.feedback = document.querySelector("[data-situation-feedback]");
    el.feedbackTitleRow = document.querySelector("[data-situation-feedback-title-row]");
    el.feedbackTitle = document.querySelector("[data-situation-feedback-title]");
    el.feedbackIcon = document.querySelector("[data-situation-feedback-icon]");
    el.feedbackSentence = document.querySelector("[data-situation-feedback-sentence]");
    el.feedbackTranslation = document.querySelector("[data-situation-feedback-translation]");
    el.optionsLabel = document.querySelector("[data-situation-options-label]");
    el.status = document.querySelector("[data-activity-status]");
  }

  function activityBridge() {
    return global.AICloudActivity || null;
  }

  function activityMeta() {
    const types = global.AICloudActivityTypes;
    const type = document.body.dataset.activityType || "situation";
    if (!types || typeof types.get !== "function") return null;
    return types.get(type);
  }

  function mode() {
    const bridge = activityBridge();
    if (!bridge || typeof bridge.context !== "function") return "solo";
    return bridge.context().mode;
  }

  /* 页头标题由 shared/activity-page.js 从题型清单填，这里只管返回键的去向 */
  function applyShellText() {
    const back = document.querySelector("[data-activity-back]");
    if (back) {
      const isClass = mode() === "class";
      back.setAttribute("href", "classroom.html");
      back.setAttribute("aria-label", isClass ? "返回课堂互动" : "返回课堂");
    }
  }

  /* 场景图槽：image 有值渲染 <img src alt>，为空渲染套了 role="img" 的 emoji */
  function renderScenarioSlot() {
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
    emoji.className = "situation-slot-emoji";
    emoji.setAttribute("role", "img");
    emoji.setAttribute("aria-label", QUESTION.imageAlt || "");
    emoji.textContent = QUESTION.icon;
    el.slot.appendChild(emoji);
  }

  function eachOptionButton(callback) {
    if (!el.options) return;
    options.forEach(function (option) {
      const button = el.options.querySelector('[data-situation-id="' + option.id + '"]');
      if (button) callback(button, option);
    });
  }

  function renderOptions() {
    if (!el.options) return;
    el.options.innerHTML = "";
    options.forEach(function (option) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "situation-option";
      button.dataset.situationId = option.id;
      button.setAttribute("aria-pressed", "false");

      const letter = document.createElement("span");
      letter.className = "situation-letter";
      letter.setAttribute("aria-hidden", "true");
      letter.textContent = option.letter;

      const text = document.createElement("span");
      text.className = "situation-option-text";
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
    setHidden(el.feedbackTitleRow, true);
    setText(el.feedbackSentence, "");
    setText(el.feedbackTranslation, "");
  }

  function showFeedback(isCorrect, correctOption) {
    if (!el.feedback || !correctOption) return;
    el.feedback.classList.remove("is-correct", "is-wrong");
    el.feedback.classList.add(isCorrect ? "is-correct" : "is-wrong");
    setText(el.feedbackIcon, isCorrect ? "✓" : "");
    setText(el.feedbackTitle, isCorrect ? "正确" : "");
    setHidden(el.feedbackTitleRow, !isCorrect);
    setText(el.feedbackSentence, isCorrect ? "" : correctOption.text);
    setText(el.feedbackTranslation, isCorrect ? "" : correctOption.textId || "");
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
        textId: option.textId || "",
        correct: option.correct === true
      };
    });

    setText(el.sceneId, QUESTION.sceneId || "");
    setText(el.scene, QUESTION.scene);
    renderScenarioSlot();
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

  global.AICloudSituationPage = { boot: boot, startQuestion: startQuestion };
})(typeof window !== "undefined" ? window : globalThis);
