import {
  ZipWriter,
  ZipReader,
  BlobWriter,
  BlobReader,
  TextReader,
  TextWriter,
  configure,
} from "@zip.js/zip.js";
import {
  db,
  updateBook,
  type Book,
  type Mark,
  type OCRNote,
  type LibraryCollection,
} from "./store";
import { contentHash } from "./content-hash";
import { storageStatus } from "./storage";
import { persistBooks } from "./binary-storage";
import type { TextLocator } from "./locators";
import { openDocument } from "./documents";
import { mimeTypes, type DocumentFormat } from "./document-types";
configure({ useWebWorkers: false });
const MAX_JSON = 16 * 1024 * 1024;
type BookInfo = Omit<Book, "blob" | "cover"> & {
  file: string;
  coverFile?: string;
  coverType?: string;
};
export async function backupLibrary(bookId?: string) {
  const snapshot = await db.transaction(
    "r",
    db.books,
    db.marks,
    db.ocr,
    async () => ({
      books: await db.books.toArray(),
      annotations: await db.marks.toArray(),
      ocr: await db.ocr.toArray(),
    }),
  );
  if (bookId) {
    snapshot.books = snapshot.books.filter((b) => b.id === bookId);
    snapshot.annotations = snapshot.annotations.filter(
      (m) => m.bookId === bookId,
    );
    snapshot.ocr = snapshot.ocr.filter((n) => n.bookId === bookId);
  }
  if (
    snapshot.books.reduce(
      (size, b) => size + b.blob.size + (b.cover?.size || 0),
      0,
    ) >
    2 * 1024 ** 3 - MAX_JSON
  )
    throw Error(
      "This library is too large for one backup. Choose individual books in the backup panel.",
    );
  const writer = new ZipWriter(new BlobWriter("application/zip"));
  const books: BookInfo[] = [];
  try {
    for (const [i, book] of snapshot.books.entries()) {
      const {
        blob,
        cover,
        prepared: _prepared,
        preparedVersion: _preparedVersion,
        ...info
      } = book;
      const hash = book.contentHash || (await contentHash(blob));
      const file = `books/${i}.${book.format || "epub"}`,
        coverFile = cover ? `covers/${i}.bin` : undefined;
      // EPUB is already compressed. Storing it avoids a costly second compression.
      await writer.add(file, new BlobReader(blob), { level: 0 });
      if (cover && coverFile)
        await writer.add(coverFile, new BlobReader(cover), { level: 0 });
      books.push({
        ...info,
        contentHash: hash,
        file,
        coverFile,
        coverType: cover?.type,
      });
    }
    const manifest = JSON.stringify({
      format: "folio-library",
      version: 2,
      exportedAt: new Date().toISOString(),
      books,
      annotations: snapshot.annotations,
      ocr: snapshot.ocr,
    });
    if (new Blob([manifest]).size > MAX_JSON)
      throw Error("The backup's notes exceed the 16 MB safety limit.");
    await writer.add("manifest.json", new TextReader(manifest));
    const result = await writer.close();
    if (result.size > 2 * 1024 ** 3)
      throw Error(
        "This backup exceeds 2 GB. Back up individual books instead.",
      );
    return result;
  } catch (error) {
    await writer.close().catch(() => {});
    throw error;
  }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid backup record.");
  return value as Record<string, unknown>;
}
function string(value: unknown, max = 10000): string {
  if (typeof value !== "string" || value.length > max)
    throw Error("Invalid backup text.");
  return value;
}
function number(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > max
  )
    throw Error("Invalid backup number.");
  return value;
}
function array(value: unknown, max = 100000): unknown[] {
  if (!Array.isArray(value) || value.length > max)
    throw Error("Invalid backup list.");
  return value;
}
function locator(value: unknown): TextLocator | undefined {
  if (value === undefined) return;
  const item = record(value),
    quote = record(item.textQuote);
  if (item.version !== 1)
    throw Error("Unsupported annotation locator version.");
  return {
    version: 1,
    spineHref: string(item.spineHref),
    rendererVersion: number(item.rendererVersion),
    offsetHint: number(item.offsetHint),
    textQuote: {
      exact: string(quote.exact, MAX_JSON),
      prefix: string(quote.prefix),
      suffix: string(quote.suffix),
    },
  };
}
function positionFields(item: Record<string, unknown>) {
  const result: Partial<Mark & Book> = {};
  for (const field of ["position", "textOffset", "page", "pageCount"] as const)
    if (item[field] !== undefined) result[field] = number(item[field]);
  if (item.readingMode === "horizontal" || item.readingMode === "vertical")
    result.readingMode = item.readingMode;
  if (item.locator !== undefined) result.locator = locator(item.locator);
  return result;
}
function annotation(value: unknown): Mark {
  const item = record(value);
  if (item.kind !== "bookmark" && item.kind !== "highlight")
    throw Error("Invalid annotation kind.");
  return {
    id: string(item.id),
    bookId: string(item.bookId),
    chapter: number(item.chapter, 30000),
    chapterTitle: string(item.chapterTitle),
    kind: item.kind,
    text: string(item.text, MAX_JSON),
    created: number(item.created),
    ...(item.start !== undefined ? { start: number(item.start) } : {}),
    ...(item.end !== undefined ? { end: number(item.end) } : {}),
    ...positionFields(item),
    unresolved: item.unresolved === true,
  };
}
function ocrNote(value: unknown): OCRNote {
  const item = record(value);
  return {
    id: string(item.id),
    bookId: string(item.bookId),
    chapter: number(item.chapter, 30000),
    text: string(item.text, MAX_JSON),
    confidence: number(item.confidence, 100),
    created: number(item.created),
    ...(item.imagePath !== undefined
      ? { imagePath: string(item.imagePath) }
      : {}),
  };
}
export async function restoreLibrary(file: File) {
  if (file.size > 2 * 1024 ** 3)
    throw Error(
      "Restore files must be below 2 GB. Split very large libraries into smaller backups.",
    );
  const notesOnly = file.name.toLowerCase().endsWith(".json");
  const reader = notesOnly ? undefined : new ZipReader(new BlobReader(file));
  try {
    const entries = new Map<
      string,
      Awaited<ReturnType<ZipReader<Blob>["getEntries"]>>[number]
    >();
    let total = 0;
    if (reader)
      for await (const entry of reader.getEntriesGenerator()) {
        if (
          entries.size >= 30000 ||
          entry.filename.startsWith("/") ||
          entry.filename.includes("\\") ||
          entry.filename.split("/").includes("..") ||
          entries.has(entry.filename)
        )
          throw Error("Unsafe backup archive.");
        total += entry.uncompressedSize;
        if (total > 4 * 1024 ** 3)
          throw Error("The expanded backup exceeds the 4 GB safety limit.");
        entries.set(entry.filename, entry);
      }
    const manifestEntry = entries.get("manifest.json");
    if (
      (notesOnly ? file.size : manifestEntry?.uncompressedSize || Infinity) >
      MAX_JSON
    )
      throw Error("Missing or oversized backup manifest.");
    if (manifestEntry?.directory) throw Error("Invalid backup manifest.");
    const manifest = record(
      JSON.parse(
        notesOnly
          ? await file.text()
          : await manifestEntry!.getData(new TextWriter(), {
              checkSignature: true,
            }),
      ),
    );
    if (
      ![1, 2].includes(Number(manifest.version)) ||
      (!notesOnly && manifest.format !== "folio-library")
    )
      throw Error("Unsupported Folio backup version.");
    const annotations = array(manifest.annotations).map(annotation),
      ocr = array(manifest.ocr).map(ocrNote);
    const existing = await db.books.toArray(),
      idMap = new Map<string, string>(),
      imported: Book[] = [];
    // Fingerprint older entries lazily; never load an entire large EPUB into RAM.
    for (const book of existing) {
      if (!book.contentHash) {
        book.contentHash = await contentHash(book.blob);
        await updateBook(book.id, { contentHash: book.contentHash });
      }
    }
    await storageStatus(true);
    for (const value of array(manifest.books, 10000)) {
      const item = record(value),
        oldId = string(item.id),
        title = string(item.title),
        author = string(item.author);
      if (idMap.has(oldId))
        throw Error("Duplicate book identifiers in backup.");
      if (notesOnly) {
        const matches = existing.filter(
          (b) =>
            b.id === oldId ||
            (typeof item.contentHash === "string" &&
              b.contentHash === item.contentHash),
        );
        if (matches.length !== 1)
          throw Error(
            `Import the matching original book before restoring notes for “${title}”. Older notes exports match their original library IDs only.`,
          );
        idMap.set(oldId, matches[0]!.id);
        continue;
      }
      const format = item.format === undefined ? "epub" : string(item.format);
      if (!["epub", "pdf", "djvu", "mobi", "md"].includes(format))
        throw Error("Unsupported document format in backup.");
      const documentFormat = format as DocumentFormat;
      const fileName =
        item.fileName === undefined
          ? `${title}.${format}`
          : string(item.fileName);
      const entry = entries.get(string(item.file));
      if (!entry || entry.directory || entry.uncompressedSize > 1024 ** 3)
        throw Error("Missing or oversized book in backup.");
      const blob = await entry.getData(
        new BlobWriter(mimeTypes[documentFormat]),
        {
          checkSignature: true,
        },
      );
      const hash = await contentHash(blob);
      if (item.contentHash !== hash)
        throw Error(`Book checksum does not match: ${title}`);
      const metadata = {
        ...(item.previewVersion === 1 ? { previewVersion: 1 } : {}),
        ...(item.collection === "books" || item.collection === "documents"
          ? { collection: item.collection as LibraryCollection }
          : {}),
        added: number(item.added),
        lastRead: number(item.lastRead),
        chapter: number(item.chapter, 30000),
        chapterCount: number(item.chapterCount, 30000),
        ...positionFields(item),
        ...(item.rendererVersion !== undefined
          ? { rendererVersion: number(item.rendererVersion) }
          : {}),
      };
      const match = [...existing, ...imported].find(
        (b) => b.contentHash === hash,
      );
      if (match) {
        idMap.set(oldId, match.id);
        continue;
      }
      const parser = await openDocument(blob, documentFormat, fileName);
      let prepared: Blob | undefined;
      try {
        prepared = parser.prepared;
        if (
          metadata.chapter >= parser.chapters.length ||
          metadata.chapterCount !== parser.linearCount
        )
          throw Error(`Invalid chapter metadata in backup: ${title}`);
      } finally {
        await parser.close();
      }
      const id = crypto.randomUUID();
      let cover: Blob | undefined;
      if (item.coverFile) {
        const coverEntry = entries.get(string(item.coverFile));
        if (
          !coverEntry ||
          coverEntry.directory ||
          coverEntry.uncompressedSize > 64 * 1024 * 1024
        )
          throw Error("Missing or oversized cover in backup.");
        cover = await coverEntry.getData(
          new BlobWriter(string(item.coverType || "application/octet-stream")),
          { checkSignature: true },
        );
      }
      const book: Book = {
        id,
        title,
        author,
        size: blob.size,
        blob,
        cover,
        contentHash: hash,
        format: documentFormat,
        fileName,
        prepared,
        preparedVersion: prepared ? 1 : undefined,
        ...metadata,
      };
      imported.push(book);
      idMap.set(oldId, id);
    }
    for (const note of [...annotations, ...ocr]) {
      const id = idMap.get(note.bookId);
      if (!id) throw Error("An annotation references a missing book.");
      note.bookId = id;
    }
    // Validate the entire archive before this transaction. A failed restore never
    // leaves a half-restored library or overwrites newer local notes/positions.
    const restoredBooks = await persistBooks(imported, () =>
      db.transaction("rw", db.books, db.marks, db.ocr, async () => {
        let restoredBooks = 0;
        // A second tab may have restored/imported the same file while we were
        // validating it. Recheck inside the write transaction before inserting.
        for (const book of imported) {
          const match = book.contentHash
            ? await db.books
                .where("contentHash")
                .equals(book.contentHash)
                .first()
            : undefined;
          if (match) {
            for (const note of [...annotations, ...ocr])
              if (note.bookId === book.id) note.bookId = match.id;
          } else {
            await db.books.add(book);
            restoredBooks++;
          }
        }
        for (const mark of annotations)
          if (!(await db.marks.get(mark.id))) await db.marks.add(mark);
        for (const note of ocr)
          if (!(await db.ocr.get(note.id))) await db.ocr.add(note);
        for (const id of new Set(
          annotations.filter((m) => !m.locator).map((m) => m.bookId),
        ))
          await db.books.update(id, { rendererVersion: undefined });
        return restoredBooks;
      }),
    );
    return { books: restoredBooks, notes: annotations.length + ocr.length };
  } finally {
    await reader?.close();
  }
}
