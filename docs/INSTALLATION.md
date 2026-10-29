# Installation and use

## Build from source

Prerequisites: Node.js 24.x, npm, Python 3 available as `python3`, and `curl`. Linux and macOS can run the commands in a terminal; Windows contributors should use WSL for this build toolchain. Windows and macOS users can load a previously built extension in their native Chrome browser.

```sh
git clone https://github.com/captainprice24/EPUBchrome.git
cd EPUBchrome
npm ci
npm run typecheck
npm run build
```

`npm ci` installs the pinned lockfile, copies the pinned OCR worker and engine, downloads the English language model when absent, checks its digest, and generates the original sample EPUB. An Internet connection is required for the initial install. Subsequent local reading and OCR work offline.

In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `.output/chrome-mv3`. Pin Folio to the toolbar and click its icon. Managed browsers may prohibit unpacked extensions; use an allowed development browser rather than changing an organization’s policy.

## Read a book

Choose **Import a book** or drag an EPUB into the window. The original file remains untouched. Select a chapter from **Contents**. Reading opens in horizontal pages by default, with **Page X of Y** for the current chapter and a page-position slider. Previous/next page buttons turn within a chapter and cross to the adjacent chapter only at its ends. The small chapter arrows above the book skip directly between chapters.

Open **Reading settings** in the toolbar to choose **Horizontal pages** or **Vertical reading**. Horizontal mode supports left/right keys, Page Up/Down, mouse-wheel page turns and horizontal swipes. Vertical mode supports natural scrolling and viewport-sized page steps; left/right and Page Up/Down turn pages, and up/down keys also advance a page while focused in the chapter. Home/End go to the first/last page of the chapter.

The same panel adjusts text size (14–36 px), Literary/Classic/Clean typefaces, paper/sepia/night appearance, line spacing and margins. These settings are remembered locally. Font and viewport changes recalculate pagination and return to the page containing the saved text anchor. A page number is a **layout page**, not necessarily the publisher's printed page. Publisher-supplied page lists remain available separately in Contents.

Contents shows page counts for the current layout. Other chapters are counted sequentially in the background and cached. Chapters larger than 2 MB of markup are counted when opened to avoid expensive background parsing. A whole-book page count appears once all chapter counts are known; it changes with the reading layout.

Use **Bookmark** to save the current page; clicking **Bookmarked** removes that page's bookmark. Several pages in the same chapter can be bookmarked. Select book text and choose **Highlight** to store a passage. The navigation tabs and library sidebar revisit saved annotations. New bookmarks follow text offsets across reflow; their saved page labels describe the layout at creation. Older chapter/scroll bookmarks remain accessible. **Find in chapter** finds the first matching text node in the current chapter and brings its page into view; it is not a whole-book search.

The library stores separate copies of each imported book. Importing the same file again creates another library entry.

## Export notes

From the library footer, choose **Export notes**. The JSON file includes book identities, bookmarks, highlights and OCR records. It does not contain the original EPUB bytes. This is a portable record, not a complete restorable library backup: backup import is not implemented.

## Print or save a PDF

Open a book, select the printer icon, choose **Current chapter** or **Whole book**, then **Open print dialog**. Select **Save as PDF** in Chrome’s destination menu.

The layout uses selectable text and the original available images. Review page size, margins, headers/footers, fonts and the resulting PDF. Reading-view pagination and printed pagination can differ. Print preparation stops when chapter image/style resources cannot be loaded safely. Use individual chapters for image-heavy books.

This is browser printing, not an automated EPUB-to-PDF conversion engine. Highlights and OCR text layers are not embedded in the exported PDF. Pixel-identical output, PDF/A, PDF/UA and font-embedding rights are not guaranteed.

## Recognize printed text

Open a chapter that contains an image, select the scan icon, choose the image, and click **Recognize text**. Recognition uses the packaged English model on your device. You can cancel recognition and download the result as a text file. The latest result for the chapter can be reopened in the OCR dialog; records are stored separately from the EPUB.

Review every result for errors. Model confidence is an engine estimate, not a calibrated accuracy guarantee. Handwriting, other languages, batch recognition and automatic searchable-PDF text layers are not supported in v0.2. OCR edits made in the text box are included in a downloaded text file but do not update the original saved OCR record.

## Package or update

```sh
npm run package
```

The generated `.output/folio-0.2.0-chrome.zip` contains the production extension and local OCR assets. Extract it before using **Load unpacked**. The source ZIP from GitHub must be built first.

After updating source, run `npm ci` and `npm run build`, then click **Reload** for Folio in `chrome://extensions`. Keep the extension ID and Chrome profile stable to preserve the same local storage and OAuth configuration.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Installation cannot download the OCR model | Confirm Internet access to npm and `raw.githubusercontent.com`, Python 3 and `curl`; retry `npm ci`. Do not disable TLS or the model integrity check. |
| The model checksum fails | Delete `public/ocr/lang/eng.traineddata.gz` and rerun `npm run prepare:assets`. A changed upstream model must be investigated rather than accepted with a new checksum blindly. |
| No extension appears after loading a ZIP | Extract the build ZIP and select its folder, which must contain `manifest.json`. A GitHub source ZIP needs `npm ci` and `npm run build` first. |
| Chrome blocks development extensions | The browser may be managed. Use a permitted development browser. |
| Google Drive is not configured | Follow [the Drive guide](GOOGLE_DRIVE.md), rebuild and reload. Local files need no Google account. |
| A large book cannot be imported | Check browser storage/quota and the limits below. Remove an unused local copy if needed; retain originals. |
| A chapter image or style is unavailable | The file may refer to absent, external or oversized resources. External book resources are intentionally blocked. |
| No images appear in OCR | OCR works on image-based content; ordinary text chapters are already selectable. Advanced SVG content is not a guaranteed OCR input. |
| Notes are missing | Check that you are using the same Chrome profile and extension ID. Clearing browser data or uninstalling can remove local data. |

## Current limits

| Area | v0.2 behavior |
| --- | --- |
| Input | DRM-free `.epub` files; 1 GB compressed safety ceiling, not benchmarked supported capacity |
| ZIP | At most 30,000 entries, 2 GB declared expanded size, 64 MB per extracted entry; suspicious compression and unsafe paths rejected |
| Resources | 128 MB loaded-resource budget; very large individual chapters or image sets may fail |
| Rendering | Horizontal pages or vertical reading; native fixed-layout viewport fidelity, advanced SVG/media, scripted content and nested CSS imports are incomplete or unsupported |
| Page numbers | Publisher page lists when supplied; no invented universal page count for reflowable books |
| Print | At most 300 chapters and 16 MB assembled markup; actual decoded image memory may be much larger |
| OCR | Printed English, under 40 megapixels per image; review results manually |
| Local persistence | IndexedDB in one browser profile; no account sync or restorable library backup |

See [validation coverage](VALIDATION.md) for the tests performed and pending compatibility/performance work.
