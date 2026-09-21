/* 课程数据 · 课堂页（试点版，先放在本地，还没接后台）

   课堂页 classroom.html 读这一份数据来渲染：课节名 / 星星数量 / 关卡卡片 / 满分 / 班级人数。
   —— 改课程请改这个文件。app.js 里那份 DEFAULT_COURSE 只是"数据读不到也不白屏"的兜底，
   别两边都改（会各自漂移）。 */
window.AICloudClassroomCourse = {
  /* 课节名：中文上状态条；印尼语副标题先留档（状态条按口径只有中文，还没上屏） */
  lesson: { title: "嗨！你好！", subtitle: "Interaksi Kelas" },

  /* 班级人数：卡片上的 /40 和名次行的 / 40 都用它（一页不许出现两个数字） */
  classSize: 40,

  /* 每关分值：满分 = 关卡数 × 这个数（3 关 → 15 分，5 关 → 25 分） */
  pointsPerLevel: 5,

  /* 关卡列表：数组顺序就是第 1、2、3… 关
     type      题型，对应 app.js 里那张"题型 → 页面文件名 + 卡片图形"的表：
               choice 快速选择 / picture 看图单选 / match 连线配对 /
               listening 听音选词 / fill 补全句子 / order 句子排序 …
     tone      卡片配色，只有三种：violet（紫）/ mint（薄荷绿）/ orange（橙）；不填或写错按顺序自动分配
     title     卡片中文标题
     subtitle  卡片印尼语副标题 */
  levels: [
    { type: "choice", tone: "violet", title: "快速选择", subtitle: "Pilihan cepat" },
    { type: "picture", tone: "mint", title: "看图单选", subtitle: "Pilih gambar" },
    { type: "match", tone: "orange", title: "问候时间连线", subtitle: "Hubungkan waktu" }
  ]
};
