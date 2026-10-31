# Contributing to Folio

Folio is an early TypeScript/React Chrome extension. Start with the [README](README.md), [current limits](docs/INSTALLATION.md#current-limits) and [validation coverage](docs/VALIDATION.md).

## Set up

Use Node.js 24.x, npm, Python 3 (`python3`). On Windows, use WSL for the development commands.

```sh
npm ci
npm run dev
```

Installation prepares pinned PDF/DjVu assets and the original sample. `public/documents`, `public/licenses`, `public/demo.epub`, dependencies and build output are generated and intentionally ignored by Git. OCR assets are no longer shipped; asset preparation removes stale copies. No additional private file is required to build the local reader.

## Commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Reproduce the lockfile and prepare local decoder/sample assets |
| `npm run dev` | Start WXT development mode |
| `npm run typecheck` | Generate WXT types and run strict TypeScript checks |
| `npm run build` | Build `.output/chrome-mv3` |
| `npm test` | Run the browser integration suite against the production build |
| `npm run build:pages` | Build the `/EPUBchrome/` web preview and its extension download |
| `npm run test:pages` | Test the preview, sample and document decoders under the GitHub Pages path |
| `npm run preview:pages` | Serve the built preview locally on port 4174 |
| `npm run package` | Build and create the portable extension ZIP |
| `npm run format` | Format TypeScript, React, styles and JavaScript helpers |

Run `npm run typecheck`, `npm run build` and `npm test` before submitting a code change. The test server serves the built files, so rebuild after changing source. The test suite manages its own server and browser processes.

## Browser tests

The prepared cloud machine has `/usr/bin/chromium`. On another machine, either set `CHROMIUM_PATH` to your installed Chromium/Chrome executable or install the Playwright-managed browser:

```sh
npx playwright install chromium
export CHROMIUM_PATH="$(node --input-type=module -e 'import { chromium } from "@playwright/test"; console.log(chromium.executablePath())')"
npm run build
npm test
```

On a Linux CI machine that needs system libraries, use `npx playwright install --with-deps chromium`. GitHub Actions performs this setup automatically. Generated screenshots and failure traces go to `test-results` and are not committed. The screenshots in `docs/images` are intentional documentation assets captured from the original sample book.

The cloud machine blocks unpacked extensions by administrator policy. HTTP-based tests exercise the built UI and packaged document decoders under the manifest’s script CSP; they do not establish extension-origin behavior, toolbar startup or real Google authentication. Test those separately in a Chrome profile that permits development extensions.

## Source map

| Path | Responsibility |
| --- | --- |
| `entrypoints/background.ts` | Toolbar action opens the reader tab |
| `entrypoints/reader` | React application entrypoint |
| `src/App.tsx`, `src/style.css` | Library, reader and interaction UI |
| `src/epub.ts` | Bounded ZIP access, EPUB parsing and sandboxed resource preparation |
| `src/documents.ts`, `document-types.ts` | Document factory, format detection and size limits |
| `src/reflow-document.ts`, `mobi-worker.ts` | Markdown/MOBI preparation with unchanged originals |
| `src/fixed-document.ts`, `djvu-worker.ts`, `fixed-reader.ts` | Local PDF/DjVu decoding, original-page reading and zoom |
| `src/useFullscreen.ts` | Browser fullscreen and distraction-free fallback |
| `src/reader.ts` | Pagination, text anchors, reading layout and bounded background chapter counting |
| `src/annotations.ts` | Text-offset selection and highlight restoration |
| `src/store.ts`, `src/binary-storage.ts` | Catalogue/file/preview stores, transactional legacy migration and Blob compatibility |
| `src/Cover.tsx` | Visible cover loading, URL cleanup and bounded preview cache |
| `tests/catalogue.spec.ts` | Migration, rollback, stale-tab behavior, file-read boundaries and legacy note retention |
| `src/drive.ts` | Google identity and streamed Drive import |
| `scripts` | Generated assets, sample EPUB, test fixtures, HTTP preview and packaging |
| `tests/app.spec.ts` | Browser integration coverage |
| `wxt.config.ts` | Chrome manifest, permissions, CSP and optional OAuth configuration |

For a plain browser inspection, build and run `node scripts/serve.mjs`, then open the server’s local port 4173 in your development browser. The installed extension does not require this server.

## Changes and reports

Keep original document bytes immutable. Store metadata, source files, previews and annotations separately; preserve previously saved recognition text. Do not remove size limits, weaken document isolation or bypass integrity checks to make a test pass. Describe unsupported content and failed operations clearly.

When reporting an issue, include the browser/OS, app revision, reproduction steps, expected behavior and redacted errors. Share only documents you have permission to distribute. Do not include OAuth tokens, private keys or personal library data.

The project has not selected a source-code license yet. Consult the repository owner before reusing or distributing its original code; dependency licenses are described in [third-party notices](THIRD_PARTY_NOTICES.md).

The asset preparation script applies a small, version-checked patch to the MIT MOBI parser. `scripts/patch-mobi.mjs` fixes section end bounds, body attributes/missing closing tags and optional EXTH metadata. Review and remove it when an upstream release supplies equivalent fixes; do not silently change the pinned parser or discard compatibility tests.
