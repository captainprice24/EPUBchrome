import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
const book = (page: Page) => page.frameLocator('iframe[title="Book chapter"]');
const fixture = (name: string) => path.resolve("test-results/fixtures/" + name);
test.beforeAll(async ({ browser }) => {
  execFileSync("python3", ["scripts/fixtures.py"]);
  const context = await browser.newContext(),
    page = await context.newPage();
  await page.setContent(
    "<html><head><title>The PDF Reading Guide</title><style>body{font:22px Arial}section+section{break-before:page}</style></head><body><section><h1>A local PDF page</h1><p>Select this private PDF passage.</p></section><section><h1>Second PDF page</h1><p>Your original pages stay unchanged.</p></section></body></html>",
  );
  await page.pdf({ path: fixture("reading.pdf"), format: "A5", outline: true });
  await context.close();
});
async function open(page: Page, file: string) {
  await page.goto("/reader.html");
  await page.getByLabel("Import document file").setInputFiles(file);
  await expect(page.locator(".page-count")).toContainText("Page 1 of");
}
async function select(page: Page, selector: string) {
  await book(page)
    .locator(selector)
    .first()
    .evaluate((el) => {
      const text = el.firstChild!;
      const range = document.createRange();
      range.setStart(text, 0);
      range.setEnd(text, Math.min(text.textContent?.length || 0, 20));
      document.getSelection()?.removeAllRanges();
      document.getSelection()?.addRange(range);
      document.dispatchEvent(new MouseEvent("mouseup"));
    });
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  await expect(book(page).locator("mark[data-folio]").first()).toHaveCount(1);
}
test("Markdown has chapters, safe GFM content, internal links, highlights and persistent settings", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("blocked.invalid")) requests.push(r.url());
  });
  await open(page, fixture("sample.md"));
  await expect(
    book(page).getByRole("heading", { name: "Field notes", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next chapter" }).click();
  await expect(
    book(page).getByRole("heading", { name: "First trail", exact: true }),
  ).toBeVisible();
  await expect(book(page).locator("table")).toContainText("Storage");
  await expect(book(page).locator("pre code")).toContainText("privateReading");
  await select(page, "p");
  await page.getByRole("button", { name: "Next chapter" }).click();
  await expect(
    book(page).getByRole("heading", { name: "Second trail", exact: true }),
  ).toBeVisible();
  await expect(book(page).locator("script")).toHaveCount(0);
  expect(
    await page.locator("body").getAttribute("data-compromised"),
  ).toBeNull();
  expect(requests).toEqual([]);
  await page.getByRole("button", { name: "Previous chapter" }).click();
  await expect(book(page).locator("mark[data-folio]").first()).toHaveCount(1);
  await book(page)
    .getByRole("link", { name: "second trail", exact: true })
    .click();
  await expect(
    book(page).getByRole("heading", { name: "Second trail", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Read Field notes" }).click();
  await expect(
    book(page).getByRole("heading", { name: "Second trail", exact: true }),
  ).toBeVisible();
});
test("MOBI and PalmDOC open locally with metadata, chapters and saved annotations; DRM is rejected", async ({
  page,
}) => {
  for (const name of [
    "sample.mobi",
    "palmdoc.mobi",
    "body-attributes.mobi",
    "images.mobi",
  ]) {
    await open(page, fixture(name));
    await expect(page.locator(".reader-book-title")).toContainText(
      "The Local Reading Guide",
    );
    await expect(
      book(page).getByRole("heading", { name: "A private beginning" }),
    ).toBeVisible();
    if (name === "images.mobi")
      await expect(book(page).locator("img")).toHaveJSProperty(
        "naturalWidth",
        8,
      );
    await page.getByRole("button", { name: "Bookmark", exact: true }).click();
    await select(page, "p");
    await page.getByRole("button", { name: "Next chapter" }).click();
    await expect(
      book(page).getByRole("heading", { name: "A second chapter" }),
    ).toBeVisible();
    if (name === "body-attributes.mobi")
      await expect(book(page).locator("body")).toContainText(
        "Final words stay intact!",
      );
    await page.getByRole("button", { name: "Previous chapter" }).click();
    await expect(book(page).locator("mark[data-folio]").first()).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Bookmarked", exact: true }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Back to library" }).click();
  await page
    .getByLabel("Import document file")
    .setInputFiles(fixture("protected.mobi"));
  await expect(page.getByRole("alert")).toContainText("DRM-protected");
  await page.getByLabel("Import document file").setInputFiles({
    name: "invalid.mobi",
    mimeType: "application/x-mobipocket-ebook",
    buffer: Buffer.from("not a book"),
  });
  await expect(page.getByRole("alert")).toContainText("not a supported MOBI");
});
test("PDF original page counts, selection, zoom, bookmarks, resume and lossless original download", async ({
  page,
}) => {
  await open(page, fixture("reading.pdf"));
  await expect(page.locator(".page-count")).toHaveText("Page 1 of 2");
  await expect(book(page).locator(".textLayer")).toContainText(
    "Select this private PDF passage.",
  );
  await expect(book(page).locator("img")).toHaveJSProperty("complete", true);
  await select(page, ".textLayer span");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Fit page 125%", exact: true }),
  ).toBeVisible();
  await expect(book(page).locator("mark[data-folio]").first()).toHaveCount(1);
  await page
    .getByRole("button", { name: "Fit page 125%", exact: true })
    .click();
  await page.getByRole("slider", { name: "Page in document" }).fill("2");
  await expect(page.locator(".page-count")).toHaveText("Page 2 of 2");
  await expect(book(page).locator(".textLayer")).toContainText(
    "Second PDF page",
  );
  await page.getByRole("button", { name: "Bookmark", exact: true }).click();
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Read The PDF Reading Guide" })
    .click();
  await expect(page.locator(".page-count")).toHaveText("Page 2 of 2");
  await expect(
    page.getByRole("button", { name: "Bookmarked", exact: true }),
  ).toBeVisible();
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download original PDF", exact: true })
    .click();
  const downloaded = await event;
  expect(await readFile((await downloaded.path())!)).toEqual(
    await readFile(fixture("reading.pdf")),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  const result = await new AxeBuilder({ page }).exclude("iframe").analyze();
  expect(
    result.violations
      .filter((v) => ["serious", "critical"].includes(v.impact || ""))
      .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
});
test("DjVu colour, JB2 monochrome and embedded text pages support zoom, bookmarks and resume", async ({
  page,
}) => {
  await open(page, path.resolve("tests/fixtures/reading.djvu"));
  await expect(page.locator(".page-count")).toHaveText("Page 1 of 3");
  await expect(book(page).locator(".djvu-text-layer")).toContainText(
    "LOCAL DJVU PAGE 1",
  );
  await select(page, ".djvu-text-layer span");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(book(page).locator("mark[data-folio]").first()).toHaveCount(1);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator(".page-count")).toHaveText("Page 2 of 3");
  await page.getByRole("button", { name: "Bookmark", exact: true }).click();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator(".page-count")).toHaveText("Page 3 of 3");
  await expect(book(page).locator("img")).toHaveJSProperty("complete", true);
  expect(
    await book(page)
      .locator("img")
      .evaluate((element) => {
        const img = element as HTMLImageElement;
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const x = c.getContext("2d")!;
        x.drawImage(img, 0, 0);
        const pixels = x.getImageData(0, 0, c.width, c.height).data;
        let dark = 0;
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i]! < 100) dark++;
        return dark;
      }),
  ).toBeGreaterThan(100);
  await page
    .getByRole("button", { name: "Previous page", exact: true })
    .click();
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Read reading", exact: false })
    .click();
  await expect(page.locator(".page-count")).toHaveText("Page 2 of 3");
  await expect(
    page.getByRole("button", { name: "Bookmarked", exact: true }),
  ).toBeVisible();
});
test("mixed-format backups preserve originals and can restore every reader", async ({
  page,
}) => {
  for (const file of [
    fixture("sample.md"),
    fixture("sample.mobi"),
    fixture("reading.pdf"),
    path.resolve("tests/fixtures/reading.djvu"),
  ]) {
    await open(page, file);
    await page.getByRole("button", { name: "Bookmark", exact: true }).click();
    await page.getByRole("button", { name: "Back to library" }).click();
  }
  await page.getByRole("button", { name: "Storage & backup" }).click();
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Back up library", exact: true })
    .click();
  const file = await event;
  const buffer = await readFile((await file.path())!);
  const manifest = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        'import zipfile,json,sys; z=zipfile.ZipFile(sys.argv[1]); print(z.read("manifest.json").decode())',
        (await file.path())!,
      ],
      { encoding: "utf8" },
    ),
  );
  expect(manifest.version).toBe(2);
  expect(
    manifest.books.map((b: { format: string }) => b.format).sort(),
  ).toEqual(["djvu", "md", "mobi", "pdf"]);
  expect(manifest.books.every((b: object) => !("prepared" in b))).toBe(true);
  await page.getByRole("button", { name: "Close dialog" }).click();
  for (let i = 0; i < 4; i++) {
    await page
      .locator(".book-card")
      .first()
      .getByRole("button", { name: /^Remove / })
      .click();
    await page
      .getByRole("button", { name: "Remove book", exact: true })
      .click();
  }
  await page.getByLabel("Restore library file").setInputFiles({
    name: "library.folio",
    mimeType: "application/zip",
    buffer,
  });
  await expect(page.locator(".book-card")).toHaveCount(4);
  for (const title of [
    "Field notes",
    "The Local Reading Guide",
    "The PDF Reading Guide",
    "reading",
  ]) {
    await page
      .getByRole("button", { name: `Read ${title} `, exact: false })
      .click();
    await expect(page.locator(".page-count")).toContainText("Page 1 of");
    await expect(
      page.getByRole("button", { name: "Bookmarked", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back to library" }).click();
  }
});
test("native fullscreen and keyboard exit preserve the reading passage and controls", async ({
  page,
}) => {
  await open(page, fixture("long.epub"));
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "Next page", exact: true }).click();
  await page
    .getByRole("button", { name: "Enter fullscreen", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await expect(page.locator(".app")).toHaveClass(/immersive/);
  await expect(page.locator(".reader-top")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Exit fullscreen", exact: true }),
  ).toBeVisible();
  await expect(book(page).locator("#folio-viewport")).toBeVisible();
  await page
    .getByRole("button", { name: "Exit fullscreen", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === null))
    .toBe(true);
  await expect(page.locator(".page-count")).toHaveText(/^Page 4 of/);
  await book(page).locator("#folio-viewport").focus();
  await book(page).locator("#folio-viewport").press("f");
  await expect(page.locator(".app")).toHaveClass(/immersive/);
  await book(page).locator("#folio-viewport").press("Escape");
  await expect(page.locator(".app")).not.toHaveClass(/immersive/);
});
test("fullscreen fallback fills the tab and Escape remains available inside the document", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(document, "fullscreenEnabled", { get: () => false }),
  );
  await open(page, fixture("sample.md"));
  await page
    .getByRole("button", { name: "Enter fullscreen", exact: true })
    .click();
  await expect(
    page.getByText("Distraction-free view", { exact: true }),
  ).toBeVisible();
  await book(page).locator("#folio-viewport").focus();
  await book(page).locator("#folio-viewport").press("Escape");
  await expect(page.locator(".app")).not.toHaveClass(/immersive/);
});

test("large DjVu takes the Blob-range decoder path and still renders original pages", async ({
  page,
}) => {
  const large = fixture("large.djvu");
  execFileSync("python3", [
    "-c",
    'import sys,struct,pathlib; src=pathlib.Path(sys.argv[1]).read_bytes(); size=64*1024**2; out=open(sys.argv[2],"wb"); out.write(src[:8]+struct.pack(">I",len(src)-12+8+size)+src[12:]); out.write(b"JUNK"+struct.pack(">I",size)); out.seek(size-1,1); out.write(bytes([0])); out.close()',
    path.resolve("tests/fixtures/reading.djvu"),
    large,
  ]);
  await open(page, large);
  await expect(page.locator(".page-count")).toHaveText("Page 1 of 3");
  await expect(
    book(page).getByRole("img", { name: "Page 1", exact: true }),
  ).toHaveJSProperty("complete", true);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator(".page-count")).toHaveText("Page 2 of 3");
  await expect(page.getByRole("button", { name: "Open OCR" })).toBeEnabled();
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByLabel("Import document file").setInputFiles({
    name: "broken.djvu",
    mimeType: "image/vnd.djvu",
    buffer: Buffer.from("not a DjVu"),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".book-card")).toHaveCount(1);
});
