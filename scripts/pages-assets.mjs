import { copyFile, writeFile, readFile } from "node:fs/promises";
const { version } = JSON.parse(await readFile("package.json", "utf8"));
await copyFile(
  `.output/folio-${version}-chrome.zip`,
  ".output/pages/folio-chrome.zip",
);
await writeFile(".output/pages/.nojekyll", "");
await writeFile(
  ".output/pages/INSTALL_EXTENSION.txt",
  `Folio ${version} — Chrome extension\n\n1. Download folio-chrome.zip and extract it.\n2. Open chrome://extensions in Chrome.\n3. Turn on Developer mode and choose Load unpacked.\n4. Select the extracted folder containing manifest.json.\n5. Pin Folio and click its toolbar icon.\n\nThe web preview has separate local storage from the extension.\nGoogle Drive requires OAuth configuration; see:\nhttps://github.com/captainprice24/EPUBchrome/blob/main/docs/GOOGLE_DRIVE.md\n`,
);
