import type { BookMetadata } from "./store";

type Progress = Pick<
  BookMetadata,
  "format" | "chapter" | "chapterCount" | "page" | "pageCount" | "pagination"
>;

/** Share of the book before and including the saved place: 0 on the first
 * page, 100 on the last. A book that was never opened reports 0. */
export function bookProgress(book: Progress): number {
  const percent = (value: number) =>
    Math.max(0, Math.min(100, Math.round(100 * value)));
  if (book.format === "pdf" || book.format === "djvu") {
    if (!book.page) return 0;
    return book.chapterCount > 1
      ? percent(book.chapter / (book.chapterCount - 1))
      : 100;
  }
  if (!book.page || !book.pageCount || book.chapter >= book.chapterCount)
    return 0;
  const counts = book.pagination?.counts.slice(0, book.chapterCount);
  if (counts?.length === book.chapterCount && counts.every((n) => n > 0)) {
    const total = counts.reduce((a, b) => a + b, 0);
    const before = counts.slice(0, book.chapter).reduce((a, b) => a + b, 0);
    return total > 1 ? percent((before + book.page - 1) / (total - 1)) : 100;
  }
  // Without counts for every chapter, weigh chapters equally.
  if (book.chapter === book.chapterCount - 1 && book.page >= book.pageCount)
    return 100;
  return percent(
    (book.chapter + (book.page - 1) / book.pageCount) / book.chapterCount,
  );
}
