/* 分类归组 · interaction-category.html 页面脚本
   状态机：待作答 → 已选择 → 已提交 → 正确 / 错误（每题只判一次，不提供重试）。
   进度记账由 shared/activity-bridge.js 负责（课堂跳转由完成弹窗的按钮执行），本页只做界面并调用 finish()。
   交互只做点选：点词 → 点类别框 → 放进去；点框里的词 → 拿回待归类区。 */
(function (global) {
  "use strict";

  const SOLO_MODAL_DELAY = 2000;      // 体验模式：提交后留多久看对错，再弹完成弹窗
  const modal = global.AICloudFeedbackModal || null;
  const copy = global.AICloudFeedbackCopy || {};

  /* 本页自带的示范题（题型体验用）：2 个类别 + 6 个待归类的词；
     meaningId = 词的印尼语意思，跟在拼音后面显示，进类别框也跟着走。
     字段结构与 round-content.js 里同题型的题目一致 */
  const DEMO_QUESTION = {
    id: "category-food",
    groups: [
      { id: "eat", name: "吃", nameId: "makan" },
      { id: "drink", name: "喝", nameId: "minum" }
    ],
    words: [
      { id: "rice", text: "米饭", pinyin: "mǐfàn", meaningId: "nasi", group: "eat" },
      { id: "water", text: "水", pinyin: "shuǐ", meaningId: "air", group: "drink" },
      { id: "bread", text: "面包", pinyin: "miànbāo", meaningId: "roti", group: "eat" },
      { id: "tea", text: "茶", pinyin: "chá", meaningId: "teh", group: "drink" },
      { id: "dumpling", text: "饺子", pinyin: "jiǎozi", meaningId: "jiaozi", group: "eat" },
      { id: "juice", text: "果汁", pinyin: "guǒzhī", meaningId: "jus", group: "drink" }
    ]
  };

  /* 当前这道题（轮内来自 round-content.js，否则是上面那份示范题） */
  let QUESTION = DEMO_QUESTION;

  const el = {};
  let placed = {};        // 词 id → 类别 id（提交后只剩放对的词）
  let wrongInfo = {};     // 提交后：放错的词 id → 它该去的类别 id
  let selectedId = "";
  let submitted = false;
  let finished = false;
  let lastCorrect = false;
  let attempts = 0;
  let lastSeconds = 0;
  let startedAt = 0;
  let modalTimer = 0;
  let nudgeTimer = 0;
  let focusRequest = null;

  /* 跨页混题型一轮（链接带 q / total）：进度 / 下一题 / 记账与轮末弹窗交给 shared/round-flow.js */
  const roundFlow = global.AICloudRoundFlow || null;
  let roundState = { active: false };

  function setText(node, text) {
    if (node) node.textContent = text;
  }

  function setHidden(node, hidden) {
    if (node) node.classList.toggle("hidden", !!hidden);
  }

  function wordById(id) {
    return QUESTION.words.filter(function (word) { return word.id === id; })[0] || null;
  }

  function groupById(id) {
    return QUESTION.groups.filter(function (group) { return group.id === id; })[0] || null;
  }

  function groupName(id) {
    const group = groupById(id);
    return group ? group.name : id;
  }

  function wordText(id) {
    const word = wordById(id);
    return word ? word.text : id;
  }

  function placedList(groupId) {
    return QUESTION.words.filter(function (word) { return placed[word.id] === groupId; });
  }

  function placedTotal() {
    return QUESTION.words.filter(function (word) { return placed[word.id] !== undefined; }).length;
  }

  function allPlaced() {
    return QUESTION.words.every(function (word) { return placed[word.id] !== undefined; });
  }

  function cache() {
    el.pool = document.querySelector("[data-category-pool]");
    el.groups = document.querySelector("[data-category-groups]");
    el.submit = document.querySelector("[data-category-submit]");
    el.submitLabel = document.querySelector("[data-category-submit-label]");
    el.submitLabelId = document.querySelector("[data-category-submit-label-id]");
    el.reset = document.querySelector("[data-category-reset]");
    el.feedback = document.querySelector("[data-category-feedback]");
    el.feedbackTitle = document.querySelector("[data-category-feedback-title]");
    el.feedbackTitleId = document.querySelector("[data-category-feedback-title-id]");
    el.announcer = document.querySelector("[data-category-announcer]");
  }

  function activityBridge() {
    return global.AICloudActivity || null;
  }

  /* 体验模式还是课堂模式，一律问公共脚本，页面不自己解析网址参数 */
  function mode() {
    const bridge = activityBridge();
    if (!bridge || typeof bridge.context !== "function") return "solo";
    return bridge.context().mode;
  }

  /* 页头文案由公共脚本填；这里只按模式决定返回箭头指向哪里 */
  function applyShellText() {
    const back = document.querySelector("[data-activity-back]");
    if (back) {
      const isClass = mode() === "class";
      back.setAttribute("href", "classroom.html");
      back.setAttribute("aria-label", isClass ? "返回课堂互动" : "返回课堂");
    }
  }

  function announce(message) {
    setText(el.announcer, message);
  }

  /* 一个词块：待归类区、类别框、提交后的对错状态都用它 */
  function buildChip(word, settings) {
    const place = settings.place;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "category-chip";
    chip.dataset.categoryWord = word.id;
    chip.disabled = submitted;

    const text = document.createElement("strong");
    text.textContent = word.text;
    /* 拼音 + 印尼语意思打包成一条：空间不够时整体换行，「·」不会落在行尾 */
    const note = document.createElement("span");
    note.className = "category-chip-note";
    const pinyin = document.createElement("small");
    pinyin.textContent = word.pinyin;
    const sep = document.createElement("i");
    sep.className = "category-chip-sep";
    sep.setAttribute("aria-hidden", "true");
    sep.textContent = "·";
    const meaning = document.createElement("span");
    meaning.className = "category-chip-id";
    meaning.lang = "id";
    meaning.textContent = word.meaningId;
    note.appendChild(pinyin);
    note.appendChild(sep);
    note.appendChild(meaning);
    chip.appendChild(text);
    chip.appendChild(note);

    if (place === "group") {
      if (submitted) {
        chip.classList.add("is-correct");
        chip.setAttribute("aria-label", "「" + word.text + "」分类正确");
      } else {
        chip.classList.add("is-placed");
        chip.setAttribute("aria-label", "把「" + word.text + "」拿回待归类区 / Ambil kembali");
      }
      return chip;
    }

    if (submitted && wrongInfo[word.id]) {
      chip.classList.add("is-wrong");
      chip.setAttribute("aria-label", "「" + word.text + "」放错了，应该放在「" + groupName(wrongInfo[word.id]) + "」里");
      return chip;
    }

    chip.setAttribute("aria-pressed", word.id === selectedId ? "true" : "false");
    if (word.id === selectedId) {
      chip.classList.add("is-selected");
      chip.setAttribute("aria-label", "已选中「" + word.text + "」，再点一个类别 / Sudah dipilih");
    } else {
      chip.setAttribute("aria-label", "选择「" + word.text + "」，再点它该去的类别 / Pilih kata");
    }
    return chip;
  }

  /* 待归类区里的词：提交后放错的词后面跟一个小标签，标出它该去的类别 */
  function buildPoolItem(word) {
    const item = document.createElement("span");
    item.className = "category-pool-item";
    item.appendChild(buildChip(word, { place: "pool" }));
    if (submitted && wrongInfo[word.id]) {
      const group = groupById(wrongInfo[word.id]);
      const name = group ? group.name : wrongInfo[word.id];
      const nameId = group ? group.nameId : "";
      const tag = document.createElement("span");
      tag.className = "category-chip-arrow";
      tag.setAttribute("aria-hidden", "true");
      tag.textContent = "→ " + name + (nameId ? " · " + nameId : "");
      item.appendChild(tag);
    }
    return item;
  }

  function renderPool() {
    if (!el.pool) return;
    el.pool.textContent = "";
    const rest = QUESTION.words.filter(function (word) { return placed[word.id] === undefined; });
    rest.forEach(function (word) {
      el.pool.appendChild(buildPoolItem(word));
    });
  }

  function buildGroup(group) {
    const box = document.createElement("section");
    box.className = "category-group";
    box.dataset.categoryGroup = group.id;
    box.setAttribute("aria-label", "类别「" + group.name + "」");

    const head = document.createElement("button");
    head.type = "button";
    head.className = "category-group-head";
    head.dataset.categoryGroupTarget = group.id;
    head.disabled = submitted;
    head.setAttribute("aria-label", "把选中的词放进「" + group.name + "」 / Masukkan ke kategori " + group.name);

    const name = document.createElement("strong");
    name.className = "category-group-name";
    name.textContent = group.name;
    const nameId = document.createElement("span");
    nameId.className = "category-group-id";
    nameId.lang = "id";
    nameId.textContent = group.nameId;
    head.appendChild(name);
    head.appendChild(nameId);

    const items = document.createElement("div");
    items.className = "category-group-items";
    items.dataset.categoryGroupItems = group.id;
    const list = placedList(group.id);
    list.forEach(function (word) {
      items.appendChild(buildChip(word, { place: "group" }));
    });

    box.classList.toggle("is-filled", list.length > 0);
    box.classList.toggle("is-ready", !!selectedId && !submitted);
    box.appendChild(head);
    box.appendChild(items);
    return box;
  }

  function renderGroups() {
    if (!el.groups) return;
    el.groups.textContent = "";
    QUESTION.groups.forEach(function (group) {
      el.groups.appendChild(buildGroup(group));
    });
  }

  function syncControls() {
    if (el.submit) el.submit.disabled = submitted || !allPlaced();
    if (el.reset) el.reset.disabled = submitted;
    if (el.submitLabel) setText(el.submitLabel, submitted ? "已提交" : "提交");
    if (el.submitLabelId) setText(el.submitLabelId, submitted ? "Terkirim" : "Kirim");
  }

  /* 重新渲染后把焦点还给刚动过的那个词，键盘操作不会丢位置 */
  function applyFocus() {
    if (!focusRequest || !focusRequest.wordId) return;
    let scope = el.pool;
    if (focusRequest.where === "group" && focusRequest.groupId && el.groups) {
      scope = el.groups.querySelector('[data-category-group-items="' + focusRequest.groupId + '"]');
    }
    if (!scope) return;
    const node = scope.querySelector('[data-category-word="' + focusRequest.wordId + '"]');
    if (node && !node.disabled && typeof node.focus === "function") node.focus();
  }

  function render(focus) {
    focusRequest = focus || null;
    renderPool();
    renderGroups();
    syncControls();
    applyFocus();
  }

  function placeSummary() {
    return "已归类 " + placedTotal() + " / " + QUESTION.words.length + "。";
  }

  function nudgePool() {
    if (el.pool) {
      el.pool.classList.add("is-nudge");
      global.clearTimeout(nudgeTimer);
      nudgeTimer = global.setTimeout(function () {
        if (el.pool) el.pool.classList.remove("is-nudge");
      }, 900);
    }
    announce("先点一个词，再点它该去的类别。 / Ketuk satu kata dulu, lalu ketuk kategorinya.");
  }

  function selectWord(wordId) {
    if (submitted) return;
    selectedId = selectedId === wordId ? "" : wordId;
    render({ wordId: wordId, where: "pool" });
    announce(selectedId
      ? "已选中「" + wordText(wordId) + "」，再点一个类别。"
      : "已取消选择「" + wordText(wordId) + "」。");
  }

  function placeSelected(groupId) {
    if (submitted) return;
    if (!selectedId) {
      nudgePool();
      return;
    }
    const movedId = selectedId;
    placed[movedId] = groupId;
    selectedId = "";
    render({ wordId: movedId, where: "group", groupId: groupId });
    announce("已把「" + wordText(movedId) + "」放进「" + groupName(groupId) + "」。" + placeSummary());
  }

  function returnWord(wordId) {
    if (submitted) return;
    if (placed[wordId] === undefined) return;
    delete placed[wordId];
    if (selectedId === wordId) selectedId = "";
    render({ wordId: wordId, where: "pool" });
    announce("已把「" + wordText(wordId) + "」拿回待归类区。" + placeSummary());
  }

  function resetAll() {
    if (submitted) return;
    placed = {};
    wrongInfo = {};
    selectedId = "";
    resetFeedback();
    render();
    announce("已重置：所有词都回到了待归类区，可以重新归。");
  }

  function resetFeedback() {
    if (!el.feedback) return;
    el.feedback.classList.add("hidden");
    el.feedback.classList.remove("is-correct", "is-wrong");
    setText(el.feedbackTitle, "");
    setText(el.feedbackTitleId, "");
  }

  /* 反馈只留一行标题：对错靠颜色，说明交给词自己的位置和弹窗 */
  function showFeedback() {
    if (!el.feedback) return;
    el.feedback.classList.remove("hidden", "is-correct", "is-wrong");
    el.feedback.classList.add(lastCorrect ? "is-correct" : "is-wrong");
    setText(el.feedbackTitle, lastCorrect ? "答对了！" : "再想想");
    setText(el.feedbackTitleId, lastCorrect ? "Bagus, semua benar!" : "Coba pikir lagi ya!");
    if (typeof el.feedback.focus === "function") el.feedback.focus({ preventScroll: true });
    if (typeof el.feedback.scrollIntoView === "function") el.feedback.scrollIntoView({ block: "center" });
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

  /* 再练一次：关掉弹窗，重新开始本题 */
  function restartQuestion() {
    closeModal();
    startQuestion();
  }

  function submit() {
    if (submitted || !allPlaced()) return;
    submitted = true;
    lastSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));

    wrongInfo = {};
    const wrong = [];
    QUESTION.words.forEach(function (word) {
      if (placed[word.id] !== word.group) {
        wrongInfo[word.id] = word.group;
        wrong.push(word);
        delete placed[word.id];   // 放错的词移回待归类区，提交后不再可改
      }
    });
    lastCorrect = wrong.length === 0;
    attempts += 1;
    const tier = lastCorrect ? (attempts === 1 ? "correctFirstTry" : "correct") : "wrong";
    const praise = typeof copy.draw === "function" ? copy.draw(tier) : null;

    render();
    showFeedback();
    announce(lastCorrect
      ? "答对了！" + QUESTION.words.length + " 个词全部分类正确。"
      : "再想想。" + wrong.length + " 个词放错了，已经放回上面的待归类区。");

    /* 跨页那一轮：本页不记账、不弹窗——中间题只是「下一题」，最后一题交给 round-flow 结算 */
    if (roundState.active && roundFlow) {
      const step = roundFlow.afterAnswer(lastCorrect);
      const hasNext = step !== "finish";
      if (el.submit) el.submit.disabled = !hasNext;
      if (el.submitLabel) setText(el.submitLabel, hasNext ? "下一题" : "已提交");
      if (el.submitLabelId) setText(el.submitLabelId, hasNext ? "Lanjut" : "Terkirim");
      return;
    }

    completeOnce(); /* 课堂模式记进度；完成弹窗两种模式都走，跳转由弹窗按钮负责 */
    modalTimer = global.setTimeout(function () {
      openModal(tier, praise);
    }, SOLO_MODAL_DELAY);
  }

  function bindEvents() {
    if (el.submit) el.submit.addEventListener("click", function () {
      /* 跨页那一轮：答完后这颗按钮是【下一题】，点它跳下一题那一页 */
      if (submitted && roundState.active && roundFlow) {
        roundFlow.goNext();
        return;
      }
      submit();
    });
    if (el.reset) el.reset.addEventListener("click", resetAll);

    if (el.pool) {
      el.pool.addEventListener("click", function (event) {
        const chip = event.target && event.target.closest ? event.target.closest("[data-category-word]") : null;
        if (!chip || chip.disabled) return;
        selectWord(chip.dataset.categoryWord);
      });
    }

    if (el.groups) {
      el.groups.addEventListener("click", function (event) {
        const target = event.target;
        if (!target || !target.closest) return;
        const chip = target.closest("[data-category-word]");
        if (chip) {
          if (!chip.disabled) returnWord(chip.dataset.categoryWord);
          return;
        }
        const box = target.closest("[data-category-group]");
        if (box) placeSelected(box.dataset.categoryGroup);
      });
    }

  }

  function startQuestion() {
    global.clearTimeout(modalTimer);
    closeModal();
    placed = {};
    wrongInfo = {};
    selectedId = "";
    submitted = false;
    finished = false;
    lastCorrect = false;
    startedAt = Date.now();
    resetFeedback();
    render();
    announce("题目已开始：把 " + QUESTION.words.length + " 个词放进对应的类别里。");
  }

  function boot() {
    cache();
    applyShellText();
    bindEvents();

    /* 轮内（跨页那一轮）→ 题目从 round-content.js 取；不是轮内 → 本页自带的那道示范题 */
    roundState = roundFlow && typeof roundFlow.init === "function" ? roundFlow.init("category") : { active: false };
    QUESTION = roundState.active && roundState.question ? roundState.question : DEMO_QUESTION;

    startQuestion();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  document.addEventListener("DOMContentLoaded", applyShellText);

  global.AICloudCategoryPage = { boot: boot, startQuestion: startQuestion };
})(typeof window !== "undefined" ? window : globalThis);
