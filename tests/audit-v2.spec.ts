import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { readFile } from "node:fs/promises";
const frame = (page: import("@playwright/test").Page) =>
  page.frameLocator('iframe[title="Book chapter"]');
const fixture = (name: string) =>
  path.resolve("test-results/fixtures/" + name + ".epub");
test.beforeAll(() =>
  execFileSync("python3", [
    "-c",
    `
from zipfile import ZipFile
from copy import copy
from pathlib import Path
import zlib,struct
Path('test-results/fixtures').mkdir(parents=True,exist_ok=True)
chapters={
 'cover': '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Cover</title></head><body><div><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" preserveAspectRatio="none" width="100%" height="100%"><image width="300" height="400" href="cover.png"/></svg></div></body></html>',
 'entities': '<html xmlns="http://www.w3.org/1999/xhtml"><head><title/><style>.gap{display:none}@import url(https://blocked.invalid/fonts.css);</style></head><body epub:type="bodymatter"><h1>Recovered text</h1><p>Non&nbsp;breaking &mdash; text <a id="anchor"/>after anchor.</p><div class="gap" title="1 > 0"/><p id="after-empty">After empty div.</p><p id="literal-xml"><![CDATA[Literal <fake/> stays text.]]></p><img/><img src=""/></body></html>',
 'malformed': '<html xmlns="http://www.w3.org/1999/xhtml"><head><title/><style>.gap{display:none}</style></head><body><h1>Recovered text</h1><p class=unquoted>Unknown &notanentity; then non&nbsp;breaking text <a id="anchor"/>after anchor.</p><div class="gap" title="1 > 0"/><p id="after-empty">After empty div.</p></body></html>',
 'decode': '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Bad image</title></head><body><h1>Visible text</h1><img src="invalid.png" alt="Illustration"/></body></html>',
 'font': '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Bad font</title><style>@font-face{font-family:BadFont;src:url(invalid.woff)}p{font-family:BadFont!important}</style></head><body><h1>Visible text</h1><p>Font fallback needs review.</p></body></html>',
 'lossy': '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Missing image</title></head><body><h1>Visible text</h1><img src="missing.png" alt="Expected illustration"/></body></html>',
 'repeated': '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Repeated text</title></head><body>'+(''.join('<section><p>'+('Identical context. '*40)+'</p><h2 class="repeated">A repeated heading</h2><p>'+('Identical ending. '*40)+'</p></section>' for _ in range(2)))+'</body></html>'
}
with ZipFile('public/demo.epub') as src:
 for name,chapter in chapters.items():
  with ZipFile('test-results/fixtures/audit-v2-'+name+'.epub','w') as dest:
   for item in src.infolist():
    data=src.read(item)
    if item.filename=='OEBPS/chapter0.xhtml':data=chapter.encode()
    dest.writestr(copy(item),data)
   if name=='decode':dest.writestr('OEBPS/invalid.png',b'Not a valid PNG')
   if name=='font':dest.writestr('OEBPS/invalid.woff',b'Not a valid font')
   if name=='cover':
    def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    png=bytes([137,80,78,71,13,10,26,10])+chunk(b'IHDR',struct.pack('>IIBBBBB',300,400,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((bytes([0])+bytes([221,68,34])*300)*400))+chunk(b'IEND',b'')
    dest.writestr('OEBPS/cover.png',png)
`,
  ]),
);

test("named entities, missing namespace and empty images keep text structure and print without remote requests", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("blocked.invalid")) external.push(r.url());
  });
  await page.goto("/reader.html");
  await page
    .getByLabel("Import document file")
    .setInputFiles(fixture("audit-v2-entities"));
  await expect(
    frame(page).getByRole("heading", { name: "Recovered text" }),
  ).toBeVisible();
  await expect(frame(page).locator("#anchor")).toHaveText("");
  await expect(frame(page).locator(".gap")).toHaveText("");
  await expect(frame(page).locator("#after-empty")).toBeVisible();
  await expect(frame(page).locator("body")).toContainText(
    "Non\u00a0breaking — text",
  );
  await expect(frame(page).locator("#literal-xml")).toHaveText(
    "Literal <fake/> stays text.",
  );
  await expect(frame(page).locator("fake")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Print or save as PDF", exact: true })
    .click();
  await page.getByText("Whole book", { exact: true }).click();
  await page
    .getByRole("button", { name: "Open print dialog", exact: true })
    .click();
  await expect(
    page
      .frameLocator('iframe[title="Print layout"]')
      .locator(".folio-print-chapter"),
  ).toHaveCount(5);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(external).toEqual([]);
});

for (const kind of ["lossy", "malformed", "decode", "font"])
  test(`${kind} print requires explicit review and keeps recovered text`, async ({
    page,
  }) => {
    await page.goto("/reader.html");
    await page
      .getByLabel("Import document file")
      .setInputFiles(fixture("audit-v2-" + kind));
    await expect(frame(page).locator("h1")).toBeVisible();
    if (kind === "malformed") {
      await expect(frame(page).locator("#anchor")).toHaveText("");
      await expect(frame(page).locator("#after-empty")).toBeVisible();
      await expect(frame(page).locator("body")).toContainText(
        "Unknown &notanentity;",
      );
    }
    await page
      .getByRole("button", { name: "Print or save as PDF", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Open print dialog", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Print anyway", exact: true }),
    ).toBeVisible();
    await expect(page.locator('iframe[title="Print layout"]')).toHaveCount(0);
    await expect(page.locator(".print-review")).toContainText(
      kind === "malformed" ? "formatting" : kind === "font" ? "font" : "image",
    );
    await page
      .getByRole("button", { name: "Print anyway", exact: true })
      .click();
    await expect(
      page.frameLocator('iframe[title="Print layout"]').locator("h1"),
    ).toHaveText(kind === "malformed" ? "Recovered text" : "Visible text");
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

test("a repeated-heading highlight paints the selected occurrence and survives reflow and reopening", async ({
  page,
}) => {
  await page.goto("/reader.html");
  await page
    .getByLabel("Import document file")
    .setInputFiles(fixture("audit-v2-repeated"));
  const f = frame(page);
  await expect(f.locator(".repeated")).toHaveCount(2);
  await f
    .locator(".repeated")
    .nth(1)
    .evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      const s = document.getSelection()!;
      s.removeAllRanges();
      s.addRange(r);
      document.dispatchEvent(new MouseEvent("mouseup"));
    });
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  await expect(
    f.locator(".repeated").nth(1).locator("mark[data-folio]"),
  ).toHaveText("A repeated heading");
  await expect(
    f.locator(".repeated").nth(0).locator("mark[data-folio]"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "A+ Increase font size" }).click();
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.reload();
  await page.locator(".book-open").click();
  await expect(
    f.locator(".repeated").nth(1).locator("mark[data-folio]"),
  ).toHaveText("A repeated heading");
  await expect(
    f.locator(".repeated").nth(0).locator("mark[data-folio]"),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("button", { name: "Storage & backup" }).click();
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Back up library", exact: true })
    .click();
  const backup = await event,
    buffer = await readFile((await backup.path())!);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Remove The Quiet Atlas" }).click();
  await page.getByRole("button", { name: "Remove book", exact: true }).click();
  await page.getByLabel("Restore library file").setInputFiles({
    name: "backup.folio",
    mimeType: "application/zip",
    buffer,
  });
  await expect(page.locator(".toast[role=status]")).toContainText(
    "Restored 1 books",
  );
  await page.locator(".book-open").click();
  await expect(
    f.locator(".repeated").nth(1).locator("mark[data-folio]"),
  ).toHaveText("A repeated heading");
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("folio-library");
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction("marks", "readwrite"),
            store = tx.objectStore("marks"),
            get = store.getAll();
          get.onsuccess = () => {
            for (const mark of get.result) {
              delete mark.locator.textHash;
              mark.locator.rendererVersion = 3;
              store.put(mark);
            }
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  await page.locator(".book-open").click();
  await expect(f.locator(".repeated mark[data-folio]")).toHaveCount(0);
  await page.getByRole("tab", { name: "Highlights", exact: true }).click();
  await expect(page.locator(".reader-note")).toContainText(
    "Location needs review",
  );
});

test("native documents use useful titles and describe DjVu raster printing truthfully", async ({
  page,
  browser,
}) => {
  const pdf = await browser.newPage();
  await pdf.setContent(
    "<title>Microsoft Word - internal.docx</title><h1>A reading handbook</h1>",
  );
  const file = path.resolve("test-results/fixtures/Reading handbook.pdf");
  await pdf.pdf({ path: file });
  await pdf.close();
  await page.goto("/reader.html");
  await page.getByLabel("Import document file").setInputFiles(file);
  await expect(page.locator(".page-count")).toContainText("Page 1 of");
  await page.getByRole("button", { name: "Back to library" }).click();
  await expect(
    page.getByRole("button", { name: /^Read Reading handbook/ }),
  ).toBeVisible();
  await page
    .getByLabel("Import document file")
    .setInputFiles(path.resolve("tests/fixtures/reading.djvu"));
  await expect(page.locator(".page-count")).toContainText("Page 1 of");
  await page
    .getByRole("button", { name: "Print or save as PDF", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "text will not be selectable",
  );
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download original DjVu", exact: true })
    .click();
  const original = await event;
  expect(await readFile((await original.path())!)).toEqual(
    await readFile("tests/fixtures/reading.djvu"),
  );
});

test("long contents titles keep page counts separate and notices avoid reading controls", async ({
  page,
}) => {
  execFileSync("python3", ["scripts/fixtures.py"]);
  execFileSync("python3", [
    "-c",
    `
from zipfile import ZipFile
from copy import copy
with ZipFile('test-results/fixtures/audit.epub') as src, ZipFile('test-results/fixtures/audit-v2-layout.epub','w') as out:
 for item in src.infolist():
  data=src.read(item)
  if item.filename.endswith('nav.xhtml'):data=data.replace(b'A slower beginning',('Long_filename_'*30).encode())
  out.writestr(copy(item),data)
`,
  ]);
  await page.goto("/reader.html");
  await page
    .getByLabel("Import document file")
    .setInputFiles(fixture("audit-v2-layout"));
  await expect(frame(page).locator("h1")).toBeVisible();
  const item = page
    .locator(".toc-item")
    .filter({ hasText: "Long_filename_" })
    .first();
  await expect(item.locator(".toc-page-count")).toBeVisible();
  const bounds = await item.evaluate((el) => {
    const title = el.children[1]!.getBoundingClientRect(),
      count = el.querySelector(".toc-page-count")!.getBoundingClientRect();
    return {
      titleRight: title.right,
      countLeft: count.left,
      wrap: getComputedStyle(el.children[1]!).overflowWrap,
    };
  });
  expect(bounds.titleRight).toBeLessThanOrEqual(bounds.countLeft);
  expect(bounds.wrap).toBe("anywhere");
  const toast = await page.locator(".toast").boundingBox(),
    header = await page.locator(".reader-top").boundingBox(),
    footer = await page.locator(".reader-footer").boundingBox();
  expect(toast).not.toBeNull();
  expect(toast!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
  expect(toast!.y + toast!.height).toBeLessThanOrEqual(footer!.y);
  await page
    .getByRole("button", { name: "Print or save as PDF", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("5 chapters");
  await expect(page.getByRole("dialog")).not.toContainText("8 chapters");
});

test("an image-only SVG page keeps a portrait image's aspect ratio", async ({
  page,
}) => {
  await page.goto("/reader.html");
  await page
    .getByLabel("Import document file")
    .setInputFiles(fixture("audit-v2-cover"));
  const svg = frame(page).locator("svg");
  await expect(svg).toBeVisible();
  const image = await svg.screenshot();
  const bounds = await page.evaluate(async (encoded) => {
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(
      new Blob([bytes], { type: "image/png" }),
    );
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width,
      right = -1,
      top = canvas.height,
      bottom = -1;
    for (let y = 0; y < canvas.height; y++)
      for (let x = 0; x < canvas.width; x++) {
        const i = 4 * (y * canvas.width + x);
        if (pixels[i]! > 200 && pixels[i + 1]! < 110 && pixels[i + 2]! < 80) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
    bitmap.close();
    return { width: right - left + 1, height: bottom - top + 1 };
  }, image.toString("base64"));
  expect(bounds.width).toBeGreaterThan(100);
  expect(bounds.height).toBeGreaterThan(100);
  expect(bounds.width / bounds.height).toBeCloseTo(0.75, 1);
});
