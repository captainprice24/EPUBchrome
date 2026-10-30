export function contentHash(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./hash-worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event) => {
      worker.terminate();
      if (event.data.error) reject(Error(event.data.error));
      else resolve(event.data.hash);
    };
    worker.onerror = () => {
      worker.terminate();
      reject(Error("Could not fingerprint this book."));
    };
    worker.postMessage(blob);
  });
}
