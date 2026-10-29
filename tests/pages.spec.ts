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
test("Pages OCR finds its packaged worker and model under the repository prefix", async ({
  page,
  context,
}) => {
  const image = await context.newPage();
  await image.setContent(
    '<div style="font:bold 42px Arial;display:inline-block;background:white;color:black;padding:20px">READING IS A JOY</div>',
  );
  await image
    .locator("div")
    .screenshot({ path: "test-results/pages-scan.png" });
  await image.close();
  execFileSync("python3", [
    "scripts/fixtures.py",
    "test-results/pages-scan.png",
  ]);
  await page.goto("/EPUBchrome/");
  await page
    .locator("input[type=file]")
    .setInputFiles(path.resolve("test-results/fixtures/scan.epub"));
  await expect(
    page
      .frameLocator('iframe[title="Book chapter"]')
      .getByRole("heading", { name: "A scanned page" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open OCR" }).click();
  await page
    .getByRole("button", { name: "Recognize text", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Recognized text" }),
  ).toHaveValue(/READING IS A JOY/, { timeout: 50000 });
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
