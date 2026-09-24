import { existsSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import "../shared/activity-types.js";
import "../shared/activity-bridge.js";

const types = (window as any).AICloudActivityTypes;
const bridge = (window as any).AICloudActivity;

describe("student activity library", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("registers every student activity type", () => {
    const keys = types.all().map((item: any) => item.type).sort();
    expect(keys).toEqual([
      "category",
      "choice",
      "correction",
      "dialogue",
      "fill",
      "listening",
      "match",
      "memory",
      "open-qa",
      "order",
      "picture",
      "picture-match",
      "picture-talk",
      "pinyin-match",
      "poll",
      "read-aloud",
      "situation",
      "word-build"
    ]);
    const pages = types.all().map((item: any) => item.page);
    expect(new Set(pages).size).toBe(keys.length);
  });

  it("gives every type a title, a description and a page file on disk", () => {
    types.all().forEach((item: any) => {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.titleId.length).toBeGreaterThan(0);
      expect(item.cardDescription.length).toBeGreaterThan(0);
      expect(item.page).toMatch(/\.html$/);
      expect(existsSync(new URL("../" + item.page, import.meta.url))).toBe(true);
    });
  });

  it("keeps the first batch of finished pages ready", () => {
    const ready = types.ready().map((item: any) => item.type);
    ["choice", "order", "fill", "poll", "match", "memory"].forEach((type) => {
      expect(ready).toContain(type);
    });
  });

  it("builds solo links for the picker and class links for the classroom flow", () => {
    expect(types.linkFor("choice")).toBe("interaction-choice.html?type=choice");
    expect(types.linkFor("order", { mode: "class", slot: 2 })).toBe("interaction-order.html?type=order&mode=class&slot=2");
    expect(types.linkFor("unknown")).toBe("");
  });

  it("reads the page context from the url", () => {
    window.history.replaceState({}, "", "/interaction-fill.html?type=fill");
    expect(bridge.context().mode).toBe("solo");
    expect(bridge.context().type).toBe("fill");
    window.history.replaceState({}, "", "/interaction-fill.html?type=fill&mode=class&slot=1");
    expect(bridge.context().mode).toBe("class");
    expect(bridge.context().slot).toBe(1);
  });

  it("never records progress for a solo experience", () => {
    const outcome = bridge.finish({ correct: true, seconds: 5 });
    expect(outcome.recorded).toBe(false);
    expect(bridge.read().results).toHaveLength(0);
    expect(bridge.read().task1Done).toBe(false);
  });

  it("records class results and unlocks the matching slot", () => {
    bridge.write({ task1Done: false, task2Done: false, results: [] });
    bridge.recordResult({ slot: 1, type: "match", correct: true, seconds: 12 });
    const afterFirst = bridge.read();
    expect(afterFirst.task1Done).toBe(true);
    expect(afterFirst.task2Done).toBe(false);
    expect(afterFirst.results).toHaveLength(1);
    bridge.recordResult({ slot: 2, type: "memory", correct: false, seconds: 20 });
    const afterSecond = bridge.read();
    expect(afterSecond.task2Done).toBe(true);
    expect(afterSecond.results[1].correct).toBe(false);
    expect(bridge.slotResult(2).type).toBe("memory");
  });

  it("keeps the first time when the same slot is played again", () => {
    bridge.write({ task1Done: false, task2Done: false, results: [] });
    bridge.recordResult({ slot: 1, type: "choice", correct: false, seconds: 9 });
    const first = bridge.slotResult(1);
    bridge.recordResult({ slot: 1, type: "choice", correct: true, seconds: 21 });
    const redone = bridge.slotResult(1);
    expect(redone.seconds).toBe(9);                    // 速度榜只认第一次的用时
    expect(redone.completedAt).toBe(first.completedAt);
    expect(redone.correct).toBe(true);                 // 其余字段用这次的
    expect(bridge.read().results).toHaveLength(1);
  });
});
