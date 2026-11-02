// Renders the Folio toolbar/extension icons and Chrome Web Store artwork.
// Run with `npm run icons` after changing the brand mark; outputs are committed.
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const GREEN = "#294c3c",
  CREAM = "#f2f4e6";
// The same open-book glyph as the in-app brand icon (24-unit grid).
const BOOK = [
  "M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4z",
  "M13 7a3 3 0 0 1 3-3h5v15h-4a4 4 0 0 0-4 2",
];

function tile(size, padding, stroke) {
  const inner = size - padding * 2;
  const glyph = inner * 0.66;
  const offset = padding + (inner - glyph) / 2;
  const scale = glyph / 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect x="${padding}" y="${padding}" width="${inner}" height="${inner}" rx="${inner * 0.22}" fill="${GREEN}"/>
  <g transform="translate(${offset} ${offset + scale * 0.5}) scale(${scale})" fill="none" stroke="${CREAM}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">
    ${BOOK.map((d) => `<path d="${d}"/>`).join("")}
  </g>
</svg>`;
}

// Toolbar sizes fill most of the canvas; heavier strokes keep 16 px legible.
// The store icon uses 96 px artwork with 16 px transparent padding, as Chrome
// Web Store guidelines recommend.
const icons = [
  { file: "public/icon/16.png", svg: tile(16, 0, 2.4) },
  { file: "public/icon/32.png", svg: tile(32, 1, 2) },
  { file: "public/icon/48.png", svg: tile(48, 2, 1.8) },
  { file: "public/icon/128.png", svg: tile(128, 16, 1.9) },
];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const page = await browser.newPage({ deviceScaleFactor: 1 });
await mkdir("public/icon", { recursive: true });
for (const { file, svg } of icons) {
  const size = Number(/width="(\d+)"/.exec(svg)[1]);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg}</body></html>`,
  );
  await page.locator("svg").screenshot({ path: file, omitBackground: true });
  console.log("wrote", file);
}
await browser.close();
