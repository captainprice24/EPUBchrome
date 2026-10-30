import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
test.beforeAll(() => {
  execFileSync("python3", ["scripts/corpus.py"], { stdio: "pipe" });
});
async function open(page: Page, name: string) {
  await page.goto("/reader.html");
  await page
    .getByLabel("Import EPUB file")
    .setInputFiles(path.resolve(`test-results/corpus/${name}.epub`));
  await expect(page.locator(".page-count")).toContainText("Page 1 of");
  return page.frameLocator('iframe[title="Book chapter"]');
}
test("IDPF Waste Land applies linked and imported CSS and loads its embedded font", async ({
  page,
}) => {
  const doc = await open(page, "wasteland-woff");
  await expect(
    doc.getByRole("heading", { name: "The Waste Land", exact: true }),
  ).toBeVisible();
  await expect(doc.locator("[data-folio-body]")).toHaveCSS(
    "font-family",
    /OldStandard/,
  );
  expect(
    await doc
      .locator("body")
      .evaluate(() =>
        [...document.fonts].some(
          (font) =>
            font.family.includes("OldStandard") && font.status === "loaded",
        ),
      ),
  ).toBe(true);
  await expect(doc.locator(".indent").first()).toHaveCSS(
    "padding-left",
    "66px",
  );
  await expect(doc.locator('[lang="la"]').first()).toHaveCount(1);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
test("IDPF Japanese sample retains Unicode IDs and renders successive content documents", async ({
  page,
}) => {
  const doc = await open(page, "internallinks");
  await expect(doc.locator("[data-folio-html]")).toHaveAttribute("lang", "ja");
  for (let i = 0; i < 3; i++) {
    expect(
      (await doc.locator("[data-folio-body]").textContent())!.trim().length >
        10 || (await doc.locator("[data-folio-body] img").count()) > 0,
    ).toBe(true);
    await page.getByRole("button", { name: "Next chapter" }).click();
    await expect(page.locator(".chapter-location")).toContainText(
      `Chapter ${i + 2} of`,
    );
    await expect(page.locator(".page-count")).toContainText("Page 1 of");
    if (i === 0)
      expect(
        await doc
          .locator("[id]")
          .evaluateAll((nodes) =>
            nodes.some((node) => /[^\x00-\x7f]/.test(node.id)),
          ),
      ).toBe(true);
  }
  await expect(page.getByRole("alert")).toHaveCount(0);
});
test("IDPF Arabic sample keeps language, RTL direction and paginates its body", async ({
  page,
}) => {
  const doc = await open(page, "regime-anticancer-arabic");
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Next chapter" }).click();
    await expect(page.locator(".chapter-location")).toContainText(
      `Chapter ${i + 2} of`,
    );
    await expect(page.locator(".page-count")).toContainText("Page 1 of");
  }
  await expect(doc.locator("[data-folio-html]")).toHaveAttribute("lang", "ar");
  await expect(doc.locator("[data-folio-body]")).toHaveCSS("direction", "rtl");
  expect(
    (await doc.locator("p").first().textContent())!.trim().length,
  ).toBeGreaterThan(40);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator(".page-count")).toContainText("Page 2 of");
  expect(
    await doc.locator("#folio-viewport").evaluate((el) => el.scrollLeft),
  ).toBeLessThan(0);
});
