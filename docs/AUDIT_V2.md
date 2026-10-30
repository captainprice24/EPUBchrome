# Folio v0.4.5: strict re-audit

**Audit date:** 30 October 2026 · **Revision audited:** `ef8d0ce` (`main`, v0.4.5) · **Previous audit:** [AUDIT.md](AUDIT.md) on `b8c6555` (v0.2.0) · **Team response:** [AUDIT_RESPONSE.md](AUDIT_RESPONSE.md)

This re-audit uses the same standard as the first one: comparison with mature readers, and every claim reproduced in Chromium where possible. It has three goals:

1. Verify each original finding against the v0.4.5 build.
2. Answer the team's objections in `AUDIT_RESPONSE.md`.
3. Audit what is new: PDF, DjVu, MOBI and Markdown support, fullscreen, previews, backup and the storage-compatibility layer.

---

## 1. Verdict

**v0.4.5 is a substantial improvement.** All five P0 defects from the first audit are fixed and verified in the browser:

- Publisher stylesheets apply.
- `<title/>` chapters render.
- Footnotes open, with a way back to the text.
- RTL text reads right-to-left.
- Highlights carry text-quote anchors and survived the renderer change.
- The library requests persistent storage and has a working backup and restore.

Measured UI contrast went from **31 of 36** failing text elements in the reader to **0**. The response document is a model of how to handle an audit: it separates verified defects from recommendations, explains each decision and lists what is still open.

The product's weak points have moved rather than disappeared:

1. **The XHTML fix has an unguarded fallback.** Any chapter that is not strict XML is still read with the HTML parser. The trigger is typically an HTML entity such as `&nbsp;` in an EPUB 3 file. In that case the original self-closing-tag bug **returns in full** for that chapter, and the chapter cannot be printed. *(Verified on a constructed file, §4 N-1. Not observed in any of the 7 real-world EPUBs in §8.)*
2. **Printing is blocked by harmless warnings.** Every Google Docs–exported EPUB in the real-library test (3 of 3) shows a warning on opening and **cannot be printed**. The cause is that Folio correctly blocks the export's online-font `@import` and then treats that as content loss (§8 R-1). DjVu prints only the current page, as a 150 dpi raster, under a dialog that says "Text stays selectable" (N-3). PDF is handled well: Folio offers the original file byte-for-byte.
3. **A newly created highlight can vanish immediately.** On text that repeats in a book, such as a running heading, Folio confirms "Highlight saved." but never draws it, and lists it as "Location needs review" (§8 R-2).
4. **The deferred navigation items are now the largest gaps compared with other readers.** Find still only ever selects the first match, reloading still exits the book, external links are still dead, and there are still no highlight colors or notes.
5. **The codebase grew instead of splitting.** `App.tsx` is now **3,129 lines**, up 43%, with 47 `useState`, 26 `useRef` and 20 `useEffect`. It drives five formats from one component, and there is still no linter.

### Scorecard: v0.2.0 → v0.4.5

| Area | v0.2 | v0.4.5 | Verdict |
| --- | :-: | :-: | --- |
| Rendering fidelity (EPUB) | D | **B−** | Strict-XML path is correct. The fallback path regresses, external links are dead, and fixed layout and vertical CJK are unsupported. |
| Annotations | C− | **C** | Robust quote anchors, a careful migration and a review state. But new highlights on repeated text vanish at once (§8 R-2). Still one color, no notes and no edit. |
| Data durability | D | **B** | `unlimitedStorage`, `persist()`, full backup and restore with checksums, notes import. Backups are unencrypted and capped at 2 GB. |
| Accessibility | D | **B−** | 0 contrast failures measured, axe checks in CI, real tabs, focus rings. No screen-reader study yet. |
| Design system and legibility | D+ | **C+** | 151 `var()` uses and 84 unique hex colors, down from 194. The UI follows the OS theme. A 12 px floor exists but there is still no type scale. |
| Visual identity | B | **B+** | Hero removed once books exist, real page previews, calmer copy. |
| Pagination and position | B− | **B** | RTL logical paging and fullscreen. Fast at scale (§5). No spreads, tap zones or deep links. |
| Library management | D+ | **C** | Content-hash dedupe, Books/Documents split, previews. No collections, status, metadata or bulk import. |
| Search | D | **D** | Unchanged: first match only, current chapter only. |
| Print / PDF | C | **C−** | PDF hands over the original file, byte-identical (verified on 5 real PDFs). EPUB printing is blocked by harmless warnings, including every Google Docs export tested. DjVu prints one raster page under misleading copy. |
| OCR | C | **C+** | Correct image association, saved edits, worker reuse. |
| Google Drive | D | **D** | Permissions are now omitted when unconfigured. Still `drive.readonly`, no 401 retry, not validated live. |
| Format breadth | — | **B** | PDF (PDF.js with text layer), DjVu (Rust/WASM), MOBI/KF8, Markdown, all local. |
| Security and isolation | B+ | **B+** | Same strong iframe and CSP boundary, `npm audit` clean. The attack surface is larger (§4 N-9). |
| Architecture | C− | **C−** | Good new modules (locators, backup, storage), but the main component grew 43%. No lint. |
| Tests and CI | C+ | **B+** | 45 reader tests (2.4 min) plus a Pages suite (not re-run here), real-EPUB corpus, axe, format check. No unit tests, no lint. |
| Documentation | A− | **A** | The response document is exemplary. |

### Method

- Reset to `origin/main` at `ef8d0ce`. Ran `npm ci`, `npm run typecheck` and `npm run build` (all succeed; the extension is 40.5 MB). `npm test` passes **45/45** in 2.4 min, including the 3-book IDPF corpus. `npm audit --omit=dev` reports 0 vulnerabilities.
- Re-ran the original probe EPUB (`<title/>`, self-closing anchors and divs, `linear="no"` notes, an external link, Arabic RTL, linked and imported CSS).
- Ran a new probe EPUB with `&nbsp;` in an EPUB 3 chapter without a DOCTYPE and with blocks that have no whitespace between them.
- Ran a 200-chapter × 40-paragraph EPUB for performance.
- Repeated the contrast, text-size, touch-target and reading-area measurements at 1440×900 and 390×844.
- Read the code that changed since the first audit: `epub.ts`, `publisher-css.ts`, `locators.ts`, `migrate-locators.ts`, `annotations.ts`, `backup.ts`, `binary-storage.ts`, `store.ts`, `drive.ts`, `documents.ts`, `document-types.ts`, `thumbnails.ts`, the print, find and refresh paths in `App.tsx`, the manifest and CI.

---

## 2. Status of every original finding

✅ Fixed and verified · ◐ Partly fixed · ⏸ Open, deferred by the team · ✖ Open, not addressed

| ID | Finding | Status | Evidence on v0.4.5 |
| --- | --- | :-: | --- |
| P0-1 | Linked publisher CSS stripped | ✅ | Probe: computed `text-indent` is `22px` (1em), was `0px`. Corpus *Waste Land* loads its imported `@font-face`. CSS is parsed with css-tree, scoped with `@scope` and budgeted (`publisher-css.ts`). |
| P0-2 | XHTML parsed as HTML | ◐ | Strict-XML chapters are correct: `<title/>` renders. **The HTML fallback still has the defect**; see N-1. |
| P0-3 | Non-linear items unreachable | ✅ | The footnote opens "Footnote one.", with a "Back to text" control. Sequential reading skips it. |
| P0-4 | Fragile offset anchors | ✅ | Versioned `TextLocator` with quote, prefix, suffix and offset hint. A frozen v0.2 renderer captures quotes for migration. Ambiguous quotes go to review instead of being painted. A cross-paragraph highlight survived reopening (3 `<mark>`s before and after). |
| P0-5 | Evictable library, no backup | ✅ | `unlimitedStorage` in the manifest. `persist()` is called and the result shown. `.folio` backup and restore verifies SHA-256, validates records and merges in one transaction. |
| P1-1 | `lang`, `dir` and body attributes dropped | ✅ | Probe: `direction: rtl`, `lang="ar"`, `body.pub-body` retained. |
| P1-2 | LTR-only position capture | ✅ | Logical-start capture. RTL advance and resume are tested. Vertical CJK is still open, as documented. |
| P1-3 | External links dead | ⏸ | Probe: `href = null`, and clicking opens nothing. |
| P1-4 | Find: first match only | ⏸ | Probe: Enter twice gives `There is a@0` both times. Code unchanged (`App.tsx:1392`). |
| P1-5 | Printing aborts on any warning | ✖ | Now blocks printing of every chapter that needed HTML recovery. See N-1 and N-2. |
| P1-6 | No routing, new tab per click | ⏸ | Reload while reading still returns to the library. `background.ts` still calls `tabs.create` on every click. |
| P1-7 | Duplicate imports | ✅ | SHA-256 computed in a worker. Re-importing opens the existing book. |
| P1-8 | Wrong progress | ✅ | New books show 0%. Measured page counts are used when available. |
| P1-9 | OCR association and edits | ✅ | Results are keyed by image path, edits are saved and the idle worker is reused. Bulk OCR, overlays and languages are deferred. |
| P1-10 | Drive scope and token handling | ◐ | `identity` and the host permission are omitted when no client ID is set. Still `drive.readonly`, no `removeCachedAuthToken` retry, and no live test. |
| P1-11 | Theme toggle forgot Sepia | ✅ | Tested by the team's suite. |
| P1-12 | TOC fidelity | ◐ | NCX depth is kept. Index-based numbering and the active state for each section are unchanged. |
| P1-13 | Shallow metadata | ⏸ | Still first `dc:title` and all creators joined (`epub.ts:108-113`). |
| §5 | Contrast and text size | ✅ | Reader: **0/36** below 4.5:1, was 31/36. Library: 1/47, a decorative ✳ glyph. No UI text below 11 px. |
| §5 | Focus, tabs, dialogs | ✅ | Focus rings on inputs, `tabpanel` and `aria-controls`, arrow keys, labelled dialogs. Axe runs on four views in CI. |
| §5 | Touch targets | ✅ | Mobile: one control under 24 px ("Find", 23×32), was 11 under 32 px. |
| §6 | Hero dominates the library | ✅ | Hidden once the library has books (screenshot). |
| §6 | Reader chrome takes 43% | ◐ | Normal mode is unchanged (reading frame 1112×670, 57% of the viewport). **Fullscreen** mode now provides an immersive alternative. |
| §6 | Toasts cover the page navigator | ✅ | Moved to the top-right on desktop. |
| §6 | No tap zones or spreads | ⏸ | Neither exists in the code. |
| §6 | Selection toolbar only offers Highlight | ⏸ | Unchanged. |
| §7 | `App.tsx` monolith | ✖ | **Grew** from 2,193 to 3,129 lines. |
| §7 | Error boundary | ✅ | `ErrorBoundary.tsx` added. |
| §7 | Lint and format | ◐ | `prettier --check` runs in CI. Still no ESLint or react-hooks rules. |
| §7 | Version duplication | ✅ | The manifest reads the version from `package.json`. |
| §7 | Bundle and OCR size | ✖ / disputed | Main chunk grew from 562 to **828 kB**. OCR is still 31 MB of 40.5 MB. The team keeps the English model bundled for offline use; see §3. |
| §7 | Real-world corpus | ◐ | 3 IDPF samples, below the 10+ books proposed, as the team acknowledges. |

**Totals:** of 32 tracked items, **17 fixed**, **6 partly fixed**, **6 deferred by the team** and **3 not addressed** (one of them, OCR bundle size, partly disputed).

---

## 3. Response to the team's objections

The team's objections in `AUDIT_RESPONSE.md` were weighed on their merits.

| Objection | Assessment |
| --- | --- |
| "An open-source license is not required to distribute in the Chrome Web Store; the audit overstates that blocker." | **Conceded.** The first audit was wrong to call it a Web Store blocker. The remaining, narrower point stands: without a license, outside contributions and forks have no clear legal basis. That is a business decision for the owner. |
| "Not every rendering fix corrupts every annotation; CSS changes geometry, not the text sequence." | **Conceded.** The defensible claim was that renderer changes *can* shift offsets. The migration the team built handles it correctly. |
| "Do not make all print warnings non-fatal." | **Partly conceded.** Silently dropping a missing image or font is the wrong default. However, the current behavior blocks printing for a purely structural recovery that loses no content (N-1), with no way to continue. A middle path is proposed under N-2. |
| "Keep the English OCR model bundled for offline use." | **Accepted as a product decision.** The real waste is the duplication: three core variants each shipped as `.wasm` *and* as base64 `.wasm.js`. Measuring which variants Chrome ever loads would shrink the install without giving up offline OCR. |
| "Do not count pages with text-only markup." | **Conceded.** Performance at 200 chapters is already acceptable (§5), so the optimization is not needed now. |
| "12 px, grades and time estimates are not standards evidence." | **Agreed.** They were presented as heuristics and remain so. The verified failures were the substance, and they are fixed. |
| "Do not add AI, subscriptions or a backend in response to the audit." | **Agreed.** The first audit placed those in a late, optional phase only. |

---

## 4. New findings in v0.4.5

### N-1 (P2): the HTML recovery path brings back the self-closing-tag bug, shows a technical warning and blocks printing

- **Where:** `src/epub.ts`, in `render()`: it parses with `application/xhtml+xml` and, on `parsererror`, falls back to `text/html` with a warning.
- **Frequency:** none of the 7 real-world EPUBs in §8 or the 3 IDPF corpus books triggered the fallback. Even a real chapter using `&egrave;` without a DOCTYPE parsed as XML in Chromium. Severity is therefore **P2**: the defect is real but appears uncommon. The print-blocking half of the problem is common through a different trigger (§8 R-1).
- **Trigger:** any chapter that is not well-formed XML.
  - The most common real-world case is an **HTML named entity** (`&nbsp;`, `&mdash;`, `&rsquo;`) in a file **without an XHTML 1.x DOCTYPE**, which is typical of EPUB 3 files using `<!DOCTYPE html>`.
  - Measured in Chromium: `&nbsp;` parses as XHTML with the XHTML 1.0 or 1.1 DOCTYPE, but fails with `<!DOCTYPE html>` or with no DOCTYPE.
  - An undeclared namespace prefix, such as `epub:type` without `xmlns:epub`, also triggers it.
- **Effects:**
  - **The P0-2 defect returns for that chapter.** Probe: `<a id="pg3"/>` contains "after anchor.", and `<div class="gap"/>` swallows the following paragraph. Publisher rules such as `.gap{display:none}` or page-break styles would now hide or restyle real text.
  - **The reader sees "This chapter contains invalid XHTML; HTML recovery was used."** in a toast with a **success checkmark**. It is jargon, it cannot be acted on, and the icon is wrong.
  - **Printing is blocked:** "Review this chapter before printing: This chapter contains invalid XHTML…". No review action exists.
- **Fix, in order:**
  1. Before parsing, replace HTML named entities with numeric references using the WHATWG entity table, which is only needed when `&[a-z]` occurs outside the five XML entities. Retry the XML parse.
  2. Declare well-known prefixes (`epub`, `xlink`, `m`, `svg`) on the root if they are used but not declared, and retry.
  3. Only then fall back to HTML. Before HTML parsing, expand `<tag …/>` into `<tag …></tag>` for non-void elements, so the fallback keeps the structure.
  4. Log recovery details for diagnostics, and do not show the reader a toast unless content was actually lost.
- **Tests:** an EPUB 3 chapter with `&nbsp;`; an undeclared `epub:` prefix; a genuinely malformed chapter. Assert the structure and assert that printing is allowed.

### N-2 (P1): printing is blocked by non-content warnings

- **Where:** `App.tsx:1323-1324` throws on `r.warnings.length`.
- **Problem:** the team rightly wants print to stop when content would be lost. The warning list mixes **content-loss** warnings (image unavailable, style resource blocked) with **recovery notes** (XHTML recovery, a skipped layered `@import`).
- **Fix:**
  - Give warnings a severity: `{ level: "info" | "degraded" | "lossy", message }`.
  - Print freely on `info`.
  - On `degraded` or `lossy`, show the list in the print dialog with **Print anyway**, which is an explicit and informed choice. This is the "future print preview" the response already proposes.

### N-3 (P2): DjVu printing is limited and the dialog misdescribes it

> **Correction.** An earlier version of this section said PDF printing was rasterized. That was wrong. For PDF, the header button is **Download original PDF** (`App.tsx:1292-1295` and `:1996-2014`), and it returned byte-identical files for all 5 real PDFs in §8. Only DjVu uses the raster print path.

- **Where:** `App.tsx:1305` (`printScope === "book" && !engine.fixedPages`) and `App.tsx:1316-1327`. DjVu renders one page at 1754×2480 and prints it as an `<img>`.
- **Problems:**
  - Only the **current page** can be printed. "Whole book" is hidden.
  - The page prints as a **raster**, so text is not selectable.
  - The dialog body still says "Text stays selectable and original images are used", which contradicts the DjVu fine print below it.
- **Fix:** allow DjVu page ranges with a bounded queue, offer "Download original DjVu" beside printing (as PDF already does), and make the dialog copy depend on the format.

### N-4 (P2): the whole-book print count includes supplementary files

The dialog shows "`engine.chapters.length` chapters" (`App.tsx:2981`), which now includes non-linear and out-of-spine XHTML. Probe: it shows **5 chapters** for a book with **3** linear chapters, while whole-book printing correctly prints 3. Use `engine.linearCount`.

### N-5 (P2): toast semantics and placement

- Informational, warning and success messages all use the green check icon. Warnings need their own visual style and `role="status"` text that does not claim success.
- On mobile the toast sits over the bottom of the reading text. That is acceptable, but it should avoid the page footer as it does on desktop.

### N-6 (P2): library refresh loads every book record, including binaries

- **Where:** `refresh()` (`App.tsx:405-412`) calls `db.books.orderBy("lastRead").reverse().toArray()`.
- **Effect:**
  - Native Blobs are lazy, so the cost is small in normal Chrome.
  - In the **compatibility storage path** (`binary-storage.ts`), each record stores its file as `ArrayBuffer` chunks. IndexedDB materializes those chunks on read, so **every library refresh loads every compatible file into memory**, up to 64 MB per item plus its reading copy and cover.
  - The records also carry `prepared` reading copies for MOBI and Markdown.
- **Fix:** split the schema into `books` (metadata, used for listing), `files` (original, prepared copy, cover) and `previews`. List from metadata only, and load files when a book is opened. This also makes backup snapshots cheaper.

### N-7 (P2): the main component grew instead of splitting

`App.tsx` has 3,129 lines, 47 `useState`, 26 `useRef` and 20 `useEffect`, and it now coordinates EPUB, MOBI, Markdown, PDF and DjVu, fullscreen, previews, backup, OCR, print and Drive. Every new format increases the cost of change. Recommended order:

1. `ReaderView` vs `LibraryView`.
2. A `useDocument` hook for engine lifecycle, chapter rendering and the paginator.
3. `useAnnotations`.
4. `usePrint` and `useOcr`.
5. Dialogs as separate components.

Add ESLint with `react-hooks/exhaustive-deps` **before** the split, so that stale closures surface during the move.

### N-8 (P2): navigation basics now dominate the gap with other readers

None of these changed. They are the most visible shortcomings in daily use:

- **Find:** first match only, current chapter only, and matches inside a single text node only.
- **Reload and Back:** reload exits the book, browser Back leaves the app, there are no deep links, and each toolbar click opens a new tab.
- **External links:** inert.
- **Highlights:** one color, no notes, no edit. Bookmark labels still use layout-dependent page numbers.
- **Page turning:** no tap or click zones and no two-page spread.

### N-9 (P2): the larger attack surface needs explicit hardening and tests

The new parsers are PDF.js 6.4, the `djvu-rs` WASM worker, `@lingo-reader/mobi-parser` (patched at install by `scripts/patch-mobi.mjs`), `marked`, `html2canvas` and `css-tree`. The architecture is sound: parsing happens in workers, and MOBI and Markdown output passes through the EPUB sanitizer and the scriptless iframe. Recommendations:

- Pin explicit PDF.js options: `isEvalSupported: false`, `enableXfa: false`, `maxImageSize` and `stopAtErrors` policy. Do not rely on defaults combined with the CSP.
- Replace the string-replacement patches in `patch-mobi.mjs` with a vendored fork or `patch-package` diffs that fail loudly when upstream changes. Today a silent non-match only "fails" if the script checks for it.
- Add malformed-input fuzz fixtures for each parser (truncated PDF, oversized DjVu dimensions, MOBI with bad record offsets), with time and memory assertions.
- `html2canvas` renders book DOM to make previews. Keep it confined to the sandboxed frame and covered by the unsafe-content fixture.

### N-10 (P3): fragile error detection in the storage-compatibility layer

`blobStorageError()` (`binary-storage.ts`) recognizes Blob storage failures by matching English error-message text. A browser change in wording would silently skip the recovery path. Probe capability once at startup (write a small Blob to a scratch store and read it back) and choose the storage mode from the result.

### N-11 (P3): the sample card stays visible after the sample is imported

The library shows both the imported *Quiet Atlas* and the sample card offering to "Open the sample". Duplicate detection now opens the existing copy, so no data problem arises, but the card is redundant. Hide it once the sample's hash is in the library. The sample's generated cover is also still the off-palette grey-blue.

### N-12 (P3): CI depends on GitHub availability for the corpus

`npm test` downloads the corpus from GitHub on a fresh machine. Cache `test-results/corpus` in CI, keyed by the pinned commit, so a GitHub outage does not fail unrelated changes.

### Findings from real-library testing (R-1 to R-8)

These defects were found by testing 7 EPUBs and 5 PDFs from the owner's library. They are part of this audit's findings and carry the same severity scale. Evidence, causes and fixes are in [§8](#8-real-library-test).

| ID | Severity | Finding | Where |
| --- | :-: | --- | --- |
| R-1 | P1 | Google Docs–exported EPUBs cannot be printed. The blocked online-font `@import` is treated as content loss, and the same warning appears with a success icon every time the book opens. | `publisher-css.ts` import warning; `App.tsx:1323-1324` |
| R-1b | P1 | Printing also fails when an export contains `<img>` elements with no `src`: "An image failed to decode". | `App.tsx:1364` (print image-decode check) |
| R-2 | P1 | A highlight created on text that repeats in the book is never drawn and is listed as "Location needs review" immediately after "Highlight saved." | `highlight()` in `App.tsx`; `resolveLocator()` in `locators.ts:240` |
| R-3 | P2 | Calibre cover pages (`<svg preserveAspectRatio="none">`) are stretched from portrait to landscape on desktop. | EPUB render path; reader CSS |
| R-4 | P2 | Long filename-style titles in the contents panel overlap the page count. | `.toc-item` styles |
| R-5 | P2 | Junk PDF metadata ("Microsoft Word - rwtw4.docx", ".docx" suffixes) is shown as the document title. | `fixed-document.ts:155-158` (metadata Title overrides the filename) |
| R-6 | P2 | Chapter labels follow files, not sections: "Chapter 41 of 67" for a 40-character fragment, and a 242-page main text labelled "Table of Contents". | chapter title mapping in `epub.ts`; toolbar label |
| R-7 | P2 | Single-file books (Google Docs exports) take 3.3–6.7 s to show page 1 and offer one contents entry for 175–255 pages. | paginator start-up; navigation parsing |
| R-8 | P2 | Desktop toasts cover the reader's Fullscreen, Print and Settings buttons for 4.5 s after opening a book or saving a highlight. | toast placement in `style.css` |

**Updated totals for this audit:** 12 findings from code review and probes (N-1 to N-12) plus 9 from real files (R-1 to R-8, with R-1b), of which **4 are P1**: N-2, R-1, R-1b and R-2.

---

## 5. Measurements

| Metric | v0.2.0 | v0.4.5 |
| --- | --- | --- |
| Reader tests | 11 passed in 25 s | **45 passed in 2.4 min** |
| Production dependency advisories | 0 | 0 |
| Extension size | 32.2 MB | 40.5 MB (OCR 31 MB, PDF and DjVu 6.3 MB) |
| Main JS chunk | 562 kB | 828 kB, with PDF.js (430 kB) and html2canvas (199 kB) split out |
| Library text below 4.5:1 contrast | 30 / 45 | **1 / 47** (decorative glyph) |
| Reader chrome text below 4.5:1 | 31 / 36 | **0 / 36** |
| UI text below 12 px (library) | 28 / 45 | 2 / 47 |
| Mobile controls below 24 px | ≥ 4 | 1 ("Find", 23×32) |
| Reading frame at 1440×900, normal mode | 57% | 57% (fullscreen available) |
| 200-chapter EPUB: import to first page | — | **343 ms** |
| 200-chapter EPUB: chapter switch | — | **103–148 ms** |
| 200-chapter EPUB: whole-book page count ready | — | **10.1 s** (background) |
| 200-chapter EPUB: JS heap after counting | — | **36 MB** |

Performance at this scale is good. A 1 GB or image-heavy benchmark is still outstanding, as the team's own limits section says.

---

## 6. Design review delta

**Improved:**

- The library opens straight to the shelf.
- Real first-page previews give documents identity.
- Books and Documents are separate.
- Body copy is legible.
- Night, sepia and paper apply only to the page, while the app follows the OS theme. This is a better model than the first audit proposed.
- Fullscreen keeps the reading tools.

**Still to do:**

1. **A type scale, not just a floor.** 77 declarations are now exactly 12 px, so most UI text has become one undifferentiated size. Define 12/13/14/16/20/24/32 roles (caption, label, body, title) and map components to them.
2. **Finish the tokens.** 84 raw hex colors remain alongside the semantic tokens. `--green`, `--muted`, `--border` and `--paper` coexist with `--text-*` and `--surface-*`, which suggests two systems. Remove the legacy names.
3. **Normal-mode reader chrome** still uses three bars around a bordered card. Merge the chapter toolbar into the header. Auto-hide the footer after a few seconds of reading, as fullscreen already does, so the 57% figure can rise without forcing fullscreen.
4. **Status messaging.** Use distinct styles for success, info, warning and error (N-5), and write plain-language copy ("Some formatting in this chapter was repaired").
5. **The selection toolbar** remains a single action. Colors, notes and copy-with-citation are the most-expected next steps.
6. **Generated covers:** the sample card's grey-blue is off-palette. Derive the generated cover color from the brand palette.

---

## 7. Next priorities

Ordered by user impact for effort:

1. **R-1 and N-2:** warning severities. Blocked online fonts are expected privacy behavior: never block printing for them and never show them as an alarm. Offer "Print anyway" for genuine losses. This unblocks printing for every Google Docs export.
2. **R-2:** make new highlights unique at creation (extend the context until the quote resolves to exactly one place) and break ties by `offsetHint` for same-renderer anchors.
3. **N-1:** entity pre-pass, prefix declaration and a self-closing-tag-safe fallback.
4. **Find:** next and previous, match count, whole-book and whole-document search with snippets. This is the most-used missing feature, and it is nearly useless on Calibre books split into small files (§8) and on PDFs, where it searches only the visible page.
5. **Hash routing plus single-tab reuse:** reload keeps your place, Back works, deep links to `#/book/:id?loc=` become possible, and a `BroadcastChannel` keeps tabs in sync.
6. **Annotation workflow:** colors, a note on each highlight, edit and delete from the page, quote-based bookmark labels, Markdown export.
7. **Real-library polish (§8):** undistorted Calibre SVG covers (R-3), section-aware chapter labels (R-6), junk PDF title filtering (R-5), and the contents-panel overlap (R-4).
8. **ESLint, then split `App.tsx`** (N-7).
9. **Schema split** into metadata, files and previews (N-6).
10. **External links** with a visible destination and confirmation.
11. **Tap zones, two-page spread and auto-hiding chrome in normal mode.**
12. **N-3:** DjVu page ranges, original download and format-specific dialog copy.
13. **Grow the corpus** to 10+ real books, including Standard Ebooks and Project Gutenberg EPUB 3, an EPUB 3 file with `&nbsp;`, a vertical CJK book and a fixed-layout book. Add parser fuzz fixtures (N-9).

The later-phase items from the first audit (read aloud, collections and reading status, sync through Drive `appDataFolder`, OPDS, opt-in on-device AI) remain valid. They should follow items 1–6, which are the basics users will notice first.

---

## 8. Real-library test

At the owner's request, Folio v0.4.5 (`ef8d0ce`) was tested with **7 EPUBs and 5 PDFs from the owner's own Google Drive**. The files were read through the Drive connector, kept only in the test machine's scratch space, and were **not committed**. Personal documents (CVs, forms, correspondence) were deliberately excluded. Files are described below by type and production tool rather than by title.

Each file was imported into a fresh browser profile at 1440×900 and exercised as follows:

- open to the first page;
- walk up to 40 chapters (EPUB) or 8 pages plus a jump to the last page (PDF);
- Find;
- create a highlight, reload, reopen and confirm it is still drawn;
- print (EPUB) or download the original (PDF);
- check the library card and preview.

Ground truth came from the archive contents, `pdfinfo` and an independent PDF outline reader.

### EPUB results

| File type | Production | Size | Open to first page | Chapter switch (median / max) | Pages counted | Highlight survives reopen | Print |
| --- | --- | --- | --- | --- | --- | :-: | --- |
| Greek school textbook A | Google Docs export, EPUB 3, one 513 KB XHTML file | 1.6 MB | 6.7 s | — (1 file) | 198 | ✅ | ✖ blocked (R-1) |
| Greek school textbook B | Google Docs export, EPUB 3, one 646 KB XHTML file | 0.45 MB | 5.4 s | — (1 file) | 255 | ✖ vanished (R-2) | ✖ blocked (R-1b) |
| Greek teacher's book | Google Docs export, EPUB 3, one 323 KB XHTML file | 2.4 MB | 3.3 s | — (1 file) | 175 | ✖ vanished (R-2) | ✖ blocked (R-1) |
| University-press academic companion | Calibre conversion, EPUB 2, 67 files | 0.7 MB | 0.5 s | 302 / 542 ms | 1,588 | n/a¹ | ✅ |
| Trade non-fiction | Calibre conversion, EPUB 2, 19 files, 112 contents entries | 2.0 MB | 0.6 s | 308 / 551 ms | 858 | ✅ | ✅ |
| 19th-century public-domain work | Retail digital-library edition, EPUB 2, 30 files, 61 images | 2.3 MB | 0.6 s | 292 / 523 ms | 740 | ✅ | ✅ |
| 19th-century public-domain work | Scan-to-EPUB with OCR text, EPUB 3, 203 contents entries | 0.5 MB | 0.5 s | 286 / 552 ms | 262 | ✅ | ✅ |

¹ The automated selection landed on a chapter fragment with no selectable text.

### PDF results

| File type | Production | Pages | Open | Page turn | Outline shown / actual | Text layer | Find | Highlight survives | Original download |
| --- | --- | --: | --: | --: | --- | :-: | --- | :-: | :-: |
| Trade finance book | QuarkXPress, tagged | 226 | 0.8 s | ≈330 ms | 0 / 0 | ✅ | page only | ✅ | byte-identical |
| Self-published e-book | unknown, tagged | 214 | 1.0 s | ≈330 ms | 16 / 17 | ✅ | page only | ✅ | byte-identical |
| Greek study book, 124 pages | Google Docs (Skia) | 124 | 1.0 s | ≈340 ms | 196 / 196 | ✅ | page only | ✅ | byte-identical |
| Greek EU fact sheet | Apache FOP, tagged | 5 | 1.0 s | ≈335 ms | 7 / 7 | ✅ | page only | ✅ | byte-identical |
| Greek official exam paper | Microsoft Print to PDF | 3 | 0.8 s | ≈335 ms | 0 / 0 | ✅ | page only | ✅ | byte-identical |

Jumping to the last page took 311–417 ms. JS heap stayed between 10 and 30 MB in every session. No page errors or console errors occurred in any of the 12 sessions.

### What works well

Calibre, retail and scan-derived EPUBs open in about half a second. Chapter changes stay near 300 ms. Whole-book page counts complete in the background (1,588 pages for the 67-file companion). Greek text, Greek Find and highlight persistence all work. PDF support is the strongest part of v0.4.5: fast, correct outlines, real text layers, highlights and lossless original downloads. The library shows publisher covers and real first-page previews, and the Books/Documents split was correct for all 12 files.

### New findings from real files

**R-1 (P1): every Google Docs–exported EPUB is unprintable, and two of them warn on every open.**

Google Docs exports include `@import url(https://themes.googleusercontent.com/fonts/css?kit=…)`. Folio correctly blocks the import for privacy. It then shows "A publisher stylesheet import could not be loaded safely." with a success checkmark, and printing fails with "Review this chapter before printing: …".

**R-1b**, a second path in the same exports: `<img>` elements with no `src` (65 of 80 in one book) make the print step fail with "An image failed to decode. No incomplete PDF was printed." No content is missing, since those elements never had an image.

**Fix:**

- Classify blocked *remote* resources as expected `info`, never as content loss.
- Skip `img:not([src])` when waiting for images to decode before printing.
- Combine with N-2's severities.

**R-2 (P1): new highlights on repeated text vanish immediately.**

The selected text in two of the three Google Docs textbooks also appears elsewhere: a heading that occurs 2–3 times. The app confirms "Highlight saved.", draws nothing, and lists the highlight as **"Location needs review"** even before any reload.

- **Cause:** `highlight()` (`App.tsx`) stores a 48-character prefix and suffix without checking that they are unique. Here the prefix was only 12 characters, at the start of the document. `resolveLocator()` (`locators.ts:240`) then returns `null` on a score tie and ignores `offsetHint`, even for an anchor created moments earlier by the same renderer.
- **Fix:**
  - At creation, extend the prefix and suffix (up to about 256 characters) until the quote resolves to exactly one range.
  - When `locator.rendererVersion === RENDERER_VERSION`, break ties by distance from `offsetHint`.
  - Add a regression test that highlights a repeated heading.

**R-3 (P2): Calibre cover pages are distorted.**

Calibre's standard `titlepage.xhtml` wraps the cover in `<svg viewBox="0 0 W H" preserveAspectRatio="none">`. On a desktop page, both 3:4 portrait covers in the test (1200×1600 and 525×700) were stretched to about 740×582, which is landscape. Calibre output is extremely common.

**Fix:** for a spine item whose body is a single SVG wrapping one `<image>`, override `preserveAspectRatio` to `xMidYMid meet`, or size the SVG box to the image's aspect ratio.

**R-4 (P2): long contents-panel titles overlap the page count.**

Underscore-separated, filename-style titles with no spaces run underneath "198 pages" in the contents panel.

**Fix:** reserve the count column, and add `overflow-wrap: anywhere` with a two-line clamp on the title.

**R-5 (P2): junk PDF metadata is shown as the title.**

Two of the five PDFs display their internal Title field: "Microsoft Word - rwtw4.docx" instead of the file's real name, and a "….docx" suffix on another.

**Fix:** when the metadata title matches `^Microsoft Word - `, ends in `.doc`/`.docx`/`.pdf`, or is "untitled", fall back to the cleaned filename. Let the user edit titles.

**R-6 (P2): chapter labels come from files, not sections (real-world P1-12).**

- The 67-file Calibre companion shows "Chapter 41 of 67" for a 40-character abbreviations fragment, while the book has roughly a dozen real chapters.
- The scan-to-EPUB labels its entire 242-page main text "Table of Contents", because that is the first contents entry pointing into the file.

**Fix:** label by the nearest preceding contents entry for the visible page, and show "Section N of M" or nothing when the contents don't map to files.

**R-7 (P2): single-file books are slow to open and have no useful contents.**

Each Google Docs export puts the whole textbook in one XHTML file. That costs 3.3–6.7 s to the first page, because the entire file is laid out before page 1 appears, and the contents panel has one entry for 175–255 pages. These exports use styled paragraphs instead of `<h1>`–`<h3>`.

**Fix:**

- Paginate progressively, showing page 1 as soon as its column is laid out.
- When the navigation document has a single entry, offer a "Sections" list generated from heading-like paragraphs (large or bold single-line paragraphs).
- Make whole-book Find (priority 4) the primary navigation for such books.

**R-8 (P2): toasts cover the reader's toolbar.**

On desktop, the top-right toast covers the Fullscreen, Print and Settings buttons for 4.5 s after every open and every highlight.

**Fix:** place toasts below the header, or bottom-center above the page footer, which is now clear of the navigator.

**Not reproduced:** N-1, the XHTML-recovery regression, did not occur in any of the seven real EPUBs. Its severity is lowered to P2 above.

---

## Appendix: reproduction

New probe chapter (EPUB 3, no DOCTYPE):

```xml
<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Entities</title></head>
<body><h1>Entity chapter</h1>
<p>Non&nbsp;breaking space, then <a id="pg3"/>after anchor.</p><div class="gap"/>
<p id="next">Paragraph after empty div.</p></body></html>
```

| Check on `ef8d0ce` | Expected | Observed |
| --- | --- | --- |
| Original probe: `<title/>` chapter text | visible | ✅ "Chapter with empty title / If you can read this…" |
| Original probe: linked CSS `text-indent` | 1em | ✅ `22px` |
| Original probe: RTL chapter | `rtl`, `ar` | ✅ `rtl`, `ar` |
| Original probe: footnote link | opens note | ✅ "Footnote one.", with a Back control |
| Original probe: `body.pub-body` | kept | ✅ kept |
| Original probe: external link `href` | openable | ✖ `null` |
| New probe: `#pg3` content | empty | ✖ "after anchor." |
| New probe: `.gap` content | empty | ✖ "Paragraph after empty div." |
| New probe: reader notice | none, or plain language | ✖ "This chapter contains invalid XHTML; HTML recovery was used." with a check icon |
| New probe: print current chapter | print dialog | ✖ "Review this chapter before printing: …" |
| `&nbsp;` with XHTML 1.0/1.1 DOCTYPE | parses as XML | ✅ |
| `&nbsp;` with `<!DOCTYPE html>` or none | parses as XML | ✖ falls back to HTML |
| Find, Enter twice | second match | ✖ same first match |
| Reload while reading | stays in book | ✖ returns to library |
| Print dialog chapter count, 3-chapter book | 3 | ✖ 5 |
| Cross-paragraph highlight after reopen | kept | ✅ 3 marks before and after |

Commands: `npm ci && npm run build && node scripts/serve.mjs`, then use Playwright to drive `http://127.0.0.1:4173/reader.html` and import the probe files through the hidden file input.
