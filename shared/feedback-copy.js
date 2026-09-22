(function (global) {
  "use strict";

  /* 句池：每条自带表情，抽到哪条就是"表情＋中文＋印尼语"一整套。
     池子归属：
     - correct：通用夸夸，所有题型都能抽到；
     - correctFirstTry：判分题"第一次就答对"的专属档，默认走多件题池（一屏好几处、一次判好几样）；
     - correctFirstTrySingle：一屏只有一道题的页面用（draw 传 { single: true } 才走这个池），句子不出现"全 / 处 / 都"这类只在多件题成立的字；
     - wrong：判分题的鼓励档；
     - pair：配对专属句；onlyPerfect 标记的只在"一局没连错过"时进池。
     口径：全部以"！"结尾；中文不超过 6 个字；表情与文案成对，一次作答只抽一次。 */
  const pools = {
    correct: [
      { zh: "太棒了！", id: "Hebat!", emoji: "🤩" },
      { zh: "无敌了！", id: "Luar biasa!", emoji: "💥" },
      { zh: "做得好！", id: "Kerja bagus!", emoji: "👍" },
      { zh: "漂亮！", id: "Mantap!", emoji: "✨" },
      { zh: "就是这样！", id: "Itu dia!", emoji: "🔥" },
      { zh: "太酷了！", id: "Keren!", emoji: "😎" }
    ],
    correctFirstTry: [
      { zh: "完美！", id: "Sempurna!", emoji: "🏆" },
      { zh: "一处都没错！", id: "Tidak ada yang salah!", emoji: "🏆" },
      { zh: "一次就全对！", id: "Sekali coba, benar semua!", emoji: "🏆" }
    ],
    correctFirstTrySingle: [
      { zh: "一次就对！", id: "Sekali coba, benar!", emoji: "🏆" },
      { zh: "一下就答对！", id: "Langsung benar!", emoji: "🏆" },
      { zh: "真准！", id: "Tepat sekali!", emoji: "🏆" },
      { zh: "一眼就对！", id: "Sekali lihat, tepat!", emoji: "🏆" }
    ],
    wrong: [
      { zh: "再来一遍！", id: "Ayo coba lagi!", emoji: "💪" },
      { zh: "差一点点，再来！", id: "Hampir benar, ayo coba lagi!", emoji: "💪" }
    ],
    pair: [
      { zh: "全部连对啦！", id: "Semua pasangan benar!", emoji: "🎉" },
      { zh: "一次就连对！", id: "Sekali coba, langsung benar!", emoji: "🏅", onlyPerfect: true }
    ]
  };

  const fixed = {
    record: { zh: "收到啦！", id: "Sudah diterima!" },
    submitted: { zh: "已提交！", id: "Sudah dikirim!" }
  };

  let lastZh = "";

  /* draw("correct" | "correctFirstTry" | "wrong")：按池子抽，不连续重复。
     draw("correctFirstTry", { single: true })：一屏只有一道题的页面走单题池；
     不传 single 仍是多件题池（老调用点不用改）。
     draw("pair", { perfect })：从"通用＋配对专属"里抽；perfect 不为 true 时，
     带 onlyPerfect 标记的句子不进候选。 */
  function draw(key, options) {
    const settings = options || {};
    const pool = key === "pair"
      ? pools.correct.concat(pools.pair).filter(function (entry) {
          return entry.onlyPerfect !== true || settings.perfect === true;
        })
      : (key === "correctFirstTry" && settings.single === true ? pools.correctFirstTrySingle : pools[key]);
    if (!Array.isArray(pool) || pool.length === 0) return null;
    let candidates = pool.length > 1
      ? pool.filter(function (entry) { return entry.zh !== lastZh; })
      : pool.slice();
    if (candidates.length === 0) candidates = pool.slice();
    const entry = candidates[Math.floor(Math.random() * candidates.length)];
    lastZh = entry.zh;
    return { zh: entry.zh, id: entry.id, emoji: entry.emoji };
  }

  global.AICloudFeedbackCopy = {
    correct: pools.correct,
    correctFirstTry: pools.correctFirstTry,
    correctFirstTrySingle: pools.correctFirstTrySingle,
    wrong: pools.wrong,
    pair: pools.pair,
    record: fixed.record,
    submitted: fixed.submitted,
    draw: draw
  };
})(typeof window !== "undefined" ? window : globalThis);
