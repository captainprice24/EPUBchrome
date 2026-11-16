import { describe, expect, it } from "vitest";
import { findMatches, matchFrom } from "../../src/find";

describe("findMatches", () => {
  const text = "The kettle finds its voice. Then the\n  kettle rests.";
  it("finds every occurrence without regard to case", () => {
    expect(findMatches(text, "the")).toEqual([
      { start: 0, end: 3 },
      { start: 28, end: 31 },
      { start: 33, end: 36 },
    ]);
  });
  it("matches a phrase across a line break and indentation", () => {
    const [match] = findMatches(text, "the kettle rests");
    expect(text.slice(match!.start, match!.end)).toBe("the\n  kettle rests");
  });
  it("treats punctuation in the query literally", () => {
    expect(findMatches("a.b a+b (a)", "a+b")).toEqual([{ start: 4, end: 7 }]);
    expect(findMatches("price: $5 (approx.)", "(approx.)")).toHaveLength(1);
    expect(findMatches("abc", ".")).toEqual([]);
  });
  it("returns nothing for an empty query and honours the limit", () => {
    expect(findMatches(text, "   ")).toEqual([]);
    expect(findMatches("aaaaaaaaaa", "a", 4)).toHaveLength(4);
  });
  it("matches non-Latin text", () => {
    expect(findMatches("Ελληνικά και ΕΛΛΗΝΙΚΆ", "ελληνικά")).toHaveLength(2);
  });
});

describe("matchFrom", () => {
  const matches = [
    { start: 5, end: 8 },
    { start: 40, end: 43 },
  ];
  it("starts at the first match on or after the current place", () => {
    expect(matchFrom(matches, 0)).toBe(0);
    expect(matchFrom(matches, 6)).toBe(0);
    expect(matchFrom(matches, 20)).toBe(1);
  });
  it("wraps to the first match past the last one", () => {
    expect(matchFrom(matches, 100)).toBe(0);
  });
});
