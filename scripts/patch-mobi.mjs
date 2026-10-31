import { readFile, writeFile } from "node:fs/promises";
// Narrow, reproducible fixes to the pinned MIT parser's MOBI6 section splitter.
// Keep these visible until the upstream parser provides equivalent fixes.
const replacements = [
  [
    "const boundary = this.exth.boundary ?? 4294967295;",
    "const boundary = this.exth?.boundary ?? 4294967295;",
  ],
  [
    "const end = matches[i + 1]?.index;",
    "const end = matches[i + 1]?.index ?? str.length;",
  ],
  [
    'chapters[chapters.length - 1].text = lastChapterText.slice(0, lastChapterText.indexOf("</body>"));',
    "const bodyClose = lastChapterText.search(/<\\/body\\s*>/i);\n    chapters[chapters.length - 1].text = bodyClose >= 0 ? lastChapterText.slice(0, bodyClose) : lastChapterText;",
  ],
  [
    'const bodyOpenTagIndex = firstChapterText.indexOf("<body>");\n    chapters[0].text = firstChapterText.slice(bodyOpenTagIndex + "<body>".length);',
    "const bodyOpen = /<body\\b[^>]*>/i.exec(firstChapterText);\n    const bodyOpenTagIndex = bodyOpen?.index ?? 0;\n    chapters[0].text = bodyOpen ? firstChapterText.slice(bodyOpenTagIndex + bodyOpen[0].length) : firstChapterText;",
  ],
];
for (const file of ["index.browser.mjs", "index.browser.js"]) {
  const path = `node_modules/@lingo-reader/mobi-parser/dist/${file}`;
  let source = await readFile(path, "utf8");
  for (const [before, after] of replacements) {
    const beforeCount = source.split(before).length - 1;
    const afterCount = source.split(after).length - 1;
    if (beforeCount === 1 && afterCount === 0)
      source = source.replace(before, after);
    else if (beforeCount !== 0 || afterCount !== 1)
      throw Error(
        `Review the MOBI parser patch before changing its pinned dependency: ${file}`,
      );
  }
  await writeFile(path, source);
}
