/* 课堂投票 · interaction-poll.html 页面脚本
   状态机：待作答 → 已选择 → 已提交（每题只提交一次；投票不计分，没有对错）
   题干与选项由本脚本按题目数据渲染（保留现有结构与 class）：轮内（链接带 q / total）题目从
   round-content.js 取，不是轮内就用下面这份示范题。
   进度记账由 shared/activity-bridge.js 负责；跨页混题型一轮的进度 / 下一题 / 记账交给 shared/round-flow.js。 */
(() => {
  "use strict";

  const bridge = window.AICloudActivity;
  const modal = window.AICloudFeedbackModal || null;
  const copy = window.AICloudFeedbackCopy || {};

  /* 本页自带的示范题（题型体验用）：题干 + 4 个选项；字段结构与 round-content.js 里同题型的题目一致 */
  const DEMO_QUESTION = {
    id: "poll-after-class",
    prompt: "下课后你最喜欢做什么？",
    promptId: "Setelah kelas, kamu paling suka melakukan apa?",
    options: [
      { value: "music", emoji: "🎧", text: "听音乐", textId: "Mendengarkan musik" },
      { value: "basketball", emoji: "🏀", text: "打篮球", textId: "Bermain basket" },
      { value: "animation", emoji: "📺", text: "看中文动画", textId: "Menonton animasi Mandarin" },
      { value: "chat", emoji: "💬", text: "和朋友聊天", textId: "Mengobrol dengan teman" }
    ]
  };

  /* 当前这道题（轮内来自 round-content.js，否则是上面那份示范题） */
  let QUESTION = DEMO_QUESTION;

  const card = document.querySelector("[data-poll-card]");
  const optionsBox = document.querySelector(".poll-options");
  const questionNode = document.querySelector("[data-poll-question]");
  const questionIdNode = document.querySelector("[data-poll-question-id]");
  const submitButton = document.querySelector("[data-poll-submit]");
  const submitLabel = document.querySelector("[data-poll-submit-label]");
  const submitLabelId = document.querySelector("[data-poll-submit-label-id]");

  const startedAt = Date.now();

  let submitted = false;
  let options = [];

  /* 跨页混题型一轮（链接带 q / total）：进度 / 下一题 / 记账与轮末弹窗交给 shared/round-flow.js */
  const roundFlow = window.AICloudRoundFlow || null;
  let roundState = { active: false };

  const inputOf = (option) => (option ? option.querySelector(".poll-option-input") : null);

  const selectedOption = () => options.filter((option) => {
    const input = inputOf(option);
    return Boolean(input && input.checked);
  })[0] || null;

  const textOf = (option) => {
    const zh = option ? option.querySelector(".poll-option-body strong") : null;
    const id = option ? option.querySelector(".poll-option-body small") : null;
    return {
      zh: zh ? zh.textContent.trim() : "",
      id: id ? id.textContent.trim() : ""
    };
  };

  /* 选中态整块一起变（描边 + 底色 + 右上角对勾），不只靠颜色 */
  const paintOptions = () => {
    options.forEach((option) => {
      const input = inputOf(option);
      const selected = Boolean(input && input.checked);
      option.classList.toggle("is-selected", selected);
    });
  };

  const refreshSubmit = () => {
    if (submitButton) submitButton.disabled = submitted || !selectedOption();
  };

  /* 题干 + 选项按题目数据渲染（保留现有 DOM 结构与 class；选项顺序 = 数据顺序，不进页打乱） */
  const renderQuestion = () => {
    if (questionNode) questionNode.textContent = QUESTION.prompt;
    if (questionIdNode) questionIdNode.textContent = QUESTION.promptId || "";
    if (!optionsBox) return;

    optionsBox.textContent = "";
    QUESTION.options.forEach((item) => {
      const label = document.createElement("label");
      label.className = "poll-option";
      label.dataset.pollOption = "";

      const input = document.createElement("input");
      input.className = "poll-option-input";
      input.type = "radio";
      input.name = "poll-choice";
      input.value = item.value;

      const emoji = document.createElement("span");
      emoji.className = "poll-emoji";
      emoji.setAttribute("aria-hidden", "true");
      emoji.textContent = item.emoji;

      const body = document.createElement("span");
      body.className = "poll-option-body";
      const zh = document.createElement("strong");
      zh.textContent = item.text;
      const id = document.createElement("small");
      id.textContent = item.textId || "";
      body.appendChild(zh);
      body.appendChild(id);

      label.appendChild(input);
      label.appendChild(emoji);
      label.appendChild(body);
      optionsBox.appendChild(label);
    });

    options = Array.from(optionsBox.querySelectorAll("[data-poll-option]"));
    options.forEach((option) => {
      const input = inputOf(option);
      if (!input) return;
      input.addEventListener("change", () => {
        if (submitted) return;
        paintOptions();
        refreshSubmit();
      });
    });
  };

  /* 完成弹窗：公共模具（投票没有对错，用中性样式 + 记录类文案） */
  const openModal = () => {
    if (!modal || typeof modal.open !== "function") return;
    const praise = copy && copy.record ? copy.record : { zh: "收到啦！", id: "Sudah diterima!" };
    modal.open({
      badge: "🗳️",
      titleZh: praise.zh,
      titleId: praise.id,
      actions: [
        {
          label: "返回课堂",
          onSelect: () => {
            window.location.href = "classroom.html";
          }
        },
        { label: "再练一次", icon: "↻", onSelect: restartRound }
      ]
    });
  };

  /* 再练一次：清掉已记录状态，重新投一次 */
  const restartRound = () => {
    if (modal && typeof modal.close === "function") modal.close();
    submitted = false;
    options.forEach((option) => {
      const input = inputOf(option);
      if (input) {
        input.disabled = false;
        input.checked = false;
      }
      option.classList.remove("is-selected");
    });
    if (card) card.classList.remove("is-submitted");
    if (submitLabel) submitLabel.textContent = "提交";
    if (submitLabelId) submitLabelId.textContent = "Kirim";
    paintOptions();
    refreshSubmit();
  };

  const submitAnswer = () => {
    if (submitted) return;
    const option = selectedOption();
    if (!option) return;

    submitted = true;
    const picked = textOf(option);

    options.forEach((item) => {
      const input = inputOf(item);
      if (input) input.disabled = true;
    });
    if (card) card.classList.add("is-submitted");
    paintOptions();

    if (submitButton) {
      submitButton.disabled = true;
    }
    if (submitLabel) submitLabel.textContent = "已提交";
    if (submitLabelId) submitLabelId.textContent = "Terkirim";

    /* 跨页那一轮：本页不记账、不弹窗（那发 650ms 的自动弹窗也不要）——
       中间题只是「下一题」，最后一题交给 round-flow 结算；投票没有对错，一律按"答对"记 */
    if (roundState.active && roundFlow) {
      const step = roundFlow.afterAnswer(true);
      const hasNext = step !== "finish";
      if (submitButton) submitButton.disabled = !hasNext;
      if (submitLabel) submitLabel.textContent = hasNext ? "下一题" : "已提交";
      if (submitLabelId) submitLabelId.textContent = hasNext ? "Lanjut" : "Terkirim";
      return;
    }

    const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    if (bridge && typeof bridge.finish === "function") {
      /* 课堂模式：公共脚本只记进度；跳转由弹窗按钮负责，页面不自己写跳转 */
      bridge.finish({ correct: true, seconds, detail: `投票：${picked.zh}` });
    }

    /* 两种模式都弹公共情绪弹窗 */
    window.setTimeout(openModal, 650);
  };

  if (submitButton) submitButton.addEventListener("click", () => {
    /* 跨页那一轮：答完后这颗按钮是【下一题】，点它跳下一题那一页 */
    if (submitted && roundState.active && roundFlow) {
      roundFlow.goNext();
      return;
    }
    submitAnswer();
  });

  /* 顶栏返回：统一回课堂页，href 与文案由 shared/activity-page.js 负责 */

  /* 轮内（跨页那一轮）→ 题目从 round-content.js 取；不是轮内 → 本页自带的那份示范题 */
  roundState = roundFlow && typeof roundFlow.init === "function" ? roundFlow.init("poll") : { active: false };
  QUESTION = roundState.active && roundState.question ? roundState.question : DEMO_QUESTION;

  renderQuestion();
  paintOptions();
  refreshSubmit();
})();
