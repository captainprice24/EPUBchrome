# Changelog

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
