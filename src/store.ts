import Dexie, { type EntityTable } from "dexie";
import type { TextLocator } from "./locators";
import type { DocumentFormat } from "./document-types";
import {
  hydrateBook,
  installBinaryStorage,
  persistBookWrites,
} from "./binary-storage";
export type LibraryCollection = "books" | "documents";
export interface Book {
  collection?: LibraryCollection;
  format?: DocumentFormat;
  fileName?: string;
  prepared?: Blob;
  preparedVersion?: number;
  id: string;
  title: string;
  author: string;
  size: number;
  added: number;
  lastRead: number;
  chapter: number;
  blob: Blob;
  cover?: Blob;
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
export const db = new Dexie("folio-library") as Dexie & {
  books: EntityTable<Book, "id">;
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
installBinaryStorage(db);
db.books.hook("reading", hydrateBook);
export function updateBook(id: string, changes: Partial<Omit<Book, "id">>) {
  return persistBookWrites(() => db.books.update(id, changes));
}
export async function removeBook(id: string) {
  await db.transaction("rw", db.books, db.marks, db.ocr, async () => {
    await db.books.delete(id);
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
