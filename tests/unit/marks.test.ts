import { describe, expect, it } from "vitest";
import { compareLibraryMarks, compareMarks, markOffset } from "../../src/marks";
import type { Mark } from "../../src/store";

const mark = (id: string, extra: Partial<Mark>): Mark => ({
  id,
  bookId: "a",
  chapter: 0,
  chapterTitle: "",
  kind: "highlight",
  text: id,
  created: 0,
  ...extra,
});
const ids = (marks: Mark[]) => marks.map((m) => m.id);

describe("mark ordering", () => {
  it("follows reading order, not identifiers or time of saving", () => {
    const marks = [
      mark("z", { chapter: 1, start: 5, created: 1 }),
      mark("m", { chapter: 0, start: 90, created: 2 }),
      mark("a", { chapter: 0, start: 10, created: 3 }),
    ];
    expect(ids(marks.sort(compareMarks))).toEqual(["a", "m", "z"]);
  });
  it("prefers the locator position, then start, then the bookmark offset", () => {
    const locator = {
      version: 1 as const,
      spineHref: "c.xhtml",
      rendererVersion: 4,
      offsetHint: 7,
      textQuote: { exact: "x", prefix: "", suffix: "" },
    };
    expect(markOffset(mark("l", { locator, start: 99 }))).toBe(7);
    expect(markOffset(mark("s", { start: 12, textOffset: 50 }))).toBe(12);
    expect(markOffset(mark("b", { textOffset: 50 }))).toBe(50);
  });
  it("puts marks without a position after positioned ones, oldest first", () => {
    const marks = [
      mark("late", { created: 20 }),
      mark("early", { created: 10 }),
      mark("placed", { start: 400, created: 30 }),
    ];
    expect(ids(marks.sort(compareMarks))).toEqual(["placed", "early", "late"]);
  });
  it("groups library notes by the order of the books", () => {
    const order = new Map([
      ["recent", 0],
      ["older", 1],
    ]);
    const marks = [
      mark("o1", { bookId: "older", start: 1 }),
      mark("gone", { bookId: "removed", start: 1 }),
      mark("r2", { bookId: "recent", chapter: 3 }),
      mark("r1", { bookId: "recent", chapter: 1 }),
    ];
    expect(ids(marks.sort(compareLibraryMarks(order)))).toEqual([
      "r1",
      "r2",
      "o1",
      "gone",
    ]);
  });
});
