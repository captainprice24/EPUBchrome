import type { Mark } from "./store";

/** Position of a mark inside its chapter's text, when one was recorded. */
export function markOffset(mark: Mark): number {
  return (
    mark.locator?.offsetHint ??
    mark.start ??
    mark.textOffset ??
    Number.MAX_SAFE_INTEGER
  );
}

/** Reading order within one book; ties fall back to the time of saving. */
export function compareMarks(a: Mark, b: Mark): number {
  return (
    a.chapter - b.chapter ||
    markOffset(a) - markOffset(b) ||
    a.created - b.created ||
    a.id.localeCompare(b.id)
  );
}

/** Library-wide order: books as listed, then reading order inside each book. */
export function compareLibraryMarks(bookOrder: Map<string, number>) {
  const rank = (mark: Mark) =>
    bookOrder.get(mark.bookId) ?? Number.MAX_SAFE_INTEGER;
  return (a: Mark, b: Mark) => rank(a) - rank(b) || compareMarks(a, b);
}

export const markDate = (mark: Mark) =>
  new Date(mark.created).toLocaleDateString(undefined, { dateStyle: "medium" });
