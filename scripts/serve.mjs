import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
const pages = process.argv.includes("--pages");
const root = path.resolve(pages ? ".output/pages" : ".output/chrome-mv3");
const prefix = pages ? "/EPUBchrome/" : "/";
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
    if (pages && (url.pathname === "/" || url.pathname === "/EPUBchrome")) {
      res.writeHead(302, { Location: prefix });
      res.end();
      return;
    }
    if (!url.pathname.startsWith(prefix)) throw Error("Invalid prefix");
    const relative = url.pathname.slice(prefix.length);
    const f = path.resolve(
      root,
      "." +
        decodeURIComponent(
          "/" + (relative || (pages ? "index.html" : "reader.html")),
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
server.listen(pages ? 4174 : 4173, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit()));
