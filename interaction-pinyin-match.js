/* 拼音—汉字—含义匹配 · interaction-pinyin-match.html 页面脚本
   一屏一组、共 3 组，流程是「拼音 → 选汉字 → 选意思」：
   ① 看拼音选汉字（步骤标签在题目牌里）→ 选对汉字（绿锁 + 勾轻弹 + 步骤②滑入）
   → 选对意思（本组完成、收集槽填一格）→ 0.9 秒后自动进入下一组
   → 三组完成 → 0.9 秒后弹公共中性弹窗。
   页面不放说明文字：引导只交给两枚步骤标签；状态只做无障碍播报（视觉隐藏）。
   闯关式手感：选错只标红加抖动、原地重试、不显示正确答案，所以 correct 恒为 true。
   进度记账由 shared/activity-bridge.js 负责（课堂跳转由完成弹窗的按钮执行），本页只做界面并调用 finish()。 */
(function (global) {
  "use strict";

  /* 三组模拟内容（任务书 3.4 的例子；第 2、3 组的候选按同样规则配：
     汉字和含义各 3 个、都含正确项、干扰项同类） */
  const GROUPS = [
    {
      key: "shu",
      pinyin: "shū",
      word: "书",
      meaning: "buku",
      wordOptions: ["书", "笔", "本"],
      meaningOptions: ["buku", "pena", "buku tulis"]
    },
    {
      key: "bi",
      pinyin: "bǐ",
      word: "笔",
      meaning: "pena",
      wordOptions: ["本", "笔", "书"],
      meaningOptions: ["buku tulis", "pena", "buku"]
    },
    {
      key: "benzi",
      pinyin: "běnzi",
      word: "本子",
      meaning: "buku tulis",
      wordOptions: ["书", "本子", "笔"],
      meaningOptions: ["pena", "buku tulis", "buku"]
    }
  ];

  const TOTAL_GROUPS = GROUPS.length;
  const WRONG_RESET_DELAY = 720;      // 选错：红块和抖动保留 720ms 后复原，可以继续点
  const ADVANCE_DELAY = 900;          // 本组完成后 0.9 秒自动进入下一组
  const SOLO_MODAL_DELAY = 900;       // 三组全配好后等 0.9 秒再弹完成弹窗，让最后一组的 ✓ 被看见
  const modal = global.AICloudFeedbackModal || null;
  const copy = global.AICloudFeedbackCopy || {};

  const el = {};
  const wrongTimers = new Map();
  const completed = [];
  let groupIndex = 0;
  let stage = "word";       // "word"：正在选汉字；"meaning"：正在选意思
  let finished = false;
  let lastSeconds = 0;
  let startedAt = 0;
  let advanceTimer = 0;
  let modalTimer = 0;
  let madeMistake = false;

  function setText(node, text) {
    if (node) node.textContent = text;
  }

  function setHidden(node, hidden) {
    if (node) node.classList.toggle("hidden", !!hidden);
  }

  function cache() {
    el.pinyin = document.querySelector("[data-py-pinyin]");
    el.words = document.querySelector("[data-py-words]");
    el.meanings = document.querySelector("[data-py-meanings]");
    el.meaningStage = document.querySelector("[data-py-meaning-stage]");
    el.stepWord = document.querySelector("[data-py-step-word]");
    el.feedback = document.querySelector("[data-py-feedback]");
    el.feedbackTitle = document.querySelector("[data-py-feedback-title]");
    el.feedbackCopy = document.querySelector("[data-py-feedback-copy]");
    el.slots = document.querySelector("[data-py-done-list]");
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

  /* 返回按钮跟着模式走（题型名由页头标题承担，页面里不再放角标） */
  function applyShellText() {
    const back = document.querySelector("[data-activity-back]");
    if (back) {
      const isClass = mode() === "class";
      back.setAttribute("href", "classroom.html");
      back.setAttribute("aria-label", isClass ? "返回课堂互动" : "返回课堂");
    }
  }

  /* 页面不写字，状态只说给读屏软件（视觉隐藏的播报区） */
  function announce(message) {
    if (el.status) el.status.textContent = message || "";
  }

  function renderOptions(container, values, kind, answer) {
    if (!container) return;
    container.innerHTML = "";
    values.forEach(function (value) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "py-option py-option-" + kind;
      button.dataset.value = value;
      button.dataset.correct = value === answer ? "true" : "false";
      const label = document.createElement("span");
      label.className = "py-option-text";
      label.textContent = value;
      button.appendChild(label);
      button.addEventListener("click", function () {
        onOptionClick(button, kind);
      });
      container.appendChild(button);
    });
  }

  function replayPinyinPop() {
    if (!el.pinyin) return;
    el.pinyin.classList.remove("py-pinyin-pop");
    void el.pinyin.offsetWidth;
    el.pinyin.classList.add("py-pinyin-pop");
  }

  function setStepCurrent(node, isCurrent) {
    if (node) node.classList.toggle("is-current", !!isCurrent);
  }

  /* 收集槽里的一格：拼音 / 汉字 / 意思三行，空槽不放任何文字 */
  function buildSlotCard(group) {
    const fragment = document.createDocumentFragment();
    [
      { className: "py-slot-pinyin", text: group.pinyin },
      { className: "py-slot-word", text: group.word },
      { className: "py-slot-meaning", text: group.meaning }
    ].forEach(function (part) {
      const node = document.createElement("span");
      node.className = part.className;
      node.textContent = part.text;
      fragment.appendChild(node);
    });
    return fragment;
  }

  function renderSlots() {
    if (!el.slots) return;
    const slots = el.slots.querySelectorAll("[data-py-slot]");
    Array.prototype.forEach.call(slots, function (slot, index) {
      const group = completed[index];
      slot.textContent = "";
      slot.classList.toggle("is-filled", !!group);
      if (!group) {
        slot.setAttribute("aria-hidden", "true");
        slot.removeAttribute("aria-label");
        return;
      }
      slot.setAttribute("aria-hidden", "false");
      slot.setAttribute("aria-label", group.pinyin + " " + group.word + " " + group.meaning);
      slot.appendChild(buildSlotCard(group));
    });
  }

  function resetFeedback() {
    if (!el.feedback) return;
    el.feedback.classList.add("hidden");
    setText(el.feedbackTitle, "");
    setText(el.feedbackCopy, "");
  }

  /* 提示条：只在选错时出现，一行中性提示，不显示正确答案 */
  function showHint(kind) {
    if (!el.feedback) return;
    el.feedback.classList.remove("hidden");
    setText(el.feedbackTitle, "再想想");
    setText(el.feedbackCopy, kind === "word"
      ? "这个音对应哪个字？ · Huruf mana yang cocok dengan bunyi ini?"
      : "这个字是什么意思？ · Apa arti hanzi ini?");
  }

  function lockCorrect(button) {
    button.classList.remove("wrong");
    button.classList.add("correct");
    button.disabled = true;
  }

  /* 选错：整格红 + 抖动 + 一行提示，不显示正确答案；抖动结束后保持可点 */
  function markWrong(button, kind) {
    const timer = wrongTimers.get(button);
    if (timer) global.clearTimeout(timer);
    button.classList.remove("wrong");
    void button.offsetWidth;
    button.classList.add("wrong");
    showHint(kind);
    madeMistake = true;
    announce(kind === "word" ? "不是这个字，再试试" : "意思不对，再试试");
    wrongTimers.set(button, global.setTimeout(function () {
      button.classList.remove("wrong");
      wrongTimers.delete(button);
    }, WRONG_RESET_DELAY));
  }

  function lockAllOptions() {
    document.querySelectorAll(".py-option").forEach(function (button) {
      button.disabled = true;
    });
  }

  function onOptionClick(button, kind) {
    if (finished || !button || button.disabled) return;
    const group = GROUPS[groupIndex];

    if (button.dataset.correct !== "true") {
      markWrong(button, kind);
      return;
    }

    if (kind === "word") {
      lockCorrect(button);
      setStepCurrent(el.stepWord, false);
      setHidden(el.meaningStage, false);
      stage = "meaning";
      resetFeedback();
      announce("汉字选对了：" + group.word + "，接着选它的意思");
      return;
    }

    lockCorrect(button);
    completeGroup(group);
  }

  /* 一组配好：收集槽填一格，0.9 秒后自动进入下一组 */
  function completeGroup(group) {
    completed.push(group);
    lockAllOptions();
    setHidden(el.meaningStage, false);
    resetFeedback();
    renderSlots();
    announce("配好一组：" + group.pinyin + " " + group.word + " " + group.meaning);

    if (completed.length >= TOTAL_GROUPS) {
      finishBoard();
      return;
    }
    advanceTimer = global.setTimeout(function () {
      goToGroup(groupIndex + 1);
    }, ADVANCE_DELAY);
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

  /* 再练一次：关掉弹窗，三组重新配一遍 */
  function restartBoard() {
    closeModal();
    startBoard();
  }

  /* 三组全部配好：全部锁定，调用 finish()（课堂模式记进度）；
     两种模式都等 0.9 秒弹完成弹窗 */
  function finishBoard() {
    lockAllOptions();
    lastSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    completeOnce(lastSeconds);
    modalTimer = global.setTimeout(openModal, SOLO_MODAL_DELAY);
  }

  /* 进入一组：拼音重新出场、汉字格换新、含义区收起、步骤①复位 */
  function renderGroup() {
    const group = GROUPS[groupIndex];
    setText(el.pinyin, group.pinyin);
    replayPinyinPop();
    renderOptions(el.words, group.wordOptions, "word", group.word);
    renderOptions(el.meanings, group.meaningOptions, "meaning", group.meaning);
    setHidden(el.meaningStage, true);
    stage = "word";
    setStepCurrent(el.stepWord, true);
    resetFeedback();
  }

  function goToGroup(index) {
    groupIndex = index;
    renderGroup();
    announce("第 " + (index + 1) + " 组：" + GROUPS[index].pinyin);
  }

  function startBoard() {
    global.clearTimeout(advanceTimer);
    global.clearTimeout(modalTimer);
    closeModal();
    completed.length = 0;
    groupIndex = 0;
    stage = "word";
    finished = false;
    madeMistake = false;
    lastSeconds = 0;
    startedAt = Date.now();
    renderSlots();
    goToGroup(0);
  }

  function boot() {
    cache();
    applyShellText();
    startBoard();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  document.addEventListener("DOMContentLoaded", applyShellText);

  global.AICloudPinyinMatchPage = { boot: boot, startBoard: startBoard, groups: GROUPS };
})(typeof window !== "undefined" ? window : globalThis);
