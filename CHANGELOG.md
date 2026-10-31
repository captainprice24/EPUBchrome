# Changelog

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
