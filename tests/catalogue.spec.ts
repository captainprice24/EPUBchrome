import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

async function staticPage(page: Page) {
  await page.route("**/storage-fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Storage fixture</title>",
    }),
  );
  await page.goto("/storage-fixture");
}
async function seedLegacy(page: Page, version: 10 | 20 = 20) {
  // A static same-origin page leaves the reader unopened until the v2 fixture exists.
  await staticPage(page);
  const bytes = (await readFile("public/demo.epub")).toString("base64");
  await page.evaluate(
    async ({ base64, version }) => {
      const original = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const variant = new Uint8Array(original.length + 1);
      variant.set(original); // A permitted trailing byte gives the second source its own identity.
      const coverBytes = Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7eoAAAAASUVORK5CYII=",
        ),
        (c) => c.charCodeAt(0),
      );
      const chunks = (bytes: Uint8Array, type: string) => ({
        folioBinary: 1,
        chunks: [bytes.buffer],
        size: bytes.length,
        type,
      });
      const hash = async (bytes: Uint8Array) =>
        Array.from(
          new Uint8Array(
            await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer),
          ),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
      const hashes = [await hash(original), await hash(variant)];
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("folio-library", version);
        request.onupgradeneeded = () => {
          const db = request.result;
          const books = db.createObjectStore("books", { keyPath: "id" });
          for (const key of [
            "lastRead",
            "added",
            ...(version === 20 ? ["contentHash"] : []),
          ])
            books.createIndex(key, key);
          const marks = db.createObjectStore("marks", { keyPath: "id" });
          marks.createIndex("bookId", "bookId");
          marks.createIndex("kind", "kind");
          marks.createIndex("[bookId+chapter]", ["bookId", "chapter"]);
          const ocr = db.createObjectStore("ocr", { keyPath: "id" });
          ocr.createIndex("bookId", "bookId");
          ocr.createIndex("[bookId+chapter]", ["bookId", "chapter"]);
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(["books", "marks", "ocr"], "readwrite");
          for (const [i, id] of ["a-native", "b-chunks"].entries()) {
            const data = i ? variant : original;
            tx.objectStore("books").put({
              id,
              title: i ? "Legacy chunks" : "Legacy native",
              author: "Folio Studio",
              size: data.length,
              added: 1,
              lastRead: 2 - i,
              chapter: 1,
              chapterCount: 5,
              page: 1,
              position: 0,
              rendererVersion: 0,
              textOffset: 0,
              contentHash: hashes[i],
              format: "epub",
              fileName: id + ".epub",
              previewVersion: 1,
              blob: i
                ? chunks(data, "application/epub+zip")
                : new Blob([data], { type: "application/epub+zip" }),
              cover: i
                ? chunks(coverBytes, "image/png")
                : new Blob([coverBytes], { type: "image/png" }),
              prepared: i
                ? chunks(original, "application/epub+zip")
                : undefined,
              preparedVersion: i ? 1 : undefined,
            });
            tx.objectStore("marks").put({
              id: "mark-" + id,
              bookId: id,
              kind: "bookmark",
              chapter: 1,
              chapterTitle: "The shape of a place",
              text: "Saved legacy page",
              textOffset: 0,
              created: 1,
              page: 1,
              position: 0,
            });
          }
          tx.objectStore("ocr").put({
            id: "old-text",
            bookId: "a-native",
            chapter: 1,
            text: "Previously saved recognition text",
            confidence: 89,
            created: 1,
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      });
    },
    { base64: bytes, version },
  );
}
async function records(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any>((resolve, reject) => {
        const request = indexedDB.open("folio-library");
        request.onsuccess = () => {
          const db = request.result;
          const names = Array.from(db.objectStoreNames);
          const tx = db.transaction(names);
          const queries = names.map(
            (name) => [name, tx.objectStore(name).getAll()] as const,
          );
          tx.oncomplete = () => {
            resolve({
              version: db.version,
              ...Object.fromEntries(
                queries.map(([name, query]) => [
                  name,
                  query.result.map((row) => {
                    const result = { ...row };
                    for (const field of ["blob", "cover", "prepared"]) {
                      if (row[field] instanceof Blob)
                        result[field] = {
                          nativeBlob: true,
                          size: row[field].size,
                          type: row[field].type,
                        };
                    }
                    return result;
                  }),
                ]),
              ),
            });
            db.close();
          };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      }),
  );
}

test("v2 upgrade preserves native and chunk originals, prepared copies, notes and restorable backups", async ({
  page,
}) => {
  await seedLegacy(page);
  await page.goto("/reader.html");
  await expect(page.locator(".book-card")).toHaveCount(2);
  await expect(page.locator(".book-card .cover img")).toHaveCount(2);
  const data = await records(page);
  expect(data.version).toBe(30);
  expect(
    data.library.every(
      (row: object) => !["blob", "cover", "prepared"].some((key) => key in row),
    ),
  ).toBe(true);
  expect(data.files).toHaveLength(0); // No duplicate originals during upgrade.
  expect(data.books).toHaveLength(2);
  expect(data.books[0].blob.nativeBlob).toBe(true); // Full bytes checked in exported backup below.
  expect(data.books[1].prepared.folioBinary).toBe(1);
  expect(data.previews.every((row: any) => row.cover.folioBinary === 1)).toBe(
    true,
  );
  expect(data.marks.map((m: any) => m.id)).toEqual([
    "mark-a-native",
    "mark-b-chunks",
  ]);
  expect(data.ocr[0].text).toBe("Previously saved recognition text");
  await page.getByRole("button", { name: "Read Legacy native" }).click();
  await expect(
    page
      .frameLocator('iframe[title="Book chapter"]')
      .getByRole("heading", { name: "The shape of a place" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Bookmarked", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Open OCR" })).toHaveCount(0);
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("button", { name: "Storage & backup" }).click();
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Back up library", exact: true })
    .click();
  const backup = await event;
  execFileSync("python3", [
    "-c",
    `import zipfile,json,sys
z=zipfile.ZipFile(sys.argv[1]); m=json.loads(z.read('manifest.json')); original=open('public/demo.epub','rb').read()
assert {b['id'] for b in m['books']}=={'a-native','b-chunks'}
for b in m['books']: assert z.read(b['file'])==(original if b['id']=='a-native' else original+bytes([0]))
assert len(m['annotations'])==2 and m['ocr'][0]['text']=='Previously saved recognition text'
`,
    (await backup.path())!,
  ]);
  const buffer = await readFile((await backup.path())!);
  await page.getByRole("button", { name: "Close dialog" }).click();
  for (const title of ["Legacy native", "Legacy chunks"]) {
    await page.getByRole("button", { name: "Remove " + title }).click();
    await page
      .getByRole("button", { name: "Remove book", exact: true })
      .click();
  }
  await page.getByLabel("Restore library file").setInputFiles({
    name: "legacy.folio",
    mimeType: "application/zip",
    buffer,
  });
  await expect(page.locator(".toast[role=status]")).toContainText(
    "Restored 2 books",
  );
  const restored = await records(page);
  expect(restored.files).toHaveLength(2);
  expect(restored.books).toHaveLength(0);
  expect(restored.marks).toHaveLength(2);
  expect(restored.ocr[0].text).toBe("Previously saved recognition text");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("library refresh reads no originals and position saves never rewrite files", async ({
  page,
}) => {
  await seedLegacy(page);
  await page.goto("/reader.html");
  await expect(page.locator(".book-card")).toHaveCount(2);
  await page.addInitScript(() => {
    Reflect.set(window, "sourceReads", []);
    Reflect.set(window, "sourceWrites", []);
    for (const method of ["get", "getAll", "openCursor"] as const) {
      const original = IDBObjectStore.prototype[method];
      Reflect.set(
        IDBObjectStore.prototype,
        method,
        function (this: IDBObjectStore, ...args: any[]) {
          if (["books", "files"].includes(this.name))
            Reflect.get(window, "sourceReads").push({
              store: this.name,
              key: String(args[0]),
              method,
            });
          return Reflect.apply(original, this, args);
        },
      );
    }
    for (const method of ["add", "put"] as const) {
      const original = IDBObjectStore.prototype[method];
      Reflect.set(
        IDBObjectStore.prototype,
        method,
        function (this: IDBObjectStore, ...args: any[]) {
          if (["books", "files", "previews"].includes(this.name))
            Reflect.get(window, "sourceWrites").push(this.name);
          return Reflect.apply(original, this, args);
        },
      );
    }
  });
  await page.reload();
  await expect(page.locator(".book-card .cover img")).toHaveCount(2);
  expect(await page.evaluate(() => Reflect.get(window, "sourceReads"))).toEqual(
    [],
  );
  await page.getByRole("button", { name: "Read Legacy chunks" }).click();
  await expect(page.locator(".page-count")).toContainText("Page 1 of");
  await page.getByRole("button", { name: "Next chapter", exact: true }).click();
  await expect(
    page
      .frameLocator('iframe[title="Book chapter"]')
      .getByRole("heading", { name: "Notes from the margins" }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const counts = await page.evaluate(
        () =>
          new Promise<number[] | undefined>((resolve, reject) => {
            const request = indexedDB.open("folio-library");
            request.onsuccess = () => {
              const db = request.result;
              const tx = db.transaction("library");
              const row = tx.objectStore("library").get("b-chunks");
              tx.oncomplete = () => {
                db.close();
                resolve(row.result.pagination?.counts);
              };
              tx.onerror = () => reject(tx.error);
            };
          }),
      );
      return counts?.filter((n: number) => n > 0).length;
    })
    .toBe(5);
  await page.getByRole("button", { name: "Back to library" }).click();
  expect(
    await page.evaluate(() => Reflect.get(window, "sourceWrites")),
  ).toEqual([]);
  const reads = await page.evaluate(() => Reflect.get(window, "sourceReads"));
  expect(reads).toEqual([
    { store: "files", key: "b-chunks", method: "get" },
    { store: "books", key: "b-chunks", method: "get" },
  ]);
  expect(
    (await records(page)).library.find((row: any) => row.id === "b-chunks")
      .chapter,
  ).toBe(2);
});

test("failed migration rolls back every row and can retry without clearing the library", async ({
  page,
}) => {
  await seedLegacy(page);
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, ...args) {
      if (
        this.name === "library" &&
        value.id === "b-chunks" &&
        !localStorage.getItem("migration-retry")
      )
        throw new DOMException(
          "Injected migration quota failure",
          "QuotaExceededError",
        );
      return Reflect.apply(put, this, [value, ...args]);
    };
  });
  await page.goto("/reader.html");
  await expect(page.locator(".database-notice")).toContainText(
    "Existing records have not been cleared",
  );
  const failed = await records(page);
  expect(failed.version).toBe(20);
  expect(failed.library).toBeUndefined();
  expect(failed.books).toHaveLength(2);
  expect(failed.marks).toHaveLength(2);
  expect(failed.ocr).toHaveLength(1);
  await page.evaluate(() => localStorage.setItem("migration-retry", "1"));
  await page.getByRole("button", { name: "Reload Folio" }).click();
  await expect(page.locator(".book-card")).toHaveCount(2);
  expect((await records(page)).version).toBe(30);
});

test("blocked upgrades explain other tabs and complete after the old connection closes", async ({
  page,
  context,
}) => {
  await seedLegacy(page);
  const oldTab = await context.newPage();
  await staticPage(oldTab);
  await oldTab.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const request = indexedDB.open("folio-library", 20);
        request.onsuccess = () => {
          Reflect.set(window, "oldConnection", request.result);
          resolve();
        };
      }),
  );
  await page.goto("/reader.html");
  await expect(page.locator(".database-notice")).toContainText(
    "Close other Folio tabs",
  );
  await oldTab.evaluate(() => Reflect.get(window, "oldConnection").close());
  await expect(page.locator(".database-notice")).toHaveCount(0);
  await expect(page.locator(".book-card")).toHaveCount(2);
  // A newer reader closes this connection and asks for a reload, avoiding stale writes.
  await oldTab.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("folio-library", 40);
        request.onsuccess = () => {
          request.result.close();
          resolve();
        };
        request.onerror = () => reject(request.error);
      }),
  );
  await expect(page.locator(".database-notice")).toContainText(
    "updated in another tab",
  );
});

test("v1 libraries upgrade directly while keeping old originals and notes", async ({
  page,
}) => {
  await seedLegacy(page, 10);
  await page.goto("/reader.html");
  await expect(page.locator(".book-card")).toHaveCount(2);
  const data = await records(page);
  expect(data.version).toBe(30);
  expect(data.books).toHaveLength(2);
  expect(data.marks).toHaveLength(2);
  expect(data.ocr).toHaveLength(1);
  await page.getByRole("button", { name: "Read Legacy chunks" }).click();
  await expect(
    page
      .frameLocator('iframe[title="Book chapter"]')
      .getByRole("heading", { name: "The shape of a place" }),
  ).toBeVisible();
});

test("a long shelf loads nearby covers and releases offscreen image URLs", async ({
  page,
}) => {
  await seedLegacy(page);
  await page.goto("/reader.html");
  await expect(page.locator(".book-card")).toHaveCount(2);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("folio-library");
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(["library", "previews"], "readwrite");
          const metadata = tx.objectStore("library").get("a-native");
          const preview = tx.objectStore("previews").get("a-native");
          preview.onsuccess = () => {
            for (let i = 0; i < 64; i++) {
              const id = "shelf-" + i;
              tx.objectStore("library").add({
                ...metadata.result,
                id,
                title: "Shelf item " + i,
              });
              tx.objectStore("previews").add({
                id,
                cover: preview.result.cover,
              });
            }
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.addInitScript(() => {
    Reflect.set(window, "coverReads", []);
    Reflect.set(window, "activeCoverUrls", new Set<string>());
    Reflect.set(window, "releasedCoverUrls", 0);
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (...args) {
      if (this.name === "previews")
        Reflect.get(window, "coverReads").push(args[0]);
      return Reflect.apply(get, this, args);
    };
    const create = URL.createObjectURL,
      revoke = URL.revokeObjectURL;
    URL.createObjectURL = function (blob) {
      const url = create.call(this, blob);
      Reflect.get(window, "activeCoverUrls").add(url);
      return url;
    };
    URL.revokeObjectURL = function (url) {
      if (Reflect.get(window, "activeCoverUrls").delete(url))
        Reflect.set(
          window,
          "releasedCoverUrls",
          Reflect.get(window, "releasedCoverUrls") + 1,
        );
      return revoke.call(this, url);
    };
  });
  await page.reload();
  await expect(page.locator(".book-card")).toHaveCount(66);
  await expect(page.locator(".book-card .cover img").first()).toBeVisible();
  const initialReads: number = await page.evaluate(
    () => Reflect.get(window, "coverReads").length,
  );
  expect(initialReads).toBeGreaterThan(0);
  expect(initialReads).toBeLessThan(20);
  await page.locator(".book-card").last().scrollIntoViewIfNeeded();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "releasedCoverUrls")))
    .toBeGreaterThan(0);
  await expect(
    page.locator(".book-card").last().locator(".cover img"),
  ).toBeVisible();
  expect(
    await page.evaluate(() => Reflect.get(window, "activeCoverUrls").size),
  ).toBeLessThan(20);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("oversized legacy covers remain exportable without becoming library thumbnails", async ({
  page,
}) => {
  await seedLegacy(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("folio-library");
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("books", "readwrite");
          const store = tx.objectStore("books"),
            rowRequest = store.get("b-chunks");
          rowRequest.onsuccess = () => {
            const row = rowRequest.result;
            row.cover = new Blob(
              [...row.cover.chunks, new Uint8Array(2 * 1024 ** 2)],
              { type: "image/png" },
            );
            delete row.previewVersion;
            store.put(row);
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.goto("/reader.html");
  await expect(page.locator(".book-card .cover img")).toHaveCount(2);
  const data = await records(page);
  expect(
    data.library.find((row: any) => row.id === "b-chunks").archivedCover,
  ).toBe(true);
  expect(data.previews.every((row: any) => row.cover.size <= 1024 ** 2)).toBe(
    true,
  );
  await page.getByRole("button", { name: "Storage & backup" }).click();
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Back up library", exact: true })
    .click();
  const backup = await event;
  execFileSync("python3", [
    "-c",
    `import zipfile,json,sys
z=zipfile.ZipFile(sys.argv[1]); m=json.loads(z.read('manifest.json')); b=next(b for b in m['books'] if b['id']=='b-chunks')
cover=z.read(b['coverFile']); assert len(cover)>2*1024**2 and cover[-2*1024**2:]==bytes(2*1024**2)
`,
    (await backup.path())!,
  ]);
  const buffer = await readFile((await backup.path())!);
  await page.getByRole("button", { name: "Close dialog" }).click();
  for (const title of ["Legacy native", "Legacy chunks"]) {
    await page.getByRole("button", { name: "Remove " + title }).click();
    await page
      .getByRole("button", { name: "Remove book", exact: true })
      .click();
  }
  await page.getByLabel("Restore library file").setInputFiles({
    name: "large-cover.folio",
    mimeType: "application/zip",
    buffer,
  });
  await expect(page.locator(".toast[role=status]")).toContainText(
    "Restored 2 books",
  );
  await expect(page.locator(".book-card .cover img")).toHaveCount(2);
  const restored = await records(page);
  expect(restored.books).toHaveLength(1);
  expect(restored.books[0].blob).toBeUndefined();
  expect(restored.books[0].cover.size).toBeGreaterThan(2 * 1024 ** 2);
  expect(
    restored.previews.every((row: any) => row.cover.size <= 1024 ** 2),
  ).toBe(true);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
