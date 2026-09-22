import { describe, expect, it } from "vitest";
import "../shared/feedback-copy.js";

const copy = (window as any).AICloudFeedbackCopy;
const POOLS = ["correct", "correctFirstTry", "wrong", "pair"];
const SINGLE_POOL = "correctFirstTrySingle";
const ALL_POOLS = POOLS.concat([SINGLE_POOL]);

describe("feedback copy", () => {
  it("keeps fixed bilingual lines for rare moments", () => {
    ["record", "submitted"].forEach((key) => {
      expect(typeof copy[key].zh).toBe("string");
      expect(copy[key].zh.length).toBeGreaterThan(0);
      expect(typeof copy[key].id).toBe("string");
      expect(copy[key].id.length).toBeGreaterThan(0);
    });
  });

  it("rotates praise pools with short bilingual entries", () => {
    ALL_POOLS.forEach((key) => {
      expect(Array.isArray(copy[key])).toBe(true);
      expect(copy[key].length).toBeGreaterThanOrEqual(2);
      copy[key].forEach((entry: any) => {
        const plain = entry.zh.replace(/[！？，、。]/g, "");
        expect(plain.length).toBeGreaterThan(0);
        expect(plain.length).toBeLessThanOrEqual(6);
        expect(entry.zh.endsWith("！")).toBe(true);
        expect(typeof entry.id).toBe("string");
        expect(entry.id.length).toBeGreaterThan(0);
      });
    });
  });

  it("never draws the same sentence twice in a row", () => {
    ALL_POOLS.forEach((key) => {
      const seen = new Set<string>();
      let previous = "";
      for (let i = 0; i < 40; i += 1) {
        const entry = copy.draw(key);
        expect(entry).toBeTruthy();
        expect(previous).not.toBe(entry.zh);
        previous = entry.zh;
        seen.add(entry.zh);
      }
      expect(seen.size).toBeGreaterThan(1);
    });
  });

  it("draws pair praise from shared + pair pools, gated by a perfect run", () => {
    const shared = copy.correct.map((entry: any) => entry.zh);
    const pairOnly = copy.pair
      .filter((entry: any) => entry.onlyPerfect)
      .map((entry: any) => entry.zh);
    const allowed = shared.concat(copy.pair.map((entry: any) => entry.zh));
    expect(pairOnly.length).toBeGreaterThan(0);

    let sawPairOnly = false;
    for (let i = 0; i < 200; i += 1) {
      const normal = copy.draw("pair", { perfect: false });
      expect(allowed).toContain(normal.zh);
      expect(pairOnly).not.toContain(normal.zh);

      const perfect = copy.draw("pair", { perfect: true });
      expect(allowed).toContain(perfect.zh);
      if (pairOnly.includes(perfect.zh)) sawPairOnly = true;
    }
    expect(sawPairOnly).toBe(true);
    expect(shared.length).toBeGreaterThan(1);
  });

  it("ships one emoji per pool entry", () => {
    ALL_POOLS.forEach((key) => {
      copy[key].forEach((entry: any) => {
        expect(typeof entry.emoji).toBe("string");
        expect(entry.emoji.length).toBeGreaterThan(0);
      });
    });
    const drawn = copy.draw("correct");
    expect(drawn.emoji).toBeTruthy();
  });

  it("keeps first-try praise single-question-safe when asked for it", () => {
    const multi = copy.correctFirstTry.map((entry: any) => entry.zh);
    const single = copy.correctFirstTrySingle.map((entry: any) => entry.zh);
    const multiOnly = /[全都处]/;

    expect(single.length).toBeGreaterThanOrEqual(3);
    expect(single.some((zh: string) => multi.includes(zh))).toBe(false);
    single.forEach((zh: string) => expect(multiOnly.test(zh)).toBe(false));

    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      const praise = copy.draw("correctFirstTry", { single: true });
      expect(single).toContain(praise.zh);
      expect(multiOnly.test(praise.zh)).toBe(false);
      seen.add(praise.zh);
    }
    expect(seen.size).toBe(single.length);

    const multiSeen = new Set<string>();
    for (let i = 0; i < 300; i += 1) {
      const praise = copy.draw("correctFirstTry");
      expect(multi).toContain(praise.zh);
      multiSeen.add(praise.zh);
    }
    expect(multiSeen.size).toBeGreaterThan(1);
    expect(copy.correctFirstTry.some((entry: any) => /[全都处]/.test(entry.zh))).toBe(true);
  });
});
