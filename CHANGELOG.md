# Changelog

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
