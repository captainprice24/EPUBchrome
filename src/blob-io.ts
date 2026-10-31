/** Read one bounded Blob slice, retaining a second native API for WebKit errors. */
export async function readBlobPart(
  part: Blob,
  expectedBytes: number,
): Promise<ArrayBuffer> {
  try {
    const buffer = await part.arrayBuffer();
    if (buffer.byteLength !== expectedBytes)
      throw Error("The browser returned an incomplete file byte range.");
    return buffer;
  } catch (error) {
    if (
      !(error instanceof DOMException) ||
      !["NotFoundError", "NotReadableError"].includes(error.name)
    )
      throw error;
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const buffer = reader.result;
        if (
          buffer instanceof ArrayBuffer &&
          buffer.byteLength === expectedBytes
        )
          resolve(buffer);
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
