import { Reader } from "@zip.js/zip.js";
import { storedBinaryRange } from "./binary-storage";

function unavailable(error: unknown) {
  return (
    error instanceof DOMException &&
    ["NotFoundError", "NotReadableError"].includes(error.name)
  );
}

export async function readBinaryRange(blob: Blob, begin: number, end: number) {
  const start = Math.max(0, Math.min(blob.size, begin));
  const stop = Math.max(start, Math.min(blob.size, end));
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(stop))
    throw Error("Invalid file byte range.");
  const bytes = storedBinaryRange(blob, start, stop);
  if (bytes) return bytes;
  const part = blob.slice(start, stop);
  try {
    const buffer = await part.arrayBuffer();
    if (buffer.byteLength !== stop - start)
      throw Error("The browser returned an incomplete file byte range.");
    return new Uint8Array(buffer);
  } catch (error) {
    if (!unavailable(error)) throw error;
    // Some WebKit Blob paths fail while FileReader can still read the bytes.
    // Read only the requested range; never materialize a large book as a whole.
    return new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const buffer = reader.result;
        if (buffer instanceof ArrayBuffer && buffer.byteLength === stop - start)
          resolve(new Uint8Array(buffer));
        else
          reject(Error("The browser returned an incomplete file byte range."));
      };
      const fail = () =>
        reject(
          Error(
            "This browser could not read the saved file. Return to the library and import the same original again to repair its local copy. Keep the existing entry to preserve its notes and saved place.",
          ),
        );
      reader.onerror = fail;
      reader.onabort = fail;
      try {
        reader.readAsArrayBuffer(part);
      } catch {
        fail();
      }
    });
  }
}

// zip.js's BlobReader streams slices directly. Use its generic bounded reader
// instead so extraction and directory parsing share the same recoverable path.
export class LocalFileReader extends Reader<Blob> {
  constructor(private readonly blob: Blob) {
    super(blob);
    this.size = blob.size;
  }
  override readUint8Array(offset: number, length: number) {
    return readBinaryRange(this.blob, offset, offset + length);
  }
}
