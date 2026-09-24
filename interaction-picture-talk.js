/* 看图说话 · interaction-picture-talk.html 页面脚本
   状态机：待作答 → 录音中 → 识别中 → 出学习卡（＝交卷）→ 已说完。
   录音和识别都是假的：不碰麦克风、不弹授权框、不发出任何声音；录音中也不跳柱子（没有假波形）。
   假识别固定 1 秒，整段假流程不超过 2 秒。这一页没有对错：录音即交卷，没有「完成」按钮。
   按住说话：按住超过 350ms 再松开就算说完了；也支持点一下开始、再点一下结束。
   说完后按钮原地变成安静款「再说一次」：按下才重录，不自动开录；记账只记第一次。
   状态都在贴底动作区那行小字里（见 HINT），按钮视觉上只有图标，名字落在 aria-label 上。
   学习卡是卡片的下一层，出结果时从卡片下沿滑出来（同跟读模仿页的回执条）。
   图槽、参考答案都按可替换字段写：图片路径一填、识别接上，页面代码不用重写。
   出结果就交卷：两种模式都在约 2 秒后弹 shared/feedback-modal.js 的公共弹窗，
   课堂模式下由弹窗按钮跳回课堂（进度记账在 shared/activity-bridge.js）。
   跨页多题一轮（链接带 q / total）：进度行 / 下一题 / 记账与轮末弹窗交给 shared/round-flow.js。 */
(function (global) {
  "use strict";

  const HOLD_MS = 350;                 // 按住超过这个时长，松开就算说完了；短按则等学生再点一下结束
  const RECOGNIZE_MS = 1000;           // 假识别固定 1 秒
  const SOLO_MODAL_DELAY = 2000;       // 演示模式：出结果后留 2 秒看反馈，再自动弹「收到啦」（同听音页节奏）
  const CHEER = { zh: "说得不错！", id: "Bagus!" };  // 只夸「开口说了」，不评结果（这一页不打分）
  /* 动作区那行小字：状态的唯一可见反馈（录音时手指压在按钮上，只有这行字露在外面）。
     四态四句，全是换文案，不是藏起来 */
  const HINT = {
    idle: "按住说完松开 · Tahan, lepas setelah selesai",
    recording: "正在听…… · Sedang mendengar",
    recognizing: "听出来了？· Sebentar ya…",
    result: "再说一次 · Bicara lagi"
  };
  const modal = global.AICloudFeedbackModal || null;
  const copy = global.AICloudFeedbackCopy || {};

  /* 兜底的示范题（任务书 7.4 的例子）。prompt 只给读屏，页面上让大图自己说话。
     image 先留空字符串：以后把真图放进 public/shared/demo-materials/，
     把路径填到这个字段里，图槽就渲染 <img>——页面代码不用改。
     轮内时这道题从 round-content.js 取——改题目请改那个文件，这里只是"数据读不到也不白屏"的兜底 */
  const DEMO_QUESTION = {
    id: "kan-tu-paobu",
    prompt: "看这张图，用中文说一句话。",
    hint: "试试说：谁 + 在做什么 · Coba: siapa + sedang apa",
    icon: "🏃",
    image: "",
    imageAlt: "一个小朋友在跑步",
    answer: "小朋友在跑步。",
    answerId: "Anak itu sedang berlari."
  };

  /* 当前这一题：非轮内 = 上面那份兜底；轮内 = round-content.js 里 slot 对应的这道题 */
  let QUESTION = DEMO_QUESTION;

  const el = {};
  let micState = "idle";       // idle（待作答）| recording（录音中）| recognizing（识别中）| done（已说完）
  let finished = false;
  let lastSeconds = 0;
  let startedAt = 0;
  let pressStartedAt = 0;
  let pressedWhileRecording = false;
  let recognizeTimer = 0;
  let modalTimer = 0;                  // 演示模式的自动弹窗计时器：重录要取消它

  /* 跨页多题一轮：进度行 / 下一题 / 记账都交给 shared/round-flow.js；不是轮内就照旧 */
  let roundFlow = null;
  let roundState = { active: false };
  let roundAnswered = false;           // 轮内这一题只收尾一次（挡住重录重入）

  function setText(node, text) {
    if (node) node.textContent = text;
  }

  function setHidden(node, hidden) {
    if (node) node.classList.toggle("hidden", !!hidden);
  }

  function cache() {
    el.prompt = document.querySelector("[data-picture-talk-prompt]");
    el.slot = document.querySelector("[data-picture-talk-slot]");
    el.hint = document.querySelector("[data-picture-talk-hint]");
    el.mic = document.querySelector("[data-picture-talk-mic]");
    el.micIcon = document.querySelector("[data-picture-talk-mic-icon]");
    el.recordHint = document.querySelector("[data-picture-talk-record-hint]");
    el.card = document.querySelector(".picture-talk-card");
    el.result = document.querySelector("[data-picture-talk-result]");
    el.answer = document.querySelector("[data-picture-talk-answer]");
    el.answerId = document.querySelector("[data-picture-talk-answer-id]");
    el.cheer = document.querySelector("[data-picture-talk-cheer]");
    el.cheerId = document.querySelector("[data-picture-talk-cheer-id]");
    el.announcer = document.querySelector("[data-picture-talk-announcer]");
    el.nextBox = document.querySelector("[data-pt-next]");
    el.nextButton = document.querySelector("[data-pt-next-btn]");
    el.nextLabel = document.querySelector("[data-pt-next-label]");
    el.nextLabelId = document.querySelector("[data-pt-next-label-id]");
  }

  function activityBridge() {
    return global.AICloudActivity || null;
  }

  function mode() {
    const bridge = activityBridge();
    if (!bridge || typeof bridge.context !== "function") return "solo";
    return bridge.context().mode;
  }

  /* 返回按钮：课堂模式回课堂互动，体验模式也回课堂页 */
  function applyShellText() {
    const back = document.querySelector("[data-activity-back]");
    if (!back) return;
    const isClass = mode() === "class";
    back.setAttribute("href", "classroom.html");
    back.setAttribute("aria-label", isClass ? "返回课堂互动" : "返回课堂");
  }

  function announce(text) {
    setText(el.announcer, text);
  }

  /* 图槽：image 有值渲染 <img src alt>，为空渲染放大后的 emoji（同一套可替换槽位） */
  function renderPictureSlot() {
    if (!el.slot) return;
    el.slot.innerHTML = "";

    const inner = document.createElement("div");
    inner.className = "picture-talk-slot-inner";

    if (QUESTION.image) {
      const image = document.createElement("img");
      image.src = QUESTION.image;
      image.alt = QUESTION.imageAlt || "";
      inner.appendChild(image);
    } else {
      const emoji = document.createElement("span");
      emoji.className = "picture-talk-slot-emoji";
      emoji.setAttribute("role", "img");
      emoji.setAttribute("aria-label", QUESTION.imageAlt || "");
      emoji.textContent = QUESTION.icon;
      inner.appendChild(emoji);
    }

    el.slot.appendChild(inner);
  }

  /* 鼓励行：中文大字 + 「·」+ 印尼小字，两半各自成节点（字号不同，见 css）。
     只夸「开口说了」，不评结果；读屏那份念白在 announce 里，和这里无关 */
  function renderCheer() {
    setText(el.cheer, CHEER.zh);
    setText(el.cheerId, CHEER.id);
  }

  /* 按钮、小字都跟着状态走：待作答 / 录音中 / 识别中 / 已说完。
     按钮视觉上只剩一个图标（没有文字），名字必须落在 aria-label 上——
     否则用屏幕朗读的学生会遇到一个没有名字的按钮 */
  function paintMic() {
    if (!el.mic) return;
    const recording = micState === "recording";
    const recognizing = micState === "recognizing";
    const done = micState === "done";
    el.mic.classList.toggle("is-recording", recording);
    el.mic.classList.toggle("is-recognizing", recognizing);
    /* 说完：紫色大按钮降级成安静款「再说一次」（不禁用，按一下才重录） */
    el.mic.classList.toggle("is-retry", done);
    if (el.card) el.card.classList.toggle("is-result", done);
    el.mic.setAttribute("aria-pressed", recording ? "true" : "false");
    el.mic.setAttribute("aria-busy", recognizing ? "true" : "false");
    el.mic.setAttribute("aria-label", recording
      ? "正在录音"
      : recognizing
        ? "识别中"
        : done ? "再说一次" : "按住说话");
    setText(el.micIcon, recording ? "🔴" : "🎤");
    setText(el.recordHint, recording
      ? HINT.recording
      : recognizing
        ? HINT.recognizing
        : done ? HINT.result : HINT.idle);
  }

  /* 按下：只改状态和动效，不碰麦克风 */
  function startRecording() {
    if (micState !== "idle") return;
    micState = "recording";
    paintMic();
    announce("正在录音。说完松开按钮。");
  }

  /* 松开 / 再点一下：进入假识别，固定 1 秒 */
  function stopRecording() {
    if (micState !== "recording") return;
    global.clearTimeout(recognizeTimer);
    micState = "recognizing";
    lastSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    paintMic();
    announce("识别中，请稍等。");
    recognizeTimer = global.setTimeout(showResult, RECOGNIZE_MS);
  }

  /* 假识别的终点：学习卡给出一句鼓励 + 参考答案，这一页不打分、不给星级。
     出结果就是交卷，所以这里顺手把账记了。 */
  function showResult() {
    micState = "done";
    lastSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    paintMic();
    announce(CHEER.zh + "参考答案：" + QUESTION.answer);
    if (el.result) {
      el.result.classList.remove("hidden");
      if (typeof el.result.focus === "function") el.result.focus({ preventScroll: true });
      /* 学习卡从卡片下沿滑出来：把它带进视野就好，别把卡片整块推走；矮屏装不下允许滚动 */
      if (typeof el.result.scrollIntoView === "function") el.result.scrollIntoView({ block: "nearest" });
    }
    submitResult();
  }

  function completeOnce() {
    if (finished) return null;
    finished = true;
    const bridge = activityBridge();
    if (!bridge || typeof bridge.finish !== "function") return { recorded: false, next: "" };
    return bridge.finish({
      correct: true,                 /* 这一页没有对错，如实写 true */
      seconds: lastSeconds,
      detail: "看图说话"
    });
  }

  /* 轮内：麦克风停用（变灰、点不动）；重练留给轮末弹窗的「再做一次」 */
  function stopRetryInRound() {
    if (el.mic) el.mic.disabled = true;
  }

  /* 轮内：中间题解禁【下一题】，最后一题换成【已提交】（口径与其它题型页一致） */
  function stepToNext(step) {
    if (step === "next" && el.nextButton) {
      el.nextButton.disabled = false;
    } else if (step === "finish") {
      setText(el.nextLabel, "已提交");
      setText(el.nextLabelId, "Terkirim");
    }
    /* 矮屏上这颗键可能正好压在贴底动作区后面：把它带进视野，别让学生自己找 */
    if (el.nextBox && typeof el.nextBox.scrollIntoView === "function") {
      el.nextBox.scrollIntoView({ block: "nearest" });
    }
  }

  /* 录音即交卷。轮内：不记账、不弹本页弹窗——这一题只收尾一次，把【下一题】交给 round-flow；
     题型体验：课堂模式由公共脚本记进度；两种模式都弹弹窗，跳转由弹窗按钮负责 */
  function submitResult() {
    if (roundFlow && roundState.active) {
      if (roundAnswered) return;
      roundAnswered = true;
      finished = true;
      stopRetryInRound();
      stepToNext(roundFlow.afterAnswer(true));
      return;
    }
    completeOnce();
    scheduleModal();
  }

  /* 演示模式的自动弹窗：留 2 秒看反馈；重录取消它，出了新结果再重新计时 */
  function scheduleModal() {
    global.clearTimeout(modalTimer);
    modalTimer = global.setTimeout(openModal, SOLO_MODAL_DELAY);
  }

  /* 完成弹窗：公共模具（这一页没有对错，用中性语气 + 记录类文案） */
  function openModal() {
    if (!modal || typeof modal.open !== "function") return;
    const praise = (copy && copy.record) || { zh: "收到啦！", id: "Sudah diterima!" };
    modal.open({
      badge: "🎤",
      titleZh: praise.zh,
      titleId: praise.id,
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

  /* 再练一次：关掉弹窗，回到「按住说话」的初始状态，可以重录 */
  function restartQuestion() {
    closeModal();
    startQuestion();
  }

  /* 按住说话：按下开始，松开结束（按住超过 HOLD_MS 才算「说完」）；
     短按两下就是「点一下开始、再点一下结束」，桌面演示和无障碍都方便 */
  function handleMicDown(event) {
    if (typeof event.button === "number" && event.button !== 0) return;
    /* 结果态：这一下是「再说一次」——按下去才重录，不自动开录 */
    if (micState === "done") {
      if (roundState.active) return;   /* 轮内：说完这一题就到头了，重录留给轮末「再做一次」 */
      restartQuestion();
      return;
    }
    if (micState !== "idle" && micState !== "recording") return;
    pressedWhileRecording = micState === "recording";
    pressStartedAt = Date.now();
    if (micState === "idle") startRecording();
  }

  function handleMicUp(event) {
    if (micState !== "recording") return;
    if (typeof event.button === "number" && event.button !== 0) return;
    const held = Date.now() - pressStartedAt;
    if (pressedWhileRecording || held >= HOLD_MS) stopRecording();
    /* 短按：保持在录音态，等学生再点一下结束 */
  }

  function handleMicClick(event) {
    /* 鼠标和触摸的 click 已经由 pointerdown / pointerup 处理，这里只管键盘（Enter / 空格）；
       浏览器不支持 PointerEvent 时（老 Safari），click 就是唯一入口 */
    const fromKeyboard = !event || event.detail === 0;
    if (!fromKeyboard && typeof global.PointerEvent === "function") return;
    if (micState === "done") {
      if (roundState.active) return;   /* 轮内：同上，重录不再触发 */
      restartQuestion();
      return;
    }
    if (micState === "idle") startRecording();
    else if (micState === "recording") stopRecording();
  }

  function startQuestion() {
    global.clearTimeout(recognizeTimer);
    global.clearTimeout(modalTimer);     /* 重录：取消还没弹的自动弹窗 */
    closeModal();

    micState = "idle";
    lastSeconds = 0;
    startedAt = Date.now();
    pressStartedAt = 0;
    pressedWhileRecording = false;

    setText(el.prompt, QUESTION.prompt);
    setText(el.hint, QUESTION.hint);
    setHidden(el.hint, !QUESTION.hint);
    setText(el.answer, QUESTION.answer);
    setText(el.answerId, QUESTION.answerId);
    setHidden(el.answerId, !QUESTION.answerId);

    renderPictureSlot();
    renderCheer();
    paintMic();
    if (el.result) el.result.classList.add("hidden");
    announce("待作答。" + QUESTION.prompt);
  }

  function bindEvents() {
    if (el.mic) {
      el.mic.addEventListener("pointerdown", handleMicDown);
      el.mic.addEventListener("click", handleMicClick);
      /* 按下后手指滑出按钮再松开也算说完 */
      global.addEventListener("pointerup", handleMicUp);
      global.addEventListener("pointercancel", handleMicUp);
    }
  }

  function boot() {
    cache();
    applyShellText();
    bindEvents();
    /* 轮内多题：题目从 round-content.js 取，不是轮内就用本页自带的兜底题；
       进度行 / 下一题 / 记账都交给 shared/round-flow.js */
    roundFlow = global.AICloudRoundFlow || null;
    roundState = roundFlow && typeof roundFlow.init === "function" ? roundFlow.init("picture-talk") : { active: false };
    QUESTION = roundState.active && roundState.question ? roundState.question : DEMO_QUESTION;
    if (roundState.active && el.nextBox) el.nextBox.classList.remove("hidden");
    if (roundState.active && el.nextButton) {
      el.nextButton.addEventListener("click", function () { roundFlow.goNext(); });
    }
    startQuestion();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  document.addEventListener("DOMContentLoaded", applyShellText);

  global.AICloudPictureTalkPage = { boot: boot, startQuestion: startQuestion };
})(typeof window !== "undefined" ? window : globalThis);
