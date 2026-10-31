import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

test.beforeAll(() => {
  execFileSync("python3", [
    "-c",
    `
from zipfile import ZipFile, ZIP_STORED
from pathlib import Path
Path('test-results/fixtures').mkdir(parents=True,exist_ok=True)
with ZipFile('public/demo.epub') as src, ZipFile('test-results/fixtures/large-reading.epub','w',compression=ZIP_STORED) as dest:
 for item in src.infolist(): dest.writestr(item,src.read(item))
 with dest.open('unused-padding.bin','w',force_zip64=True) as padding:
  for _ in range(41): padding.write(bytes(1024**2))
`,
  ]);
});

test("large EPUB chapters survive failing sliced Blob streams and arrayBuffer reads", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const slices = new WeakSet<Blob>();
    const slice = Blob.prototype.slice,
      stream = Blob.prototype.stream,
      arrayBuffer = Blob.prototype.arrayBuffer;
    Blob.prototype.slice = function (...args) {
      const part = slice.apply(this, args);
      slices.add(part);
      return part;
    };
    Blob.prototype.stream = function () {
      if (slices.has(this) && sessionStorage.getItem("fail-blob-reads"))
        return new ReadableStream({
          start(c) {
            c.error(
              new DOMException(
                "The object can not be found here.",
                "NotFoundError",
              ),
            );
          },
        });
      return stream.call(this);
    };
    Blob.prototype.arrayBuffer = function () {
      if (slices.has(this) && sessionStorage.getItem("fail-blob-reads"))
        return Promise.reject(
          new DOMException(
            "The object can not be found here.",
            "NotFoundError",
          ),
        );
      return arrayBuffer.call(this);
    };
    for (const method of ["add", "put"] as const) {
      const original = IDBObjectStore.prototype[method];
      IDBObjectStore.prototype[method] = function (
        value: Record<string, unknown>,
        key?: IDBValidKey,
      ) {
        if (
          sessionStorage.getItem("fail-blob-reads") &&
          this.name === "books" &&
          ["blob", "cover", "prepared"].some(
            (field) => value[field] instanceof Blob,
          )
        )
          throw new DOMException(
            "Error preparing Blob/File data to be stored in object store",
            "UnknownError",
          );
        return key === undefined
          ? original.call(this, value)
          : original.call(this, value, key);
      };
    }
  });
  await page.goto("/reader.html");
  await page
    .getByLabel("Import document file")
    .setInputFiles(path.resolve("test-results/fixtures/large-reading.epub"));
  const frame = page.frameLocator('iframe[title="Book chapter"]');
  await expect(
    frame.getByRole("heading", { name: "A slower beginning" }),
  ).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem("fail-blob-reads", "1"));
  await page.getByRole("button", { name: "Next chapter", exact: true }).click();
  await expect(
    frame.getByRole("heading", { name: "The shape of a place" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Bookmark", exact: true }).click();
  await page.getByRole("button", { name: "Back to library" }).click();
  await expect(page.locator(".book-card")).toHaveCount(1);
  await page.reload();
  await page.getByRole("button", { name: "Read The Quiet Atlas" }).click();
  await expect(
    frame.getByRole("heading", { name: "The shape of a place" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Bookmarked", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("button", { name: "Storage & backup" }).click();
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Back up library", exact: true })
    .click();
  const backup = await event;
  execFileSync("python3", [
    "-c",
    'import zipfile,json,sys; z=zipfile.ZipFile(sys.argv[1]); m=json.loads(z.read("manifest.json")); assert z.read(m["books"][0]["file"])==open(sys.argv[2],"rb").read()',
    (await backup.path())!,
    path.resolve("test-results/fixtures/large-reading.epub"),
  ]);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

for (const storage of ["native Blob", "byte chunks"] as const) {
  test(`unavailable ${storage} source preserves notes and has a safe recovery path`, async ({
    page,
  }) => {
    await page.addInitScript((byteStorage) => {
      const broken = (blob: Blob) =>
        blob.type === "application/x-folio-unavailable";
      const invalid = new WeakSet<Blob>();
      const bad = (blob: Blob) => broken(blob) || invalid.has(blob);
      const slice = Blob.prototype.slice,
        arrayBuffer = Blob.prototype.arrayBuffer,
        stream = Blob.prototype.stream;
      Blob.prototype.slice = function (...args) {
        const part = slice.apply(this, args);
        if (bad(this)) invalid.add(part);
        return part;
      };
      const failure = () =>
        new DOMException("The object can not be found here.", "NotFoundError");
      Blob.prototype.arrayBuffer = function () {
        return bad(this) ? Promise.reject(failure()) : arrayBuffer.call(this);
      };
      Blob.prototype.stream = function () {
        return bad(this)
          ? new ReadableStream({
              start(c) {
                c.error(failure());
              },
            })
          : stream.call(this);
      };
      const read = FileReader.prototype.readAsArrayBuffer;
      FileReader.prototype.readAsArrayBuffer = function (blob) {
        if (bad(blob)) throw failure();
        return read.call(this, blob);
      };
      if (byteStorage)
        for (const method of ["add", "put"] as const) {
          const original = IDBObjectStore.prototype[method];
          IDBObjectStore.prototype[method] = function (
            value: Record<string, unknown>,
            key?: IDBValidKey,
          ) {
            if (
              this.name === "books" &&
              ["blob", "cover", "prepared"].some(
                (f) => value[f] instanceof Blob,
              )
            )
              throw new DOMException(
                "Error preparing Blob/File data to be stored in object store",
                "UnknownError",
              );
            return key === undefined
              ? original.call(this, value)
              : original.call(this, value, key);
          };
        }
    }, storage === "byte chunks");
    if (storage === "native Blob")
      await page.setViewportSize({ width: 346, height: 844 });
    await page.goto("/reader.html");
    const source = path.resolve("test-results/fixtures/large-reading.epub");
    await page.getByLabel("Import document file").setInputFiles(source);
    const frame = page.frameLocator('iframe[title="Book chapter"]');
    await expect(
      frame.getByRole("heading", { name: "A slower beginning" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Next chapter", exact: true })
      .click();
    await expect(
      frame.getByRole("heading", { name: "The shape of a place" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Bookmark", exact: true }).click();
    await page.getByRole("button", { name: "Back to library" }).click();
    const bookId = await page.evaluate(
      () =>
        new Promise<string>((resolve, reject) => {
          const request = indexedDB.open("folio-library");
          request.onsuccess = () => {
            const db = request.result,
              tx = db.transaction("books", "readwrite"),
              store = tx.objectStore("books"),
              get = store.getAll();
            let id = "";
            get.onsuccess = () => {
              const value = get.result[0];
              id = value.id;
              if (value.blob instanceof Blob)
                value.blob = new Blob([value.blob], {
                  type: "application/x-folio-unavailable",
                });
              else value.blob.type = "application/x-folio-unavailable";
              store.put(value);
            };
            tx.oncomplete = () => {
              db.close();
              resolve(id);
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    await page.reload();
    await page.getByRole("button", { name: "Read The Quiet Atlas" }).click();
    if (storage === "native Blob") {
      await expect(page.getByRole("alert")).toContainText(
        "could not read the saved file",
      );
      await expect(page.locator(".page-count")).toHaveText(
        "Chapter unavailable",
      );
      await page
        .getByRole("button", { name: "Dismiss error", exact: true })
        .click();
      await expect(page.locator(".paper-wrap")).toContainText(
        "could not read the saved file",
      );
      const event = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Choose original file" }).click();
      await (await event).setFiles(source);
    }
    await expect(
      frame.getByRole("heading", { name: "The shape of a place" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Bookmarked", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back to library" }).click();
    await expect(page.locator(".book-card")).toHaveCount(1);
    if (storage === "native Blob") {
      await expect(page.locator(".search input")).toHaveCSS(
        "font-size",
        "16px",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    await page.getByRole("button", { name: "Storage & backup" }).click();
    const event = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Back up library", exact: true })
      .click();
    const backup = await event;
    execFileSync("python3", [
      "-c",
      'import zipfile,json,sys; z=zipfile.ZipFile(sys.argv[1]); m=json.loads(z.read("manifest.json")); assert m["books"][0]["id"]==sys.argv[3]; assert len(m["annotations"])==1; assert z.read(m["books"][0]["file"])==open(sys.argv[2],"rb").read()',
      (await backup.path())!,
      source,
      bookId,
    ]);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}
