import type Dexie from "dexie";
import type { Book } from "./store";

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
// The middleware stays synchronous: no file reads inside an IDB transaction.
const stored = new WeakMap<Blob, StoredBinary>();

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
            return table.mutate(
              request.type === "add" || request.type === "put"
                ? { ...request, values: request.values.map(serializeBook) }
                : request,
            );
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

async function prepareCompatibilityStorage(books: Book[]) {
  // Some WebKit contexts cannot persist Blob/File objects at all. Copy bytes in
  // bounded slices, preserving MIME types and originals, rather than retrying
  // another Blob or expanding the file into base64 text.
  for (const book of books) {
    const binaries = fields
      .map((field) => book[field])
      .filter((value): value is Blob => value instanceof Blob);
    if (
      binaries.reduce((sum, blob) => sum + blob.size, 0) >
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
          await blob.slice(offset, offset + CHUNK_BYTES).arrayBuffer(),
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

/** The callback must be a fresh, atomic transaction with no external effects. */
export async function persistBooks<T>(
  books: Book[],
  write: () => Promise<T>,
): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (!blobStorageError(error)) throw error;
  }
  await prepareCompatibilityStorage(books);
  try {
    return await write();
  } catch (error) {
    if (!blobStorageError(error)) throw error;
    throw Error(
      "This browser could not save the file locally. Try a regular browsing tab or another browser. Keep your original file; existing library items have not been changed.",
    );
  }
}
