import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { readFile } from "node:fs/promises";
test("Pages subpath loads the reader, sample, persistent notes and extension download", async ({
  page,
}) => {
  const failures: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", (e) => failures.push(e.message));
  page.on("request", (r) => requests.push(r.url()));
  page.on("response", (r) => {
    if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
  });
  await page.goto("/EPUBchrome/");
  await expect(
    page.getByText("Folio web preview", { exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Get Chrome extension", exact: true })
    .click();
  const result = await download;
  expect(result.suggestedFilename()).toBe("folio-chrome.zip");
  expect(
    (await readFile((await result.path())!)).subarray(0, 2).toString(),
  ).toBe("PK");
  await page.getByRole("button", { name: "Open the sample" }).click();
  const frame = page.frameLocator('iframe[title="Book chapter"]');
  await expect(
    frame.getByRole("heading", { name: "A slower beginning" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Bookmark", exact: true }).click();
  await page.getByRole("button", { name: "Next chapter" }).click();
  await expect(
    frame.getByRole("heading", { name: "The shape of a place" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Read The Quiet Atlas" }).click();
  await expect(
    frame.getByRole("heading", { name: "The shape of a place" }),
  ).toBeVisible();
  expect(requests.some((url) => url.endsWith("/EPUBchrome/demo.epub"))).toBe(
    true,
  );
  expect(failures).toEqual([]);
});
test("web preview explains Drive limits and adapts to a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 650, height: 900 });
  await page.goto("/EPUBchrome/");
  await page.getByRole("button", { name: "Open from Drive" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Google Drive sign-in uses the Chrome extension",
  );
  await expect(
    page.getByRole("button", { name: "Connect & open" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/pages-mobile.png",
    fullPage: true,
  });
});

test("Pages PDF and DjVu find their local workers and WASM under the repository prefix", async ({
  page,
  context,
}) => {
  const creator = await context.newPage();
  await creator.setContent(
    "<html><head><title>Pages PDF</title><style>section+section{break-before:page}</style></head><body><section><h1>A private PDF</h1><p>Original document pages.</p></section><section><h1>A second page</h1></section></body></html>",
  );
  const pdf = await creator.pdf({ format: "A5" });
  await creator.close();
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => requests.push(r.url()));
  await page.goto("/EPUBchrome/");
  await page.getByLabel("Import document file").setInputFiles({
    name: "pages.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  const doc = page.frameLocator('iframe[title="Book chapter"]');
  await expect(doc.locator(".textLayer")).toContainText("A private PDF");
  await expect(page.locator(".page-count")).toHaveText("Page 1 of 2");
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(doc.locator(".textLayer")).toContainText("A second page");
  await page.getByRole("button", { name: "Back to library" }).click();
  await page
    .getByLabel("Import document file")
    .setInputFiles(path.resolve("tests/fixtures/reading.djvu"));
  await expect(page.locator(".page-count")).toHaveText("Page 1 of 3");
  await expect(doc.locator(".djvu-text-layer")).toContainText(
    "LOCAL DJVU PAGE 1",
  );
  expect(
    requests.some((url) =>
      url.endsWith("/EPUBchrome/documents/pdf/pdf.worker.min.js"),
    ),
  ).toBe(true);
  expect(
    requests.some((url) => url.includes("/EPUBchrome/assets/djvu-worker-")),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("Pages MOBI worker, Markdown navigation and fullscreen fallback use packaged assets", async ({
  page,
}) => {
  execFileSync("python3", ["scripts/fixtures.py"]);
  await page.addInitScript(() =>
    Object.defineProperty(document, "fullscreenEnabled", { get: () => false }),
  );
  await page.goto("/EPUBchrome/");
  await page
    .getByLabel("Import document file")
    .setInputFiles(path.resolve("test-results/fixtures/images.mobi"));
  const doc = page.frameLocator('iframe[title="Book chapter"]');
  await expect(
    doc.getByRole("heading", { name: "A private beginning" }),
  ).toBeVisible();
  await expect(doc.locator("img")).toHaveJSProperty("naturalWidth", 8);
  await page
    .getByRole("button", { name: "Enter fullscreen", exact: true })
    .click();
  await expect(
    page.getByText("Distraction-free view", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Exit fullscreen", exact: true })
    .click();
  await page.getByRole("button", { name: "Back to library" }).click();
  await page
    .getByLabel("Import document file")
    .setInputFiles(path.resolve("test-results/fixtures/sample.md"));
  await expect(
    doc.getByRole("heading", { name: "Field notes", exact: true }),
  ).toBeVisible();
});

test("Pages library categories, banner contrast and long document titles work on desktop and mobile", async ({
  page,
}) => {
  await page.goto("/EPUBchrome/");
  await expect(page.locator(".welcome")).toContainText(
    "Your private book library, built around EPUB",
  );
  await page.getByLabel("Import document file").setInputFiles({
    name: "reference.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(
      "# doc017852202610300959501234567890123456789012345678901234567890\n\nYour private reference notes.",
    ),
  });
  await expect(page.locator(".page-count")).toContainText("Page 1 of");
  await page.getByRole("button", { name: "Back to library" }).click();
  await expect(
    page.getByRole("heading", { name: "Your documents" }),
  ).toBeVisible();
  await expect(page.locator(".sample-card")).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(
      page.getByRole("button", { name: "Books", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Documents", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const banner = page.locator(".web-preview-banner");
    expect(await banner.evaluate((el) => getComputedStyle(el).color)).toBe(
      "rgb(242, 244, 230)",
    );
    const title = await page.locator(".book-title").boundingBox(),
      remove = await page.locator(".book-meta > .icon-btn").boundingBox();
    expect(title!.x + title!.width).toBeLessThanOrEqual(remove!.x);
    await page.screenshot({
      path: `test-results/pages-documents-${width}.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("button", { name: "Move to Books", exact: true })
    .click();
  await expect(page.locator(".book-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Books", exact: true }).click();
  await expect(page.locator(".book-card")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".book-card")).toHaveCount(1);
  const colors = await page
    .locator(".app")
    .evaluate((el) => [
      getComputedStyle(el).backgroundColor,
      getComputedStyle(el).color,
    ]);
  await page.locator(".book-open").click();
  await expect(page.locator(".page-count")).toContainText("Page 1 of");
  await page.getByRole("button", { name: "Reading settings" }).click();
  await page.getByRole("button", { name: "Sepia", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.frameLocator('iframe[title="Book chapter"]').locator("body"),
  ).toHaveCSS("background-color", "rgb(243, 231, 206)");
  expect(
    await page
      .locator(".app")
      .evaluate((el) => [
        getComputedStyle(el).backgroundColor,
        getComputedStyle(el).color,
      ]),
  ).toEqual(colors);
  await page.getByRole("button", { name: "Back to library" }).click();
  expect(
    await page
      .locator(".app")
      .evaluate((el) => [
        getComputedStyle(el).backgroundColor,
        getComputedStyle(el).color,
      ]),
  ).toEqual(colors);
});
