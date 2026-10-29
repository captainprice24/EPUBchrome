# EPUBchrome
tool for reading epubs in Chrome and exporting them to pdf.

# Folio · EPUBchrome

A local-first Chrome extension for reading DRM-free EPUBs. Built with TypeScript, React, WXT, zip.js, Dexie and Tesseract.js.

## What works

- Import local EPUBs with a file picker or drag and drop. The original file is never rewritten.
- EPUB 2 NCX and EPUB 3 navigation, spine-based chapter reading, publisher page lists when present, relative styles, images and embedded fonts.
- Persistent local library, chapter/scroll restoration, chapter bookmarks, text highlights, annotation navigation and JSON note export.
- Reader font sizing, dark theme, current-chapter text search and keyboard chapter navigation.
- Printed-English OCR on chapter images, entirely local with bundled workers, WASM and language data. OCR results are separate local records; recognized text can be downloaded.
- Current-chapter or full-book print layout. Choose **Save as PDF** in Chrome's print dialog. Original image resources are used; text remains text. Export stops rather than silently printing a chapter with missing images.
- Optional authenticated Google Drive EPUB download, streamed to temporary browser storage. Requires the OAuth setup below.

This is version 0.1, not a guarantee of perfect compatibility with every EPUB. An original sample book is included.

## Develop and build

Node 24 and npm are used in the prepared environment. Python 3 generates the sample EPUB. `curl` is needed only when the bundled language model must be downloaded on a fresh machine.

```sh
npm ci
npm run typecheck
npm run build
```

Load the generated `.output/chrome-mv3` directory using **Chrome → Extensions → Developer mode → Load unpacked**. Pin Folio and click its toolbar icon to open the reading room. Files from your PC or Mac can be selected in the app without granting broad access to `file://` URLs.

```sh
npm run dev
```

WXT's development mode starts its development browser. For a plain browser view of the production UI, run `node scripts/serve.mjs`; this mode does not provide Chrome extension APIs or Drive sign-in.

The current cloud Chromium has an administrator policy that blocks unpacked extensions. The browser tests therefore exercise the built reader using HTTP and an extension-equivalent script CSP. The real Chrome toolbar/OAuth integration still requires testing in Chrome that permits development extensions. The policy has not been bypassed.

## Google Drive setup

1. Create a Google Cloud project and enable the Google Drive API.
2. Configure an OAuth consent screen and test users. Create an OAuth client for a **Chrome extension**, associated with the stable installed extension ID.
3. Copy `.env.example` to `.env`, set `WXT_GOOGLE_CLIENT_ID` to the public client ID, and rebuild. Use a stable extension signing key/ID across OAuth testing and distribution; do not commit a private signing key.
4. Open Folio, choose **Open from Drive**, paste a Drive file link or ID, and sign in.

This implementation uses `chrome.identity.getAuthToken` and `drive.readonly` to download an arbitrary existing EPUB link. That scope is broader than per-file access and can require Google's verification before public distribution. Per-file `drive.file` with a compatible Picker flow is a future improvement. No Drive write access is requested. No OAuth client secret belongs in the extension. No credentials are included in this repository. Drive sign-in and downloads have not been verified against a live configured Google account in this cloud session.

## Validation

```sh
npm run build
npm test
```

Tests use Playwright and `/usr/bin/chromium`. Override `CHROMIUM_PATH` if your local Chromium is elsewhere. The suite starts/stops its own local test server. It verifies chapter navigation, persistence across reload, bookmarks/highlights, malicious-content isolation, malformed EPUB recovery, **browser** OCR with locally packaged assets, print-layout preparation, deletion, search, narrow-screen layout and the browser-preview Drive error path.

The test PDF byte check verifies Chromium can produce a PDF; it does not establish pixel-perfect export fidelity or accessibility conformance. Security tests cover representative malicious markup, not a complete security audit. No production handwriting, large-book performance or target-OS conformance claim is made.

## Limits and privacy

- The first version supports DRM-free EPUBs up to a **1 GB compressed input safety ceiling**, not a proven 1 GB performance guarantee. Limits: 30,000 ZIP entries, 2 GB declared expanded size, 64 MB per extracted entry and 128 MB loaded resource budget. Books with very large individual chapters may be rejected.
- Reading is chapter-based and scrollable. Reflowable EPUBs have no universal printed page count. Native fixed-layout viewport fidelity, advanced SVG/media, scripted content, nested CSS imports and every EPUB styling feature are not implemented.
- Full-book print is limited to 300 chapters and 16 MB assembled markup; decoded image memory can be much larger. Prefer individual chapters for image-heavy books. The source EPUB remains unchanged. This version does not embed highlights or OCR text layers in exported PDFs, guarantee font embedding rights, or produce certified PDF/A/PDF/UA.
- OCR currently supports printed English and images below 40 megapixels. Handwriting, automatic page-wide OCR, multilingual models and confidence correction workflows require further development. Do not rely on OCR without reviewing the output.
- Books, annotations and OCR records are in this browser's IndexedDB. Browser data removal, uninstalling the extension, profile changes or storage eviction can remove them. Use **Export notes** and keep original EPUB files. Notes export is a portable record; importing backups is not implemented yet.
- Book scripts, forms, frames and external resource URLs are blocked. Chapters render in a script-disabled sandbox with a restrictive resource CSP. No analytics or telemetry are included. Only Google Drive import connects to Google when requested. The bundled OCR model means recognition requires no remote service.
- The extension is not an operating system default file handler and does not remove DRM.

## Architecture and research

`src/epub.ts` handles bounded archive access, EPUB parsing and isolated resource rendering. `src/store.ts` stores the library and separate annotations. `src/annotations.ts` maps text ranges to chapter offsets; locators are specific to the unchanged imported book. `src/drive.ts` handles identity and downloads. `src/App.tsx` implements the library and reader.

[Preimplementation research](docs/RESEARCH.md) compares readers, rendering engines, OCR, conversion approaches, languages and REA. This version uses a small chapter renderer; it does not integrate Foliate.js or Readium yet. No Rust or backend service is required. REA remains an optional external research tool and is not shipped with the extension.

Generated OCR assets are copied during installation from pinned npm packages. The English model is downloaded from the documented upstream and checked against a pinned SHA-256 digest. See `THIRD_PARTY_NOTICES.md`.

To produce a portable ZIP of the unpacked extension:

```sh
npm run package
```

Unzip `.output/folio-0.1.0-chrome.zip`, then load the extracted folder as an unpacked extension. The ZIP is a development build, not a Chrome Web Store publication. See [validation details](docs/VALIDATION.md).
