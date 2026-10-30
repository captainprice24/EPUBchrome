import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const fixture = (name: string) => path.resolve("test-results/fixtures/" + name);
const frame = (page: Page) => page.frameLocator('iframe[title="Book chapter"]');

test.beforeAll(async ({ browser }) => {
  execFileSync("python3", ["scripts/fixtures.py"]);
  execFileSync("python3", [
    "-c",
    `
from zipfile import ZipFile
from pathlib import Path
with ZipFile('public/demo.epub') as src, ZipFile('test-results/fixtures/covered.epub','w') as out:
 for item in src.infolist():
  data=src.read(item)
  if item.filename.endswith('.opf'):
   data=data.replace(b'</manifest>',b'<item id="cover" href="cover.svg" media-type="image/svg+xml" properties="cover-image"/></manifest>')
  out.writestr(item,data)
 out.writestr('OEBPS/cover.svg','<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#284d3e"/></svg>')
`,
  ]);
  const page = await browser.newPage();
  await page.setContent(
    "<title>Local storage guide</title><style>section+section{break-before:page}body{font:20px Arial}</style><section><h1>Original page one</h1><p>Select this private PDF passage.</p></section><section><h1>Original page two</h1><p>Your original file stays unchanged.</p></section><section><h1>Original page three</h1></section>",
  );
  await page.pdf({ path: fixture("storage.pdf"), format: "A5" });
  await page.close();
});

async function rejectBlobs(page: Page) {
  await page.addInitScript(() => {
    // Reproduce WebKit's storage error at the IDB boundary. Typed byte data is
    // allowed, while every book Blob (including cover/cache) must be avoided.
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
}
async function savedRecords(page: Page) {
  return page.evaluate(
    () =>
      new Promise<
        Array<{
          format?: string;
          blob: { folioBinary?: number; size?: number };
          cover?: { folioBinary?: number };
          prepared?: { folioBinary?: number };
        }>
      >((resolve, reject) => {
        const request = indexedDB.open("folio-library");
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction("books"),
            rows = tx.objectStore("books").getAll();
          tx.oncomplete = () => {
            db.close();
            resolve(rows.result);
          };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      }),
  );
}

test("Blob-rejecting storage preserves PDF bytes, pages, saved notes and backup restore", async ({
  page,
}) => {
  await rejectBlobs(page);
  await page.goto("/reader.html");
  await page
    .getByLabel("Import document file")
    .setInputFiles(fixture("storage.pdf"));
  await expect(page.locator(".page-count")).toHaveText("Page 1 of 3");
  await expect(frame(page).locator(".textLayer")).toContainText(
    "Original page one",
  );
  await frame(page)
    .locator(".textLayer span")
    .filter({ hasText: "Select this" })
    .evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      document.getSelection()?.removeAllRanges();
      document.getSelection()?.addRange(r);
      document.dispatchEvent(new Event("selectionchange"));
    });
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator(".page-count")).toHaveText("Page 2 of 3");
  await page.getByRole("button", { name: "Bookmark", exact: true }).click();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download original PDF" }).click();
  const original = await event;
  expect(await readFile((await original.path())!)).toEqual(
    await readFile(fixture("storage.pdf")),
  );
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Read Local storage guide" }).click();
  await expect(page.locator(".page-count")).toHaveText("Page 2 of 3");
  await expect(
    page.getByRole("button", { name: "Bookmarked", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to library" }).click();
  const rows = await savedRecords(page);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.blob.folioBinary).toBe(1);
  await page.getByRole("button", { name: "Storage & backup" }).click();
  const backupEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Back up library", exact: true })
    .click();
  const backup = await backupEvent,
    buffer = await readFile((await backup.path())!);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Remove Local storage guide" })
    .click();
  await page.getByRole("button", { name: "Remove book", exact: true }).click();
  await expect(page.locator(".book-card")).toHaveCount(0);
  await page.getByLabel("Restore library file").setInputFiles({
    name: "backup.folio",
    mimeType: "application/zip",
    buffer,
  });
  await expect(page.locator(".toast[role=status]")).toContainText(
    "Restored 1 books",
  );
  await page.getByRole("button", { name: "Read Local storage guide" }).click();
  await expect(page.locator(".page-count")).toHaveText("Page 2 of 3");
  await expect(
    page.getByRole("button", { name: "Bookmarked", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Previous page", exact: true })
    .click();
  await expect(frame(page).locator("mark[data-folio]").first()).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("compatibility storage handles covers and prepared reading copies through updates and reloads", async ({
  page,
}) => {
  await rejectBlobs(page);
  await page.goto("/reader.html");
  await page
    .getByLabel("Import document file")
    .setInputFiles(fixture("covered.epub"));
  await expect(
    frame(page).getByRole("heading", { name: "A slower beginning" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Bookmark", exact: true }).click();
  await page.getByRole("button", { name: "Back to library" }).click();
  await expect(page.locator(".book-card .cover img")).toHaveJSProperty(
    "complete",
    true,
  );
  await page
    .getByLabel("Import document file")
    .setInputFiles(fixture("sample.md"));
  await expect(
    frame(page).getByRole("heading", { name: "Field notes", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next chapter" }).click();
  await expect(
    frame(page).getByRole("heading", { name: "First trail", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Bookmark", exact: true }).click();
  await page.getByRole("button", { name: "Back to library" }).click();
  await page
    .getByRole("button", { name: "Move to Books", exact: true })
    .click();
  await page.getByRole("button", { name: "Books", exact: true }).click();
  await page.reload();
  await expect(page.locator(".book-card")).toHaveCount(2);
  const rows = await savedRecords(page);
  expect(rows.every((row) => row.blob.folioBinary === 1)).toBe(true);
  expect(rows.find((row) => row.format === "epub")!.cover!.folioBinary).toBe(1);
  expect(rows.find((row) => row.format === "md")!.prepared!.folioBinary).toBe(
    1,
  );
  await page.getByRole("button", { name: "Read Field notes" }).click();
  await expect(
    frame(page).getByRole("heading", { name: "First trail", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Bookmarked", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("oversized compatibility imports fail clearly without replacing existing books", async ({
  page,
}) => {
  execFileSync("python3", [
    "-c",
    `
from zipfile import ZipFile, ZIP_STORED
with ZipFile('public/demo.epub') as src, ZipFile('test-results/fixtures/compatibility-limit.epub','w') as out:
 for item in src.infolist():out.writestr(item,src.read(item))
 with out.open('unused-padding.bin','w',force_zip64=True) as data:
  for _ in range(65):data.write(bytes(1024**2))
`,
  ]);
  await rejectBlobs(page);
  await page.goto("/reader.html");
  await page.getByRole("button", { name: "Open the sample" }).click();
  await expect(
    frame(page).getByRole("heading", { name: "A slower beginning" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Bookmark", exact: true }).click();
  await page.getByRole("button", { name: "Back to library" }).click();
  await page
    .getByLabel("Import document file")
    .setInputFiles(fixture("compatibility-limit.epub"));
  await expect(page.getByRole("alert")).toContainText(
    "compatibility storage, which supports up to 64 MB",
  );
  await expect(page.locator(".book-card")).toHaveCount(1);
  await expect(page.locator(".busy-banner")).toHaveCount(0);
  await page.getByRole("button", { name: "Read The Quiet Atlas" }).click();
  await expect(
    page.getByRole("button", { name: "Bookmarked", exact: true }),
  ).toBeVisible();
});
