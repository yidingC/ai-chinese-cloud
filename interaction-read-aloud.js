/* 跟读模仿 · interaction-read-aloud.html 页面脚本（占位版）
   状态机：待朗读 → 录音中 → 识别中（固定 1 秒）→ 已出结果。
   假流程：按住麦克风（按钮变红 + 红点），松开（或再点一下）后转 1 秒「识别中」，
   然后回执条从卡片下沿滑出来。全程不调麦克风、不发声、不弹任何授权框。
   语音题不打分：反馈只有一句鼓励（只夸"开口说了"，不夸结果）；录音本身就是交卷——
   出结果时记账，两种模式都约 2 秒后弹「收到啦」，页面没有【完成】按钮。
   以后接真录音 + 语音识别时，往这张学习卡上加内容即可，页面骨架和状态机不用重写。
   进度记账由 shared/activity-bridge.js 负责（课堂跳转由完成弹窗的按钮执行），本页只做界面并在出结果时调用 finish()。
   跨页多题一轮（链接带 q / total）：进度行 / 下一题 / 记账与轮末弹窗交给 shared/round-flow.js。 */
(function (global) {
  "use strict";

  const HOLD_MIN_MS = 300;           // 短于这个时长算「点一下」，转入点按切换模式
  const RECOGNIZE_MS = 1000;         // 假识别：固定 1 秒
  const FAKE_LISTEN_MS = 1000;       // 假范读：喇叭脉冲保持 1 秒，然后自己停
  const CLICK_GUARD_MS = 500;        // 指针流程刚处理过的 click 不重复处理；键盘 / 读屏的 click 照常走
  const MODAL_DELAY = 2000;          // 出结果约 2 秒后自己弹「收到啦」（与选择题同一节奏）
  /* 动作区那行小字：状态的唯一可见反馈（录音时手指压在按钮上，只有这行字露在外面）。
     四态四句，全是换文案，不是藏起来 */
  const HINT = {
    idle: "按住读完松开 · Tahan, baca, lalu lepas",
    recording: "正在听…… · Sedang mendengar",
    recognizing: "听出来了？· Sebentar ya…",
    result: "再读一次 · Baca lagi"
  };
  const modal = global.AICloudFeedbackModal || null;
  const copy = global.AICloudFeedbackCopy || {};

  /* 兜底的示范题（任务书 6.4 的例子）。prompt 只给读屏，页面上不写说明；
     cheer 只夸"开口说了"这件事；text / pinyin 是学习卡里能带走的参考读音。
     轮内时这道题从 round-content.js 取——改题目请改那个文件，这里只是"数据读不到也不白屏"的兜底 */
  const DEMO_QUESTION = {
    id: "gen-du-ni-hao",
    prompt: "听一遍，然后跟着读",
    text: "你好",
    pinyin: "nǐ hǎo",
    cheer: { zh: "说得不错！", id: "Bagus!" }
  };

  /* 当前这一题：非轮内 = 上面那份兜底；轮内 = round-content.js 里 slot 对应的这道题 */
  let QUESTION = DEMO_QUESTION;

  const el = {};
  let phase = "idle";           // idle | recording | recognizing | result
  let gesture = "";             // press = 按住松开结束；toggle = 点一下开始、再点一下结束
  let pressStartedAt = 0;
  let pressActive = false;      // 指针还按在按钮上
  let stopOnRelease = false;    // 这次松开就要结束录音（点按切换的第二次点击）
  let lastPointerHandledAt = 0;
  let listenPlaying = false;
  let finished = false;
  let lastSeconds = 0;
  let startedAt = 0;
  let recognizeTimer = 0;
  let listenTimer = 0;
  let modalTimer = 0;
  let modalObserver = null;

  /* 跨页多题一轮：进度行 / 下一题 / 记账都交给 shared/round-flow.js；不是轮内就照旧 */
  let roundFlow = null;
  let roundState = { active: false };
  let roundAnswered = false;          // 轮内这一题只收尾一次（挡住重录重入）

  function setText(node, text) {
    if (node) node.textContent = text;
  }

  function setHidden(node, hidden) {
    if (node) node.classList.toggle("hidden", !!hidden);
  }

  function cache() {
    el.prompt = document.querySelector("[data-read-aloud-prompt]");
    el.text = document.querySelector("[data-read-aloud-text]");
    el.pinyin = document.querySelector("[data-read-aloud-pinyin]");
    el.listen = document.querySelector("[data-read-aloud-listen]");
    el.record = document.querySelector("[data-read-aloud-record]");
    el.recordIcon = document.querySelector("[data-read-aloud-record-icon]");
    el.hint = document.querySelector("[data-read-aloud-hint]");
    el.result = document.querySelector("[data-read-aloud-result]");
    el.card = document.querySelector(".read-aloud-card");
    el.cheer = document.querySelector("[data-read-aloud-cheer]");
    el.cheerId = document.querySelector("[data-read-aloud-cheer-id]");
    el.cheerRow = document.querySelector("[data-read-aloud-cheer-row]");
    el.announcer = document.querySelector("[data-read-aloud-announcer]");
    el.nextBox = document.querySelector("[data-ra-next]");
    el.nextButton = document.querySelector("[data-ra-next-btn]");
    el.nextLabel = document.querySelector("[data-ra-next-label]");
    el.nextLabelId = document.querySelector("[data-ra-next-label-id]");
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

  /* 听范读：点击只动按钮自己——「播放中…」＋图标脉冲 1 秒，然后回到「听范读」。
     现在不发声；以后接上真人范读录音时，这里换成真播放即可。 */
  function handleListen() {
    if (phase === "recording" || phase === "recognizing" || listenPlaying) return;
    listenPlaying = true;
    if (el.listen) el.listen.classList.add("is-playing");
    announce("范读音频暂时没有声音。");
    global.clearTimeout(listenTimer);
    listenTimer = global.setTimeout(resetListen, FAKE_LISTEN_MS);
  }

  function resetListen() {
    global.clearTimeout(listenTimer);
    listenPlaying = false;
    if (el.listen) el.listen.classList.remove("is-playing");
  }

  /* 熊猫的动作交给状态类（规范第十二节：常驻呼吸 / 凑近听 / 读完跳一下） */
  function paintPanda() {
    if (!el.card) return;
    el.card.classList.toggle("is-idle", phase === "idle");
    el.card.classList.toggle("is-recording", phase === "recording");
    el.card.classList.toggle("is-recognizing", phase === "recognizing");
    el.card.classList.toggle("is-result", phase === "result");
  }

  /* 按钮和小字的样子跟着状态走：待朗读 / 录音中 / 识别中 / 已出结果。
     按钮视觉上只有一个麦克风（没有文字），名字必须落在 aria-label 上——
     否则用屏幕朗读的学生会遇到一个没有名字的按钮 */
  function paintRecord() {
    paintPanda();
    if (!el.record) return;
    const recording = phase === "recording";
    const recognizing = phase === "recognizing";
    el.record.classList.toggle("is-recording", recording);
    el.record.classList.toggle("is-recognizing", recognizing);
    /* 结果态：紫色大按钮降级成次要款（白色那档同样不加字） */
    el.record.classList.toggle("is-retry", phase === "result");
    el.record.setAttribute("aria-pressed", recording ? "true" : "false");
    el.record.setAttribute("aria-busy", recognizing ? "true" : "false");
    el.record.setAttribute("aria-label", recording
      ? "正在录音"
      : recognizing
        ? "识别中"
        : phase === "result" ? "再读一次" : "按住说话");
    setText(el.recordIcon, recording ? "🔴" : "🎤");
    setText(el.hint, recording
      ? HINT.recording
      : recognizing
        ? HINT.recognizing
        : phase === "result" ? HINT.result : HINT.idle);
  }

  function startRecording(nextGesture) {
    if (phase !== "idle" && phase !== "result") return;
    /* 轮内做完这一题：重录入口关掉（想重练等轮末「再做一次」），别让这一轮再收尾一次 */
    if (roundState.active && roundAnswered) return;
    global.clearTimeout(recognizeTimer);
    /* 重录＝取消还没弹出来的自动弹窗，等新结果出来再重新计时 */
    global.clearTimeout(modalTimer);
    gesture = nextGesture;
    phase = "recording";
    setHidden(el.result, true);
    paintRecord();
    announce("正在录音。读完松开按钮，也可以再点一下结束。");
  }

  function stopRecording() {
    if (phase !== "recording") return;
    global.clearTimeout(recognizeTimer);
    phase = "recognizing";
    gesture = "";
    paintRecord();
    announce("识别中，请稍等。");
    recognizeTimer = global.setTimeout(showResult, RECOGNIZE_MS);
  }

  /* 轮内：重录键停用（变灰、点不动）；重练留给轮末弹窗的「再做一次」 */
  function stopRetryInRound() {
    if (el.record) el.record.disabled = true;
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

  /* 出结果＝交卷。轮内：不记账、不弹「收到啦」——这一题只收尾一次，把【下一题】交给 round-flow；
     题型体验：先记账（课堂模式由公共脚本负责），两种模式都约 2 秒后弹窗 */
  function showResult() {
    phase = "result";
    paintRecord();
    setHidden(el.result, false);
    setHidden(el.cheerRow, false);
    announce(QUESTION.cheer.zh + "参考读音：" + QUESTION.text + "，" + QUESTION.pinyin + "。");
    if (el.result && typeof el.result.focus === "function") el.result.focus({ preventScroll: true });
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

  /* 出结果约 2 秒后自动弹「收到啦」；重录或复位时会被取消 */
  function scheduleModal() {
    global.clearTimeout(modalTimer);
    modalTimer = global.setTimeout(function () {
      modalTimer = 0;
      openModal();
    }, MODAL_DELAY);
  }

  /* 按住说话：按下开始，松开结束；快速点一下则转成「点一下开始」，等第二次点击结束 */
  function onRecordPointerDown(event) {
    if (typeof event.button === "number" && event.button !== 0) return;
    if (pressActive) return;
    if (phase === "idle" || phase === "result") {
      pressActive = true;
      pressStartedAt = Date.now();
      stopOnRelease = false;
      lastPointerHandledAt = Date.now();
      startRecording("press");
      return;
    }
    if (phase === "recording" && gesture === "toggle") {
      pressActive = true;
      stopOnRelease = true;
      lastPointerHandledAt = Date.now();
    }
  }

  function onRecordPointerRelease() {
    if (!pressActive) return;
    pressActive = false;
    lastPointerHandledAt = Date.now();
    if (stopOnRelease) {
      stopOnRelease = false;
      stopRecording();
      return;
    }
    if (phase !== "recording" || gesture !== "press") return;
    if (Date.now() - pressStartedAt >= HOLD_MIN_MS) {
      stopRecording();
      return;
    }
    gesture = "toggle";
    announce("正在录音。读完再点一下按钮结束。");
  }

  /* 键盘和读屏走 click：点一下开始，再点一下结束；指针流程刚处理过的不重复响应 */
  function onRecordClick() {
    if (Date.now() - lastPointerHandledAt < CLICK_GUARD_MS) return;
    if (phase === "recording") {
      stopRecording();
      return;
    }
    if (phase === "idle" || phase === "result") startRecording("toggle");
  }

  function completeOnce() {
    if (finished) return null;
    finished = true;
    lastSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const bridge = activityBridge();
    if (!bridge || typeof bridge.finish !== "function") return { recorded: false, next: "" };
    return bridge.finish({
      correct: true, /* 占位版没有对错，如实写 true */
      seconds: lastSeconds,
      detail: "跟读「" + QUESTION.text + "」"
    });
  }

  /* 完成弹窗：公共模具。记录类不传 tier，用中性底 + 固定句，徽章由页面给 */
  function openModal() {
    if (!modal || typeof modal.open !== "function") return;
    if (el.card) el.card.classList.add("is-modal-open");
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
    /* 遮罩是 open() 里才建出来的，观察要放在它后面 */
    watchModalDismiss();
  }

  function closeModal() {
    global.clearTimeout(modalTimer);
    modalTimer = 0;
    if (el.card) el.card.classList.remove("is-modal-open");
    if (modal && typeof modal.close === "function") modal.close();
  }

  /* 点灰底关掉是公共脚本直接给遮罩加 hidden 的：盯一下它，别让"弹窗打开态"留在卡片上，
     否则熊猫的呼吸会一直停着（规范第十二节：弹层关了页面动效要恢复） */
  function watchModalDismiss() {
    if (modalObserver || !global.MutationObserver) return;
    const overlay = document.querySelector("[data-feedback-modal]");
    if (!overlay) return;
    modalObserver = new global.MutationObserver(function () {
      if (overlay.classList.contains("hidden") && el.card) {
        el.card.classList.remove("is-modal-open");
      }
    });
    modalObserver.observe(overlay, { attributes: true, attributeFilter: ["class"] });
  }

  /* 再练一次：关掉弹窗，回到「按住说话」的干净初始态 */
  function restartQuestion() {
    closeModal();
    startQuestion();
  }

  /* 回执条里的鼓励：只夸"开口说了"，不评价结果；没有分数，也不给读屏念任何分数 */
  function renderCheer() {
    setText(el.cheer, QUESTION.cheer.zh);
    setText(el.cheerId, QUESTION.cheer.id);
  }

  function startQuestion() {
    global.clearTimeout(recognizeTimer);
    global.clearTimeout(modalTimer);
    modalTimer = 0;
    closeModal();

    finished = false;
    phase = "idle";
    gesture = "";
    pressActive = false;
    stopOnRelease = false;
    lastPointerHandledAt = 0;
    startedAt = Date.now();

    setText(el.prompt, QUESTION.prompt);
    setText(el.text, QUESTION.text);
    setText(el.pinyin, QUESTION.pinyin);

    resetListen();
    setHidden(el.result, true);
    setHidden(el.cheerRow, true);
    renderCheer();
    paintRecord();
    /* 屏幕上没有「按住说话」四个字了，只留麦克风图标：指路语说"麦克风"，
       别念一个学生找不到的按钮名（按钮自己的 aria-label 仍然是「按住说话」） */
    announce("先点「听范读」听一遍，再按住麦克风跟着读。");
  }

  function bindEvents() {
    if (el.listen) el.listen.addEventListener("click", handleListen);
    if (el.record) {
      el.record.addEventListener("pointerdown", onRecordPointerDown);
      el.record.addEventListener("click", onRecordClick);
      /* 长按别弹出右键菜单 / 文本选择 */
      el.record.addEventListener("contextmenu", function (event) {
        event.preventDefault();
      });
    }
    document.addEventListener("pointerup", onRecordPointerRelease);
    document.addEventListener("pointercancel", onRecordPointerRelease);
    global.addEventListener("blur", onRecordPointerRelease);
  }

  function boot() {
    cache();
    applyShellText();
    bindEvents();
    /* 轮内多题：题目从 round-content.js 取，不是轮内就用本页自带的兜底题；
       进度行 / 下一题 / 记账都交给 shared/round-flow.js */
    roundFlow = global.AICloudRoundFlow || null;
    roundState = roundFlow && typeof roundFlow.init === "function" ? roundFlow.init("read-aloud") : { active: false };
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

  global.AICloudReadAloudPage = { boot: boot, startQuestion: startQuestion };
})(typeof window !== "undefined" ? window : globalThis);
