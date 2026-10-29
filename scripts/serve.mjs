import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(".output/chrome-mv3");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".epub": "application/epub+zip",
  ".png": "image/png",
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const f = path.resolve(
      root,
      "." +
        decodeURIComponent(
          url.pathname === "/" ? "/reader.html" : url.pathname,
        ),
    );
    if (!f.startsWith(root + path.sep) || !(await stat(f)).isFile())
      throw Error("Invalid path");
    res.setHeader(
      "Content-Type",
      types[path.extname(f)] || "application/octet-stream",
    );
    res.setHeader(
      "Content-Security-Policy",
      "script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; base-uri 'none'",
    );
    res.end(await readFile(f));
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
server.listen(4173, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit()));
