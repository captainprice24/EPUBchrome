// Packages the production extension build into .output/folio-<version>-chrome.zip.
// Only files of the build are included: never application secrets or user data.
import { readFile, readdir, writeFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  ZipWriter,
  ZipReader,
  BlobWriter,
  BlobReader,
  Uint8ArrayReader,
  configure,
} from "@zip.js/zip.js";

configure({ useWebWorkers: false });
const root = ".output/chrome-mv3";
const check = (condition, message) => {
  if (!condition) throw Error(`Package check failed: ${message}`);
};
const manifest = JSON.parse(await readFile(`${root}/manifest.json`, "utf8"));
check(manifest.manifest_version === 3, "the manifest is not version 3");
check(manifest.action?.default_title === "Open Folio", "unexpected title");
check((await stat(`${root}/reader.html`)).isFile(), "reader.html is missing");
const files = (await readdir(root, { recursive: true, withFileTypes: true }))
  .filter((item) => item.isFile())
  .map((item) =>
    path
      .relative(root, path.join(item.parentPath, item.name))
      .split(path.sep)
      .join("/"),
  )
  .sort();
check(!files.some((name) => name.startsWith("ocr/")), "OCR assets present");
check(
  !files.some((name) => /quickjs|nowasm_fallback/.test(name)),
  "unused PDF.js sandbox or fallback files present",
);
check(
  !files.some((name) => path.basename(name).startsWith(".env")),
  "an environment file is present",
);
const writer = new ZipWriter(new BlobWriter("application/zip"));
for (const name of files)
  await writer.add(
    name,
    new Uint8ArrayReader(await readFile(`${root}/${name}`)),
  );
const bytes = Buffer.from(await (await writer.close()).arrayBuffer());
// Read the archive back: every entry must decompress and match its checksum.
const reader = new ZipReader(new BlobReader(new Blob([bytes])));
const entries = await reader.getEntries();
check(entries.length === files.length, "the archive is incomplete");
for (const entry of entries)
  await entry.getData(new BlobWriter(), { checkSignature: true });
await reader.close();
const output = `.output/folio-${manifest.version}-chrome.zip`;
await writeFile(output, bytes);
console.log(`${output} (${bytes.length.toLocaleString("en-US")} bytes)`);
console.log("SHA-256:", createHash("sha256").update(bytes).digest("hex"));
