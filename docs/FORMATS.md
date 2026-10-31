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

Fixed pages retain their original fonts and colours. Reading themes change only the canvas around original PDF/DjVu pages; the library and controls follow system light/dark appearance. Horizontal mode fits the page; vertical mode fits its width and allows scrolling within it. Page controls and boundary scrolling move between original pages; a continuous strip of all pages is not provided.

## EPUB recovery

A reading-order entry can name an ID that is absent from the manifest, for example a leftover `cover` reference. Folio opens the remaining declared entries in their original order and shows a persistent structure warning naming missing IDs. It cannot reconstruct missing content or certify that such a book is complete. If there are no valid linear entries, import fails; archive/resource safety checks and external-path blocking remain in place.

An empty navigation document remains addressable, with stable spine indices for notes and backups, but a newly imported book starts at the next linear content document. If title metadata is absent, the original filename supplies the library title. These accommodations do not rewrite the original EPUB, which remains unchanged in backups.

## Page themes

Paper, Sepia and Night apply to the reading surface. The library, toolbars, navigation and dialogs follow your device’s light/dark appearance, so selecting Sepia never recolours the whole app. Page preferences survive reopening; the sun/moon reading button switches page themes only. Original PDF/DjVu pixels keep their publisher colours.

## Books and Documents

Folio is an EPUB-first book library. EPUB and MOBI appear under **Books** by default, while PDF, DjVu and Markdown appear under **Documents**. Existing libraries are categorized without rewriting original files or notes. Each category has its own shelf and count, with search and sorting within the selected category. Use **Move to Books** or **Move to Documents** on a card when the default does not fit; your choice survives reloads and library backup/restore. Saved bookmarks and highlights remain accessible across both categories.

## Fullscreen

Use the toolbar button or **F**. **Esc** and **Exit fullscreen** leave the mode. Contents, **Bookmark**, **Notes**, Settings, page controls and fixed-page zoom remain available. Select text and choose **Highlight** to save a passage; **Notes** opens the saved-bookmark and highlight tabs without leaving fullscreen. Browsers without the Fullscreen API use distraction-free reading within the current tab; they cannot hide browser/OS chrome. Entering/exiting fullscreen preserves the saved text passage instead of replacing it with the start of a newly laid-out page.

## Library previews

Cards prefer an embedded cover. If it cannot be used or is absent, Folio generates a PNG of the first physical PDF/DjVu page or first readable page of a reflowing book/Markdown document. Original page colours and the whole image aspect ratio are retained. Previews use local workers and a scriptless reader; no document, screenshot or text is uploaded to a conversion service.

Previews are cached with the library and included in backups. Existing items missing a preview are processed one at a time while their Books/Documents collection is open, without changing originals, saved places or notes. The optional work is canceled when you leave that collection or begin reading.

Images are bounded to **384 × 544** pixels and generation has a **10-second** budget. Oversized cover resources (above 8 MB), reflow chapters above 2 MB or unusual publisher layouts can prevent a preview; the title card remains available and the document can still be read. The source document retains its full reading resolution and original bytes.

## Browser storage compatibility

If the browser rejects saving Blob/File objects, Folio retries with local typed byte chunks. Original bytes and MIME types are preserved, with the same reading, note and backup behavior. Existing native-Blob library records remain readable; no library reset or document conversion is needed. Recovery also covers failures that begin after import: reading-position saves, chapter changes and existing library records are retried without resetting the library. Version 0.4.5 extends this to metadata and annotation migrations, converting the latest record within its atomic write transaction. The compatibility representation requires Folio 0.4.2 or newer, so reload older open Folio tabs before using those items.

This fallback has a **64 MB per-item budget**, including the original, cover and derived reading copy. It is an input/memory guard, not a performance guarantee. The normal Blob path retains the format limits above. For larger items rejected by compatibility storage, try a regular browsing tab or the Chrome extension. A private browsing library can disappear when the private session ends; use a regular tab and backups for durable storage. A failure to save does not upload or alter the original file.

## Unavailable local files

EPUB extraction and backup use bounded range reads rather than native sliced-Blob streams. Byte-backed library files are read directly from their stored chunks; native files use `arrayBuffer()` with a FileReader fallback for `NotFoundError`/`NotReadableError`. This keeps the normal large-file range path and ZIP checksum checks.

If the browser cannot read a saved source through either API, the reader keeps an explanation and offers **Choose original file**. You can also import the same original from the library. When its SHA-256 matches an existing item, Folio validates the fresh source and replaces only its original/derived binary fields in an atomic transaction. The current item ID, reading position, collection, covers and annotations remain. An unrelated file is never matched by filename or title, and existing notes are not deleted. There is no need to upload the original to a server.

## Backups and originals

Folio 0.4 writes `.folio` **version 2** backups containing original files, declared formats, names, positions, annotations, OCR and covers. Derived reading caches are omitted and rebuilt on restore. It also restores **version 1** EPUB-only backups. Older Folio builds cannot read version 2 archives; update the destination before restoring.

PDF download is an unchanged original, not a regenerated document. Reflowing books can use the existing browser print-to-PDF flow. DjVu print output is a raster derivative of the current page, without an embedded OCR layer; it is not a lossless vector conversion. Backups are unencrypted and must be protected by their owner.

The [validation record](VALIDATION.md) lists what was tested. Broader real-document, Windows/macOS Chrome, mobile-browser and largest-file testing remains necessary.
