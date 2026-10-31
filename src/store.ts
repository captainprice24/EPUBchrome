import Dexie, { type EntityTable } from "dexie";
import type { TextLocator } from "./locators";
import type { DocumentFormat } from "./document-types";
import {
  hydrateBook,
  installBinaryStorage,
  persistBookWrites,
  encodeBinary,
} from "./binary-storage";
export type LibraryCollection = "books" | "documents";
export interface BookMetadata {
  collection?: LibraryCollection;
  format?: DocumentFormat;
  fileName?: string;
  preparedVersion?: number;
  id: string;
  title: string;
  author: string;
  size: number;
  added: number;
  lastRead: number;
  chapter: number;
  hasCover?: boolean;
  archivedCover?: boolean;
  previewVersion?: number;
  chapterCount: number;
  pagination?: { key: string; counts: number[] };
  position?: number;
  textOffset?: number;
  page?: number;
  pageCount?: number;
  readingMode?: "horizontal" | "vertical";
  locator?: TextLocator;
  rendererVersion?: number;
  contentHash?: string;
}
export interface Book extends BookMetadata {
  blob: Blob;
  prepared?: Blob;
  cover?: Blob;
}
export interface BookFile {
  id: string;
  blob: Blob;
  prepared?: Blob;
}
type LegacyBook = Partial<Book> & { id: string };
export interface BookPreview {
  id: string;
  cover: Blob;
}
export function bookCollection(
  book: Pick<Book, "collection" | "format">,
): LibraryCollection {
  return (
    book.collection ??
    (book.format === undefined ||
    book.format === "epub" ||
    book.format === "mobi"
      ? "books"
      : "documents")
  );
}
export interface Mark {
  id: string;
  bookId: string;
  chapter: number;
  chapterTitle: string;
  kind: "bookmark" | "highlight";
  text: string;
  start?: number;
  end?: number;
  created: number;
  position?: number;
  textOffset?: number;
  page?: number;
  pageCount?: number;
  readingMode?: "horizontal" | "vertical";
  locator?: TextLocator;
  unresolved?: boolean;
}
export interface OCRNote {
  imagePath?: string;
  id: string;
  bookId: string;
  chapter: number;
  text: string;
  confidence: number;
  created: number;
}
export const db = new Dexie("folio-library", { cache: "disabled" }) as Dexie & {
  books: EntityTable<LegacyBook, "id">;
  library: EntityTable<BookMetadata, "id">;
  files: EntityTable<BookFile, "id">;
  previews: EntityTable<BookPreview, "id">;
  marks: EntityTable<Mark, "id">;
  ocr: EntityTable<OCRNote, "id">;
};
db.version(1).stores({
  books: "id,lastRead,added",
  marks: "id,bookId,kind,[bookId+chapter]",
  ocr: "id,bookId,[bookId+chapter]",
});
db.version(2).stores({
  books: "id,lastRead,added,contentHash",
  marks: "id,bookId,kind,[bookId+chapter]",
  ocr: "id,bookId,[bookId+chapter]",
});

export function bookMetadata(book: Book): BookMetadata {
  const { blob: _blob, prepared: _prepared, cover, ...metadata } = book;
  return { ...metadata, hasCover: !!cover };
}

db.version(3)
  .stores({
    books: "id,lastRead,added,contentHash", // Read-on-demand legacy originals.
    library: "id,lastRead,added,contentHash",
    files: "id",
    previews: "id",
    marks: "id,bookId,kind,[bookId+chapter]",
    ocr: "id,bookId,[bookId+chapter]", // Retain existing extracted text for backups.
  })
  .upgrade(async (tx) => {
    // Read one old row at a time. Do not rewrite its original or prepared file.
    const legacy = tx.table("books");
    let last: string | undefined;
    while (true) {
      const row = await (
        last === undefined
          ? legacy.orderBy(":id")
          : legacy.where(":id").above(last)
      )
        .limit(1)
        .raw()
        .first();
      if (!row) break;
      const metadata = bookMetadata(row);
      metadata.hasCover = false;
      metadata.archivedCover = !!row.cover;
      if (
        row.cover &&
        row.previewVersion === 1 &&
        row.cover.size <= 1024 ** 2
      ) {
        let encoded;
        try {
          encoded = await Dexie.waitFor(encodeBinary(row.cover));
        } catch {
          // An unavailable derivative must not destroy or block original files.
          metadata.previewVersion = undefined;
        }
        if (encoded) {
          await tx.table("previews").put({ id: row.id, cover: encoded });
          metadata.hasCover = true;
          metadata.archivedCover = false;
        }
      } else if (row.cover) metadata.previewVersion = undefined;
      await tx.table("library").put(metadata);
      last = row.id;
    }
  });
installBinaryStorage(db);
db.files.hook("reading", hydrateBook);
db.previews.hook("reading", hydrateBook);

export type DatabaseState =
  | "opening"
  | "ready"
  | "blocked"
  | "reload"
  | "failed";
let databaseState: DatabaseState = "opening";
const databaseListeners = new Set<(state: DatabaseState) => void>();
const publishDatabaseState = (state: DatabaseState) => {
  databaseState = state;
  for (const listener of databaseListeners) listener(state);
};
export const watchDatabase = (listener: (state: DatabaseState) => void) => {
  databaseListeners.add(listener);
  listener(databaseState);
  return () => {
    databaseListeners.delete(listener);
  };
};
db.on("blocked", () => publishDatabaseState("blocked"));
db.on("versionchange", () => {
  db.close();
  publishDatabaseState("reload");
});
db.on("ready", () => publishDatabaseState("ready"));
export async function openLibrary() {
  try {
    await db.open();
  } catch (error) {
    publishDatabaseState("failed");
    throw Error(
      "The library upgrade could not finish. Existing records have not been cleared. Free storage if necessary, then reload to retry.",
      { cause: error },
    );
  }
}
export const bookTables = [db.library, db.files, db.previews, db.books];

/** Read an original only for a selected document, preview job or export. */
export async function getBook(
  id: string,
  includeCover = false,
): Promise<Book | undefined> {
  const metadata = await db.library.get(id);
  if (!metadata) return;
  const file = await db.files.get(id);
  const legacy = file ? undefined : await db.books.get(id);
  const source =
    file ||
    (legacy?.blob
      ? hydrateBook({ id, blob: legacy.blob, prepared: legacy.prepared })
      : undefined);
  if (!source?.blob)
    throw Error(
      "This saved file is unavailable. Choose the same original to repair its local copy; its notes are still in the library.",
    );
  let cover: Blob | undefined;
  if (includeCover) {
    cover = metadata.archivedCover ? undefined : await getPreview(id);
    if (!cover) {
      const old = legacy || (await db.books.get(id));
      if (old?.cover) {
        try {
          cover = hydrateBook({ cover: old.cover }).cover;
        } catch {
          /* optional derivative */
        }
      }
    }
  }
  return { ...source, ...metadata, cover };
}
export async function getPreview(id: string) {
  try {
    return (await db.previews.get(id))?.cover;
  } catch {
    return undefined;
  }
}
/** Use inside a transaction containing bookTables. */
export async function addBook(book: Book) {
  const metadata = bookMetadata(book);
  const boundedCover = book.cover && book.cover.size <= 1024 ** 2;
  if (book.cover && !boundedCover) {
    // Old backups can contain full-size cover images. Keep the derivative for
    // export, but never load it in a library card. Generate a bounded preview.
    metadata.hasCover = false;
    metadata.previewVersion = undefined;
    metadata.archivedCover = true;
    await db.books.add({ id: book.id, cover: book.cover });
  }
  await db.library.add(metadata);
  await db.files.add({ id: book.id, blob: book.blob, prepared: book.prepared });
  if (boundedCover) await db.previews.add({ id: book.id, cover: book.cover! });
}
/** Same-source replacement updates binary fields, never reading position/notes. */
export async function replaceBookFiles(
  id: string,
  source: Pick<Book, "blob" | "prepared" | "preparedVersion">,
  cover?: Blob,
) {
  await db.files.put({ id, blob: source.blob, prepared: source.prepared });
  await db.library.update(id, { preparedVersion: source.preparedVersion });
  if (cover && !(await db.library.get(id))?.hasCover) {
    await db.previews.put({ id, cover });
    await db.library.update(id, { hasCover: true, previewVersion: 1 });
  }
  if (!(await db.library.get(id))?.archivedCover) await db.books.delete(id);
}
export async function savePreview(
  id: string,
  cover: Blob | undefined,
  previewVersion: number,
) {
  await persistBookWrites(() =>
    db.transaction("rw", bookTables, async () => {
      const metadata = await db.library.get(id);
      if (!metadata || metadata.hasCover) return;
      if (cover) await db.previews.put({ id, cover });
      await db.library.update(id, { hasCover: !!cover, previewVersion });
      if (
        !metadata.archivedCover &&
        (await db.files.where(":id").equals(id).count())
      )
        await db.books.delete(id);
    }),
  );
}
export async function invalidatePreview(id: string) {
  await db.library.update(id, { hasCover: false, previewVersion: undefined });
}

const bookWrites = new Map<string, Promise<unknown>>();
export function updateBook(
  id: string,
  changes: Partial<Omit<BookMetadata, "id">>,
) {
  // Keep retries inside invocation order. Otherwise an older position save can
  // retry after a newer chapter save and move the reader back on reopening.
  const snapshot = { ...changes };
  const previous = bookWrites.get(id) || Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(() => db.library.update(id, snapshot));
  bookWrites.set(id, next);
  const release = () => {
    if (bookWrites.get(id) === next) bookWrites.delete(id);
  };
  void next.then(release, release);
  return next;
}
export async function flushBookUpdates(id: string) {
  while (bookWrites.has(id)) await bookWrites.get(id);
}
export async function removeBook(id: string) {
  await db.transaction("rw", [...bookTables, db.marks, db.ocr], async () => {
    await db.books.delete(id);
    await db.library.delete(id);
    await db.files.delete(id);
    await db.previews.delete(id);
    await db.marks.where("bookId").equals(id).delete();
    await db.ocr.where("bookId").equals(id).delete();
  });
}
export const asset = (path: string) =>
  typeof chrome !== "undefined" && chrome.runtime?.id && chrome.runtime.getURL
    ? chrome.runtime.getURL("/" + path)
    : import.meta.env.BASE_URL + path.replace(/^\/+/, "");
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export const message = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";
export const bytes = (n: number) =>
  n < 1024 * 1024
    ? `${Math.max(1, Math.round(n / 1024))} KB`
    : `${(n / 1024 / 1024).toFixed(1)} MB`;
