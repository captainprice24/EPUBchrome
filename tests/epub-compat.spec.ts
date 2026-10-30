import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
const fixture = (name: string) => path.resolve("test-results/fixtures/" + name);

test.beforeAll(() => {
  execFileSync("python3", ["scripts/fixtures.py"]);
  execFileSync("python3", [
    "-c",
    `
from zipfile import ZipFile
from pathlib import Path
import xml.etree.ElementTree as etree
for kind in ['recoverable','unreadable','unsafe-spine']:
 with ZipFile('public/demo.epub') as src, ZipFile('test-results/fixtures/'+kind+'.epub','w') as out:
  for entry in src.infolist():
   data=src.read(entry)
   if entry.filename.endswith('.opf'):
    opf=etree.fromstring(data);ns={'p':'http://www.idpf.org/2007/opf','dc':'http://purl.org/dc/elements/1.1/'}
    spine=opf.find('p:spine',ns)
    if kind=='recoverable':
     opf.find('p:metadata/dc:title',ns).text=''
     spine.insert(0,etree.Element('{'+ns['p']+'}itemref',idref='nav'))
     spine.insert(0,etree.Element('{'+ns['p']+'}itemref',idref='cover'))
    elif kind=='unreadable':
     for child in list(spine):spine.remove(child)
     etree.SubElement(spine,'{'+ns['p']+'}itemref',idref='missing-chapter')
    else:
     opf.find('p:manifest/p:item[@id="c0"]',ns).set('href','https://blocked.invalid/chapter.xhtml')
    data=etree.tostring(opf)
   elif kind=='recoverable' and entry.filename=='OEBPS/nav.xhtml':
    data=b'<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title></title></head><body><nav epub:type="toc"><ol/></nav></body></html>'
   out.writestr(entry,data)
`,
  ]);
});

test("a dangling spine entry opens remaining chapters with a warning and keeps original bytes", async ({
  page,
}) => {
  await page.goto("/reader.html");
  await page
    .getByLabel("Import document file")
    .setInputFiles(fixture("recoverable.epub"));
  const frame = page.frameLocator('iframe[title="Book chapter"]');
  await expect(
    frame.getByRole("heading", { name: "A slower beginning" }),
  ).toBeVisible();
  await expect(page.locator(".reader-book-title strong")).toHaveText(
    "recoverable",
  );
  await expect(page.locator(".chapter-location")).toContainText(
    "Chapter 2 of 6",
  );
  await expect(page.locator(".document-warning summary")).toContainText(
    "missing reading-order entries",
  );
  await page.locator(".document-warning summary").click();
  await expect(page.locator(".document-warning")).toContainText(
    "1 reading-order entry is missing",
  );
  await expect(page.locator(".document-warning")).toContainText("“cover”");
  await page.getByRole("button", { name: "Bookmark", exact: true }).click();
  await page.getByRole("button", { name: "Next chapter" }).click();
  await expect(
    frame.getByRole("heading", { name: "The shape of a place" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Read recoverable" }).click();
  await expect(
    frame.getByRole("heading", { name: "The shape of a place" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Previous chapter" }).click();
  await expect(
    page.getByRole("button", { name: "Bookmarked", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".document-warning")).toBeVisible();
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("button", { name: "Storage & backup" }).click();
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Back up library", exact: true })
    .click();
  const download = await event;
  const original = execFileSync("python3", [
    "-c",
    'import zipfile,json,sys; z=zipfile.ZipFile(sys.argv[1]); m=json.loads(z.read("manifest.json")); sys.stdout.buffer.write(z.read(m["books"][0]["file"]))',
    (await download.path())!,
  ]);
  expect(original).toEqual(await readFile(fixture("recoverable.epub")));
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("no usable spine and external spine resources still fail without importing an incomplete shell", async ({
  page,
}) => {
  await page.goto("/reader.html");
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("blocked.invalid")) requests.push(request.url());
  });
  for (const [name, error] of [
    ["unreadable.epub", "no readable chapters"],
    ["unsafe-spine.epub", "External book resources are blocked"],
  ]) {
    await page.getByLabel("Import document file").setInputFiles(fixture(name!));
    await expect(page.getByRole("alert")).toContainText(error!);
    await expect(page.locator(".book-card")).toHaveCount(0);
  }
  expect(requests).toEqual([]);
});

for (const system of ["light", "dark"] as const) {
  test(`page themes leave library and reader controls unchanged with ${system} system appearance`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: system });
    await page.goto("/reader.html");
    const app = page.locator(".app");
    const appColors = await app.evaluate((el) => [
      getComputedStyle(el).backgroundColor,
      getComputedStyle(el).color,
    ]);
    const libraryColors = await page
      .locator(".library-sidebar")
      .evaluate((el) => [
        getComputedStyle(el).backgroundColor,
        getComputedStyle(el).color,
      ]);
    await page.getByRole("button", { name: "Open the sample" }).click();
    const frame = page.frameLocator('iframe[title="Book chapter"]');
    await expect(
      frame.getByRole("heading", { name: "A slower beginning" }),
    ).toBeVisible();
    const controls = page.locator(".reader-top");
    const controlColors = await controls.evaluate((el) => [
      getComputedStyle(el).backgroundColor,
      getComputedStyle(el).color,
    ]);
    for (const [name, color] of [
      ["Sepia", "rgb(243, 231, 206)"],
      ["Night", "rgb(36, 41, 35)"],
      ["Paper", "rgb(255, 253, 248)"],
      ["Sepia", "rgb(243, 231, 206)"],
    ]) {
      await page.getByRole("button", { name: "Reading settings" }).click();
      await page.getByRole("button", { name: name!, exact: true }).click();
      await page.getByRole("button", { name: "Done", exact: true }).click();
      await expect(frame.locator("body")).toHaveCSS("background-color", color!);
      expect(
        await app.evaluate((el) => [
          getComputedStyle(el).backgroundColor,
          getComputedStyle(el).color,
        ]),
      ).toEqual(appColors);
      expect(
        await controls.evaluate((el) => [
          getComputedStyle(el).backgroundColor,
          getComputedStyle(el).color,
        ]),
      ).toEqual(controlColors);
    }
    await page.screenshot({
      path: `test-results/sepia-pages-${system}-interface.png`,
    });
    const result = await new AxeBuilder({ page }).exclude("iframe").analyze();
    expect(
      result.violations
        .filter((v) => ["serious", "critical"].includes(v.impact || ""))
        .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
    await page.getByRole("button", { name: "Back to library" }).click();
    expect(
      await page
        .locator(".library-sidebar")
        .evaluate((el) => [
          getComputedStyle(el).backgroundColor,
          getComputedStyle(el).color,
        ]),
    ).toEqual(libraryColors);
    await page.reload();
    expect(
      await app.evaluate((el) => [
        getComputedStyle(el).backgroundColor,
        getComputedStyle(el).color,
      ]),
    ).toEqual(appColors);
    await page.getByRole("button", { name: "Read The Quiet Atlas" }).click();
    await expect(frame.locator("body")).toHaveCSS(
      "background-color",
      "rgb(243, 231, 206)",
    );
  });
}
