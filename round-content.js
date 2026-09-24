/* 轮内多题 · 一节课的题目数据（试点版，先放本地，以后由后台生成）

   一轮的题可以混着题型、分散在各自的题型页上：靠 URL 参数串成一整轮
   （shared/round-flow.js 负责跳转与收尾）。课堂页的链接会带上 q=1&total=<题数>。
   —— 改题目请改这个文件；页面里那份写死的示范题只是"数据读不到也不白屏"的兜底。
   questions[].type 对应 shared/activity-types.js 里的题型表（choice / listening / match / fill …），
   拼"下一题"链接就是查这张表。 */
window.AICloudRoundContent = {
  lessonNo: 1,
  rounds: [
    {
      slot: 3,
      questions: [
        { id: "r3-q1", type: "choice", word: "三点", pinyin: "sān diǎn",
          options: [ {emoji:"🕒", word:"三点", translate:"Jam tiga", correct:true},
                     {emoji:"🕓", word:"四点", translate:"Jam empat"},
                     {emoji:"🕔", word:"五点", translate:"Jam lima"},
                     {emoji:"🕕", word:"六点", translate:"Jam enam"} ] },
        { id: "r3-q2", type: "listening", audio: "", audioText: "谢谢", pinyin: "xiè xie", meaningId: "terima kasih",
          options: [ {text:"谢谢", pinyin:"xiè xie", correct:true}, {text:"你好", pinyin:"nǐ hǎo"},
                     {text:"再见", pinyin:"zài jiàn"}, {text:"对不起", pinyin:"duì bu qǐ"} ] },
        /* 连线题的词对暂时还是 match.html 里那份（早上/中午/下午/晚上 ↔ pagi/siang/sore/malam），
           这条只占位、标出顺序和题型；以后跟其它题型一起挪进数据 */
        { id: "r3-q3", type: "match" },
        { id: "r3-q4", type: "fill", sentence: "我每天六点 ____，七点吃早饭。",
          translationId: "Setiap hari saya bangun jam enam, lalu sarapan jam tujuh.",
          blanks: [ { id: "wake", answer: "起床" } ],
          words: [ {text:"起床", pinyin:"qǐ chuáng"}, {text:"睡觉", pinyin:"shuì jiào"},
                   {text:"上课", pinyin:"shàng kè"}, {text:"回家", pinyin:"huí jiā"} ] }
      ]
    },
    {
      /* 自测轮：只用来验证"记忆翻牌 / 图片—词语连线"接进轮内的行为，不接课堂页；正式排课后删掉 */
      selfTest: true,
      slot: 9,
      questions: [
        { id: "r9-q1", type: "memory" },
        { id: "r9-q2", type: "picture-match" }
      ]
    },
    {
      /* 自测轮：只用来验证"排序 / 找错 / 分类 / 情景"接进轮内的行为，不接课堂页；正式排课后删掉 */
      selfTest: true,
      slot: 10,
      questions: [
        { id: "r10-q1", type: "order",
          items: [
            { id: "apple", text: "苹果", pinyin: "píng guǒ" },
            { id: "me", text: "我", pinyin: "wǒ" },
            { id: "one", text: "一个", pinyin: "yí ge" },
            { id: "want", text: "想", pinyin: "xiǎng" },
            { id: "buy", text: "买", pinyin: "mǎi" }
          ],
          bankOrder: ["apple", "me", "one", "want", "buy"],
          correctOrder: ["me", "want", "buy", "one", "apple"],
          correctId: "Saya ingin membeli sebuah apel." },
        { id: "r10-q2", type: "correction",
          words: [
            { id: "wo", text: "我", pinyin: "wǒ" },
            { id: "mai", text: "买", pinyin: "mǎi" },
            { id: "yi", text: "一", pinyin: "yī" },
            { id: "zhang", text: "张", pinyin: "zhāng", wrong: true },
            { id: "shu", text: "书", pinyin: "shū" },
            { id: "dot", text: "。", pinyin: "" }
          ],
          fixText: "本",
          fixedSentence: "我买一本书。",
          fixedPinyin: "Wǒ mǎi yì běn shū.",
          explain: "「书」要用量词「本」——一本；「张」用来数纸、桌子、床。",
          explainId: "Kalimat yang benar: Wǒ mǎi yì běn shū. Kata 「书」memakai kata bantu bilangan 「本」(一本); 「张」dipakai untuk kertas, meja, dan ranjang." },
        { id: "r10-q3", type: "category",
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
          ] },
        { id: "r10-q4", type: "situation",
          icon: "✏️", image: "", imageAlt: "一支铅笔",
          scene: "你想借同学的笔。", sceneId: "Kamu mau meminjam pulpen temanmu.",
          options: [
            { id: "rude", text: "喂，给我笔！", textId: "Hei, kasih aku pulpen!" },
            { id: "polite", text: "请问，我可以借你的笔吗？", textId: "Permisi, boleh saya pinjam pulpenmu?", correct: true },
            { id: "blunt", text: "笔。", textId: "Pulpen." }
          ] }
      ]
    },
    {
      /* 自测轮：只用来验证"对话补全 / 看图单选 / 拼字组词 / 课堂投票"接进轮内的行为，不接课堂页；正式排课后删掉 */
      selfTest: true,
      slot: 11,
      questions: [
        { id: "r11-q1", type: "dialogue",
          icon: "🚻", image: "", imageAlt: "洗手间的标志",
          options: [
            { id: "a", text: "在二楼，往左走。", textId: "Di lantai dua, jalan ke kiri.", correct: true },
            { id: "b", text: "我叫小明。", textId: "Nama saya Xiaoming." },
            { id: "c", text: "今天很热。", textId: "Hari ini panas." }
          ] },
        { id: "r11-q2", type: "picture",
          icon: "🐱", image: "", imageAlt: "一只猫",
          prompt: "这是什么？", promptPinyin: "Zhè shì shénme?",
          options: [
            { id: "cat", text: "猫", pinyin: "māo", translate: "Kucing", correct: true },
            { id: "dog", text: "狗", pinyin: "gǒu", translate: "Anjing" },
            { id: "bird", text: "鸟", pinyin: "niǎo", translate: "Burung" },
            { id: "fish", text: "鱼", pinyin: "yú", translate: "Ikan" }
          ] },
        { id: "r11-q3", type: "word-build",
          icon: "👩", image: "", imageAlt: "一位妈妈 / seorang ibu",
          meaning: "ibu",
          answer: ["妈", "妈"], answerWord: "妈妈", answerPinyin: "māma",
          tiles: ["妈", "妈", "爸", "姐", "哥", "弟"] },
        { id: "r11-q4", type: "poll",
          prompt: "下课后你最喜欢做什么？", promptId: "Setelah kelas, kamu paling suka melakukan apa?",
          options: [
            { value: "music", emoji: "🎧", text: "听音乐", textId: "Mendengarkan musik" },
            { value: "basketball", emoji: "🏀", text: "打篮球", textId: "Bermain basket" },
            { value: "animation", emoji: "📺", text: "看中文动画", textId: "Menonton animasi Mandarin" },
            { value: "chat", emoji: "💬", text: "和朋友聊天", textId: "Mengobrol dengan teman" }
          ] }
      ]
    },
    {
      /* 自测轮：只用来验证"拼音匹配 / 跟读模仿 / 看图说话 / 开放问答"接进轮内的行为，不接课堂页；正式排课后删掉 */
      selfTest: true,
      slot: 12,
      questions: [
        { id: "r12-q1", type: "pinyin-match",
          groups: [
            { key: "shu", pinyin: "shū", word: "书", meaning: "buku",
              wordOptions: ["书", "笔", "本"], meaningOptions: ["buku", "pena", "buku tulis"] },
            { key: "bi", pinyin: "bǐ", word: "笔", meaning: "pena",
              wordOptions: ["本", "笔", "书"], meaningOptions: ["buku tulis", "pena", "buku"] },
            { key: "benzi", pinyin: "běnzi", word: "本子", meaning: "buku tulis",
              wordOptions: ["书", "本子", "笔"], meaningOptions: ["pena", "buku tulis", "buku"] }
          ] },
        { id: "r12-q2", type: "read-aloud",
          prompt: "听一遍，然后跟着读", text: "你好", pinyin: "nǐ hǎo",
          cheer: { zh: "说得不错！", id: "Bagus!" } },
        { id: "r12-q3", type: "picture-talk",
          prompt: "看这张图，用中文说一句话。", hint: "试试说：谁 + 在做什么 · Coba: siapa + sedang apa",
          icon: "🏃", image: "", imageAlt: "一个小朋友在跑步",
          answer: "小朋友在跑步。", answerId: "Anak itu sedang berlari." },
        { id: "r12-q4", type: "open-qa",
          prompt: "你周末喜欢做什么？", promptId: "Akhir pekan kamu suka melakukan apa?",
          words: [
            { text: "听音乐", pinyin: "tīng yīnyuè", meaningId: "mendengarkan musik" },
            { text: "打篮球", pinyin: "dǎ lánqiú", meaningId: "bermain basket" },
            { text: "和朋友玩", pinyin: "hé péngyou wán", meaningId: "bermain dengan teman" }
          ],
          patternPrefix: "我周末喜欢", patternSuffix: "。", pattern: "我周末喜欢 ______ 。",
          patternIdPrefix: "Pada akhir pekan saya suka", patternIdSuffix: ".", patternId: "Pada akhir pekan saya suka ______ .",
          praise: { zh: "说得不错！", id: "Bagus!" } }
      ]
    }
  ]
};
