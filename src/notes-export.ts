import type { BookMetadata, Mark, OCRNote } from "./store";
import { compareMarks } from "./marks";

/** Notes without the original files, importable for matching books. */
export function notesJson(
  books: BookMetadata[],
  marks: Mark[],
  ocr: OCRNote[],
): Blob {
  return new Blob(
    [
      JSON.stringify(
        {
          version: 1,
          exportedAt: new Date().toISOString(),
          books: books.map(({ id, title, author, contentHash }) => ({
            id,
            title,
            author,
            contentHash,
          })),
          annotations: marks,
          ocr,
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
}

const line = (text: string) => text.replace(/\s+/g, " ").trim();
// Backslash-escape characters that would otherwise start Markdown syntax.
const plain = (text: string) => line(text).replace(/([\\`*_[\]<>#])/g, "\\$1");

/** A readable copy of every highlight and bookmark, one section per book. */
export function notesMarkdown(books: BookMetadata[], marks: Mark[]): Blob {
  const parts = ["# Reading notes", ""];
  for (const book of [...books].sort((a, b) =>
    a.title.localeCompare(b.title),
  )) {
    const own = marks.filter((m) => m.bookId === book.id).sort(compareMarks);
    if (!own.length) continue;
    parts.push(`## ${plain(book.title)}`, "");
    if (book.author && book.author !== "Unknown author")
      parts.push(`*${plain(book.author)}*`, "");
    let chapter = "";
    for (const mark of own) {
      const title = line(mark.chapterTitle);
      if (title && title !== chapter) {
        chapter = title;
        parts.push(`### ${plain(title)}`, "");
      }
      if (mark.kind === "highlight") parts.push(`> ${plain(mark.text)}`, "");
      else parts.push(`- Bookmark: ${plain(mark.text)}`, "");
    }
  }
  return new Blob([parts.join("\n")], { type: "text/markdown" });
}
