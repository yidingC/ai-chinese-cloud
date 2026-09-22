/* 听音选图/选词 · interaction-listening.html 页面脚本（占位版）
   状态机：待作答 → 播放中 → 已选择 → 已提交 → 正确 / 错误（每题只判一次）。
   判分是真的：按题目数据里标了 correct 的那一项判，选对才算对。
   对错只靠整块颜色表达（对＝选中的块变绿 + 一个课堂页同款的小绿勾；错＝选中的块变红、正确的块变绿），
   页面不写解释文字（只有卡片底下滑出的回执条报"正确答案是什么"）；
   读屏播「答对了 / 再想想 + 刚才听到的是：三，sān，tiga」。
   播放是假的：不发出声音、不碰麦克风；题目数据里的 audio 一旦填上真实路径，
   同一个播放按钮就走 <audio> 真播放，页面代码不用重写。
   进度记账由 shared/activity-bridge.js 负责（课堂跳转由完成弹窗的按钮执行），本页只做界面并调用 finish()。 */
(function (global) {
  "use strict";

  const LETTERS = ["A", "B", "C", "D", "E", "F"];
  const FAKE_PLAY_MS = 1000;          // 占位播放：圆钮保持播放态 1 秒（屏幕不写字）
  const SOLO_MODAL_DELAY = 2000;      // 体验模式：提交后留多久看颜色结果，再弹完成弹窗
  const modal = global.AICloudFeedbackModal || null;
  const copy = global.AICloudFeedbackCopy || {};

  /* 单题数据（任务书 5.4 的例子）。prompt 只给读屏：页面上让大按钮自己说话。
     audio 先留空字符串：以后录音文件放进 public/shared/demo-materials/，
     把路径填到这个字段里，播放就是真的了——页面代码不用改。 */
  const QUESTION = {
    id: "ting-shengdiao-san",
    prompt: "听一听，选出你听到的",
    audio: "",
    audioText: "三",
    pinyin: "sān",
    meaningId: "tiga",
    options: [
      { text: "三", pinyin: "sān", correct: true },
      { text: "四", pinyin: "sì" },
      { text: "山", pinyin: "shān" },
      { text: "伞", pinyin: "sǎn" }
    ]
  };

  const el = {};
  let options = [];        // [{ id, letter, text, pinyin, correct }]，按数据顺序
  let selectedId = "";
  let submitted = false;
  let playing = false;
  let finished = false;
  let lastCorrect = false;
  let lastSeconds = 0;
  let startedAt = 0;
  let playTimer = 0;
  let attempts = 0;        // 本页会话里提交过几次：第一次就全对才是「一次全对」档
  let modalTimer = 0;

  function setText(node, text) {
    if (node) node.textContent = text;
  }

  function setHidden(node, hidden) {
    if (node) node.classList.toggle("hidden", !!hidden);
  }

  function cache() {
    el.prompt = document.querySelector("[data-listening-prompt]");
    el.play = document.querySelector("[data-listening-play]");

    el.audio = document.querySelector("[data-listening-audio]");
    el.options = document.querySelector("[data-listening-options]");
    el.submit = document.querySelector("[data-listening-submit]");
    el.submitLabel = document.querySelector("[data-listening-submit-label]");
    el.submitLabelId = document.querySelector("[data-listening-submit-label-id]");
    el.announcer = document.querySelector("[data-listening-announcer]");
    el.receipt = document.querySelector("[data-listening-receipt]");
    el.receiptText = document.querySelector("[data-listening-receipt-text]");
    el.receiptRead = document.querySelector("[data-listening-receipt-read]");
    el.receiptPinyin = document.querySelector("[data-listening-receipt-pinyin]");
    el.receiptDot = document.querySelector("[data-listening-receipt-dot]");
    el.receiptMeaning = document.querySelector("[data-listening-receipt-meaning]");
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

  function hasRealAudio() {
    return typeof QUESTION.audio === "string" && QUESTION.audio.trim() !== "";
  }

  /* 呼吸只在"待作答 / 待再听"时出现：播放中换成图标脉冲，提交后彻底停住 */
  function updatePlayInvite() {
    if (el.play) el.play.classList.toggle("is-inviting", !playing && !submitted);
  }

  function setPlaying(isPlaying) {
    playing = isPlaying;
    if (el.play) el.play.classList.toggle("is-playing", isPlaying);
    updatePlayInvite();
  }

  function clearPlayTimers() {
    global.clearTimeout(playTimer);
  }

  /* 回到「待播放」：不自动播放，圆钮回到紫色呼吸态（屏幕不写字） */
  function resetPlay() {
    clearPlayTimers();
    setPlaying(false);
    if (el.audio && !el.audio.paused && typeof el.audio.pause === "function") el.audio.pause();
  }

  /* 假播放：不发出声音，只把圆钮状态走一遍（呼吸 → 图标脉冲 → 呼吸），屏幕不写字 */
  function playPlaceholder() {
    setPlaying(true);
    announce("播放中。");
    playTimer = global.setTimeout(function () {
      setPlaying(false);
      announce("可以再听一次。");
    }, FAKE_PLAY_MS);
  }

  /* 真音频就位后（QUESTION.audio 填了路径）走这里，其余逻辑不变 */
  function playRealAudio() {
    const audio = el.audio;
    if (!audio) {
      playPlaceholder();
      return;
    }
    setPlaying(true);
    announce("播放中。");
    try {
      audio.currentTime = 0;
    } catch (error) {
      /* 音频还没载入时忽略，直接播 */
    }
    const started = audio.play();
    if (started && typeof started.catch === "function") {
      started.catch(function () {
        setPlaying(false);
      });
    }
  }

  function handlePlay() {
    if (playing) return;
    clearPlayTimers();
    if (hasRealAudio()) playRealAudio();
    else playPlaceholder();
  }

  function eachOptionButton(callback) {
    if (!el.options) return;
    options.forEach(function (option) {
      const button = el.options.querySelector('[data-listening-id="' + option.id + '"]');
      if (button) callback(button, option);
    });
  }

  function correctOptionOf() {
    return options.filter(function (option) {
      return option.correct;
    })[0] || null;
  }

  /* 回执条只报"正确答案是什么"：汉字 + 拼音 · 印尼语。
     字段缺了就少报一段（退化成「汉字 · 拼音」），不留空占位符 */
  function correctAnswerParts() {
    const correct = correctOptionOf();
    return {
      text: correct ? correct.text : QUESTION.audioText || "",
      pinyin: (correct && correct.pinyin) || "",
      meaning: QUESTION.meaningId || ""
    };
  }

  function showReceipt() {
    if (!el.receipt) return;
    const parts = correctAnswerParts();
    setText(el.receiptText, parts.text);
    setText(el.receiptPinyin, parts.pinyin);
    setText(el.receiptMeaning, parts.meaning);
    setHidden(el.receiptPinyin, !parts.pinyin);
    setHidden(el.receiptDot, !(parts.pinyin && parts.meaning));
    setHidden(el.receiptMeaning, !parts.meaning);
    setHidden(el.receiptRead, !(parts.pinyin || parts.meaning));
    setHidden(el.receipt, false);
  }

  function paintSelection() {
    eachOptionButton(function (button, option) {
      const isSelected = option.id === selectedId;
      button.classList.toggle("selected", isSelected);
      button.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
    if (el.submit) el.submit.disabled = !selectedId;
  }

  function renderOptions() {
    if (!el.options) return;
    el.options.innerHTML = "";
    options.forEach(function (option) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "listening-option";
      button.dataset.listeningId = option.id;
      button.setAttribute("aria-pressed", "false");
      button.setAttribute("aria-label", "选项 " + option.letter + "：" + option.text);

      const text = document.createElement("span");
      text.className = "listening-option-text";
      text.textContent = option.text;

      button.appendChild(text);
      button.addEventListener("click", function () {
        selectOption(option.id);
      });
      el.options.appendChild(button);
    });
  }

  /* 选中：可以改选，提交后点不动 */
  function selectOption(id) {
    if (submitted || id === selectedId) return;
    selectedId = id;
    paintSelection();
    const picked = options.filter(function (option) {
      return option.id === id;
    })[0];
    if (picked) announce("已选择 " + picked.letter + " " + picked.text + "。");
  }

  /* 提交后锁定：正确项标绿，选错的那一项标红 */
  function lockOptions() {
    const correct = correctOptionOf();
    eachOptionButton(function (button, option) {
      button.disabled = true;
      button.classList.remove("selected");
      button.setAttribute("aria-pressed", "false");
      if (correct && option.id === correct.id) button.classList.add("correct");
      else if (option.id === selectedId) button.classList.add("wrong");
    });
  }

  function completeOnce() {
    if (finished) return null;
    finished = true;
    const bridge = activityBridge();
    if (!bridge || typeof bridge.finish !== "function") return { recorded: false, next: "" };
    const picked = options.filter(function (option) {
      return option.id === selectedId;
    })[0];
    return bridge.finish({
      correct: lastCorrect,
      seconds: lastSeconds,
      detail: picked ? "选了「" + picked.text + "」" : ""
    });
  }

  /* 反馈弹窗走公共模具：页面只报档位和那句情绪话，样式与动效都在公共层 */
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

  /* 再练一次：关掉弹窗，重新开始本题（圆钮回到紫色呼吸态） */
  function restartQuestion() {
    closeModal();
    startQuestion();
  }

  function submitAnswer() {
    if (submitted || !selectedId) return;
    submitted = true;
    updatePlayInvite();
    lastSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));

    const correct = correctOptionOf();
    lastCorrect = !!correct && selectedId === correct.id;
    attempts += 1;
    const tier = lastCorrect ? (attempts === 1 ? "correctFirstTry" : "correct") : "wrong";
    const praise = typeof copy.draw === "function" ? copy.draw(tier, { single: true }) : null;

    lockOptions();
    if (el.submit) {
      el.submit.disabled = true;
      setText(el.submitLabel, "已提交");
      setText(el.submitLabelId, "Terkirim");
    }
    showReceipt();
    const answer = correctAnswerParts();
    const spoken = [answer.text, answer.pinyin, answer.meaning].filter(Boolean).join("，");
    announce((lastCorrect ? "答对了。" : "再想想。") + "刚才听到的是：" + spoken + "。");

    completeOnce();
    modalTimer = global.setTimeout(function () {
      openModal(tier, praise);
    }, SOLO_MODAL_DELAY);
  }

  function startQuestion() {
    global.clearTimeout(playTimer);
    global.clearTimeout(modalTimer);
    closeModal();

    submitted = false;
    finished = false;
    lastCorrect = false;
    selectedId = "";
    startedAt = Date.now();

    setText(el.prompt, QUESTION.prompt);
    resetPlay();
    setHidden(el.receipt, true);
    if (el.audio) {
      if (hasRealAudio()) el.audio.setAttribute("src", QUESTION.audio);
      else el.audio.removeAttribute("src");
    }

    options = QUESTION.options.map(function (option, index) {
      return {
        id: "listening-" + index,
        letter: LETTERS[index] || "?",
        text: option.text,
        pinyin: option.pinyin || "",
        correct: option.correct === true
      };
    });

    renderOptions();
    if (el.submit) {
      el.submit.disabled = true;
      setText(el.submitLabel, "提交");
      setText(el.submitLabelId, "Kirim");
    }
    announce("待作答。先点播放按钮听一听。");
  }

  function bindEvents() {
    if (el.play) el.play.addEventListener("click", handlePlay);
    if (el.submit) el.submit.addEventListener("click", submitAnswer);
    if (el.audio) {
      /* 真音频播完 / 播不动时，按钮状态照常回来 */
      el.audio.addEventListener("ended", function () {
        setPlaying(false);
      });
      el.audio.addEventListener("error", function () {
        setPlaying(false);
        announce("音频暂时无法播放。");
      });
    }
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

  global.AICloudListeningPage = { boot: boot, startQuestion: startQuestion };
})(typeof window !== "undefined" ? window : globalThis);
