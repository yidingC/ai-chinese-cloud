(function (global) {
  "use strict";

  /* 本页自带的示范题（题型体验用）：字段结构与 round-content.js 里同题型的题目一致 */
  const DEMO_QUESTION = {
    id: "order-apple",
    items: [
      { id: "apple", text: "苹果", pinyin: "píng guǒ" },
      { id: "me", text: "我", pinyin: "wǒ" },
      { id: "one", text: "一个", pinyin: "yí ge" },
      { id: "want", text: "想", pinyin: "xiǎng" },
      { id: "buy", text: "买", pinyin: "mǎi" }
    ],
    bankOrder: ["apple", "me", "one", "want", "buy"],
    correctOrder: ["me", "want", "buy", "one", "apple"],
    correctId: "Saya ingin membeli sebuah apel."
  };
  const MODAL_DELAY = 1400;

  /* 当前这道题（轮内来自 round-content.js，否则是上面那份示范题） */
  let QUESTION = DEMO_QUESTION;

  const bridge = global.AICloudActivity;
  const copy = global.AICloudFeedbackCopy || {};
  const startedAt = Date.now();

  /* 跨页混题型一轮（链接带 q / total）：进度 / 下一题 / 记账与轮末弹窗交给 shared/round-flow.js */
  const roundFlow = global.AICloudRoundFlow || null;
  let roundState = { active: false };

  const answerNode = document.querySelector("[data-order-answer]");
  const bankNode = document.querySelector("[data-order-bank]");
  const submitNode = document.querySelector("[data-order-submit]");
  const submitLabelNode = document.querySelector("[data-order-submit-label]");
  const submitLabelIdNode = document.querySelector("[data-order-submit-label-id]");
  const clearNode = document.querySelector("[data-order-clear]");
  const feedbackNode = document.querySelector("[data-order-feedback]");
  const announcerNode = document.querySelector("[data-order-announcer]");
  const modal = global.AICloudFeedbackModal || null;

  let picked = [];
  let submitted = false;
  let attempts = 0;

  function itemFor(id) {
    return QUESTION.items.filter(function (entry) { return entry.id === id; })[0] || null;
  }

  function textFor(id) {
    const entry = itemFor(id);
    return entry ? entry.text : "";
  }

  function sentence(ids) {
    return ids.map(textFor).join(" ");
  }

  function announce(message) {
    if (announcerNode) announcerNode.textContent = message;
  }

  function fillTile(tile, entry) {
    const word = document.createElement("strong");
    word.textContent = entry.text;
    const pinyin = document.createElement("small");
    pinyin.textContent = entry.pinyin;
    tile.appendChild(word);
    tile.appendChild(pinyin);
    return tile;
  }

  function buildAnswerWord(id, index, settings) {
    const entry = itemFor(id) || { text: id, pinyin: "" };
    const button = document.createElement("button");
    button.type = "button";
    button.className = "order-tile order-answer-word";
    button.dataset.orderId = id;
    button.dataset.orderAnswerWord = "true";
    button.setAttribute("aria-label", "把词语 " + entry.text + " 放回词库");
    button.disabled = submitted;
    fillTile(button, entry);

    if (submitted) {
      const right = id === QUESTION.correctOrder[index];
      button.classList.add(right ? "is-correct" : "is-wrong");
      if (right) {
        const mark = document.createElement("span");
        mark.className = "order-tile-mark";
        mark.setAttribute("aria-hidden", "true");
        button.appendChild(mark);
      }
    } else if (settings.popId === id) {
      button.classList.add("is-new");
    }
    return button;
  }

  function buildBankTile(id, settings) {
    const entry = itemFor(id) || { text: id, pinyin: "" };
    const button = document.createElement("button");
    button.type = "button";
    button.className = "order-tile order-bank-tile";
    button.dataset.orderId = id;
    button.setAttribute("aria-label", "选择词语 " + entry.text);
    button.disabled = submitted;
    fillTile(button, entry);
    if (settings.popId === id) button.classList.add("is-new");
    return button;
  }

  function buildBankGhost(id) {
    const entry = itemFor(id) || { text: id, pinyin: "" };
    const ghost = document.createElement("span");
    ghost.className = "order-tile order-tile-ghost";
    ghost.setAttribute("aria-hidden", "true");
    return fillTile(ghost, entry);
  }

  function renderAnswer(settings) {
    if (!answerNode) return;
    answerNode.textContent = "";
    picked.forEach(function (id, index) {
      answerNode.appendChild(buildAnswerWord(id, index, settings));
    });
  }

  function renderBank(settings) {
    if (!bankNode) return;
    bankNode.textContent = "";
    QUESTION.bankOrder.forEach(function (id) {
      bankNode.appendChild(picked.indexOf(id) >= 0 ? buildBankGhost(id) : buildBankTile(id, settings));
    });
  }

  function syncControls() {
    if (submitNode) {
      submitNode.disabled = submitted || picked.length === 0;
    }
    if (submitLabelNode) submitLabelNode.textContent = submitted ? "已提交" : "提交";
    if (submitLabelIdNode) submitLabelIdNode.textContent = submitted ? "Terkirim" : "Kirim";
    if (clearNode) clearNode.disabled = submitted;
  }

  function focusTarget(target) {
    if (!target) return;
    const scope = target.where === "bank" ? bankNode : answerNode;
    if (!scope) return;
    const node = scope.querySelector('[data-order-id="' + target.id + '"]');
    if (node && !node.disabled && typeof node.focus === "function") node.focus();
  }

  function render(options) {
    const settings = options || {};
    renderAnswer(settings);
    renderBank(settings);
    syncControls();
    focusTarget(settings.focus);
  }

  function pick(id) {
    if (submitted || picked.indexOf(id) >= 0) return;
    picked = picked.concat(id);
    render({ popId: id, focus: { id: id, where: "answer" } });
    announce("已选入「" + textFor(id) + "」，已选 " + picked.length + " 个词");
  }

  function putBack(id) {
    if (submitted || picked.indexOf(id) < 0) return;
    picked = picked.filter(function (entry) { return entry !== id; });
    render({ popId: id, focus: { id: id, where: "bank" } });
    announce("已把「" + textFor(id) + "」放回词库，已选 " + picked.length + " 个词");
  }

  function clearAll() {
    if (submitted || picked.length === 0) return;
    picked = [];
    render();
    announce("已清空答案行，词已全部放回词库，已选 0 个词");
  }

  function buildAnswerSentence() {
    const block = document.createDocumentFragment();
    const line = document.createElement("p");
    line.className = "order-feedback-sentence";
    line.textContent = sentence(QUESTION.correctOrder);
    const translation = document.createElement("p");
    translation.className = "order-feedback-translation";
    translation.lang = "id";
    translation.textContent = QUESTION.correctId;
    block.appendChild(line);
    block.appendChild(translation);
    return block;
  }

  function showFeedback(correct) {
    if (!feedbackNode) return;
    feedbackNode.textContent = "";
    feedbackNode.classList.remove("is-correct", "is-wrong");
    if (correct) {
      feedbackNode.classList.add("hidden");
      return;
    }
    feedbackNode.classList.remove("hidden");
    feedbackNode.classList.add("is-wrong");
    feedbackNode.appendChild(buildAnswerSentence());
    if (typeof feedbackNode.focus === "function") feedbackNode.focus();
  }

  function openModal(tier, praise) {
    if (!modal || typeof modal.open !== "function") return;
    const backToClassroom = {
      label: "返回课堂",
      onSelect: function () {
        if (global.location) global.location.href = "classroom.html";
      }
    };
    const retry = { label: "再练一次", icon: "↻", onSelect: restartRound };
    modal.open({
      tier: tier,
      badge: praise ? praise.emoji : "",
      titleZh: praise ? praise.zh : "",
      titleId: praise ? praise.id : "",
      actions: [backToClassroom, retry]
    });
  }

  function restartRound() {
    picked = [];
    submitted = false;
    if (feedbackNode) {
      feedbackNode.textContent = "";
      feedbackNode.classList.add("hidden");
      feedbackNode.classList.remove("is-correct", "is-wrong");
    }
    if (modal && typeof modal.close === "function") modal.close();
    render();
    announce("已清空，可以重新排一次。");
  }

  function submit() {
    if (submitted || picked.length === 0) return;
    submitted = true;
    attempts += 1;
    const correct = picked.length === QUESTION.correctOrder.length && picked.every(function (id, index) {
      return id === QUESTION.correctOrder[index];
    });
    const firstTry = correct && attempts === 1;
    const tier = correct ? (firstTry ? "correctFirstTry" : "correct") : "wrong";
    const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const praise = copy && typeof copy.draw === "function"
      ? copy.draw(correct ? (firstTry ? "correctFirstTry" : "correct") : "wrong")
      : null;
    render();
    showFeedback(correct);
    announce(correct
      ? (praise && praise.zh) || "全对！"
      : "正确顺序是：" + sentence(QUESTION.correctOrder) + "。");

    /* 跨页那一轮：本页不记账、不弹窗——中间题只是「下一题」，最后一题交给 round-flow 结算 */
    if (roundState.active && roundFlow) {
      const step = roundFlow.afterAnswer(correct);
      const hasNext = step !== "finish";
      if (submitNode) submitNode.disabled = !hasNext;
      if (submitLabelNode) submitLabelNode.textContent = hasNext ? "下一题" : "已提交";
      if (submitLabelIdNode) submitLabelIdNode.textContent = hasNext ? "Lanjut" : "Terkirim";
      return;
    }

    if (bridge && bridge.finish) {
      bridge.finish({
        correct: correct,
        seconds: seconds,
        detail: sentence(picked)
      });
    }

    global.setTimeout(function () { openModal(tier, praise); }, MODAL_DELAY);
  }

  if (bankNode) {
    bankNode.addEventListener("click", function (event) {
      const tile = event.target && event.target.closest ? event.target.closest("button.order-bank-tile") : null;
      if (!tile || tile.disabled) return;
      pick(tile.dataset.orderId);
    });
  }

  if (answerNode) {
    answerNode.addEventListener("click", function (event) {
      const tile = event.target && event.target.closest ? event.target.closest("button.order-answer-word") : null;
      if (!tile || tile.disabled) return;
      putBack(tile.dataset.orderId);
    });
  }

  if (submitNode) submitNode.addEventListener("click", function () {
    /* 跨页那一轮：答完后这颗按钮是【下一题】，点它跳下一题那一页 */
    if (submitted && roundState.active && roundFlow) {
      roundFlow.goNext();
      return;
    }
    submit();
  });
  if (clearNode) clearNode.addEventListener("click", clearAll);

  /* 轮内（跨页那一轮）→ 题目从 round-content.js 取；不是轮内 → 本页自带的那道示范题 */
  roundState = roundFlow && typeof roundFlow.init === "function" ? roundFlow.init("order") : { active: false };
  QUESTION = roundState.active ? roundState.question : DEMO_QUESTION;
  render();
})(typeof window !== "undefined" ? window : globalThis);
