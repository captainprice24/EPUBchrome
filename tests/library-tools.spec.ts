import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const markdown = (name: string, text: string) => ({
  name,
  mimeType: "text/markdown",
  buffer: Buffer.from(text),
});
const book = (page: Page) => page.frameLocator('iframe[title="Book chapter"]');
async function openSample(page: Page) {
  await page.goto("/reader.html");
  await page.getByRole("button", { name: "Open the sample" }).click();
  await expect(page.locator(".page-count")).toHaveText(/^Page 1 of \d+/);
}
async function highlightParagraph(page: Page, index: number) {
  await book(page)
    .locator("#folio-content p")
    .nth(index)
    .click({ clickCount: 3 });
  await page
    .locator(".selection-bar")
    .getByRole("button", { name: "Highlight" })
    .click();
  await expect(page.locator(".selection-bar")).toHaveCount(0);
}

test("highlights are listed in reading order, dated, and export as Markdown", async ({
  page,
}) => {
  await openSample(page);
  // Paragraphs 2 and 4 repeat the same sentence; 3 differs. Save them out of
  // order: neither the time of saving nor a random identifier may decide.
  for (const index of [4, 2, 3]) await highlightParagraph(page, index);
  const notes = page.locator(".reader-note");
  await expect(notes).toHaveCount(3);
  await expect(notes.nth(0)).toContainText("This is a small atlas");
  await expect(notes.nth(1)).toContainText("There is a certain kind");
  await expect(notes.nth(2)).toContainText("This is a small atlas");
  await expect(notes.nth(0).locator(".note-meta")).toHaveText(/^Saved .*\d{4}/);

  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("button", { name: "Highlights" }).click();
  await expect(
    page.getByRole("button", { name: "Highlights" }),
  ).toHaveAttribute("aria-current", "page");
  const library = page.locator(".library-note");
  await expect(library).toHaveCount(3);
  await expect(library.nth(1)).toContainText("There is a certain kind");
  await expect(library.nth(0).locator(".note-eyebrow")).toContainText(
    "The Quiet Atlas · A slower beginning · Saved",
  );
  // Notes can be found by the title of their book.
  await page.getByLabel("Search library").fill("quiet atlas");
  await expect(library).toHaveCount(3);
  await page.getByLabel("Search library").fill("no such book");
  await expect(library).toHaveCount(0);
  await page.getByLabel("Search library").fill("");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Notes as Markdown" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("folio-notes.md");
  const text = await readFile((await file.path())!, "utf8");
  expect(text).toContain("## The Quiet Atlas");
  expect(text).toContain("### A slower beginning");
  const quotes = text.split("\n").filter((line) => line.startsWith("> "));
  expect(quotes.map((line) => line.slice(2, 12))).toEqual([
    "This is a ",
    "There is a",
    "This is a ",
  ]);
});

test("find steps through every match, backwards too, and across inline markup", async ({
  page,
}) => {
  await openSample(page);
  const find = page.getByLabel("Find in chapter");
  const status = page.locator(".find-status");
  // The sample repeats its paragraphs, so identify a match by its paragraph.
  const selected = () =>
    page.evaluate(() => {
      const doc = document.querySelector("iframe")!.contentDocument!;
      const node = doc.getSelection()!.getRangeAt(0).startContainer;
      return Array.from(doc.querySelectorAll("#folio-content p")).indexOf(
        node.parentElement!.closest("p")!,
      );
    });
  await find.fill("kettle");
  await find.press("Enter");
  await expect(status).toHaveText("1 of 2");
  const first = await selected();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(status).toHaveText("2 of 2");
  expect(await selected()).not.toBe(first);
  await find.press("Enter");
  await expect(status).toHaveText("1 of 2");
  expect(await selected()).toBe(first);
  await page.getByRole("button", { name: "Previous match" }).click();
  await expect(status).toHaveText("2 of 2");
  await find.press("Shift+Enter");
  await expect(status).toHaveText("1 of 2");
  await find.fill("no such words here");
  await find.press("Enter");
  await expect(status).toHaveText("No matches");
  await expect(
    page.getByRole("button", { name: "Previous match" }),
  ).toHaveCount(0);

  // A phrase that begins in plain text and ends inside emphasis.
  await page.getByRole("button", { name: "Back to library" }).click();
  await page
    .getByLabel("Import document file")
    .setInputFiles(
      markdown(
        "Markup.md",
        "# Markup\n\nThis is a **bold claim** about *nested*\nwords in one paragraph.\n",
      ),
    );
  await expect(book(page).locator("strong")).toHaveText("bold claim");
  await find.fill("a bold claim about nested words");
  await find.press("Enter");
  await expect(status).toHaveText("1 of 1");
  expect(
    await page.evaluate(() =>
      document
        .querySelector("iframe")!
        .contentDocument!.getSelection()!
        .toString()
        .replace(/\s+/g, " "),
    ),
  ).toBe("a bold claim about nested words");
});

test("several files import together with one summary; dialogs name documents correctly", async ({
  page,
}) => {
  await page.goto("/reader.html");
  await page
    .getByLabel("Import document file")
    .setInputFiles([
      markdown("First.md", "# First notes\n\nAlpha.\n"),
      markdown("Second.md", "# Second notes\n\nBeta.\n"),
      { name: "todo.txt", mimeType: "text/plain", buffer: Buffer.from("x") },
      markdown("First copy.md", "# First notes\n\nAlpha.\n"),
    ]);
  // A batch stays in the library and reports once.
  const alert = page.locator(".toast.error");
  await expect(alert).toContainText("Added 2 of 4 files to your library.");
  await expect(alert).toContainText("1 was already there.");
  await expect(alert).toContainText("todo.txt: Choose an EPUB");
  await expect(page.locator(".reader-top")).toHaveCount(0);
  await page.getByRole("button", { name: "Dismiss error" }).click();
  await page.getByRole("button", { name: "Documents" }).click();
  await expect(page.locator(".book-card")).toHaveCount(2);

  // Edit how an item is listed; its file is not touched.
  await page
    .getByRole("button", { name: "Edit details of Second notes" })
    .click();
  await page.getByLabel("Title").fill("Field notes");
  await page.getByLabel("Author").fill("R. Example");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(
    page.locator(".book-card", { hasText: "Field notes" }),
  ).toContainText("R. Example");
  await page
    .getByRole("combobox", { name: "Sort documents" })
    .selectOption("author");
  await page.reload();
  await page.getByRole("button", { name: "Documents" }).click();
  await expect(
    page.getByRole("combobox", { name: "Sort documents" }),
  ).toHaveValue("author");
  await expect(page.locator(".book-card").first()).toContainText("Field notes");

  await page.getByRole("button", { name: "Remove Field notes" }).click();
  const dialog = page.getByRole("dialog", { name: "Remove this document?" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Keep document" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Remove document" }).click();
  await expect(page.locator(".toast[role=status]")).toContainText(
    "Document removed from this browser.",
  );
  await expect(page.locator(".book-card")).toHaveCount(1);
});

test("backup reminders follow the library; the sample is recognized after a rename", async ({
  page,
}) => {
  await openSample(page);
  await page.getByRole("button", { name: "Back to library" }).click();
  const storage = page.getByRole("button", { name: /Storage & backup/ });
  await expect(storage).toContainText("No backup yet");
  await storage.click();
  const dialog = page.getByRole("dialog", { name: "Storage & backup" });
  await expect(dialog).toContainText("No full backup has been made");
  // New libraries have no recognition text from the removed OCR feature.
  await expect(dialog).not.toContainText("recognition text");
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Back up library" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.folio$/);
  await expect(dialog).toContainText("Last full backup:");
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator(".backup-reminder")).toHaveCount(0);

  await page
    .getByLabel("Import document file")
    .setInputFiles(markdown("Later.md", "# Later\n\nGamma.\n"));
  await page.getByRole("button", { name: "Back to library" }).click();
  await expect(storage).toContainText("1 new since your last backup");

  // The sample card stays hidden when the sample's own title changes.
  await page.getByRole("button", { name: "Books", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit details of The Quiet Atlas" })
    .click();
  await page.getByLabel("Title").fill("My renamed sample");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.locator(".book-card")).toContainText("My renamed sample");
  await expect(
    page.getByRole("button", { name: "Open the sample" }),
  ).toHaveCount(0);
});

test("the interface can match the page theme; wide windows can show two pages", async ({
  page,
}) => {
  execFileSync("python3", ["scripts/fixtures.py"]);
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 1440, height: 860 });
  await page.goto("/reader.html");
  await page
    .getByLabel("Import document file")
    .setInputFiles(path.resolve("test-results/fixtures/long.epub"));
  const slider = page.getByRole("slider", { name: "Page in chapter" });
  const pages = async () => Number(await slider.getAttribute("max"));
  await expect.poll(pages).toBeGreaterThan(5);
  const single = await pages();
  const app = page.locator(".app");

  await page.getByRole("button", { name: "Reading settings" }).click();
  await page.getByRole("button", { name: "Night" }).click();
  // By default the interface follows the device, not the page theme.
  await expect(app).not.toHaveClass(/night/);
  await page
    .getByLabel("Interface appearance")
    .selectOption({ label: "Match page theme" });
  await expect(app).toHaveClass(/night/);
  await page.getByRole("button", { name: "Sepia" }).click();
  await expect(app).not.toHaveClass(/night/);
  await page.getByLabel("Interface appearance").selectOption({ label: "Dark" });
  await expect(app).toHaveClass(/night/);

  await page
    .getByLabel("Pages in wide windows")
    .selectOption({ label: "Two pages" });
  await page.getByRole("button", { name: "Done" }).click();
  await expect.poll(pages).toBeLessThan(single);
  const spread = await pages();
  expect(spread).toBeGreaterThanOrEqual(Math.floor(single / 2) - 1);
  // Both columns of the first spread hold text, and a turn moves one spread.
  const columns = () =>
    book(page)
      .locator("#folio-content p")
      .evaluateAll((nodes) => {
        const width = document.documentElement.clientWidth;
        const lefts = nodes
          .flatMap((node) => Array.from(node.getClientRects()))
          .filter((r) => r.width > 0 && r.right > 0 && r.left < width)
          .map((r) => Math.round(r.left));
        return new Set(lefts.map((left) => (left < width / 2 ? "l" : "r")))
          .size;
      });
  expect(await columns()).toBe(2);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator(".page-count")).toHaveText(/^Page 2 of/);
  expect(await columns()).toBe(2);

  // Both choices persist; a narrow window falls back to one page.
  await page.reload();
  await expect(app).toHaveClass(/night/);
  await page.locator(".book-open").first().click();
  await expect.poll(pages).toBe(spread);
  await page.setViewportSize({ width: 900, height: 860 });
  await expect.poll(pages).toBeGreaterThan(spread);
});

test("on a touch screen, taps turn pages and hide or show the controls", async ({
  browser,
}) => {
  execFileSync("python3", ["scripts/fixtures.py"]);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    await page.goto("/reader.html");
    await page
      .getByLabel("Import document file")
      .setInputFiles(path.resolve("test-results/fixtures/long.epub"));
    await expect(page.locator(".page-count")).toHaveText(/^Page 1 of \d+/);
    const total = Number(
      (await page.locator(".page-count").innerText()).split(" of ")[1],
    );
    const app = page.locator(".app");
    const box = (await page
      .locator('iframe[title="Book chapter"]')
      .boundingBox())!;
    const tap = (share: number) =>
      page.touchscreen.tap(box.x + box.width * share, box.y + box.height * 0.5);

    // The sides turn pages and leave the controls alone.
    await tap(0.9);
    await expect(page.locator(".page-count")).toHaveText(/^Page 2 of/);
    await tap(0.9);
    await expect(page.locator(".page-count")).toHaveText(/^Page 3 of/);
    await tap(0.1);
    await expect(page.locator(".page-count")).toHaveText(/^Page 2 of/);
    await expect(app).not.toHaveClass(/chrome-hidden/);

    // The middle hides every control; the page then fills the screen.
    await tap(0.5);
    await expect(app).toHaveClass(/chrome-hidden/);
    await expect(page.locator(".reader-top")).toBeHidden();
    await expect(page.locator(".reader-footer")).toBeHidden();
    await expect(page.locator(".page-pill")).toBeVisible();
    await expect
      .poll(async () => {
        const full = await page
          .locator('iframe[title="Book chapter"]')
          .boundingBox();
        return Math.round(full!.height);
      })
      .toBe(844);
    // The taller page holds more text, so the chapter has fewer pages and
    // the same passage sits on an earlier one. The sides still turn pages.
    const pill = async () => {
      const [current, total] = (await page.locator(".page-pill").innerText())
        .split(" / ")
        .map(Number);
      return { current: current!, total: total! };
    };
    await expect.poll(async () => (await pill()).total).toBeLessThan(total);
    const hidden = await pill();
    expect(hidden.current).toBeLessThanOrEqual(2);
    await tap(0.9);
    await expect
      .poll(async () => (await pill()).current)
      .toBe(hidden.current + 1);
    await tap(0.5);
    await expect(app).not.toHaveClass(/chrome-hidden/);
    await expect(page.locator(".reader-top")).toBeVisible();
    await expect(page.locator(".page-count")).toHaveText(/^Page \d+ of/);

    // A mouse click is not a tap: it never hides the controls.
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect(app).not.toHaveClass(/chrome-hidden/);
  } finally {
    await context.close();
  }
});

test("a second tab follows imports and notes made in the first", async ({
  context,
}) => {
  const first = await context.newPage(),
    second = await context.newPage();
  await first.goto("/reader.html");
  await second.goto("/reader.html");
  const count = (name: string) =>
    second
      .locator(".library-sidebar nav button", { hasText: name })
      .locator("span");
  await expect(count("Books")).toHaveText("0");

  await openSample(first);
  await expect(count("Books")).toHaveText("1");
  await expect(second.locator(".book-card")).toContainText("The Quiet Atlas");

  await highlightParagraph(first, 2);
  await expect(count("Highlights")).toHaveText("1");
  await second.getByRole("button", { name: "Highlights" }).click();
  await expect(second.locator(".library-note")).toContainText(
    "This is a small atlas",
  );
});

test("the browser's Back button returns from a book to the library", async ({
  page,
}) => {
  await openSample(page);
  await page.getByRole("button", { name: "Next chapter" }).click();
  await expect(
    book(page).getByRole("heading", { name: "The shape of a place" }),
  ).toBeVisible();
  // The place is saved when the new chapter's pages are laid out.
  await expect(page.locator(".page-count")).toHaveText(/^Page 1 of \d+/);
  await page.goBack();
  await expect(page.locator(".book-card")).toContainText("The Quiet Atlas");
  await expect(page).toHaveURL(/reader\.html$/);
  // The place was saved before leaving.
  await expect(page.locator(".book-detail")).toContainText("Ch. 2");

  // The app's own button reuses that one history entry for the next book,
  // so entries do not pile up with every book opened.
  const entries = await page.evaluate(() => history.length);
  for (let i = 0; i < 2; i++) {
    await page.locator(".book-open").click();
    await expect(page.locator(".chapter-location")).toContainText("Chapter 2");
    await page.getByRole("button", { name: "Back to library" }).click();
    await expect(page.locator(".book-card")).toBeVisible();
  }
  expect(await page.evaluate(() => history.length)).toBe(entries);
  await page.locator(".book-open").click();
  await expect(page.locator(".chapter-location")).toContainText("Chapter 2");
  await page.goBack();
  await expect(page.locator(".book-card")).toBeVisible();
});
