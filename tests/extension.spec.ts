import { test, expect, chromium, type BrowserContext } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const extension = path.resolve(".output/chrome-mv3");
let context: BrowserContext, profile: string;

test.beforeAll(async () => {
  profile = await mkdtemp(path.join(tmpdir(), "folio-extension-"));
  context = await chromium.launchPersistentContext(profile, {
    // Extensions need the full browser in its new headless mode.
    channel: "chromium",
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--no-sandbox",
    ],
  });
});
test.afterAll(async () => {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
});

const readerPages = () =>
  context.pages().filter((page) => page.url().endsWith("/reader.html"));

test("the installed extension opens after installation, reads books under its own policy and reuses its tab", async () => {
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  expect(worker.url()).toMatch(
    /^chrome-extension:\/\/[a-p]{32}\/background\.js$/,
  );
  const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
  expect(manifest.permissions).toEqual(["unlimitedStorage"]);
  expect(manifest.host_permissions).toBeUndefined();

  // A fresh installation shows the library without a click on the toolbar.
  await expect.poll(() => readerPages().length).toBe(1);
  const page = readerPages()[0]!;
  const blocked: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text()))
      blocked.push(message.text());
  });
  await expect(
    page.getByRole("heading", { name: /Your next chapter/ }),
  ).toBeVisible();

  // The packaged sample, its worker and the sandboxed book frame.
  await page.getByRole("button", { name: "Open the sample" }).click();
  const book = page.frameLocator('iframe[title="Book chapter"]');
  await expect(
    book.getByRole("heading", { name: "A slower beginning" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to library" }).click();

  // The DjVu decoder's WebAssembly loads from the extension origin.
  await page
    .getByLabel("Import document file")
    .setInputFiles(path.resolve("tests/fixtures/reading.djvu"));
  await expect(page.locator(".page-count")).toHaveText(/^Page 1 of \d+/);
  await expect(book.locator(".folio-native-page img")).toBeVisible();
  await page.getByRole("button", { name: "Back to library" }).click();

  // The PDF worker, fonts and image decoders load from the extension origin.
  const source = await context.newPage();
  await source.setContent("<h1>Extension PDF</h1><p>Selectable text.</p>");
  const pdf = test.info().outputPath("extension.pdf");
  await source.pdf({ path: pdf, format: "A5" });
  await source.close();
  await page.getByLabel("Import document file").setInputFiles(pdf);
  await expect(page.locator(".page-count")).toHaveText(/^Page 1 of \d+/);
  await expect(book.locator(".folio-native-page img")).toBeVisible();
  await expect(book.locator(".textLayer")).not.toBeEmpty();
  expect(blocked).toEqual([]);

  // The toolbar button focuses the open reader instead of adding a tab, and
  // opens one when none is left.
  const clickToolbar = () =>
    worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({});
      (
        chrome.action.onClicked as unknown as {
          dispatch: (tab: chrome.tabs.Tab) => void;
        }
      ).dispatch(tab!);
    });
  await clickToolbar();
  await page.waitForTimeout(500);
  expect(readerPages()).toHaveLength(1);
  await page.close();
  await clickToolbar();
  await expect.poll(() => readerPages().length).toBe(1);
  await expect(readerPages()[0]!.locator(".book-card").first()).toBeVisible();
});
