import { Reader } from "@zip.js/zip.js";
import { storedBinaryRange } from "./binary-storage";
import { readBlobPart } from "./blob-io";

export async function readBinaryRange(blob: Blob, begin: number, end: number) {
  const start = Math.max(0, Math.min(blob.size, begin));
  const stop = Math.max(start, Math.min(blob.size, end));
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(stop))
    throw Error("Invalid file byte range.");
  const bytes = storedBinaryRange(blob, start, stop);
  if (bytes) return bytes;
  return new Uint8Array(
    await readBlobPart(blob.slice(start, stop), stop - start),
  );
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
