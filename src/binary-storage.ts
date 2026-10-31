import Dexie from "dexie";
import type { Book } from "./store";
import { readBlobPart } from "./blob-io";

const fields = ["blob", "cover", "prepared"] as const;
const MAX_COMPATIBILITY_BYTES = 64 * 1024 ** 2;
const CHUNK_BYTES = 1024 ** 2;
interface StoredBinary {
  folioBinary: 1;
  type: string;
  size: number;
  chunks: ArrayBuffer[];
}
// Retain the stored representation when a hydrated book is put/updated again.
// Already byte-backed records serialize synchronously without reading files.
const stored = new WeakMap<Blob, StoredBinary>();
let compatibilityRequired = false;

// Read hydrated byte storage without depending on WebKit's reconstructed Blob
// backing file. Return a copy so ZIP decoders cannot detach persisted chunks.
export function storedBinaryRange(blob: Blob, start: number, end: number) {
  const value = stored.get(blob);
  if (!value) return;
  const result = new Uint8Array(end - start);
  let offset = 0;
  for (const chunk of value.chunks) {
    const next = offset + chunk.byteLength;
    if (next > start && offset < end) {
      const from = Math.max(start, offset),
        to = Math.min(end, next);
      result.set(new Uint8Array(chunk, from - offset, to - from), from - start);
    }
    offset = next;
    if (offset >= end) break;
  }
  return result;
}

export function hydrateBook(book: Book): Book {
  const result = { ...book };
  for (const field of fields) {
    const value = result[field] as Blob | StoredBinary | undefined;
    if (value && "folioBinary" in value && value.folioBinary === 1) {
      const blob = new Blob(value.chunks, { type: value.type });
      if (blob.size !== value.size)
        throw Error(
          "A locally stored file is incomplete. Restore it from a library backup or reimport the original.",
        );
      stored.set(blob, value);
      result[field] = blob;
    }
  }
  return result;
}

function serializeBook(book: Book) {
  const result: Record<string, unknown> = { ...book };
  for (const field of fields) {
    const value = book[field];
    if (value instanceof Blob && stored.has(value))
      result[field] = stored.get(value);
  }
  return result;
}

export function installBinaryStorage(db: Dexie) {
  db.use({
    stack: "dbcore",
    name: "FolioBinaryStorage",
    create: (down) => ({
      ...down,
      table(name) {
        const table = down.table(name);
        if (name !== "books") return table;
        return {
          ...table,
          mutate(request) {
            if (request.type !== "add" && request.type !== "put")
              return table.mutate(request);
            const write = () =>
              table.mutate({
                ...request,
                values: request.values.map(serializeBook),
              });
            if (
              compatibilityRequired &&
              request.values.some((book) =>
                fields.some(
                  (field) =>
                    book[field] instanceof Blob && !stored.has(book[field]),
                ),
              )
            )
              // A legacy record can still contain native Blobs. Convert the
              // exact values being written, including Dexie's freshly read
              // copies. waitFor keeps the transaction alive while reading bytes;
              // this conversion and its metadata update stay atomic.
              return Dexie.waitFor(
                prepareCompatibilityStorage(request.values),
              ).then(write);
            return write();
          },
        };
      },
    }),
  });
}

function blobStorageError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const text = String((error as { message?: unknown }).message || "");
  return /preparing Blob\/File|blob.*(?:stor|clon)|file.*object store/i.test(
    text,
  );
}

async function prepareCompatibilityStorage(books: readonly Book[]) {
  // Some WebKit contexts cannot persist Blob/File objects at all. Copy bytes in
  // bounded slices, preserving MIME types and originals, rather than retrying
  // another Blob or expanding the file into base64 text.
  for (const book of books) {
    const values = fields.map((field) => book[field]);
    const binaries = values.filter(
      (value): value is Blob => value instanceof Blob,
    );
    if (
      values.reduce((sum, value) => sum + (value?.size || 0), 0) >
      MAX_COMPATIBILITY_BYTES
    )
      throw Error(
        "This browser needs compatibility storage, which supports up to 64 MB per item including its reading copy and cover. Try a regular browsing tab or the Chrome extension for larger files. Your original file has not been changed.",
      );
    for (const blob of binaries) {
      if (stored.has(blob)) continue;
      const chunks: ArrayBuffer[] = [];
      for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES)
        chunks.push(
          await readBlobPart(
            blob.slice(offset, offset + CHUNK_BYTES),
            Math.min(CHUNK_BYTES, blob.size - offset),
          ),
        );
      stored.set(blob, {
        folioBinary: 1,
        type: blob.type,
        size: blob.size,
        chunks,
      });
    }
  }
}

/** Retry the entire atomic write, never an already-aborted transaction. */
export async function persistBookWrites<T>(
  write: () => Promise<T>,
  prepare?: () => Promise<void>,
): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (!blobStorageError(error)) throw error;
  }
  compatibilityRequired = true;
  await prepare?.();
  try {
    return await write();
  } catch (error) {
    if (!blobStorageError(error)) throw error;
    throw Error(
      "This browser could not save the file locally. Try a regular browsing tab or another browser. Keep your original file; existing library items have not been changed.",
    );
  }
}

/** The callback must be a fresh, atomic transaction with no external effects. */
export function persistBooks<T>(
  books: Book[],
  write: () => Promise<T>,
): Promise<T> {
  return persistBookWrites(write, () => prepareCompatibilityStorage(books));
}
