import {
  mkdir,
  copyFile,
  readdir,
  access,
  readFile,
  rm,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
await rm("public/ocr/core", { recursive: true, force: true });
await mkdir("public/ocr/core", { recursive: true });
await mkdir("public/ocr/licenses", { recursive: true });
await mkdir("public/ocr/lang", { recursive: true });
await mkdir("public/licenses", { recursive: true });
for (const name of [
  "react",
  "react-dom",
  "scheduler",
  "dexie",
  "@zip.js/zip.js",
  "dompurify",
  "css-tree",
  "mdn-data",
  "@noble/hashes",
])
  await copyFile(
    `node_modules/${name}/LICENSE`,
    `public/licenses/${name.replaceAll("/", "-")}.txt`,
  );
await copyFile(
  "THIRD_PARTY_NOTICES.md",
  "public/licenses/THIRD_PARTY_NOTICES.md",
);
await copyFile(
  "node_modules/tesseract.js/dist/worker.min.js",
  "public/ocr/worker.min.js",
);
for (const f of await readdir("node_modules/tesseract.js-core"))
  if (/-lstm\.(?:js|wasm|wasm\.js)$/.test(f))
    await copyFile(
      "node_modules/tesseract.js-core/" + f,
      "public/ocr/core/" + f,
    );
const target = "public/ocr/lang/eng.traineddata.gz";
try {
  await access(target);
} catch {
  execFileSync("curl", [
    "--fail",
    "--location",
    "--silent",
    "--show-error",
    "--connect-timeout",
    "20",
    "--max-time",
    "180",
    "--retry",
    "2",
    "https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0/eng.traineddata.gz",
    "-o",
    target,
  ]);
}
execFileSync("python3", ["scripts/demo.py"]);

const digest = createHash("sha256")
  .update(await readFile(target))
  .digest("hex");
if (
  digest !== "ed350f3752f81ee8f38769edc14d92d997dababe23b565c59879372cc46a2468"
)
  throw Error(
    "OCR model integrity check failed; remove the model and retry from the trusted upstream.",
  );
await copyFile(
  "node_modules/tesseract.js/LICENSE.md",
  "public/ocr/licenses/tesseract-js.txt",
);
await copyFile(
  "node_modules/tesseract.js-core/LICENSE",
  "public/ocr/licenses/tesseract-core.txt",
);
await copyFile(
  "node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt",
  "public/ocr/licenses/worker.txt",
);
await copyFile(
  "THIRD_PARTY_NOTICES.md",
  "public/ocr/licenses/THIRD_PARTY_NOTICES.md",
);
