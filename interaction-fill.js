/* 补全句子 · interaction-fill.html 页面脚本（词库填空版）
   点词库里的词 → 填进最左边的空；点句子中已填的词 → 退回词库原位置。
   状态机：待作答 → 已选择（空都填了）→ 已提交（每题只提交一次）→ 正确 / 错误。
   页面说事实（对错、正确答案），弹窗说情绪（句池来自 shared/feedback-copy.js）。 */
(function (global) {
  "use strict";

  const bridge = global.AICloudActivity;
  const modal = global.AICloudFeedbackModal || null;
  const copy = global.AICloudFeedbackCopy || {};
  const MODAL_DELAY = 1400;          // 结果条先出场，弹窗后到

  // 模拟题目：字段结构与后台 InteractionPlayer 的 fill 题型一致，sentence 里 ____ 表示空
  const QUESTION = {
    id: "fill-greeting-1",
    sentence: "我每天 ____ 七点 ____，然后 ____ 学校。",
    translationId: "Setiap hari saya bangun jam tujuh pagi, lalu pergi ke sekolah.",
    blanks: [
      { id: "time", answer: "早上" },
      { id: "wake", answer: "起床" },
      { id: "go", answer: "去" }
    ],
    // 3 个正确词 + 2 个干扰词（填进去明显不通）
    words: [
      { id: "w-time", text: "早上", pinyin: "zǎo shang" },
      { id: "w-wake", text: "起床", pinyin: "qǐ chuáng" },
      { id: "w-go", text: "去", pinyin: "qù" },
      { id: "w-bag", text: "书包", pinyin: "shū bāo" },
      { id: "w-drink", text: "喝", pinyin: "hē" }
    ]
  };

  const dom = {
    card: document.querySelector(".fill-card"),
    sentence: document.querySelector("[data-fill-sentence]"),
    bank: document.querySelector("[data-fill-bank]"),
    clear: document.querySelector("[data-fill-clear]"),
    submit: document.querySelector("[data-fill-submit]"),
    submitLabel: document.querySelector("[data-fill-submit-label]"),
    submitLabelId: document.querySelector("[data-fill-submit-label-id]"),
    live: document.querySelector("[data-fill-live]"),
    feedback: document.querySelector("[data-fill-feedback]"),
    feedbackIcon: document.querySelector("[data-fill-feedback-icon]"),
    verdict: document.querySelector("[data-fill-verdict]"),
    feedbackTitle: document.querySelector(".fill-feedback-title"),
    fullSentence: document.querySelector("[data-fill-full-sentence]"),
    translation: document.querySelector("[data-fill-full-sentence-id]")
  };

  const blanks = QUESTION.blanks.map(function (item, index) {
    return { id: item.id, answer: item.answer, index: index, word: null, el: null, button: null };
  });

  // 词块顺序每次进页面都打乱
  const words = shuffle(QUESTION.words).map(function (item) {
    return { id: item.id, text: item.text, pinyin: item.pinyin, home: null, button: null };
  });

  let state = "idle";
  let attempts = 0;
  let finished = false;
  let lastCorrect = false;
  let lastSeconds = 0;
  let startedAt = Date.now();
  let modalTimer = 0;

  function shuffle(list) {
    const items = list.slice();
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const swap = items[i];
      items[i] = items[j];
      items[j] = swap;
    }
    return items;
  }

  function isLocked() {
    return state === "submitted" || state === "correct" || state === "wrong";
  }

  function emptyCount() {
    return blanks.filter(function (blank) { return !blank.word; }).length;
  }

  function announce(message) {
    if (dom.live) dom.live.textContent = message;
  }

  function setState(next) {
    state = next;
    if (dom.card) dom.card.dataset.fillState = next;
  }

  function fullSentenceText() {
    const parts = QUESTION.sentence.split("____");
    let text = "";
    parts.forEach(function (part, index) {
      text += part;
      if (index < blanks.length) text += blanks[index].answer;
    });
    return text;
  }

  /* ---------- 渲染 ---------- */

  function createBlankElement(blank) {
    const slotEl = document.createElement("span");
    slotEl.className = "fill-slot";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "fill-blank";
    button.dataset.blankId = blank.id;
    button.disabled = true;
    button.setAttribute("aria-label", "第 " + (blank.index + 1) + " 个空，还没有填");
    button.addEventListener("click", function (event) {
      takeBackWord(blank, event);
    });

    slotEl.appendChild(button);

    blank.el = slotEl;
    blank.button = button;
    return slotEl;
  }

  function renderSentence() {
    const parts = QUESTION.sentence.split("____");
    const fragment = document.createDocumentFragment();
    parts.forEach(function (part, index) {
      fragment.appendChild(document.createTextNode(part));
      if (index < blanks.length) fragment.appendChild(createBlankElement(blanks[index]));
    });
    dom.sentence.textContent = "";
    dom.sentence.appendChild(fragment);
  }

  function renderBank() {
    const fragment = document.createDocumentFragment();
    words.forEach(function (word) {
      const slotEl = document.createElement("span");
      slotEl.className = "fill-word";
      slotEl.dataset.wordId = word.id;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "fill-chip";
      button.dataset.wordId = word.id;
      button.setAttribute("aria-label", "选择词语 " + word.text);

      const text = document.createElement("strong");
      text.textContent = word.text;
      const pinyin = document.createElement("span");
      pinyin.textContent = word.pinyin;
      button.appendChild(text);
      button.appendChild(pinyin);

      button.addEventListener("click", function (event) {
        placeWord(word, event);
      });

      slotEl.appendChild(button);
      fragment.appendChild(slotEl);

      word.home = slotEl;
      word.button = button;
    });
    dom.bank.textContent = "";
    dom.bank.appendChild(fragment);
  }

  function updateBlank(blank) {
    const button = blank.button;
    const word = blank.word;
    if (word) {
      button.textContent = word.text;
      button.classList.add("is-filled");
    } else {
      button.textContent = "";
      button.classList.remove("is-filled");
    }
    button.disabled = isLocked() || !word;

    if (!word) {
      button.setAttribute("aria-label", "第 " + (blank.index + 1) + " 个空，还没有填");
    } else if (isLocked()) {
      button.setAttribute("aria-label", "第 " + (blank.index + 1) + " 个空：" + word.text);
    } else {
      button.setAttribute("aria-label", "把词语 " + word.text + " 放回词库");
    }
  }

  function updateWord(word) {
    const placed = blanks.some(function (blank) { return blank.word === word; });
    word.button.classList.toggle("is-placed", placed);
    word.button.disabled = placed || isLocked();
    word.home.classList.toggle("is-empty", placed);
  }

  /* ---------- 词块与空格的来回 ---------- */

  function firstEmptyBlank() {
    return blanks.filter(function (blank) { return !blank.word; })[0] || null;
  }

  function placeWord(word, event) {
    if (isLocked()) return;
    const blank = firstEmptyBlank();
    if (!blank) {
      announce("空都填好了，可以点提交，或者点句子里已填的词把它放回词库");
      return;
    }

    blank.word = word;
    updateBlank(blank);
    updateWord(word);
    syncReady();

    const left = emptyCount();
    announce(left > 0
      ? "已填入「" + word.text + "」，还剩 " + left + " 个空"
      : "已填入「" + word.text + "」，空都填好了，可以提交");

    if (event && event.detail === 0) focusNextChip(word);
  }

  function takeBackWord(blank, event) {
    if (isLocked()) return;
    const word = blank.word;
    if (!word) return;

    blank.word = null;
    updateBlank(blank);
    updateWord(word);
    syncReady();
    announce("已把「" + word.text + "」放回词库");

    if (event && event.detail === 0) word.button.focus();
  }

  function clearAll(event) {
    if (isLocked()) return;
    blanks.forEach(function (blank) {
      blank.word = null;
      updateBlank(blank);
    });
    words.forEach(updateWord);
    syncReady();
    announce("已清空，全部词放回词库");

    if (event && event.detail === 0) {
      const first = words.filter(function (word) { return !word.button.disabled; })[0];
      if (first) first.button.focus();
    }
  }

  function focusNextChip(word) {
    const index = words.indexOf(word);
    const ordered = words.slice(index + 1).concat(words.slice(0, index));
    const next = ordered.filter(function (item) { return !item.button.disabled; })[0];
    if (next) {
      next.button.focus();
      return;
    }
    if (!dom.submit.disabled) dom.submit.focus();
    else if (!dom.clear.disabled) dom.clear.focus();
  }

  function syncReady() {
    if (isLocked()) return;
    const left = emptyCount();
    dom.submit.disabled = left > 0;
    dom.clear.disabled = left === blanks.length;
    setState(left > 0 ? "idle" : "ready");
  }

  /* ---------- 结果条与弹窗 ---------- */

  function resetFeedback() {
    if (!dom.feedback) return;
    dom.feedback.classList.add("hidden");
    dom.feedback.classList.remove("is-correct", "is-wrong");
    if (dom.feedbackIcon) dom.feedbackIcon.textContent = "";
    if (dom.feedbackTitle) dom.feedbackTitle.classList.remove("hidden");
    if (dom.verdict) dom.verdict.textContent = "";
    if (dom.fullSentence) {
      dom.fullSentence.textContent = "";
      dom.fullSentence.classList.add("hidden");
    }
    if (dom.translation) {
      dom.translation.textContent = "";
      dom.translation.classList.add("hidden");
    }
  }

  /* 页面只说事实：对错用空格的颜色表达，答案统一在结果框里给完整原句。
     全对 = 绿框「答对了！」+ 原句；有错 = 中性紫框，只放原句（不再写“还差 N 个”）。 */
  function renderFeedback(allCorrect) {
    if (!dom.feedback) return;
    dom.feedback.classList.remove("hidden");
    dom.feedback.classList.toggle("is-correct", allCorrect);
    dom.feedback.classList.toggle("is-wrong", !allCorrect);
    if (dom.feedbackIcon) dom.feedbackIcon.textContent = allCorrect ? "✓" : "";
    if (dom.feedbackTitle) dom.feedbackTitle.classList.toggle("hidden", !allCorrect);
    if (dom.verdict) dom.verdict.textContent = allCorrect ? "答对了！" : "";
    if (dom.fullSentence) {
      dom.fullSentence.textContent = fullSentenceText();
      dom.fullSentence.classList.remove("hidden");
    }
    if (dom.translation) {
      dom.translation.textContent = QUESTION.translationId || "";
      dom.translation.classList.toggle("hidden", !QUESTION.translationId);
    }
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

  /* 再练一次：词全部放回词库（顺序不变）、空格清空、计时重开 */
  function restartQuestion() {
    global.clearTimeout(modalTimer);
    if (modal && typeof modal.close === "function") modal.close();
    if (dom.bank) dom.bank.classList.remove("is-locked");

    // 先回到待作答，再重画空格和词块，否则它们会带着“已锁定”的禁用态
    finished = false;
    setState("idle");

    blanks.forEach(function (blank) {
      blank.word = null;
      blank.el.classList.remove("is-correct", "is-wrong");
      blank.button.classList.remove("is-correct", "is-wrong");
      updateBlank(blank);
    });
    words.forEach(updateWord);

    if (dom.submitLabel) dom.submitLabel.textContent = "提交";
    if (dom.submitLabelId) dom.submitLabelId.textContent = "Kirim";
    resetFeedback();
    startedAt = Date.now();
    syncReady();
    announce("已复位，可以重新填一次");
  }

  /* 矮屏退路：动画落定后回执底边要是还在屏幕下沿外，补滚一小段让它完整露出来；
     常见屏（≥700 高）算下来不用滚，页面不动。 */
  function revealReceipt() {
    if (!dom.feedback || dom.feedback.classList.contains("hidden") || typeof global.scrollBy !== "function") return;
    const overlap = dom.feedback.getBoundingClientRect().bottom + 12 - global.innerHeight;
    if (overlap > 0) global.scrollBy({ top: overlap, behavior: "smooth" });
  }

  /* ---------- 提交 ---------- */

  function reportFinish(correctCount) {
    if (finished) return null;
    finished = true;
    if (!bridge || typeof bridge.finish !== "function") return { recorded: false, next: "" };
    return bridge.finish({
      correct: lastCorrect,
      seconds: lastSeconds,
      detail: "补全句子：答对 " + correctCount + " / " + blanks.length + " 个空"
    });
  }

  function submit() {
    if (isLocked()) return;
    if (emptyCount() > 0) return;

    const results = blanks.map(function (blank) {
      return { blank: blank, correct: blank.word.text === blank.answer };
    });
    const misses = results
      .filter(function (entry) { return !entry.correct; })
      .map(function (entry) { return entry.blank.answer; });
    const allCorrect = misses.length === 0;
    const firstTry = allCorrect && attempts === 0;
    const tier = allCorrect ? (firstTry ? "correctFirstTry" : "correct") : "wrong";
    const praise = typeof copy.draw === "function" ? copy.draw(tier) : null;

    attempts += 1;
    lastCorrect = allCorrect;
    lastSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    setState("submitted");

    dom.submit.disabled = true;
    if (dom.submitLabel) dom.submitLabel.textContent = "已提交";
    if (dom.submitLabelId) dom.submitLabelId.textContent = "Terkirim";
    dom.clear.disabled = true;
    if (dom.bank) dom.bank.classList.add("is-locked");

    results.forEach(function (entry) {
      const blank = entry.blank;
      if (entry.correct) {
        blank.button.classList.add("is-correct");
        blank.el.classList.add("is-correct");
      } else {
        blank.button.classList.add("is-wrong");
        blank.el.classList.add("is-wrong");
      }
      updateBlank(blank);
    });

    words.forEach(function (word) { word.button.disabled = true; });

    renderFeedback(allCorrect);
    setState(allCorrect ? "correct" : "wrong");

    // 读屏与页面同口径：有错时念完整原句，不再逐空念答案
    announce(allCorrect ? "全对，答对了！" : fullSentenceText());

    if (dom.feedback && typeof dom.feedback.scrollIntoView === "function") {
      /* 一屏放得下时不动页面；回执条被屏幕下沿裁掉才滚最小距离（跟其他页同一条退路） */
      dom.feedback.scrollIntoView({ block: "nearest" });
      /* 出场的 0.28s 还没跑完，这会儿量到的位置是收在半截的；等它落定再补看一眼 */
      global.setTimeout(revealReceipt, 300);
    }

    reportFinish(results.length - misses.length);

    modalTimer = global.setTimeout(function () {
      openModal(tier, praise);
    }, MODAL_DELAY);
  }

  function boot() {
    renderSentence();
    renderBank();
    words.forEach(updateWord);
    blanks.forEach(updateBlank);

    if (dom.submit) dom.submit.addEventListener("click", submit);
    if (dom.clear) dom.clear.addEventListener("click", clearAll);

    startedAt = Date.now();
    setState("idle");
    syncReady();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(typeof window !== "undefined" ? window : globalThis);
