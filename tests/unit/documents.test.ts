import { describe, expect, it } from "vitest";
import {
  checkDocumentSize,
  detectFormat,
  documentSizeLimit,
} from "../../src/document-types";
import { resolvePath } from "../../src/epub";
import { notesMarkdown } from "../../src/notes-export";
import type { BookMetadata, Mark } from "../../src/store";

describe("detectFormat", () => {
  it("recognizes formats by extension, whatever the case", () => {
    expect(detectFormat("Book.EPUB")).toBe("epub");
    expect(detectFormat("scan.djv")).toBe("djvu");
    expect(detectFormat("notes.markdown")).toBe("md");
    expect(detectFormat("a.b.mobi")).toBe("mobi");
  });
  it("falls back to the media type and rejects everything else", () => {
    expect(detectFormat("download", "application/pdf")).toBe("pdf");
    expect(() => detectFormat("todo.txt", "text/plain")).toThrow(
      /Choose an EPUB/,
    );
  });
});

describe("checkDocumentSize", () => {
  const sized = (size: number) => ({ size }) as Blob;
  it("rejects empty files and files over the limit of their format", () => {
    expect(() => checkDocumentSize(sized(0), "epub")).toThrow(/empty/);
    expect(() => checkDocumentSize(sized(16 * 1024 ** 2), "md")).not.toThrow();
    expect(() => checkDocumentSize(sized(16 * 1024 ** 2 + 1), "md")).toThrow(
      /16 MB/,
    );
    expect(documentSizeLimit("mobi")).toBe(64 * 1024 ** 2);
    expect(documentSizeLimit("pdf")).toBe(1024 ** 3);
  });
});

describe("resolvePath", () => {
  it("resolves relative references inside the archive", () => {
    expect(resolvePath("OEBPS/text/c1.xhtml", "../img/a%20b.png")).toBe(
      "OEBPS/img/a b.png",
    );
    expect(resolvePath("OEBPS/book.opf", "c1.xhtml#frag")).toBe(
      "OEBPS/c1.xhtml",
    );
    expect(resolvePath("OEBPS/c1.xhtml", "#note")).toBe("OEBPS/c1.xhtml");
    expect(resolvePath("OEBPS/c1.xhtml", "/css/a.css?v=2")).toBe("css/a.css");
  });
  it("blocks external references and paths that leave the archive", () => {
    for (const ref of [
      "https://example.invalid/a",
      "//example.invalid/a",
      "javascript:alert(1)",
      "data:text/html,x",
    ])
      expect(() => resolvePath("OEBPS/c1.xhtml", ref)).toThrow(/External/);
    expect(() => resolvePath("c1.xhtml", "../secret")).toThrow(/escapes/);
    expect(() => resolvePath("a/c1.xhtml", "..\\x")).toThrow(/Invalid/);
  });
});

describe("notesMarkdown", () => {
  const book = (id: string, title: string, author: string) =>
    ({ id, title, author }) as BookMetadata;
  const mark = (id: string, bookId: string, extra: Partial<Mark>): Mark => ({
    id,
    bookId,
    chapter: 0,
    chapterTitle: "One",
    kind: "highlight",
    text: id,
    created: 0,
    ...extra,
  });
  it("writes one section per book in reading order and escapes Markdown", async () => {
    const text = await notesMarkdown(
      [
        book("b", "Zebra *notes*", "Unknown author"),
        book("a", "Atlas", "A. Writer"),
      ],
      [
        mark("later", "a", { chapter: 1, chapterTitle: "Two", start: 3 }),
        mark("first\n  line", "a", { start: 1 }),
        mark("Page 4", "a", { kind: "bookmark", textOffset: 9 }),
        mark("# not a heading", "b", {}),
      ],
    ).text();
    expect(text.split("\n").filter(Boolean)).toEqual([
      "# Reading notes",
      "## Atlas",
      "*A. Writer*",
      "### One",
      "> first line",
      "- Bookmark: Page 4",
      "### Two",
      "> later",
      "## Zebra \\*notes\\*",
      "### One",
      "> \\# not a heading",
    ]);
  });
  it("leaves out books without notes", async () => {
    const text = await notesMarkdown([book("a", "Atlas", "")], []).text();
    expect(text.trim()).toBe("# Reading notes");
  });
});
