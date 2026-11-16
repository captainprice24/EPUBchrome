import { describe, expect, it } from "vitest";
import { bookProgress } from "../../src/progress";

describe("bookProgress", () => {
  it("reports 0 for an item that was never opened", () => {
    expect(bookProgress({ format: "pdf", chapter: 0, chapterCount: 9 })).toBe(
      0,
    );
    expect(bookProgress({ chapter: 0, chapterCount: 5 })).toBe(0);
  });
  it("runs from 0 on the first original page to 100 on the last", () => {
    const pdf = { format: "pdf" as const, chapterCount: 5, page: 1 };
    expect(bookProgress({ ...pdf, chapter: 0 })).toBe(0);
    expect(bookProgress({ ...pdf, chapter: 2 })).toBe(50);
    expect(bookProgress({ ...pdf, chapter: 4 })).toBe(100);
    expect(
      bookProgress({ format: "djvu", chapter: 0, chapterCount: 1, page: 1 }),
    ).toBe(100);
  });
  it("uses counted pages of a reflowing book when every chapter is counted", () => {
    const book = {
      chapterCount: 3,
      pageCount: 4,
      pagination: { key: "k", counts: [2, 4, 4] },
    };
    expect(bookProgress({ ...book, chapter: 0, page: 1 })).toBe(0);
    expect(bookProgress({ ...book, chapter: 1, page: 2 })).toBe(33);
    expect(bookProgress({ ...book, chapter: 2, page: 4 })).toBe(100);
  });
  it("weighs chapters equally until every chapter is counted", () => {
    const book = { chapterCount: 4, pagination: { key: "k", counts: [3, 0] } };
    expect(bookProgress({ ...book, chapter: 0, page: 1, pageCount: 3 })).toBe(
      0,
    );
    expect(bookProgress({ ...book, chapter: 0, page: 1, pageCount: 1 })).toBe(
      0,
    );
    expect(bookProgress({ ...book, chapter: 1, page: 2, pageCount: 3 })).toBe(
      33,
    );
    expect(bookProgress({ ...book, chapter: 3, page: 3, pageCount: 3 })).toBe(
      100,
    );
    expect(bookProgress({ ...book, chapter: 3, page: 1, pageCount: 1 })).toBe(
      100,
    );
  });
  it("ignores a saved chapter beyond the end of the book", () => {
    expect(
      bookProgress({ chapter: 9, chapterCount: 3, page: 1, pageCount: 2 }),
    ).toBe(0);
  });
});
