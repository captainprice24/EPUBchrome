import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
const bookFrame = (page: Page) =>
  page.frameLocator('iframe[title="Book chapter"]');
async function sample(page: Page) {
  await page.goto("/reader.html");
  await page.getByRole("button", { name: "Open the sample" }).click();
  await expect(
    bookFrame(page).getByRole("heading", { name: "A slower beginning" }),
  ).toBeVisible();
  await expect(page.locator(".page-count")).toContainText("Page 1 of");
}
async function selectPassage(page: Page) {
  await bookFrame(page)
    .locator("p")
    .nth(1)
    .evaluate((el) => {
      const range = document.createRange();
      range.setStart(el.firstChild!, 0);
      range.setEnd(el.firstChild!, 42);
      document.getSelection()?.removeAllRanges();
      document.getSelection()?.addRange(range);
      document.dispatchEvent(new MouseEvent("mouseup"));
    });
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  await expect(
    bookFrame(page).locator("mark[data-folio]").first(),
  ).toBeVisible();
}
test("audit XHTML, linked CSS, imports and supplementary links preserve content and isolation", async ({
  page,
}) => {
  execFileSync("python3", ["scripts/fixtures.py"]);
  const external: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("blocked.invalid")) external.push(request.url());
  });
  await page.goto("/reader.html");
  await page
    .getByLabel("Import document file")
    .setInputFiles(path.resolve("test-results/fixtures/audit.epub"));
  const doc = bookFrame(page);
  await expect(
    doc.getByRole("heading", { name: "Empty title, visible chapter" }),
  ).toBeVisible();
  await expect(doc.locator("#pg12")).toHaveText("");
  await expect(doc.locator(".spacer")).toHaveText("");
  await expect(doc.locator("#after-spacer")).toHaveText("After the spacer.");
  await expect(doc.locator(".indent")).toHaveCSS("text-indent", "22px");
  await expect(doc.locator(".indent")).toHaveCSS("letter-spacing", "1px");
  await expect(doc.locator("[data-folio-body]")).toHaveClass("publisher");
  await expect(doc.locator("#folio-viewport")).not.toHaveCSS("display", "none");
  await expect(doc.locator("svg circle")).toHaveCount(1);
  await expect(doc.locator("math mi")).toHaveText("x");
  await doc.getByRole("link", { name: "Footnote one" }).click();
  await expect(doc.locator("#n1")).toBeVisible();
  await expect(page.locator(".chapter-location")).toContainText(
    "Supplementary content",
  );
  await page.getByRole("button", { name: "Back to text", exact: true }).click();
  await expect(doc.locator("#passage")).toBeVisible();
  await doc.getByRole("link", { name: "Extra material" }).click();
  await expect(doc.locator("#extra")).toBeVisible();
  expect(external).toEqual([]);
});
test("RTL pages advance, reflow and resume in logical reading order", async ({
  page,
}) => {
  execFileSync("python3", ["scripts/fixtures.py"]);
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto("/reader.html");
  await page
    .getByLabel("Import document file")
    .setInputFiles(path.resolve("test-results/fixtures/audit.epub"));
  await expect(page.locator(".page-count")).toContainText("Page 1 of");
  await page.getByRole("button", { name: "Next chapter" }).click();
  const doc = bookFrame(page);
  await expect(
    doc.getByRole("heading", { name: "Arabic chapter" }),
  ).toBeVisible();
  await expect(doc.locator("[data-folio-html]")).toHaveAttribute("lang", "ar");
  await expect(doc.locator("[data-folio-body]")).toHaveCSS("direction", "rtl");
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator(".page-count")).toContainText("Page 2 of");
  expect(
    await doc.locator("#folio-viewport").evaluate((el) => el.scrollLeft),
  ).toBeLessThan(-100);
  await doc.locator("#folio-viewport").focus();
  await doc.locator("#folio-viewport").press("ArrowLeft");
  await expect(page.locator(".page-count")).toContainText("Page 3 of");
  await page.locator(".reader-book-title").click();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".page-count")).toContainText("Page 4 of");
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("button", { name: "Read The Quiet Atlas" }).click();
  await expect(page.locator(".page-count")).toContainText("Page 4 of");
});
test("v0.2 highlights migrate by quote and ambiguous passages stay visible for review", async ({
  page,
}) => {
  await sample(page);
  await selectPassage(page);
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.evaluate(
    async () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("folio-library");
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction(["books", "marks"], "readwrite");
          const books = tx.objectStore("books"),
            marks = tx.objectStore("marks");
          const b = books.getAll();
          b.onsuccess = () => {
            const book = b.result[0];
            delete book.rendererVersion;
            delete book.locator;
            books.put(book);
            const m = marks.getAll();
            m.onsuccess = () => {
              const mark = m.result[0];
              delete mark.locator;
              marks.put(mark);
              marks.put({
                ...mark,
                id: "ambiguous",
                start: 999999,
                end: 1000000,
              });
              marks.put({
                ...mark,
                id: "unresolved",
                text: "This passage is absent from the book.",
                start: 999999,
                end: 1000000,
              });
            };
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
  await page.getByRole("button", { name: "Read The Quiet Atlas" }).click();
  await expect(bookFrame(page).locator("mark[data-folio]").first()).toHaveText(
    /There is a certain/,
  );
  if (await page.getByRole("button", { name: "Show navigation" }).count())
    await page.getByRole("button", { name: "Show navigation" }).click();
  await page.getByRole("tab", { name: "Highlights" }).click();
  await expect(page.locator(".reader-note")).toHaveCount(3);
  await expect(
    page.locator(".reader-note").filter({ hasText: "absent from the book" }),
  ).toContainText("Location needs review");
  await expect(
    bookFrame(page).locator('mark[data-folio="unresolved"]'),
  ).toHaveCount(0);
});
test("library backup restores original books, saved places and notes without duplicates", async ({
  page,
}) => {
  await sample(page);
  await selectPassage(page);
  await page.getByRole("button", { name: "Next chapter" }).click();
  await expect(
    bookFrame(page).getByRole("heading", { name: "The shape of a place" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Bookmark", exact: true }).click();
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("button", { name: "Storage & backup" }).click();
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Back up library", exact: true })
    .click();
  const file = await event,
    archive = (await file.path())!;
  expect(file.suggestedFilename()).toMatch(/\.folio$/);
  const check = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        'import sys,json,zipfile,hashlib; z=zipfile.ZipFile(sys.argv[1]); m=json.loads(z.read("manifest.json")); print(json.dumps({"books":len(m["books"]),"notes":len(m["annotations"]),"hash":hashlib.sha256(z.read(m["books"][0]["file"])).hexdigest()==m["books"][0]["contentHash"]}))',
        archive,
      ],
      { encoding: "utf8" },
    ),
  );
  expect(check).toEqual({ books: 1, notes: 2, hash: true });
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Remove The Quiet Atlas" }).click();
  await page.getByRole("button", { name: "Remove book", exact: true }).click();
  await page.getByLabel("Restore library file").setInputFiles({
    name: "backup.folio",
    mimeType: "application/zip",
    buffer: await readFile(archive),
  });
  await expect(
    page.getByRole("button", { name: "Read The Quiet Atlas" }),
  ).toHaveCount(1);
  await page.getByLabel("Restore library file").setInputFiles({
    name: "backup.folio",
    mimeType: "application/zip",
    buffer: await readFile(archive),
  });
  await expect(page.locator(".toast[role=status]")).toContainText(
    "Restored 0 books",
  );
  await expect(page.locator(".book-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Read The Quiet Atlas" }).click();
  await expect(
    bookFrame(page).getByRole("heading", { name: "The shape of a place" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Bookmarked", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Previous chapter" }).click();
  await expect(
    bookFrame(page).locator("mark[data-folio]").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to library" }).click();
  const corrupt = test.info().outputPath("corrupt.folio");
  execFileSync("python3", [
    "-c",
    'import sys,json,zipfile,pathlib; src=zipfile.ZipFile(sys.argv[1]); pathlib.Path(sys.argv[2]).parent.mkdir(parents=True,exist_ok=True); dst=zipfile.ZipFile(sys.argv[2],"w"); m=json.loads(src.read("manifest.json")); m["books"][0]["contentHash"]="0"*64; [dst.writestr(n, json.dumps(m) if n=="manifest.json" else src.read(n)) for n in src.namelist()]; dst.close()',
    archive,
    corrupt,
  ]);
  await page.getByLabel("Restore library file").setInputFiles(corrupt);
  await expect(page.getByRole("alert")).toContainText(
    "checksum does not match",
  );
  await expect(page.locator(".book-card")).toHaveCount(1);
});
test("exported notes can be merged back without replacing existing annotations", async ({
  page,
}) => {
  await sample(page);
  await selectPassage(page);
  await page.getByRole("button", { name: "Back to library" }).click();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export notes" }).click();
  const file = await event,
    data = await readFile((await file.path())!);
  await page
    .getByRole("navigation", { name: "Library" })
    .getByRole("button", { name: /Highlights/ })
    .click();
  await page.getByRole("button", { name: "Delete note" }).click();
  await expect(page.locator(".library-note")).toHaveCount(0);
  for (let i = 0; i < 2; i++) {
    await page.getByLabel("Restore library file").setInputFiles({
      name: "folio-notes.json",
      mimeType: "application/json",
      buffer: data,
    });
    await expect(page.locator(".library-note")).toHaveCount(1);
    await expect(page.locator(".toast[role=status]")).toContainText(
      "Restored 0 books",
    );
  }
});
test("duplicate imports, theme memory, focus and reader tabs behave predictably", async ({
  page,
}) => {
  await sample(page);
  await page.getByRole("button", { name: "Reading settings" }).click();
  await page.getByRole("button", { name: "Sepia", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await page.getByRole("button", { name: "Use light theme" }).click();
  await expect(page.locator(".app")).toHaveClass(/sepia/);
  await page.getByRole("tab", { name: "Contents" }).focus();
  await page.getByRole("tab", { name: "Contents" }).press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Saved" })).toBeFocused();
  await expect(page.getByRole("tabpanel")).toHaveAttribute(
    "aria-labelledby",
    "reader-tab-bookmarks",
  );
  await page.getByRole("button", { name: "Back to library" }).click();
  await expect(page.locator(".welcome")).toHaveCount(0);
  await page.getByRole("button", { name: "Open the sample" }).click();
  await expect(page.locator(".toast[role=status]")).toContainText(
    "already in your library",
  );
  await page.getByRole("button", { name: "Back to library" }).click();
  await expect(page.locator(".book-card")).toHaveCount(1);
  await expect(page.locator(".book-progress > span")).toHaveAttribute(
    "style",
    "width: 0%;",
  );
});
test("library, reader and settings have no serious or critical axe violations", async ({
  page,
}) => {
  await page.goto("/reader.html");
  const check = async () => {
    const result = await new AxeBuilder({ page }).exclude("iframe").analyze();
    expect(
      result.violations
        .filter((v) => ["serious", "critical"].includes(v.impact || ""))
        .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
  };
  await check();
  await sample(page);
  await check();
  await page.getByRole("button", { name: "Reading settings" }).click();
  await page.getByRole("button", { name: "Night", exact: true }).click();
  await check();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Back to library" }).click();
  await check();
});
