# Supported documents in Folio 0.4

All reading happens locally. Imported originals are stored unchanged, fingerprinted for duplicates and included in library backups. No conversion service, document upload, analytics or account is needed for local reading.

| Format | Reading and navigation | Notes and limitations |
| --- | --- | --- |
| EPUB | Reflowing chapters, publisher CSS/fonts, TOC/page lists, horizontal/vertical reading, text settings | Existing archive limits apply. Native fixed-layout EPUB and vertical CJK conformance remain unfinished. |
| PDF | Original pages, on-demand Blob ranges, page slider, outlines/internal destinations when present, zoom | Embedded text supports selection/search/highlights. Scans remain images and can use local OCR. Password-protected PDFs are rejected clearly; forms, PDF scripts, attachments and external actions are not executed. Downloading the original preserves its exact bytes. |
| DjVu / `.djv` | Original pages, local WASM worker, colour IW44 and bilevel JB2, zoom and page navigation | Bundled/single-file documents only. Below/equal 64 MB the decoder exposes an embedded text layer when present. Larger files use Blob ranges; that API does not expose embedded text, so reading/OCR and physical-page bookmarks remain available. Indirect documents requiring companion files are not supported. |
| MOBI | DRM-free MOBI6/PalmDOC, with a separate KF8/hybrid parser; metadata, sections, images and existing reflow tools | Declared encryption is rejected. The parser runs in a disposable worker; it is not a Kindle-library or DRM-removal integration. Legacy byte-position links fall back to their containing section if an exact target is unavailable. KF8/hybrid and unusual books need broader corpus testing. |
| Markdown | UTF-8 `.md`/`.markdown`, heading navigation, GFM tables/fenced code, sanitized HTML | Standalone files only. Local-relative/external image dependencies are not imported or fetched; external resource requests remain blocked. Front-matter metadata, Mermaid execution, workspace editing and folder bundles are not implemented. |

## Limits and performance

- EPUB/PDF/DjVu: **1 GB input ceiling**. This is a safety limit, not a claim of smooth operation on every gigabyte-size document.
- MOBI: **64 MB input and declared expanded-text ceiling**, **128 MB resource budget**, with a **45-second parser timeout**. The normalization cache is local and can require additional storage.
- Markdown: **16 MB input ceiling**; large HTML conversion/layout still needs performance testing.
- PDF/DjVu: at most **30,000 original pages**. The current page is rendered on demand, with an approximately **6-megapixel canvas budget** and bounded dimensions. Very high zoom on large pages can therefore reach a sharpness ceiling. DjVu work is canceled/restarted on navigation and its decoder is recycled periodically to limit retained caches.
- Existing EPUB extraction/resource limits apply to prepared MOBI/Markdown reading copies. Actual file and markup complexity matters as much as compressed size.

Fixed pages retain their original fonts and colours. Reading themes change the surrounding UI. Horizontal mode fits the page; vertical mode fits its width and allows scrolling within it. Page controls and boundary scrolling move between original pages; a continuous strip of all pages is not provided.

## Fullscreen

Use the toolbar button or **F**. **Esc** and **Exit fullscreen** leave the mode. Settings, page controls and fixed-page zoom remain available. Browsers without the Fullscreen API use distraction-free reading within the current tab; they cannot hide browser/OS chrome. Entering/exiting fullscreen preserves the saved text passage instead of replacing it with the start of a newly laid-out page.

## Backups and originals

Folio 0.4 writes `.folio` **version 2** backups containing original files, declared formats, names, positions, annotations, OCR and covers. Derived reading caches are omitted and rebuilt on restore. It also restores **version 1** EPUB-only backups. Older Folio builds cannot read version 2 archives; update the destination before restoring.

PDF download is an unchanged original, not a regenerated document. Reflowing books can use the existing browser print-to-PDF flow. DjVu print output is a raster derivative of the current page, without an embedded OCR layer; it is not a lossless vector conversion. Backups are unencrypted and must be protected by their owner.

The [validation record](VALIDATION.md) lists what was tested. Broader real-document, Windows/macOS Chrome, mobile-browser and largest-file testing remains necessary.
