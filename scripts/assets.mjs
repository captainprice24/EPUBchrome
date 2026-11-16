import { mkdir, copyFile, rm, cp, readdir } from "node:fs/promises";
import "./patch-mobi.mjs";
await rm("public/ocr", { recursive: true, force: true });
await rm("public/licenses", { recursive: true, force: true });
await mkdir("public/licenses", { recursive: true });
for (const name of [
  "react",
  "react-dom",
  "scheduler",
  "dexie",
  "@zip.js/zip.js",
  "dompurify",
  "entities",
  "css-tree",
  "mdn-data",
  "@noble/hashes",
  "pdfjs-dist",
  "djvu-rs",
  "@lingo-reader/mobi-parser",
  "@lingo-reader/shared",
  "marked",
  "fflate",
  "events",
  "path-browserify",
  "html2canvas",
  "css-line-break",
  "text-segmentation",
  "utrie",
  "base64-arraybuffer",
])
  await copyFile(
    `node_modules/${name}/LICENSE`,
    `public/licenses/${name.replaceAll("/", "-")}.txt`,
  );
await copyFile("LICENSE", "public/licenses/FOLIO-LICENSE.txt");
await copyFile("NOTICE", "public/licenses/FOLIO-NOTICE.txt");
await copyFile(
  "THIRD_PARTY_NOTICES.md",
  "public/licenses/THIRD_PARTY_NOTICES.md",
);
await copyFile("node_modules/sax/LICENSE.md", "public/licenses/sax.txt");
await copyFile(
  "third-party/foliate-mobi-LICENSE",
  "public/licenses/foliate-mobi.txt",
);
await copyFile(
  "node_modules/djvu-rs/THIRD_PARTY_NOTICES",
  "public/licenses/djvu-rs-dependencies.txt",
);
await rm("public/documents", { recursive: true, force: true });
await mkdir("public/documents/pdf", { recursive: true });
await copyFile(
  "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
  "public/documents/pdf/pdf.worker.min.js",
);
for (const dir of ["cmaps", "standard_fonts", "iccs"])
  await cp(`node_modules/pdfjs-dist/${dir}`, `public/documents/pdf/${dir}`, {
    recursive: true,
  });
// Only the image and colour decoders are used. The scripting sandbox
// (quickjs-eval) and the no-WebAssembly fallbacks are never loaded: PDF
// scripting is off and the extension CSP allows WebAssembly.
await mkdir("public/documents/pdf/wasm", { recursive: true });
for (const name of await readdir("node_modules/pdfjs-dist/wasm"))
  if (/^LICENSE|^(?:openjpeg|jbig2|qcms_bg)\.wasm$/.test(name))
    await copyFile(
      `node_modules/pdfjs-dist/wasm/${name}`,
      `public/documents/pdf/wasm/${name}`,
    );
// The DjVu decoder's WebAssembly is emitted by the bundler next to its worker.
await import("./demo.mjs");
