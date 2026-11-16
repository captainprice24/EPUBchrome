# Changelog

## 0.6.0 — Reading tools, library upkeep and a lighter package

Follows the review in [docs/ASSESSMENT.md](docs/ASSESSMENT.md). Existing libraries, notes, preferences and backups are unchanged; the database schema is the same.

Reading

- **Find in chapter** now counts every match and steps to the next and previous one (Enter, Shift+Enter, buttons). A phrase is found across line breaks, inline formatting and existing highlights. Previously only the first match in a single text node could be reached.
- Saved bookmarks and highlights are listed in reading order and show the date they were saved. They were listed in the order of their random identifiers.
- Added **Two pages** for horizontal reading in windows at least 1100 px wide.
- Added an **Interface** setting: follow the device (default, as before), match the page theme, light, or dark.
- PDF and DjVu zoom is remembered per document.
- Warnings stay until dismissed. Other notices last 6 seconds instead of 4.5 and wait while their close button is hovered or focused. Notices still let clicks through to the page beneath them.
- Bookmark positions are resolved once per loaded chapter. Previously each render re-read and re-hashed the chapter text for every bookmark.
- Background page counting restarts only when the layout changes, not when the page theme does.

Library

- Several files can be selected or dropped at once. They are added in turn and reported in one summary; an unreadable file no longer stops the others.
- **Edit details** changes the listed title and author. Sorting by author was added, and the chosen sort is remembered.
- Download all bookmarks and highlights as Markdown from the Bookmarks and Highlights views. Notes search also matches book titles.
- The **Storage & backup** button shows a reminder when items are not covered by a full backup or the last one is over 30 days old. The dialog shows the date of the last full backup and no longer mentions recognition text unless the library holds some.
- A book on its last page shows 100% and **Finished**. Progress previously stopped short of 100%.
- Dialogs say "document" for documents; restore reports "items" with correct singular and plural.
- An empty backup can no longer be created after the selected item was removed.
- The sample is recognized by a stored marker instead of its title, and its badge no longer covers the cover's author line.
- All four library sections announce the current one to screen readers; the brand is a button.

Extension and package

- Folio opens in a tab after installation.
- The package shrank from 8.9 MB to 6.6 MB unpacked: duplicate DjVu decoders, the unused PDF.js scripting sandbox and its no-WebAssembly fallbacks were removed, and the CSS parser no longer bundles grammar data it did not use.
- Drive import (self-built copies only) loads on demand and retries once when Chrome returns an expired cached token.
- The error screen offers **Copy details for a bug report**: version, browser and error, with no book titles or content. Nothing is sent.

Development

- Folio is now licensed under the Apache License 2.0.
- Installing, building and packaging no longer need Python; `scripts/demo.mjs` and `scripts/package.mjs` replace the Python scripts, and the sample book is built reproducibly. Node.js 22 or later is supported.
- Added `npm run lint` (Oxlint with React hook rules), `npm run test:unit` (Vitest) and both to CI, with `npm audit`. Unused locals and parameters are TypeScript errors.
- Added a release workflow for `v*` tags, Dependabot configuration, `SECURITY.md`, and issue and pull-request templates.
- Rewrote the README; moved the audits, responses, research and earlier validation records to `docs/history/`.

## 0.5.1 — Chrome Web Store readiness

- Added Folio toolbar and store icons (16, 32, 48 and 128 px) with a reproducible generator (`npm run icons`), and favicons for the reader and web preview.
- Removed the unused `storage` permission; store builds request only `unlimitedStorage` and make no network requests.
- Declared `minimum_chrome_version` 147 for PDF.js 6, and show an "update Chrome" message instead of failing when a browser lacks the APIs it needs.
- Hid **Open from Drive** in builds without a Google OAuth client, including the web preview and store build.
- Reused an open Folio tab from the toolbar button instead of opening a new tab on every click.
- Hid the sample card once the sample book is in the library.
- Ignored URL and `about:blank` PDF titles written by browsers' print-to-PDF, alongside the existing office-file title cleanup.
- Updated the web preview banner: files stay in the browser, with no registration, ads or fees.
- Added a privacy policy page to the GitHub Pages site, store screenshots and promo tiles (`npm run store:assets`), and a submission guide in `docs/CHROME_WEB_STORE.md`.

## 0.5.0 — Lightweight catalogue, no OCR

- Separated library metadata, source files and previews; library refresh and position saves no longer materialize or rewrite every stored book.
- Added an atomic, one-record-at-a-time upgrade that preserves old originals in place, IDs, reading copies, positions and notes; failures roll back, blocked/stale tabs get reload guidance.
- Loaded covers as cards approach the viewport, released offscreen object URLs and bounded the compressed preview cache to 8 MiB/24 entries. Missing previews are generated on demand.
- Reused the selected source for background chapter counting and loaded backup sources one at a time. Restores retain full validation and atomic commit; large archive memory limits still apply.
- Removed Tesseract, OCR controls, worker, WASM variants and model downloads at the owner’s request. Scanned pages still display; existing recognition text remains in notes export and backup/restore.
- Reduced the extension ZIP to 3.96 MB (8.90 MB unpacked), from approximately 21.5 MB compressed before OCR removal. Validated 63 unique reader and 5 Pages scenarios across full/focused runs, including migration, rollback, lazy covers and legacy text backup/restore.
- Updated installation, privacy, format and audit-response documentation.

## 0.4.7 — First response to the second audit

- Recovered HTML named entities, missing standard namespaces and self-closing structure before sanitizing chapters; structural repair details are informational unless layout may be degraded.
- Allowed printing with expected blocked online stylesheet imports and empty image placeholders. Genuine omissions, invalid images/fonts and degraded recovery require an explicit reviewed “Print anyway” choice.
- Shared FileReader fallback with byte conversion and queued per-book metadata writes so delayed retries cannot overwrite newer positions; library return waits for pending saves.
- Bound new repeated-text highlights to renderer v4, wider quote context and a complete text fingerprint; reused hashes during page saves/painting, preserved them in backups and retained legacy ambiguity for review.
- Preserved image-only SVG page proportions, bounded contents titles, cleaned office-generated PDF titles, moved reading notices away from controls and corrected linear print counts.
- Clarified DjVu raster printing and offered original-byte download; made supported PDF options explicit and strengthened fail-loud MOBI patch checks.
- Cached the pinned corpus source outside disposable test output and preserved the second audit with a finding-by-finding response. Metadata/file schema separation, full search/routing, annotation editing and the larger UI split remain planned.

## 0.4.6 — Recoverable EPUB file reads

- Replaced sliced-Blob ZIP streams with bounded byte reads for EPUB extraction and backups, including direct reads of locally stored byte chunks and a FileReader fallback for unavailable native Blob reads.
- Allowed a SHA-256-matching original to refresh an existing library item’s file and derived reading copy, retaining its ID, notes, category and reading position.
- Added a persistent reading-error explanation, a “Choose original file” action and an unavailable-page status instead of indefinite “Counting pages…” after a read failure.
- Used 16 px mobile form text to prevent Safari’s focus-triggered zoom while retaining manual pinch zoom.
- Added controlled 41 MiB ZIP read-failure, byte-storage and file-reattachment regressions; this does not verify the unavailable reported publication or every iOS version.

## 0.4.5 — Recover file-storage failures while reading

- Extended Blob/File storage recovery to reading positions, chapter changes, pagination counts, last-read dates, category moves and older-library fingerprints.
- Retried legacy annotation migrations and restores as complete atomic transactions, including existing native-Blob records when a browser starts rejecting file writes after import.
- Converted the latest record within its transaction using Dexie’s transaction keep-alive support, preserving concurrent metadata changes, annotations, original bytes and the existing 64 MB compatibility budget.
- Added regressions for failures beginning during reading and while reopening older libraries; verified supplied EPUB chapters locally without publishing the supplied file.

## 0.4.4 — Real document previews and simpler library copy

- Kept “Your reading room” on one line; moved the full browser-storage sentence to a single-line library footer and restored “Local first. Private by default.” in the sidebar.
- Used valid embedded covers or locally rendered first pages for library cards, including PDF, DjVu, EPUB, MOBI and Markdown. Images retain their full aspect ratio instead of cropping page content.
- Cached bounded PNG previews, filled missing previews in existing library items one at a time and preserved originals, reading positions, notes and Blob-storage compatibility.
- Limited optional preview generation by time, image/chapter size and canvas dimensions; unsuccessful previews keep the readable title card and never block document reading.

## 0.4.3 — Recoverable EPUB imports and independent page themes

- Opened remaining declared EPUB content when a reading-order ID is absent from the manifest, with a persistent explanation of missing entries. Books with no usable reading order and unsafe external spine paths remain rejected.
- Used the filename when EPUB title metadata is empty and started new books after an empty navigation document, preserving spine indices, saved places and original bytes.
- Scoped Paper, Sepia and Night to the reading surface. Library, toolbars, navigation and settings follow system light/dark appearance independently.
- Added recovery, original-byte backup and page-theme isolation coverage for both system appearances and the Pages build.

## 0.4.2 — Browser file-storage compatibility

- Retried Blob/File-specific IndexedDB failures using typed byte chunks, preserving original file bytes, MIME types, covers and derived reading copies.
- Kept metadata updates and library restore compatible with byte-backed items, including atomic retries and existing native-Blob libraries.
- Added a 64 MB per-item limit for the compatibility path to bound memory use; native Blob storage retains the existing format limits.
- Made import tolerate browsers without the Storage Estimate API and clarified private-browsing data lifetime in Storage & backup.

## 0.4.1 — Books first and usable fullscreen tools

- Separated Books and Documents with automatic defaults for existing files, independent category counts and persistent manual moves included in backups.
- Restored fullscreen access to adding bookmarks, selecting/highlighting text and navigating contents, bookmarks and highlights.
- Fixed long-title overflow and remove-button collisions; improved banner and selection-toolbar contrast and narrow-screen category navigation.
- Cleared reader loading state when returning to the library before a document finishes opening, keeping imports usable.
- Clarified the app, extension metadata and documentation as an EPUB-first book library with additional document support.

## 0.4.0 — More formats and fullscreen

- Added PDF reading with PDF.js: original page counts, local range access, embedded text selection/highlights, outlines/internal links, zoom and byte-for-byte original downloads.
- Added DjVu with a local Rust/WASM worker: original pages, IW44/JB2 decoding, embedded text for smaller files, on-demand range reads for larger files, OCR access and zoom.
- Added DRM-free MOBI/PalmDOC/KF8 parsing in a disposable worker, with bounded preparation, metadata, images, sections and shared reader annotations.
- Added standalone Markdown with headings, GFM tables/code and sanitized HTML in the existing reflow reader.
- Added real fullscreen and a distraction-free fallback, keyboard/visible exit controls, and layout anchors that preserve the passage when entering/exiting fullscreen.
- Extended backups to version 2 for mixed-format originals, while retaining version 1 restore support. Extended configured Drive imports to supported formats.
- Bundled local PDF workers/fonts/CMaps/ICC/decoder assets and DjVu WASM with license notices; added reproducible fixes for known edge cases in the pinned MOBI parser.
- Added format, fullscreen, large-range-path and Pages-subpath regression coverage.
- Queued restore actions through completion and rechecked content hashes transactionally to prevent duplicate books during concurrent restore/import.

## 0.3.0 — Rendering and data safety

- Fixed XHTML self-closing elements and linked publisher styles; added scoped local CSS imports and Publisher typography.
- Opened non-linear/out-of-spine XHTML links, with a return action and stable sequential reading order.
- Preserved language/direction and added logical RTL page movement and resume.
- Migrated legacy annotations to verified text quotes; retained unresolved notes for review.
- Added persistent-storage reporting, complete `.folio` backup/restore, notes import and streaming SHA-256 duplicate detection.
- Corrected OCR image association and saved edits; reused an idle OCR worker.
- Improved text sizes, contrast, input focus, tabs, touch targets and app-wide themes; preserved Sepia and corrected initial progress.
- Added audit/corpus/axe regression coverage, a render error boundary and CI format checks.
- Preserved the independent audit and documented accepted, deferred and modified recommendations in `docs/AUDIT_RESPONSE.md`.

## 0.2.0 — Page reading

- Added horizontal page turns and vertical reading, with page counts per chapter and a page-position slider.
- Restored the saved text passage across reopening, font changes and viewport changes.
- Added background chapter page counting, cached layout counts and a whole-book page indicator when all counts are available.
- Added a reading preferences panel: text size, three typefaces, three themes, line spacing and margins.
- Allowed several page bookmarks within the same chapter and navigation back to each saved passage.
- Added keyboard, mouse-wheel and horizontal-swipe page turns; chapter skipping remains available separately.
- Preserved existing local books, highlights, OCR records and older chapter/scroll bookmarks.
- Added regression coverage for pagination, reflow, saved positions, gestures, preferences and chapter boundaries.

## 0.1.0 — First reader

Local EPUB library, chapter navigation, bookmarks, highlights, printed-English OCR, PDF printing, optional Google Drive integration, and a GitHub Pages preview.
