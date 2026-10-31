import { db, type Book } from "./store";
import { Epub, readerDocument } from "./epub";
import { documentText, locatorFactory, RENDERER_VERSION } from "./locators";
import { persistBookWrites } from "./binary-storage";

// A DOM-dependent migration cannot run inside Dexie's schema upgrade transaction.
// Capture v0.2 quotes lazily, atomically per book, before displaying v0.3 content.
export async function migrateLocators(book: Book, epub: Epub) {
  if (book.rendererVersion === RENDERER_VERSION) return book;
  const marks = await db.marks.where("bookId").equals(book.id).toArray();
  const chapters = new Set(
    marks.filter((m) => !m.locator).map((m) => m.chapter),
  );
  if (book.textOffset !== undefined && !book.locator)
    chapters.add(book.chapter);
  let locator = book.locator;
  const updates = new Map<string, Partial<(typeof marks)[number]>>();
  for (const chapter of chapters) {
    try {
      const href = epub.chapters[chapter]?.href;
      if (!href) continue;
      const output = await epub.renderLegacy(chapter);
      const doc = new DOMParser().parseFromString(
        readerDocument(output.html),
        "text/html",
      );
      const text = documentText(doc);
      const captureLocator = locatorFactory(text, href);
      for (const mark of marks.filter(
        (m) => m.chapter === chapter && !m.locator,
      )) {
        const start = mark.kind === "highlight" ? mark.start : mark.textOffset;
        let anchor =
          start === undefined
            ? undefined
            : captureLocator(
                start,
                mark.kind === "highlight" ? mark.end : undefined,
              );
        if (
          mark.kind === "highlight" &&
          anchor &&
          !anchor.textQuote.exact.startsWith(mark.text)
        )
          anchor = undefined;
        // Highlight text is already present in v0.2 exports. Keep it even when
        // the old renderer cannot recover its offsets; resolution must be unique.
        const fallback =
          mark.kind === "highlight" && mark.text.trim()
            ? {
                version: 1 as const,
                spineHref: href,
                rendererVersion: RENDERER_VERSION,
                offsetHint: mark.start || 0,
                textQuote: { exact: mark.text, prefix: "", suffix: "" },
              }
            : undefined;
        updates.set(mark.id, {
          locator: anchor || fallback,
          unresolved: !anchor && !fallback,
        });
      }
      if (chapter === book.chapter && book.textOffset !== undefined && !locator)
        locator = captureLocator(book.textOffset);
    } catch {
      // Preserve the note and expose its unresolved location; never delete it.
      for (const mark of marks.filter(
        (m) => m.chapter === chapter && !m.locator,
      ))
        updates.set(mark.id, { unresolved: true });
    } finally {
      epub.releaseResources();
    }
  }
  const update = {
    rendererVersion: RENDERER_VERSION,
    locator,
    textOffset: locator ? book.textOffset : undefined,
    pagination: undefined,
  };
  await persistBookWrites(() =>
    db.transaction("rw", db.library, db.marks, async () => {
      for (const [id, update] of updates) await db.marks.update(id, update);
      await db.library.update(book.id, update);
    }),
  );
  return { ...book, ...update };
}
