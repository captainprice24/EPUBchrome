import { sha256 } from "@noble/hashes/sha2.js";
self.onmessage = async (event: MessageEvent<Blob>) => {
  try {
    const hash = sha256.create();
    const reader = event.data.stream().getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
    }
    self.postMessage({
      hash: Array.from(hash.digest(), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join(""),
    });
  } catch {
    self.postMessage({ error: "Could not fingerprint this book." });
  }
};
