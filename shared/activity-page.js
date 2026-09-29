(function (global) {
  "use strict";

  const types = global.AICloudActivityTypes;
  const bridge = global.AICloudActivity;
  let booted = false;

  function setText(node, text) {
    if (node && typeof text === "string") node.textContent = text;
  }

  function boot() {
    if (booted) return;
    booted = true;

    const type = document.body.dataset.activityType || "";
    const meta = types && types.get ? types.get(type) : null;
    const ctx = bridge && bridge.context ? bridge.context() : { mode: "solo", slot: 0, type: type };

    setText(document.querySelector("[data-activity-title]"), meta ? meta.title : "题型页面");

    const back = document.querySelector("[data-activity-back]");
    if (back) {
      back.setAttribute("href", "classroom.html");
      back.setAttribute("aria-label", ctx.mode === "class" ? "返回课堂互动" : "返回课堂");
    }

    // 完成弹窗：点弹窗外的灰色区域可以关掉，回到页面继续看
    document.addEventListener("click", function (event) {
      const target = event.target;
      if (!target || !target.classList || !target.classList.contains("modal-overlay")) return;
      if (target.classList.contains("hidden")) return;
      target.classList.add("hidden");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  global.AICloudActivityPage = { boot: boot };
})(typeof window !== "undefined" ? window : globalThis);
