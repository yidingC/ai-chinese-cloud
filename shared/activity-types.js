(function (global) {
  "use strict";

  const ACTIVITIES = [
    {
      type: "choice",
      page: "interaction-choice.html",
      icon: "🅰️",
      title: "快速选择",
      titleId: "Pilihan cepat",
      cardTitle: "快速选择",
      cardDescription: "读题，点选正确答案，提交后立即看到对错。",
      tags: ["一分钟", "自动判分"],
      ready: true,
      legacy: false
    },
    {
      type: "order",
      page: "interaction-order.html",
      icon: "🔢",
      title: "句子排序",
      titleId: "Urutkan kalimat",
      cardTitle: "句子排序",
      cardDescription: "点选词块，把它们排成通顺的一句话，提交后看到正确答案。",
      tags: ["一分钟", "自动判分"],
      ready: true,
      legacy: false
    },
    {
      type: "fill",
      page: "interaction-fill.html",
      icon: "✏️",
      title: "补全句子",
      titleId: "Lengkapi kalimat",
      cardTitle: "补全句子",
      cardDescription: "从词库点选词语，把句子补完整，提交后看结果。",
      tags: ["一分钟", "自动判分"],
      ready: true,
      legacy: false
    },
    {
      type: "poll",
      page: "interaction-poll.html",
      icon: "📊",
      title: "课堂投票",
      titleId: "Polling kelas",
      cardTitle: "课堂投票",
      cardDescription: "点选你的想法并提交，不计分，老师查看统计。",
      tags: ["不计分"],
      ready: true,
      legacy: false
    },
    {
      type: "match",
      page: "match.html",
      icon: "🔗",
      title: "连线配对",
      titleId: "Hubungkan",
      cardTitle: "问候时间连线",
      cardDescription: "把中文时间和正确的印尼语意思连起来。",
      tags: ["左右配对", "自动判分"],
      ready: true,
      legacy: true
    },
    {
      type: "memory",
      page: "memory.html",
      icon: "🧠",
      title: "记忆翻牌",
      titleId: "Kartu memori",
      cardTitle: "问候翻翻乐",
      cardDescription: "翻开卡片，找到中文和印尼语配对。",
      tags: ["卡片配对", "自动判分"],
      ready: true,
      legacy: true
    },
    {
      type: "picture",
      page: "interaction-picture.html",
      icon: "🖼️",
      title: "看图单选",
      titleId: "Pilih gambar",
      cardTitle: "看图单选",
      cardDescription: "看一张图，从选项里选出正确的词。",
      tags: ["一分钟", "自动判分"],
      ready: true,
      legacy: false
    },
    {
      type: "picture-match",
      page: "interaction-picture-match.html",
      icon: "🧩",
      title: "图片—词语连线",
      titleId: "Gambar dan kata",
      cardTitle: "图片—词语连线",
      cardDescription: "点左边的图，再点右边的词，配对成功就锁定。",
      tags: ["点选配对", "自动判分"],
      ready: true,
      legacy: false
    },
    {
      type: "situation",
      page: "interaction-situation.html",
      icon: "🙋",
      title: "情景选择",
      titleId: "Situasi dan ucapan",
      cardTitle: "情景选择",
      cardDescription: "看场景，选出这个场合里最得体的说法。",
      tags: ["一分钟", "自动判分"],
      ready: true,
      legacy: false
    },
    {
      type: "dialogue",
      page: "interaction-dialogue.html",
      icon: "💬",
      title: "对话补全",
      titleId: "Lengkapi dialog",
      cardTitle: "对话补全",
      cardDescription: "看上一句，选出合适的下一句，填进对话气泡。",
      tags: ["一分钟", "自动判分"],
      ready: true,
      legacy: false
    },
    {
      type: "pinyin-match",
      page: "interaction-pinyin-match.html",
      icon: "🔤",
      title: "拼音—汉字—含义匹配",
      titleId: "Cocokkan pinyin, hanzi, arti",
      cardTitle: "拼音—汉字—含义匹配",
      cardDescription: "看拼音选汉字，再选它的意思，一组一组配起来。",
      tags: ["闯关式", "自动判分"],
      ready: true,
      legacy: false
    },
    {
      type: "category",
      page: "interaction-category.html",
      icon: "📦",
      title: "分类归组",
      titleId: "Kelompokkan kata",
      cardTitle: "分类归组",
      cardDescription: "把词语一个个放进正确的类别里，提交后看结果。",
      tags: ["一分钟", "自动判分"],
      ready: true,
      legacy: false
    },
    {
      type: "word-build",
      page: "interaction-word-build.html",
      icon: "🧱",
      title: "拼字/组词",
      titleId: "Susun hanzi jadi kata",
      cardTitle: "拼字/组词",
      cardDescription: "点字块，把词语拼进空格里。",
      tags: ["一分钟", "自动判分"],
      ready: true,
      legacy: false
    },
    {
      type: "correction",
      page: "interaction-correction.html",
      icon: "🔍",
      title: "找错误/改错",
      titleId: "Temukan yang salah",
      cardTitle: "找错误/改错",
      cardDescription: "读句子，点出用错的那个词，看看正确说法。",
      tags: ["一分钟", "自动判分"],
      ready: true,
      legacy: false
    },
    {
      type: "listening",
      page: "interaction-listening.html",
      icon: "🔊",
      title: "听音选图/选词",
      titleId: "Dengar dan pilih",
      cardTitle: "听音选图/选词",
      cardDescription: "听一听，从选项里选出你听到的内容。",
      tags: ["一分钟", "自动判分"],
      ready: true,
      placeholder: true,
      legacy: false
    },
    {
      type: "read-aloud",
      page: "interaction-read-aloud.html",
      icon: "🎤",
      title: "跟读模仿",
      titleId: "Tirukan bacaan",
      cardTitle: "跟读模仿",
      cardDescription: "听一遍，跟着读——开口说了就算完成。",
      tags: ["语音", "占位演示"],
      ready: true,
      placeholder: true,
      legacy: false
    },
    {
      type: "picture-talk",
      page: "interaction-picture-talk.html",
      icon: "🗣️",
      title: "看图说话",
      titleId: "Bicara dari gambar",
      cardTitle: "看图说话",
      cardDescription: "看一张图，用中文说一句话。",
      tags: ["语音", "占位演示"],
      ready: true,
      placeholder: true,
      legacy: false
    },
    {
      type: "open-qa",
      page: "interaction-open-qa.html",
      icon: "❓",
      title: "开放问答",
      titleId: "Tanya jawab terbuka",
      cardTitle: "开放问答",
      cardDescription: "回答一个开放问题，说说你的想法。",
      tags: ["语音", "占位演示"],
      ready: true,
      placeholder: true,
      legacy: false
    }
  ];

  function all() {
    return ACTIVITIES.slice();
  }

  function ready() {
    return ACTIVITIES.filter(function (item) {
      return item.ready === true;
    });
  }

  function get(type) {
    return ACTIVITIES.filter(function (item) {
      return item.type === type;
    })[0] || null;
  }

  function label(type) {
    const meta = get(type);
    return meta ? meta.title : type;
  }

  function linkFor(type, options) {
    const meta = get(type);
    if (!meta || !meta.page) return "";
    const settings = options || {};
    const parts = ["type=" + encodeURIComponent(type)];
    const slot = Number(settings.slot) || 0;
    if (settings.mode === "class" && slot > 0) {
      parts.push("mode=class");
      parts.push("slot=" + slot);
    }
    return meta.page + "?" + parts.join("&");
  }

  const api = {
    all: all,
    ready: ready,
    get: get,
    label: label,
    linkFor: linkFor
  };

  global.AICloudActivityTypes = api;
})(typeof window !== "undefined" ? window : globalThis);
