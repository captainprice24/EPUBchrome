import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
async function openLong(page: Page) {
  execFileSync("python3", ["scripts/fixtures.py"]);
  await page.setViewportSize({ width: 1200, height: 820 });
  await page.goto("/reader.html");
  await page
    .getByLabel("Import document file")
    .setInputFiles(path.resolve("test-results/fixtures/long.epub"));
  await expect(page.locator(".page-count")).toHaveText(/^Page 1 of \d+/);
  await expect
    .poll(async () =>
      Number(
        await page
          .getByRole("slider", { name: "Page in chapter" })
          .getAttribute("max"),
      ),
    )
    .toBeGreaterThan(5);
}
const currentPage = async (page: Page) =>
  Number(
    await page.getByRole("slider", { name: "Page in chapter" }).inputValue(),
  );
const count = async (page: Page) =>
  Number(
    await page
      .getByRole("slider", { name: "Page in chapter" })
      .getAttribute("max"),
  );
async function visibleParagraphs(page: Page) {
  return page
    .frameLocator('iframe[title="Book chapter"]')
    .locator("#folio-content p")
    .evaluateAll((nodes) => {
      const view = document
        .getElementById("folio-viewport")!
        .getBoundingClientRect();
      return nodes
        .filter((node) =>
          Array.from(node.getClientRects()).some(
            (r) =>
              r.width > 0 &&
              r.height > 0 &&
              r.right > view.left + 10 &&
              r.left < view.right - 10 &&
              r.bottom > view.top + 10 &&
              r.top < view.bottom - 10,
          ),
        )
        .map((n) => n.textContent);
    });
}
test("horizontal pages have chapter counts, move within the chapter and resume after reload", async ({
  page,
}) => {
  await openLong(page);
  const first = await visibleParagraphs(page);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator(".page-count")).toHaveText(/^Page 2 of/);
  expect(await visibleParagraphs(page)).not.toEqual(first);
  await expect(page.locator(".chapter-location")).toContainText(
    "Chapter 1 of 5",
  );
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator(".page-count")).toHaveText(/^Page 4 of/);
  await expect(page.locator(".toc-page-count")).toHaveCount(5);
  await expect
    .poll(async () => page.locator(".toc-page-count").allTextContents())
    .toEqual(expect.arrayContaining([expect.stringMatching(/\d+ pages?/)]));
  await expect(page.locator(".chapter-location")).toContainText("Book page");
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Read The Quiet Atlas" }).click();
  await expect(page.locator(".page-count")).toHaveText(/^Page 4 of/);
  await page.screenshot({
    path: "test-results/pagination-reader.png",
    fullPage: true,
  });
});
test("reading settings reflow pages while preserving the visible passage; vertical mode persists", async ({
  page,
}) => {
  await openLong(page);
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "Next page", exact: true }).click();
  const passage = (await visibleParagraphs(page))[0];
  const originalCount = await count(page);
  await page.getByRole("button", { name: "Reading settings" }).click();
  await page.getByRole("slider", { name: "Text size" }).focus();
  await page.getByRole("slider", { name: "Text size" }).press("End");
  await expect.poll(() => count(page)).toBeGreaterThan(originalCount);
  expect(await visibleParagraphs(page)).toContain(passage);
  await page.getByRole("button", { name: "Clean", exact: true }).click();
  await page.getByLabel("Line spacing").selectOption("2");
  await page.getByLabel("Reading margins").selectOption("wide");
  await page.getByRole("button", { name: "Sepia", exact: true }).click();
  await expect(
    page.frameLocator('iframe[title="Book chapter"]').locator("#folio-content"),
  ).toHaveCSS("font-size", "36px");
  await page
    .getByRole("button", { name: "Vertical reading", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const before = await currentPage(page);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect.poll(() => currentPage(page)).toBe(before + 1);
  await expect
    .poll(() =>
      page
        .frameLocator('iframe[title="Book chapter"]')
        .locator("#folio-viewport")
        .evaluate((e) => e.scrollTop),
    )
    .toBeGreaterThan(100);
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Read The Quiet Atlas" }).click();
  await page.getByRole("button", { name: "Reading settings" }).click();
  await expect(
    page.getByRole("button", { name: "Vertical reading", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Sepia", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("slider", { name: "Text size" })).toHaveValue(
    "36",
  );
});
test("multiple page bookmarks and keyboard navigation work across chapter boundaries", async ({
  page,
}) => {
  await openLong(page);
  await page.getByRole("button", { name: "Bookmark", exact: true }).click();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await page.getByRole("button", { name: "Bookmark", exact: true }).click();
  await page.getByRole("tab", { name: "Saved" }).click();
  await expect(page.locator(".reader-note")).toHaveCount(2);
  await page
    .locator(".reader-note")
    .getByRole("button", { name: /Page 1 ·/ })
    .click();
  await expect(page.locator(".page-count")).toHaveText(/^Page 1 of/);
  const view = page
    .frameLocator('iframe[title="Book chapter"]')
    .locator("#folio-viewport");
  await view.focus();
  await view.press("ArrowRight");
  await expect(page.locator(".page-count")).toHaveText(/^Page 2 of/);
  await view.press("End");
  const last = await count(page);
  await expect(page.locator(".page-count")).toHaveText(
    `Page ${last} of ${last}`,
  );
  await view.press("ArrowRight");
  await expect(page.locator(".chapter-location")).toContainText(
    "Chapter 2 of 5",
  );
  await expect(page.locator(".page-count")).toHaveText(/^Page 1 of/);
  await page
    .getByRole("button", { name: "Previous page", exact: true })
    .click();
  await expect(page.locator(".chapter-location")).toContainText(
    "Chapter 1 of 5",
  );
  await expect(page.locator(".page-count")).toHaveText(
    `Page ${last} of ${last}`,
  );
});
test("trackpad, horizontal swipe and viewport reflow keep the current passage readable", async ({
  page,
}) => {
  await openLong(page);
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "Next page", exact: true }).click();
  const viewport = page
    .frameLocator('iframe[title="Book chapter"]')
    .locator("#folio-viewport");
  await viewport.evaluate((el) => {
    for (let i = 0; i < 9; i++)
      el.dispatchEvent(
        new WheelEvent("wheel", { deltaY: 5, bubbles: true, cancelable: true }),
      );
  });
  await expect(page.locator(".page-count")).toHaveText(/^Page 5 of/);
  await viewport.evaluate((el) => {
    const start = new Touch({
      identifier: 1,
      target: el,
      clientX: 400,
      clientY: 200,
    });
    const end = new Touch({
      identifier: 1,
      target: el,
      clientX: 200,
      clientY: 205,
    });
    el.dispatchEvent(
      new TouchEvent("touchstart", { touches: [start], bubbles: true }),
    );
    el.dispatchEvent(
      new TouchEvent("touchend", {
        touches: [],
        changedTouches: [end],
        bubbles: true,
      }),
    );
  });
  await expect(page.locator(".page-count")).toHaveText(/^Page 6 of/);
  const passage = (await visibleParagraphs(page))[0];
  const original = await count(page);
  await page.setViewportSize({ width: 900, height: 700 });
  await expect.poll(() => count(page)).toBeGreaterThan(original);
  expect(await visibleParagraphs(page)).toContain(passage);
  await page.setViewportSize({ width: 1200, height: 1000 });
  const dismiss = page.getByRole("button", { name: "Dismiss notification" });
  if (await dismiss.count()) await dismiss.click();
  await page.getByRole("button", { name: "Reading settings" }).click();
  await page.screenshot({
    path: "test-results/reading-settings.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.setViewportSize({ width: 650, height: 900 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/pagination-mobile.png",
    fullPage: true,
  });
});
