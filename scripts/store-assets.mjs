// Generates Chrome Web Store artwork in store/: five 1280x800 screenshots of
// the production extension build, the 440x280 small promo tile, the
// 1400x560 marquee and the 128x128 store icon.
// Usage: npm run build && npm run store:assets
// All books shown are original demo content created here; no third-party
// or personal files are used.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, copyFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ZipWriter, BlobWriter, TextReader, BlobReader } from "@zip.js/zip.js";

const OUT = "store";
const URL = "http://127.0.0.1:4173/reader.html";
const GREEN = "#294c3c",
  CREAM = "#f2f4e6";

const books = [
  {
    title: "The Patient Garden",
    author: "Mara Ellis",
    colors: ["#5d7a4f", "#eef0dc"],
    chapters: [
      [
        "Seeds and waiting",
        "Every garden begins with a promise that cannot be hurried. The seed keeps its own calendar, and the gardener learns to keep it too.",
      ],
      [
        "The weather in the soil",
        "Rain arrives twice: once from the sky, and again weeks later, in the green that answers it.",
      ],
      [
        "A season of small work",
        "Most of tending is ordinary: a stake straightened, a weed lifted, a path swept. The ordinary is where the garden lives.",
      ],
    ],
  },
  {
    title: "Letters from the Coast",
    author: "Tomas Rey",
    colors: ["#2f5d73", "#e6eef0"],
    chapters: [
      [
        "First letter",
        "The tide was out when I arrived, and the harbour looked like a room after a party, everything tilted and waiting.",
      ],
      [
        "On lighthouses",
        "A lighthouse does not chase ships. It stays where it is and tells the truth, every night, in the same few words.",
      ],
    ],
  },
  {
    title: "Small Hours",
    author: "Ines Varga",
    colors: ["#7a4e3a", "#f3e8dc"],
    chapters: [
      [
        "Before the city wakes",
        "At four in the morning the streets belong to bakers, cats and the occasional cyclist with somewhere important to be.",
      ],
      [
        "Lamps",
        "A lit window at night is a sentence in a language everyone understands: someone is here, and awake, and thinking.",
      ],
    ],
  },
];

function coverHtml(book) {
  const [bg, fg] = book.colors;
  return `<html><body style="margin:0"><div style="width:600px;height:900px;background:${bg};color:${fg};font-family:Georgia,serif;display:flex;flex-direction:column;justify-content:space-between;padding:70px 56px;box-sizing:border-box">
  <div style="font:15px Arial,sans-serif;letter-spacing:6px;opacity:.8">A NOVEL</div>
  <div><div style="font-size:72px;line-height:1.05">${book.title}</div>
  <div style="width:90px;height:3px;background:${fg};margin:36px 0;opacity:.7"></div>
  <div style="font-size:30px;font-style:italic">${book.author}</div></div>
  <div style="font:14px Arial,sans-serif;letter-spacing:5px;opacity:.7">FOLIO DEMO EDITION</div></div></body></html>`;
}

async function epub(book, cover) {
  const writer = new ZipWriter(new BlobWriter("application/epub+zip"));
  await writer.add("mimetype", new TextReader("application/epub+zip"), {
    level: 0,
  });
  await writer.add(
    "META-INF/container.xml",
    new TextReader(
      '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    ),
  );
  const items = book.chapters
    .map(
      (_, i) =>
        `<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/>`,
    )
    .join("");
  const spine = book.chapters
    .map((_, i) => `<itemref idref="c${i}"/>`)
    .join("");
  await writer.add(
    "OEBPS/book.opf",
    new TextReader(
      `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">folio-demo-${book.title}</dc:identifier><dc:title>${book.title}</dc:title><dc:creator>${book.author}</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/>${items}</manifest><spine>${spine}</spine></package>`,
    ),
  );
  const links = book.chapters
    .map(([t], i) => `<li><a href="c${i}.xhtml">${t}</a></li>`)
    .join("");
  await writer.add(
    "OEBPS/nav.xhtml",
    new TextReader(
      `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol>${links}</ol></nav></body></html>`,
    ),
  );
  await writer.add("OEBPS/cover.png", new BlobReader(new Blob([cover])));
  for (const [i, [title, text]] of book.chapters.entries())
    await writer.add(
      `OEBPS/c${i}.xhtml`,
      new TextReader(
        `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title></head><body><h1>${title}</h1>${`<p>${text}</p>`.repeat(6)}</body></html>`,
      ),
    );
  return Buffer.from(await (await writer.close()).arrayBuffer());
}

const pdfHtml = `<html><head><title>Field Notes for Slow Readers</title><style>body{font:15px/1.6 Georgia,serif;color:#222;margin:0}section{padding:60px 64px;break-after:page}h1{font-weight:normal;font-size:30px;margin:0 0 6px}h2{font-weight:normal;font-size:20px;margin:28px 0 6px}.k{font:12px Arial;letter-spacing:3px;color:#5b6b52}</style></head><body>
<section><div class="k">READING GUIDE</div><h1>Field Notes for Slow Readers</h1><p>A short companion for keeping a reading notebook: what to mark, what to skip, and how to come back to a book months later and still find your way.</p><h2>1. Read with a pencil</h2><p>Underline sparingly. A page with every line marked has no marks at all. Choose the sentence you would quote to a friend.</p><h2>2. Write the date</h2><p>Note where and when you read a chapter. Memory attaches itself to places more readily than to page numbers.</p></section>
<section><h2>3. Keep a list of questions</h2><p>Questions age better than answers. When you reread, start with the questions you left behind.</p><h2>4. Finish, or don't</h2><p>Not every book is for now. Leave a bookmark and a note about why you stopped; it may be exactly the book for next year.</p></section></body></html>`;

function tileHtml(width, height) {
  const big = width > 600;
  return `<html><body style="margin:0"><div style="width:${width}px;height:${height}px;background:${GREEN};color:${CREAM};display:flex;align-items:center;justify-content:center;gap:${big ? 48 : 22}px;font-family:Georgia,serif;box-sizing:border-box;overflow:hidden;position:relative">
  <svg width="${big ? 170 : 96}" height="${big ? 170 : 96}" viewBox="0 0 24 24" fill="none" stroke="${CREAM}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4z"/><path d="M13 7a3 3 0 0 1 3-3h5v15h-4a4 4 0 0 0-4 2"/></svg>
  <div><div style="font-size:${big ? 120 : 62}px;letter-spacing:-3px;line-height:1">folio<span style="color:#a0ad7f">.</span></div>
  <div style="font:${big ? 30 : 16}px/1.35 Arial,sans-serif;margin-top:${big ? 18 : 10}px;opacity:.92">Your private EPUB library.<br>No accounts. No ads. No fees.</div></div></div></body></html>`;
}

await mkdir(OUT, { recursive: true });
const work = await mkdtemp(path.join(tmpdir(), "folio-store-"));
const server = spawn(process.execPath, ["scripts/serve.mjs"], {
  stdio: "ignore",
});
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
try {
  const maker = await browser.newPage();
  const files = [];
  for (const book of books) {
    await maker.setViewportSize({ width: 600, height: 900 });
    await maker.setContent(coverHtml(book));
    const cover = await maker.screenshot();
    const file = path.join(work, `${book.title}.epub`);
    await writeFile(file, await epub(book, cover));
    files.push(file);
  }
  await maker.setContent(pdfHtml);
  const pdf = path.join(work, "Field Notes for Slow Readers.pdf");
  await maker.pdf({ path: pdf, format: "A5", outline: true });
  for (const [name, w, h] of [
    ["promo-small-440x280.png", 440, 280],
    ["promo-marquee-1400x560.png", 1400, 560],
  ]) {
    await maker.setViewportSize({ width: w, height: h });
    await maker.setContent(tileHtml(w, h));
    await maker.screenshot({ path: path.join(OUT, name) });
  }
  await copyFile("public/icon/128.png", path.join(OUT, "icon-128.png"));

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: "light",
  });
  const page = await context.newPage();
  for (let i = 0; i < 40; i++) {
    try {
      await page.goto(URL);
      break;
    } catch {
      await page.waitForTimeout(250);
    }
  }
  const settle = () =>
    page.waitForFunction(
      () =>
        /Page \d+ of \d+/.test(
          document.querySelector(".page-count")?.textContent || "",
        ) && !document.querySelector(".reader-loading"),
      null,
      { timeout: 60000 },
    );
  const back = async () => {
    await page.getByRole("button", { name: "Back to library" }).click();
    await page.waitForTimeout(300);
  };
  const dismissToasts = () =>
    page.evaluate(() =>
      document
        .querySelectorAll('.toast button[aria-label^="Dismiss"]')
        .forEach((b) => b.click()),
    );
  const importInput = page.locator('input[aria-label="Import document file"]');
  await page.getByRole("button", { name: "Open the sample" }).click();
  await settle();
  const frame = page.frameLocator('iframe[title="Book chapter"]');
  await frame
    .locator("p")
    .nth(2)
    .evaluate((p) => {
      const text = p.firstChild;
      const range = document.createRange();
      range.setStart(text, 0);
      range.setEnd(text, 74);
      document.getSelection().removeAllRanges();
      document.getSelection().addRange(range);
      document.dispatchEvent(new MouseEvent("mouseup"));
    });
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  await page.waitForTimeout(600);
  await dismissToasts();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, "screenshot-2-reader.png") });

  await page.getByRole("button", { name: "Reading settings" }).click();
  await page.getByRole("button", { name: "Sepia" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "screenshot-3-settings.png") });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Reading settings" }).click();
  await page.getByRole("button", { name: "Night" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Enter fullscreen" }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, "screenshot-4-night.png") });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page
    .getByRole("button", { name: "Exit fullscreen" })
    .click()
    .catch(() => {});
  await page.getByRole("button", { name: "Reading settings" }).click();
  await page.getByRole("button", { name: "Paper" }).click();
  await page.keyboard.press("Escape");
  await back();
  for (const file of [...files, pdf]) {
    await importInput.setInputFiles(file);
    await settle();
    await back();
  }
  await page
    .getByRole("button", { name: /^Books/ })
    .first()
    .click();
  await page.waitForTimeout(4000);
  await dismissToasts();
  await page.screenshot({ path: path.join(OUT, "screenshot-1-library.png") });

  await page
    .getByRole("button", { name: /Documents/ })
    .first()
    .click();
  await page.locator(".book-card button").first().click();
  await settle();
  await page.getByRole("tab", { name: /Contents/ }).click();
  await page.waitForTimeout(800);
  await dismissToasts();
  await page.screenshot({ path: path.join(OUT, "screenshot-5-pdf.png") });
  console.log("Store assets written to", OUT);
} finally {
  await browser.close();
  server.kill();
}
