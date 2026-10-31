# Version 0.4 validation

The production UI is exercised in Chromium using a local test server, with the same script/worker WASM CSP as the extension manifest. The environment administrator blocks unpacked extension loading, so toolbar startup, extension-origin permissions and real Google OAuth require a separate Chrome smoke test.

Automated coverage:

1. Sample EPUB import, EPUB 3 chapters, bookmark and highlight creation, font adjustment, chapter navigation and annotation persistence after reload.
2. Malicious EPUB script/frame/form removal, no external image request, and malformed-container recovery.
3. Browser worker OCR on a generated printed-English image using the packaged WASM core and language model, followed by recognized-text download.
4. Whole-book print layout, generation of PDF bytes through Chromium, library search and book removal.
5. Drive browser-preview error handling and a 650-pixel responsive viewport.
6. Rejection of oversized expanded ZIP metadata and traversal names before extraction.
7. Scroll-position restoration across reopening and JSON note export contents.

`npm run typecheck`, `npm run build`, and `npm test` are the required checks. The application dependency audit reported no known advisories during development. This does not certify the code's security or all possible documents.

Not covered: a live Google account, extension-origin runtime, Windows/macOS Chrome, exhaustive EPUB conformance, actual 1 GB performance, handwriting/multilingual accuracy, print color/font fidelity, PDF/A/PDF/UA, or DRM-protected files. The 1 GB input limit is a safety ceiling, not a performance claim.

## Reproducibility check

The earlier v0.1 repository audit also tested the proposed source tree in a fresh temporary directory, without dependencies or generated OCR files from the working checkout. `npm ci` downloaded and verified the English model from its documented upstream. TypeScript checks, the production build, all seven browser tests and ZIP packaging passed there. A dummy public OAuth client ID in `.env` was verified in the generated manifest; this checks configuration loading only, not live Google sign-in.

The GitHub Actions workflow in `.github/workflows/ci.yml` installs its own Chromium, builds the app, runs the suite and uploads the extension ZIP on success. Local validation does not establish that a remote Actions run has completed; consult the repository’s Actions tab for that status.

## GitHub Pages preview

A separate three-test browser suite exercises the production web build at `/EPUBchrome/`: sample import and navigation, note persistence and extension ZIP download; image EPUB import and local OCR using workers/model under the repository subpath; and narrow-screen layout plus the extension-only Drive explanation. Run `npm run build:pages` and `npm run test:pages`. These tests establish local preview behavior, not that the public GitHub Pages deployment is live. The workflow only deploys after the extension and Pages tests pass.

## Page reading and preferences

Four additional browser scenarios use an 80-paragraph EPUB chapter. They verify multi-page horizontal layout and counts, page turns without chapter jumps, exact page restoration after reopening, background chapter counts and book totals, reflow with a preserved passage, persistent font/theme/direction settings, multiple page bookmarks in one chapter, keyboard crossing of chapter boundaries, swipe turns, resize-driven repagination and narrow-screen layout. The original annotation/OCR/print tests remain in place and use the new page viewport where relevant.

The full suite now contains 57 reader tests and 6 Pages tests. Pagination is viewport- and preference-dependent, not a publisher page-number guarantee. Linked publisher CSS, local imports and an embedded font are now tested; broader publisher CSS and native fixed-layout conformance remain open.

## Audit regressions

Seven new audit scenarios cover XHTML self-closing markup, linked/imported/scoped CSS, supplementary-document links and return navigation, logical RTL pagination/resume, legacy highlight migration and unresolved notes, SHA-256 duplicate detection, full backup/restore with repeat-restore and corrupt-checksum rejection, JSON notes re-import, Sepia memory and keyboard tabs. Axe checks library, reader chrome, reading settings and night library for serious/critical violations; book content inside the scriptless iframe is excluded from that app-chrome scan. This does not replace manual accessibility testing.

Three additional scenarios compile unmodified, pinned IDPF/W3C samples and verify imported-font rendering, Japanese content/Unicode identifiers and Arabic direction/pagination. See [corpus sources and licenses](../tests/corpus/README.md). A fresh `npm test` needs GitHub access to prepare the corpus; no upstream build scripts are executed. The existing OCR scenario now saves corrections, reopens them and checks results are not shown for another image.

The [audit response](AUDIT_RESPONSE.md) distinguishes completed changes from deferred and modified recommendations. A small regression corpus is not an EPUB certification, and successful local tests do not establish a successful remote deployment.

## Formats and fullscreen

Eight new reader scenarios cover Markdown headings/tables/code and script/remote-resource isolation, DRM-free MOBI/PalmDOC metadata/chapters/images and body-boundary edge cases, PDF text selection/zoom/bookmark/resume/original-byte download, DjVu IW44/JB2/embedded-text reading, mixed-format backup/delete/restore, fullscreen/keyboard exit/passage preservation, a fullscreen API fallback and the larger-file DjVu Blob-range path. The last uses a small original DjVu fixture padded with an ignored IFF chunk beyond 64 MB; this verifies the alternate loading path, **not** performance on a complex 64 MB publication.

Two new Pages tests check PDF/DjVu workers and WASM and MOBI/Markdown/fullscreen behavior under `/EPUBchrome/`. The MOBI6 tests include images, body attributes, missing closing tags and declared DRM rejection. KF8/hybrid support uses the library's separate parser but still needs a broader real-document corpus. Password-protected PDFs, unusual fonts/rotations, indirect DjVu, accessibility of every imported document and gigabyte-scale performance are not certified.

Concurrent restore is also exercised in two tabs: identical originals merge and every annotation retains a valid book reference. Restore actions within a tab are queued through UI completion, with content-hash deduplication rechecked inside the database write transaction. Corpus navigation assertions wait for the requested source document rather than accepting the previous chapter’s page status.

## Library and fullscreen UI regressions (v0.4.1)

Three additional reader scenarios verify fullscreen bookmark/highlight creation and navigation on desktop and a 390px fallback view, including paragraph-boundary selections, accessibility checks and saved notes after reopening. Category coverage verifies older EPUB records without format metadata, default document categorization, manual moves without losing bookmarks, reload persistence and bounded long titles. A deliberately delayed PDF worker verifies that leaving an unfinished open does not lock library imports. The mixed-format backup test now also restores a manual category override. An additional Pages test verifies book-first copy, separate shelves, banner contrast and long-title layout at desktop/mobile widths.

## Blob/File storage compatibility (v0.4.2)

Three additional reader scenarios inject the reported “Error preparing Blob/File data to be stored in object store” at the IndexedDB boundary. They verify PDF original-byte downloads, physical pages, highlights/bookmarks, reloads and backup/restore; EPUB covers and Markdown derived copies through reading-position/category updates; and a clear oversized-compatibility error without deleting an existing book or bookmark. Synthetic fixtures are original project material. These injected failures are regression coverage, not a claim of reproducing a particular iPhone Safari build or private session.

## EPUB recovery and independent page themes (v0.4.3)

Four additional scenarios use original project fixtures to verify a missing cover ID with remaining readable chapters, filename title fallback, an empty initial navigation document, persisted bookmarks and unchanged originals in backups; rejection of an entirely unusable spine and external spine URLs; and page-theme isolation from reader/library colours under both light and dark system appearances. Pages category coverage also checks that selecting Sepia changes the document canvas without recolouring the library. This does not certify recovery of every malformed EPUB or invent content absent from its archive.

## Library previews (v0.4.4)

Three additional browser scenarios verify first-page PDF/DjVu image pixels rather than the saved page, bounded dimensions and uncropped aspect ratios; embedded-cover priority plus EPUB/MOBI/Markdown text-page previews without external requests; and background generation for an older item under injected Blob-storage rejection, with its bookmark, page and downloaded original bytes preserved. The native-card scenario also checks privacy copy and overflow at desktop, tablet and 390/320px widths. Previews are optional derivatives and not a document-fidelity certification.

## Storage failures after import (v0.4.5)

Two additional reader scenarios first save a covered EPUB through normal native-Blob storage, then inject Blob rejection either during chapter navigation or while reopening a record that needs legacy annotation migration. Both check readable chapters, saved position after reload, both bookmarks, byte-backed original/cover persistence, unchanged original bytes in a backup and no error alert. Recovery retries the complete transaction; existing native-Blob values are converted with Dexie’s transaction keep-alive support only after a Blob-specific failure. This exercises a later failure that import-only injection did not cover; it does not reproduce every Safari version or guarantee storage persistence in private browsing.

## Unavailable file reads (v0.4.6)

Three scenarios use an original EPUB padded with an unused stored ZIP entry to around 41 MiB. The first injects the reported NotFoundError into sliced Blob streams and arrayBuffer reads after the first chapter opens; chapter navigation, reopening, a bookmark and byte-identical backup succeed via FileReader. It failed on the previous production build before the reader change. The other scenarios mark a saved source as unavailable to all Blob read APIs: an existing byte-backed item still reads directly from its chunks, while a native-Blob item displays persistent recovery guidance and can be repaired by reselecting the matching original. Both retain the item ID, bookmark, saved chapter and exact backup bytes. The native case also checks 16 px mobile search text and no horizontal overflow at 346 px.

This reproduces specific read failures in Chromium. It does not reproduce a particular physical iPhone or certify complex 41 MiB publications; the reported book could not be supplied because of the attachment limit. Mobile form sizing prevents the usual Safari focus zoom without disabling manual zoom, but physical-device confirmation remains useful.

## Second audit regressions (v0.4.7)

Nine additional reader scenarios cover named entities/standard namespaces, literal CDATA and empty anchors/divs; printing with blocked remote CSS and empty images without external requests; separate explicit-review paths for missing resources, malformed HTML, invalid image bytes and failed fonts; repeated-heading highlights at the selected occurrence through reflow/reopen/full backup/restore, with unverifiable legacy ties still in review; PDF metadata cleanup and unchanged DjVu download with truthful raster-print copy; long contents titles/count columns, notices clear of header/footer and linear print scope; and a pixel-based portrait-aspect test for an image-only SVG page. The fixtures are original project material, not the owner's private library.

The initial entity/structural-recovery, missing-image print-review, malformed-recovery and repeated-heading cases failed on the prior production build before the implementation changes. The supported PDF.js 6.4 API does not contain the proposed `isEvalSupported` option. MOBI patch idempotence/occurrence guards and the configurable pinned source-cache path were exercised locally. Corpus compilation still uses a pinned public Git tree and never runs upstream scripts. See [the audit response](AUDIT_V2_RESPONSE.md) for partial/deferred findings and the actual limits of this coverage.

The 41 MiB range-read regression now also injects later Blob write failures: conversion uses FileReader, per-book queued retries preserve the newest chapter, and returning to the library waits for pending saves. Cross-tab conflict resolution and forced tab/process termination remain outside that guarantee.
