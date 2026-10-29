import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
const fixture = (name: string) =>
  path.resolve("test-results/fixtures/" + name + ".epub");
test("sample reading, chapters, bookmarks, highlights, font and persistence", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/reader.html");
  await expect(
    page.getByRole("heading", { name: /Your next chapter/ }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/library.png", fullPage: true });
  await page.getByRole("button", { name: "Open the sample" }).click();
  const book = page.frameLocator('iframe[title="Book chapter"]');
  await expect(
    book.getByRole("heading", { name: "A slower beginning" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Bookmark", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Bookmarked", exact: true }),
  ).toBeVisible();
  await book
    .locator("p")
    .nth(1)
    .evaluate((el) => {
      const text = el.firstChild!;
      const r = document.createRange();
      r.setStart(text, 0);
      r.setEnd(text, 42);
      document.getSelection()?.removeAllRanges();
      document.getSelection()?.addRange(r);
      document.dispatchEvent(new MouseEvent("mouseup"));
    });
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  await expect(book.locator("mark[data-folio]").first()).toBeVisible();
  await expect(page.getByRole("tab", { name: "Highlights" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "Increase font size" }).click();
  await expect(book.locator("#folio-content")).toHaveCSS("font-size", "23px");
  await page.getByRole("button", { name: "Next chapter" }).click();
  await expect(
    book.getByRole("heading", { name: "The shape of a place" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Previous chapter" }).click();
  await expect(book.locator("mark[data-folio]").first()).toBeVisible();
  await page.screenshot({ path: "test-results/reader.png", fullPage: true });
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Read The Quiet Atlas" }).click();
  await expect(book.locator("mark[data-folio]").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Bookmarked", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to library" }).click();
  await page
    .getByRole("navigation", { name: "Library" })
    .getByRole("button", { name: /Highlights/ })
    .click();
  await expect(page.locator(".library-note")).toHaveCount(1);
  await expect(page.locator(".library-note")).toContainText(
    "There is a certain",
  );
  expect(errors).toEqual([]);
});
test("unsafe content is isolated and malformed imports leave library usable", async ({
  page,
}) => {
  execFileSync("python3", ["scripts/fixtures.py"]);
  await page.goto("/reader.html");
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("blocked.invalid")) requests.push(r.url());
  });
  await page.locator("input[type=file]").setInputFiles(fixture("unsafe"));
  const doc = page.frameLocator('iframe[title="Book chapter"]');
  await expect(
    doc.getByRole("heading", { name: "A slower beginning" }),
  ).toBeVisible();
  await expect(doc.locator("script,iframe,form")).toHaveCount(0);
  expect(
    await page.locator("body").getAttribute("data-compromised"),
  ).toBeNull();
  expect(requests).toEqual([]);
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.locator("input[type=file]").setInputFiles(fixture("missing"));
  await expect(page.getByRole("alert")).toContainText("Missing book resource");
  await expect(
    page.getByRole("button", { name: "Read The Quiet Atlas" }),
  ).toBeVisible();
});
test("local browser OCR recognizes a scan with packaged worker, WASM and model", async ({
  page,
  context,
}) => {
  const imagePage = await context.newPage();
  await imagePage.setContent(
    '<html><body style="margin:0;padding:30px;background:white"><div style="font:bold 42px Arial;color:black;display:inline-block">READING IS A JOY</div></body></html>',
  );
  await imagePage.locator("div").screenshot({ path: "test-results/scan.png" });
  await imagePage.close();
  execFileSync("python3", ["scripts/fixtures.py", "test-results/scan.png"]);
  await page.goto("/reader.html");
  await page.locator("input[type=file]").setInputFiles(fixture("scan"));
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
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save text" }).click();
  expect((await download).suggestedFilename()).toBe("recognized-text.txt");
});
test("print layout includes all chapters; library search and removal work", async ({
  page,
}) => {
  await page.goto("/reader.html");
  await page.getByRole("button", { name: "Open the sample" }).click();
  await expect(
    page
      .frameLocator('iframe[title="Book chapter"]')
      .getByRole("heading", { name: "A slower beginning" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Print or save as PDF" }).click();
  await page.getByRole("radio", { name: /Whole book/ }).check();
  await page.getByRole("button", { name: "Open print dialog" }).click();
  const layout = page.frameLocator('iframe[title="Print layout"]');
  await expect(
    layout.getByRole("heading", { name: "What we carry forward" }),
  ).toBeVisible();
  const pdf = await page.pdf();
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  await page.getByRole("button", { name: "Back to library" }).click();
  await page
    .getByRole("textbox", { name: "Search library" })
    .fill("missing title");
  await expect(
    page.getByRole("heading", { name: "No books found" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Search library" }).fill("");
  await page.getByRole("button", { name: "Remove The Quiet Atlas" }).click();
  await page.getByRole("button", { name: "Remove book", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Read The Quiet Atlas" }),
  ).toHaveCount(0);
});
test("Drive entry explains unavailable sign-in in browser preview; layout fits a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 650, height: 900 });
  await page.goto("/reader.html");
  await page.getByRole("button", { name: "Open from Drive" }).click();
  await page
    .getByLabel("GOOGLE DRIVE FILE LINK")
    .fill("https://drive.google.com/file/d/12345678901234567890/view");
  await page.getByRole("button", { name: "Connect & open" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "installed Chrome extension",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("archive size metadata and traversal paths are rejected before extraction", async ({
  page,
}) => {
  execFileSync("python3", ["scripts/fixtures.py"]);
  await page.goto("/reader.html");
  await page.locator("input[type=file]").setInputFiles(fixture("limits"));
  await expect(page.getByRole("alert")).toContainText("expanded book exceeds");
  await page.locator("input[type=file]").setInputFiles(fixture("traversal"));
  await expect(page.getByRole("alert")).toContainText(
    /Unsafe (archive path|filename)/,
  );
  await expect(
    page.getByRole("heading", { name: /Your next chapter/ }),
  ).toBeVisible();
});
test("reading position and exported notes survive reopening a book", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 650 });
  await page.goto("/reader.html");
  await page.getByRole("button", { name: "Open the sample" }).click();
  const book = page.frameLocator('iframe[title="Book chapter"]');
  await expect(
    book.getByRole("heading", { name: "A slower beginning" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reading settings" }).click();
  await page
    .getByRole("button", { name: "Vertical reading", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect
    .poll(() => book.locator("#folio-viewport").evaluate((el) => el.scrollTop))
    .toBeGreaterThan(200);
  await page.getByRole("button", { name: "Bookmark", exact: true }).click();
  // The persistence debounce is awaited through an observable DB-backed round trip.
  await expect
    .poll(async () =>
      page.evaluate(
        async () =>
          new Promise<number>((resolve, reject) => {
            const r = indexedDB.open("folio-library");
            r.onsuccess = () => {
              const d = r.result;
              const get = d.transaction("books").objectStore("books").getAll();
              get.onsuccess = () => {
                resolve(get.result[0]?.position || 0);
                d.close();
              };
              get.onerror = () => reject(get.error);
            };
            r.onerror = () => reject(r.error);
          }),
      ),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("button", { name: "Read The Quiet Atlas" }).click();
  await expect(
    book.getByRole("heading", { name: "A slower beginning" }),
  ).toBeVisible();
  await expect
    .poll(() => book.locator("#folio-viewport").evaluate((el) => el.scrollTop))
    .toBeGreaterThan(200);
  await page.getByRole("button", { name: "Back to library" }).click();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export notes" }).click();
  const exported = await event;
  expect(exported.suggestedFilename()).toBe("folio-notes.json");
  const fs = await import("node:fs/promises");
  const data = JSON.parse(await fs.readFile((await exported.path())!, "utf8"));
  expect(data.annotations[0].kind).toBe("bookmark");
  expect(data.books[0].title).toBe("The Quiet Atlas");
});
