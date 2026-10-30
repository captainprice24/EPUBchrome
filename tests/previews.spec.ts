import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
const fixture = (name: string) => path.resolve("test-results/fixtures/" + name);

test.beforeAll(async ({ browser }) => {
  execFileSync("python3", ["scripts/fixtures.py"]);
  execFileSync("python3", [
    "-c",
    `
from zipfile import ZipFile
with ZipFile('public/demo.epub') as src, ZipFile('test-results/fixtures/preview-cover.epub','w') as out:
 for item in src.infolist():
  data=src.read(item)
  if item.filename.endswith('.opf'):data=data.replace(b'</manifest>',b'<item id="cover" href="cover.svg" media-type="image/svg+xml" properties="cover-image"/></manifest>')
  out.writestr(item,data)
 out.writestr('OEBPS/cover.svg','<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#284d3e"/></svg>')
`,
  ]);
  const page = await browser.newPage();
  await page.setContent(
    "<title>First-page preview</title><style>@page{size:A5;margin:0}body{margin:0}section{height:210mm;break-after:page;background:#e02020}section+section{background:#2020e0}h1{margin:0;padding:30px;font:28px Arial;color:white}</style><section><h1>First page</h1></section><section><h1>Second page</h1></section>",
  );
  await page.pdf({ path: fixture("preview.pdf"), printBackground: true });
  await page.close();
});
async function open(page: Page, file: string) {
  await page.goto("/reader.html");
  await page.getByLabel("Import document file").setInputFiles(file);
  await expect(page.locator(".page-count")).toContainText("Page 1 of");
}
async function pixels(page: Page) {
  const image = page.locator(".book-card .cover img");
  await expect(image).toHaveJSProperty("complete", true);
  return image.evaluate((node) => {
    const img = node as HTMLImageElement,
      canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    for (let i = 0; i < data.length; i += 4)
      if (
        Math.min(data[i]!, data[i + 1]!, data[i + 2]!) < 190 &&
        data[i + 3]! > 100
      )
        ink++;
    return {
      width: canvas.width,
      height: canvas.height,
      ink,
      center: Array.from(
        ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data,
      ),
    };
  });
}

test("PDF and DjVu cards show actual first pages with uncropped cached images", async ({
  browser,
}) => {
  for (const file of [
    fixture("preview.pdf"),
    path.resolve("tests/fixtures/reading.djvu"),
  ]) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    try {
      await open(page, file);
      await page
        .getByRole("button", { name: "Next page", exact: true })
        .click();
      await expect(page.locator(".page-count")).toContainText("Page 2 of");
      await page.getByRole("button", { name: "Back to library" }).click();
      const sample = await pixels(page);
      expect(sample.ink).toBeGreaterThan(50);
      expect(sample.width).toBeLessThanOrEqual(384);
      expect(sample.height).toBeLessThanOrEqual(544);
      if (file.endsWith(".pdf")) {
        expect(sample.center[0]).toBeGreaterThan(200);
        expect(sample.center[2]).toBeLessThan(60);
      }
      await expect(page.locator(".cover img")).toHaveCSS(
        "object-fit",
        "contain",
      );
      for (const width of [1440, 1000, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        const privacy = page.locator(".privacy-statement");
        await expect(privacy).toBeVisible();
        await expect(privacy).toHaveText(
          "Your books, documents and notes stay in this browser.",
        );
        expect(
          await privacy.evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        if (width > 760) {
          const caption = page.locator(".sidebar-caption");
          expect(
            await caption.evaluate((el) => el.scrollWidth <= el.clientWidth),
          ).toBe(true);
        }
      }
      await page.reload();
      expect((await pixels(page)).ink).toBeGreaterThan(50);
      await page.screenshot({
        path: `test-results/${file.endsWith(".pdf") ? "pdf" : "djvu"}-preview-library.png`,
        fullPage: true,
      });
    } finally {
      await page.close();
    }
  }
});

test("embedded covers take priority and EPUB, MOBI and Markdown get local page previews", async ({
  browser,
}) => {
  for (const file of [
    fixture("preview-cover.epub"),
    path.resolve("public/demo.epub"),
    fixture("sample.mobi"),
    fixture("sample.md"),
  ]) {
    const page = await browser.newPage();
    const external: string[] = [];
    page.on("request", (request) => {
      if (
        !request.url().startsWith("http://127.0.0.1:") &&
        !request.url().startsWith("blob:") &&
        !request.url().startsWith("data:") &&
        request.url() !== "about:blank"
      )
        external.push(request.url());
    });
    try {
      await open(page, file);
      await page.getByRole("button", { name: "Back to library" }).click();
      const sample = await pixels(page);
      expect(sample.ink).toBeGreaterThan(50);
      if (file.endsWith("preview-cover.epub"))
        expect(sample.center.slice(0, 3)).toEqual([40, 77, 62]);
      await expect(
        page.locator('iframe[title="Generating local library preview"]'),
      ).toHaveCount(0);
      expect(external).toEqual([]);
    } finally {
      await page.close();
    }
  }
});

test("old documents gain previews under Blob-rejecting storage without changing bookmarks or originals", async ({
  page,
}) => {
  await page.addInitScript(() => {
    for (const method of ["add", "put"] as const) {
      const original = IDBObjectStore.prototype[method];
      IDBObjectStore.prototype[method] = function (
        value: Record<string, unknown>,
        key?: IDBValidKey,
      ) {
        if (
          this.name === "books" &&
          ["blob", "cover", "prepared"].some(
            (field) => value[field] instanceof Blob,
          )
        )
          throw new DOMException(
            "Error preparing Blob/File data to be stored in object store",
            "UnknownError",
          );
        return key === undefined
          ? original.call(this, value)
          : original.call(this, value, key);
      };
    }
  });
  await open(page, fixture("preview.pdf"));
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator(".page-count")).toContainText("Page 2 of");
  await page.getByRole("button", { name: "Bookmark", exact: true }).click();
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("folio-library");
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction("books", "readwrite"),
            store = tx.objectStore("books"),
            cursor = store.openCursor();
          cursor.onsuccess = () => {
            const row = cursor.result;
            if (row) {
              const value = row.value;
              delete value.cover;
              delete value.previewVersion;
              row.update(value);
              row.continue();
            }
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      }),
  );
  await page.reload();
  const sample = await pixels(page);
  expect(sample.center[0]).toBeGreaterThan(200);
  expect(sample.center[2]).toBeLessThan(60);
  await page.locator(".book-open").click();
  await expect(page.locator(".page-count")).toContainText("Page 2 of");
  await expect(
    page.getByRole("button", { name: "Bookmarked", exact: true }),
  ).toBeVisible();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download original PDF" }).click();
  const download = await event;
  expect(await readFile((await download.path())!)).toEqual(
    await readFile(fixture("preview.pdf")),
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
});
