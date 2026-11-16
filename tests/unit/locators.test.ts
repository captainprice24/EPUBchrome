import { describe, expect, it } from "vitest";
import {
  quoteLocator,
  resolveLocator,
  RENDERER_VERSION,
} from "../../src/locators";

const chapter =
  "The harbour was quiet. The harbour was quiet. A gull turned over the\n" +
  "  water and the harbour was quiet again.";
const at = (needle: string, from = 0) => chapter.indexOf(needle, from);

describe("quoteLocator", () => {
  it("records the quote with context and a fingerprint of the chapter", () => {
    const start = at("A gull");
    const locator = quoteLocator(chapter, "c1.xhtml", start, start + 6)!;
    expect(locator.textQuote.exact).toBe("A gull");
    expect(locator.textQuote.prefix.endsWith("was quiet. ")).toBe(true);
    expect(locator.textQuote.suffix.startsWith(" turned")).toBe(true);
    expect(locator.offsetHint).toBe(start);
    expect(locator.rendererVersion).toBe(RENDERER_VERSION);
    expect(locator.textHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it("refuses an empty or whitespace-only quote and clamps the range", () => {
    expect(quoteLocator(chapter, "c1.xhtml", 5, 5)).toBeUndefined();
    expect(quoteLocator("a   b", "c1.xhtml", 1, 4)).toBeUndefined();
    const end = quoteLocator(chapter, "c1.xhtml", chapter.length - 6, 9999)!;
    expect(end.textQuote.exact).toBe("again.");
  });
});

describe("resolveLocator", () => {
  it("returns the saved offset when the chapter text is unchanged", () => {
    const second = at("The harbour was quiet.", 5);
    const locator = quoteLocator(chapter, "c1.xhtml", second, second + 22)!;
    expect(resolveLocator(chapter, locator)).toEqual({
      start: second,
      end: second + 22,
    });
  });
  it("finds a unique quote again after text was inserted before it", () => {
    const start = at("A gull");
    const locator = quoteLocator(chapter, "c1.xhtml", start, start + 6)!;
    const changed = "A new opening line. " + chapter;
    expect(resolveLocator(changed, locator)).toEqual({
      start: start + 20,
      end: start + 26,
    });
  });
  it("uses the surrounding context to choose between repeated quotes", () => {
    const text = "one fish, two fish. red fish, blue fish.";
    const start = text.indexOf("fish", text.indexOf("red"));
    const locator = quoteLocator(text, "c1.xhtml", start, start + 4)!;
    const changed = "Preface. " + text;
    expect(resolveLocator(changed, locator)).toEqual({
      start: start + 9,
      end: start + 13,
    });
  });
  it("matches across changed whitespace and maps back to raw offsets", () => {
    const start = at("turned over the");
    const locator = quoteLocator(chapter, "c1.xhtml", start, at("and the"))!;
    const reflowed = chapter.replace("the\n  water", "the water");
    const found = resolveLocator(reflowed, locator)!;
    expect(reflowed.slice(found.start, found.end)).toBe(
      "turned over the water ",
    );
  });
  it("declines to guess between equally likely places", () => {
    const text = "echo. echo.";
    expect(
      resolveLocator(text, {
        version: 1,
        spineHref: "c1.xhtml",
        rendererVersion: 1,
        offsetHint: 0,
        textQuote: { exact: "echo", prefix: "", suffix: "." },
      }),
    ).toBeNull();
  });
  it("reports a quote that no longer exists", () => {
    const locator = quoteLocator(
      chapter,
      "c1.xhtml",
      at("A gull"),
      at("A gull") + 6,
    )!;
    expect(resolveLocator("Entirely different text.", locator)).toBeNull();
  });
});
