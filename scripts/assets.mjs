import { mkdir, copyFile, rm, cp } from "node:fs/promises";
import { execFileSync } from "node:child_process";
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
await mkdir("public/documents/djvu", { recursive: true });
await copyFile(
  "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
  "public/documents/pdf/pdf.worker.min.js",
);
for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"])
  await cp(`node_modules/pdfjs-dist/${dir}`, `public/documents/pdf/${dir}`, {
    recursive: true,
  });
await copyFile(
  "node_modules/djvu-rs/scalar/djvu_rs_bg.wasm",
  "public/documents/djvu/scalar.wasm",
);
await copyFile(
  "node_modules/djvu-rs/simd128/djvu_rs_bg.wasm",
  "public/documents/djvu/simd.wasm",
);
execFileSync("python3", ["scripts/demo.py"]);
