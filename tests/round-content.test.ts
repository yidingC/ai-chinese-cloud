import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import "../round-content.js";
import "../classroom-course.js";
import "../shared/activity-types.js";

const content = (window as any).AICloudRoundContent;
const course = (window as any).AICloudClassroomCourse;
const types = (window as any).AICloudActivityTypes;

const allRounds: any[] = content.rounds;
/* 自测轮（selfTest: true）不进课堂页，也不参与课堂口径的校验 */
const rounds: any[] = allRounds.filter((round: any) => round.selfTest !== true);
const questions: any[] = rounds.flatMap((round: any) => round.questions);

/* 每道题里能看到的词（用于"四道题的词互不重复 / 不撞第 1 轮"） */
function wordsOf(question: any): string[] {
  const words: string[] = [];
  (question.options || []).forEach((option: any) => {
    const value = option.text || option.word;
    if (value) words.push(value);
  });
  (question.words || []).forEach((word: any) => {
    if (word.text) words.push(word.text);
  });
  (question.blanks || []).forEach((blank: any) => {
    if (blank.answer) words.push(blank.answer);
  });
  if (question.word) words.push(question.word);
  if (question.audioText) words.push(question.audioText);
  return words;
}

describe("mixed round content (round-content.js)", () => {
  it("keeps self-test rounds pointed at real page files", () => {
    const selfTests = allRounds.filter((round: any) => round.selfTest === true);
    selfTests.forEach((round: any) => {
      round.questions.forEach((question: any) => {
        const meta = types.get(question.type);
        expect(meta, question.type).toBeTruthy();
        expect(existsSync(new URL("../" + meta.page, import.meta.url))).toBe(true);
      });
    });
  });

  it("points every question type at a real page file", () => {
    questions.forEach((question: any) => {
      const meta = types.get(question.type);
      expect(meta, question.type).toBeTruthy();
      expect(existsSync(new URL("../" + meta.page, import.meta.url))).toBe(true);
    });
  });

  it("uses unique question ids", () => {
    const ids = questions.map((question: any) => question.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the pilot round in the agreed order (choice → listening → match → fill)", () => {
    expect(questions.map((question: any) => question.type)).toEqual(["choice", "listening", "match", "fill"]);
  });

  it("matches the classroom course data (questionCount = questions in the round)", () => {
    rounds.forEach((round: any) => {
      const level = course.levels[round.slot - 1];
      expect(level, "第 " + round.slot + " 轮").toBeTruthy();
      expect(level.questionCount).toBe(round.questions.length);
    });
    expect(rounds[0].questions).toHaveLength(4);
  });

  it("gives every choice question four options with exactly one correct", () => {
    questions.filter((question: any) => question.type === "choice").forEach((question: any) => {
      expect(question.options).toHaveLength(4);
      expect(question.options.filter((option: any) => option.correct === true)).toHaveLength(1);
    });
  });

  it("does not repeat words inside the round, nor touch the round-1 demo words", () => {
    const roundOneWords = ["一杯茶", "一本书", "一件衣服", "一碗米饭"];
    const seen = new Map<string, string>();
    questions.forEach((question: any) => {
      /* 同一道题里：选项之间、词库之间各自不重复（题干/答案本来就该跟选项、词库撞上，不算重复） */
      [question.options || [], question.words || []].forEach((list: any[]) => {
        const texts = list.map((item: any) => item.text || item.word).filter(Boolean);
        expect(new Set(texts).size, question.id).toBe(texts.length);
      });
      /* 跨题：这道题用到的词不许在别的题里再出现，也不许撞第 1 轮那三个示范词 */
      const words = Array.from(new Set(wordsOf(question)));
      words.forEach((word) => {
        const owner = seen.get(word);
        if (owner) expect(owner, "「" + word + "」出现在两道题里").toBe(question.id);
        else seen.set(word, question.id);
        expect(roundOneWords).not.toContain(word);
      });
    });
    expect(seen.size).toBeGreaterThan(0);
  });
});
