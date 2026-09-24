/* 找错误/改错 · interaction-correction.html 页面脚本
   状态机：待作答 → 已选择 → 已提交 → 正确 / 错误（每题只判一次，不提供重试）。
   第一版只做「用错的词」这一种错误类型：一句话里只有一个错点，选中它才算对；
   提交后一定给出改好的整句，这是改错题的价值。
   一页只有一个说话的人：说明只留卡片里题面那一行（中文＋印尼语，写在 HTML 里）；对错靠字块的颜色表达。
   进度记账由 shared/activity-bridge.js 负责（课堂跳转由完成弹窗的按钮执行），本页只做界面并调用 finish()。 */
(function (global) {
  "use strict";

  const SOLO_MODAL_DELAY = 2000;      // 体验模式：提交后留多久看对错，再弹完成弹窗
  const modal = global.AICloudFeedbackModal || null;
  const copy = global.AICloudFeedbackCopy || {};

  /* 本页自带的示范题（题型体验用；任务书 6.4 的例子）：words 按原句顺序横排，wrong 标出唯一的错点。
     字段结构与 round-content.js 里同题型的题目一致 */
  const DEMO_QUESTION = {
    id: "liangci-ben",
    words: [
      { id: "wo", text: "我", pinyin: "wǒ" },
      { id: "mai", text: "买", pinyin: "mǎi" },
      { id: "yi", text: "一", pinyin: "yī" },
      { id: "zhang", text: "张", pinyin: "zhāng", wrong: true },
      { id: "shu", text: "书", pinyin: "shū" },
      { id: "dot", text: "。", pinyin: "" }
    ],
    fixText: "本",                  // 正确的是哪个词
    fixedSentence: "我买一本书。",   // 改好的整句（反馈里一定要给）
    fixedPinyin: "Wǒ mǎi yì běn shū.",
    explain: "「书」要用量词「本」——一本；「张」用来数纸、桌子、床。",
    explainId: "Kalimat yang benar: Wǒ mǎi yì běn shū. Kata 「书」memakai kata bantu bilangan 「本」(一本); 「张」dipakai untuk kertas, meja, dan ranjang."
  };

  /* 当前这道题（轮内来自 round-content.js，否则是上面那份示范题） */
  let QUESTION = DEMO_QUESTION;

  const el = {};
  let tiles = [];         // [{ word, button }]，按句子顺序
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
    el.sentence = document.querySelector("[data-correction-sentence]");
    el.submit = document.querySelector("[data-correction-submit]");
    el.submitLabel = document.querySelector("[data-correction-submit-label]");
    el.submitLabelId = document.querySelector("[data-correction-submit-label-id]");
    el.feedback = document.querySelector("[data-correction-feedback]");
    el.feedbackTitleRow = document.querySelector("[data-correction-feedback-title-row]");
    el.feedbackIcon = document.querySelector("[data-correction-feedback-icon]");
    el.feedbackTitle = document.querySelector("[data-correction-feedback-title]");
    el.fixedSentence = document.querySelector("[data-correction-fixed-sentence]");
    el.fixedPinyin = document.querySelector("[data-correction-fixed-pinyin]");
    el.feedbackCopy = document.querySelector("[data-correction-feedback-copy]");
    el.feedbackId = document.querySelector("[data-correction-feedback-id]");
    el.announcer = document.querySelector("[data-correction-announcer]");
  }

  function activityBridge() {
    return global.AICloudActivity || null;
  }

  function mode() {
    const bridge = activityBridge();
    if (!bridge || typeof bridge.context !== "function") return "solo";
    return bridge.context().mode;
  }

  /* 返回按钮跟着模式走（标题与副标题由 shared/activity-page.js 统一填） */
  function applyShellText() {
    const back = document.querySelector("[data-activity-back]");
    if (!back) return;
    const isClass = mode() === "class";
    back.setAttribute("href", "classroom.html");
    back.setAttribute("aria-label", isClass ? "返回课堂互动" : "返回课堂");
  }

  function wordFor(id) {
    return QUESTION.words.filter(function (word) { return word.id === id; })[0] || null;
  }

  function wrongWord() {
    return QUESTION.words.filter(function (word) { return word.wrong === true; })[0] || null;
  }

  function labelOf(word) {
    return word.pinyin ? word.text + " " + word.pinyin : word.text;
  }

  function announce(message) {
    if (el.announcer) el.announcer.textContent = message;
  }

  /* 标点跟着前一个词走，不单独换行：没有拼音的符号与它前一个词绑成一组，整组一起换行 */
  function groupWords(words) {
    const groups = [];
    words.forEach(function (word) {
      const last = groups[groups.length - 1];
      if (!word.pinyin && last) last.push(word);
      else groups.push([word]);
    });
    return groups;
  }

  function buildTile(word) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "correction-word";
    button.dataset.correctionId = word.id;
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", "点选 " + labelOf(word));

    const text = document.createElement("strong");
    text.className = "correction-word-text";
    text.textContent = word.text;
    button.appendChild(text);

    if (word.pinyin) {
      const pinyin = document.createElement("small");
      pinyin.className = "correction-word-pinyin";
      pinyin.textContent = word.pinyin;
      button.appendChild(pinyin);
    } else {
      button.classList.add("is-punct");
    }

    button.addEventListener("click", function () {
      selectWord(word.id);
    });
    return button;
  }

  function renderSentence() {
    if (!el.sentence) return;
    el.sentence.textContent = "";
    tiles = [];
    groupWords(QUESTION.words).forEach(function (group) {
      const holder = group.length > 1 ? document.createElement("span") : null;
      if (holder) holder.className = "correction-cluster";
      group.forEach(function (word) {
        const button = buildTile(word);
        (holder || el.sentence).appendChild(button);
        tiles.push({ word: word, button: button });
      });
      if (holder) el.sentence.appendChild(holder);
    });
  }

  function paintSelection() {
    tiles.forEach(function (tile) {
      const isPicked = tile.word.id === selectedId;
      tile.button.classList.toggle("is-selected", isPicked);
      tile.button.setAttribute("aria-pressed", isPicked ? "true" : "false");
    });
    if (el.submit) el.submit.disabled = !selectedId;
  }

  function resetFeedback() {
    if (!el.feedback) return;
    el.feedback.classList.add("hidden");
    el.feedback.classList.remove("is-correct", "is-wrong");
    setHidden(el.feedbackTitleRow, true);
    setText(el.feedbackIcon, "");
    setText(el.feedbackTitle, "");
    setText(el.fixedSentence, "");
    setText(el.fixedPinyin, "");
    setText(el.feedbackCopy, "");
    setText(el.feedbackId, "");
  }

  /* 词块只有一种状态：点一下选中，点别的词块换过去，再点自己取消 */
  function selectWord(id) {
    if (submitted) return;
    selectedId = selectedId === id ? "" : id;
    paintSelection();
    const word = wordFor(id);
    announce(selectedId
      ? "已选中：" + labelOf(word)
      : "已取消选择");
  }

  /* 提交后锁住句子：对错只看颜色——绿＝真正用错的词（选对了），
     红＝没找到时标出的错点，灰＝你点错的词；不再挂文字标记 */
  function lockSentence() {
    const error = wrongWord();
    tiles.forEach(function (tile) {
      const button = tile.button;
      const word = tile.word;
      button.disabled = true;
      button.classList.remove("is-selected");
      button.setAttribute("aria-pressed", "false");
      if (error && word.id === error.id) {
        if (lastCorrect) {
          button.classList.add("is-found");
          button.setAttribute("aria-label", "「" + word.text + "」就是用错的词，你找到了");
        } else {
          button.classList.add("is-error");
          button.setAttribute("aria-label", "「" + word.text + "」用错了，应该改成「" + QUESTION.fixText + "」");
        }
      } else if (word.id === selectedId) {
        button.classList.add("is-miss");
        button.setAttribute("aria-label", "「" + word.text + "」是你选的词，这里没有错");
      }
    });
  }

  /* 结果条只说事实：全对＝绿框「✓ 找对了！」＋改好的整句；有错＝中性紫框，
     直接给改好的整句，不写「正确答案：」这类标签。 */
  function showFeedback(isCorrect) {
    if (!el.feedback) return;
    el.feedback.classList.remove("is-correct", "is-wrong");
    el.feedback.classList.add(isCorrect ? "is-correct" : "is-wrong");
    setHidden(el.feedbackTitleRow, !isCorrect);
    setText(el.feedbackIcon, isCorrect ? "✓" : "");
    setText(el.feedbackTitle, isCorrect ? "找对了！" : "");
    setText(el.fixedSentence, QUESTION.fixedSentence);
    setText(el.fixedPinyin, QUESTION.fixedPinyin);
    setText(el.feedbackCopy, QUESTION.explain);
    setText(el.feedbackId, QUESTION.explainId);
    el.feedback.classList.remove("hidden");
  }

  function completeOnce() {
    if (finished) return null;
    finished = true;
    const bridge = activityBridge();
    if (!bridge || typeof bridge.finish !== "function") return { recorded: false, next: "" };
    const picked = wordFor(selectedId);
    return bridge.finish({
      correct: lastCorrect,
      seconds: lastSeconds,
      detail: picked ? "选了「" + picked.text + "」" : ""
    });
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

  /* 再练一次：关掉弹窗，重新开始本题 */
  function restartQuestion() {
    closeModal();
    startQuestion();
  }

  function submitAnswer() {
    if (submitted || !selectedId) return;
    submitted = true;
    lastSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));

    const error = wrongWord();
    lastCorrect = !!error && selectedId === error.id;
    attempts += 1;
    const tier = lastCorrect ? (attempts === 1 ? "correctFirstTry" : "correct") : "wrong";
    const praise = typeof copy.draw === "function" ? copy.draw(tier, { single: true }) : null;

    lockSentence();
    if (el.submit) {
      el.submit.disabled = true;
      setText(el.submitLabel, "已提交");
      setText(el.submitLabelId, "Terkirim");
    }

    showFeedback(lastCorrect);
    announce(lastCorrect
      ? "找对了！" + QUESTION.fixedSentence
      : "再想想。「" + (error ? error.text : "") + "」应该改成「" + QUESTION.fixText + "」。" + QUESTION.fixedSentence);
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

    renderSentence();
    resetFeedback();
    if (el.submit) {
      el.submit.disabled = true;
      setText(el.submitLabel, "提交");
      setText(el.submitLabelId, "Kirim");
    }
    announce("待作答。");
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
    roundState = roundFlow && typeof roundFlow.init === "function" ? roundFlow.init("correction") : { active: false };
    QUESTION = roundState.active && roundState.question ? roundState.question : DEMO_QUESTION;

    startQuestion();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  document.addEventListener("DOMContentLoaded", applyShellText);

  global.AICloudCorrectionPage = { boot: boot, startQuestion: startQuestion };
})(typeof window !== "undefined" ? window : globalThis);
