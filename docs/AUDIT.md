# Folio v0.2.0: strict audit of design, operability and capability

**Audit date:** 30 October 2026 · **Revision audited:** `b8c6555` (`main` lineage) · **Scope:** the whole repository: extension, web preview, docs, tests and CI.

This audit uses a strict standard. Folio is compared with mature readers (Apple Books, Kindle, Thorium, Readest, Foliate and KOReader), not with other early prototypes. Where a claim could be tested, it was reproduced in Chromium rather than inferred from the code. Reproduction steps are in the [appendix](#appendix-a--reproduction).

---

## 1. Executive summary

Folio has a **distinctive visual identity**, **unusually candid documentation** and a **careful security posture** for untrusted book content. Its pagination engine is also more capable than most hobby readers: position follows the text across reflow, the app counts pages for each chapter and resumes exactly where you stopped.

The core promise, *read your EPUBs*, is **not met for real-world books**. Four defects found in this audit affect most commercially produced and library EPUBs:

1. **Publisher stylesheets are never applied.** DOMPurify removes every `<link rel="stylesheet">` before Folio's inlining code runs. That inlining code is unreachable. *(Verified.)*
2. **XHTML is parsed as HTML.** A chapter containing `<title/>` renders **completely blank**. Self-closing `<a id="…"/>` and `<div/>` swallow the text that follows them. *(Verified.)*
3. **Non-linear spine items (footnotes and endnotes) cannot be opened.** Footnote links show "This link does not point to a readable chapter." *(Verified.)*
4. **Right-to-left and language metadata are discarded.** Arabic and Hebrew render left-to-right with misplaced punctuation. *(Verified.)*

Annotation anchoring makes these fixes harder. Highlights and bookmarks are stored as **raw character offsets into the sanitized DOM**, so any fix to defects 1 to 4 shifts those offsets and **silently misplaces every existing highlight**. A robust anchoring model must ship before or together with the rendering fixes.

The library also lacks durability guarantees: it never calls `navigator.storage.persist()`, the extension does not request `unlimitedStorage`, and there is no backup or restore. A "local-first" product without those is one browser cleanup away from losing the user's library.

On design, the aesthetic is strong but the **design system is missing**. The CSS has 194 unique hex colors and only 4 tokens, plus 18 font sizes between 6 px and 55 px with no scale. **Most UI text is 7 to 10 px and below WCAG contrast** (measurements in §5). Reader chrome takes **43% of a 1440×900 viewport**.

### Scorecard

| Area | Grade | One-line verdict |
| --- | :-: | --- |
| Content isolation and security | **B+** | Sandboxed scriptless iframe, CSP in `srcdoc`, ZIP-bomb and traversal limits. Permissions are broader than needed. |
| Rendering fidelity | **D** | Linked CSS dropped, XHTML misparsed, RTL lost, non-linear items unreachable, external links dead. |
| Pagination and position | **B−** | Good reflow-stable resume. Single column only, no spreads, no tap zones, no prefetch. |
| Annotations | **C−** | Highlight works but has one color and no notes, no editing, fragile anchors and no import. |
| Search | **D** | Chapter-only, first match only, single text node only, no results list. |
| Library management | **D+** | No dedupe, collections, reading status, metadata or bulk import. Progress is miscalculated. |
| Data durability | **D** | Evictable storage, no backup or restore, export cannot be re-imported. |
| OCR | **C** | Works locally. It is attached to the wrong image, edits are lost, the model reloads every run and it is English only. |
| Print / PDF | **C** | Works for simple books. Any warning aborts it, it ignores the reader's typeface and has no TOC or annotations. |
| Google Drive | **D** | Never validated live, uses a restricted scope, no token refresh and paste-a-link only. |
| Accessibility (WCAG 2.2 AA) | **D** | Tiny low-contrast text, inputs without a focus indicator, incomplete tabs pattern, small touch targets. |
| Visual design: identity | **B** | Coherent editorial look and a calm tone. |
| Visual design: system and legibility | **D+** | No tokens or type scale. Dark mode exists only in the reader and is hand-patched. |
| Architecture and code quality | **C−** | 2,193-line single component with no routing, error boundary or lint. |
| Tests and CI | **C+** | 11 + 3 end-to-end tests pass in 25 s. No real-world corpus, unit, a11y or visual tests. |
| Documentation | **A−** | Honest about limits. Overstates nothing except chapter-navigation depth. |

### Method

- Read all application source (about 3,400 lines of TypeScript and TSX, about 2,000 lines of CSS), the configs, scripts, tests, CI and docs.
- `npm ci`, `npm run typecheck` and `npm run build` all succeed. The extension is 32.2 MB, with one 562 kB JS chunk.
- `npm test` passes **11/11** in 25 s.
- Wrote an edge-case EPUB (appendix A) and Playwright probes that drive the production build at 1440×900 and 390×844. The probes measured computed font size and WCAG contrast for every visible text element, touch-target sizes, the share of the viewport used for reading, and a set of behaviors.

### Severity legend

- **P0:** breaks reading of common real books, or risks loss of user data.
- **P1:** a major capability is broken or missing compared with baseline readers.
- **P2:** a quality, polish or maintainability problem.
- **P3:** a minor issue.

---

## 2. P0: critical defects

### P0-1 Publisher stylesheets are stripped before they can be inlined

- **Where:** `src/epub.ts:285-328`
- **What:** `DOMPurify.sanitize(source, { WHOLE_DOCUMENT: true, … })` runs **before** the loop that turns `<link rel="stylesheet">` into inline `<style>`. DOMPurify's default allowlist does not include `link`, so the loop at `311-328` never finds anything.
- **Effect:** practically every EPUB ships its CSS this way, and none of it applies: indents, drop caps, small caps, poetry indentation, centered scene breaks, table styling and embedded `@font-face` fonts. The warning "Some book styles could not be loaded" is dead code. So is the `@import` warning for linked sheets.
- **Evidence:** the probe chapter links `style.css` (`p{text-indent:1em}`). The rendered document contains only Folio's own two `<style>` blocks, and the computed `text-indent` is `0px`.
- **Why tests miss it:** the sample book and fixtures use no linked stylesheets.
- **Fix:**
  1. Parse the raw chapter first and collect `link[rel~=stylesheet]` hrefs.
  2. Load and sanitize each sheet: rewrite `url()`, resolve `@import` recursively with a depth limit, and drop `expression()` and `behavior`.
  3. Inject the sheets **after** DOMPurify.
  4. Scope publisher CSS beneath `#folio-content`, for example with CSS nesting or `@scope`, so it cannot style Folio's viewport.
- **Tests to add:** linked CSS, nested `@import`, `@font-face` from the archive.

### P0-2 XHTML content documents are parsed with the HTML parser

- **Where:** `src/epub.ts:285` (DOMPurify defaults to `text/html`) and `src/epub.ts:303` (`DOMParser(…, "text/html")`)
- **What:** EPUB content documents are XHTML, where self-closing syntax is legal. The HTML parser ignores `/>` on non-void elements.
  - `<title/>` opens an RCDATA element that swallows **the entire rest of the document**. The probe chapter rendered **empty**.
  - `<a id="pg12"/>`, a very common page-break anchor, becomes an open `<a>` wrapping the following text. The probe found 3 href-less anchors where there should have been 1 of zero length.
  - `<div class="spacer"/>` swallowed the following paragraph.
- **Fix:** parse with `DOMParser(text, "application/xhtml+xml")`. On `parsererror`, fall back to `text/html` with a warning. Sanitize with DOMPurify `PARSER_MEDIA_TYPE: "application/xhtml+xml"`, or sanitize the parsed tree in place, keeping the SVG and MathML namespaces.
- **Tests to add:** `<title/>`, `<a id/>`, `<div/>`, inline SVG with `xlink:href`, MathML.

### P0-3 Non-linear spine items cannot be opened

- **Where:** `src/epub.ts:109-118` (`.filter(e => e.getAttribute("linear") !== "no")`) and `src/App.tsx:475-482` (`goHref`)
- **What:** items marked `linear="no"` are removed from `chapters`. Publishers mark footnote and endnote files, answer keys and pop-up content this way, and links into those files fail with "This link does not point to a readable chapter." *(Verified.)*
- **Fix:**
  - Keep all spine items with a `linear` flag. Skip non-linear items during sequential page turns, but allow link navigation to them, ideally as a **footnote pop-over** (§8).
  - Also resolve links to manifest items that are not in the spine.

### P0-4 Annotation anchors are fragile character offsets

- **Where:** `src/annotations.ts:13-55`, `src/reader.ts` (`textOffset`), `src/store.ts` (`Mark.start/end/textOffset`)
- **What:** a highlight is `{start, end}`, a count of characters across all text nodes of the **post-sanitization, post-rewrite** DOM. Bookmarks and resume positions use the same scheme. Anything that changes the rendered text sequence moves every anchor without warning: a sanitizer rule, an XHTML parsing fix (P0-2), a library upgrade, or a whitespace change.
- **Effect:** fixing P0-1 and P0-2 will **corrupt existing users' highlights** unless anchors are migrated. The JSON export (`App.tsx:1320-1345`) carries these offsets, so it is not portable to other tools.
- **Fix:**
  1. Define a versioned locator: `{ spineHref, cfi?, textQuote: { exact, prefix, suffix }, offsetHint, rendererVersion }`. This follows the W3C Web Annotation TextQuoteSelector and EPUB CFI.
  2. Re-anchor by quote, using the offset as a hint, and flag orphans in the UI instead of drawing them in the wrong place.
  3. Write a one-off migration: before switching renderers, compute quotes for all existing marks from the old renderer output. `Mark.text` already holds `exact`.
- **Also:** `range.surroundContents` (`annotations.ts:52`) only works on single text nodes. Splitting is handled, but overlapping highlights produce nested `<mark>`s with no visual distinction.

### P0-5 The library is evictable and has no backup

- **Where:** `wxt.config.ts:12` (no `unlimitedStorage`), and no call to `navigator.storage.persist()` anywhere in `src/`. Search the code to confirm.
- **What:** EPUB blobs, positions and annotations live only in IndexedDB under "best-effort" storage. Chrome can evict it under storage pressure. The web preview is even more exposed.
  - "Export notes" writes JSON that **cannot be imported back**, and it excludes the books.
  - There is no restore path after reinstalling, changing profile or moving machine.
- **Fix:**
  - Request `unlimitedStorage` in the extension. Call `navigator.storage.persist()` on the first import and show the result in a "Storage" panel with usage and quota.
  - Add **Backup library** (books + metadata + annotations + OCR → a single `.folio` ZIP) and **Restore**.
  - Add "Import notes", which merges by locator and book content hash.

---

## 3. P1: major operability defects

| # | Defect | Where | Evidence or effect | Fix |
| --- | --- | --- | --- | --- |
| P1-1 | `lang`, `dir`, `xml:lang` and `<body>`/`<html>` attributes and classes are discarded. Only `body.innerHTML` is kept. | `epub.ts:384-389` | Probe RTL chapter: `dir=""` and the computed direction is `ltr`. The Arabic period renders on the wrong side. Publisher selectors such as `body.calibre` never match. No `lang`, so no hyphenation and wrong screen-reader voice. | Carry `lang`/`dir`/`class` from `<html>`/`<body>` onto `#folio-content`. Default `dir` from the OPF `page-progression-direction` and `dc:language`. Mirror page-turn direction for RTL. |
| P1-2 | Paging-position capture assumes LTR horizontal text. | `reader.ts:366-368` (`caretRangeFromPoint` at the top-left corner) | RTL and `writing-mode: vertical-rl` (Japanese and Chinese) resume at the wrong spot. | Probe the logical start corner from the computed `direction`/`writing-mode`. |
| P1-3 | External hyperlinks are silently disabled. | `epub.ts:365-383`. `resolvePath` throws for `https:` links, so `href` is removed. | Probe: an external link has `href = null`. Bibliographies and references are dead. | Keep external links as `data-external-href`. Open them through `chrome.tabs.create` / `window.open(…, "noopener")` after showing the domain. |
| P1-4 | Find in chapter returns only the **first** match, matches only within a single text node, has no next/previous, count or highlighting of all matches, and no whole-book search. | `App.tsx:923-946` | Pressing Find twice selects the same range (`Anchors@0` both times). A phrase across `<em>` is never found. | Build a text index per spine item, searched in a worker. Add a results list with context snippets and next/previous (Enter / Shift+Enter). Highlight matches with the CSS Custom Highlight API so the DOM is not mutated. |
| P1-5 | Printing aborts on **any** render warning. | `App.tsx:857-858` | Masked today because linked CSS never loads (P0-1). After P0-1 is fixed, any book with `@import` or a missing image becomes unprintable. | Treat warnings as non-fatal and list them in the print dialog. |
| P1-6 | No URL state or routing. | `App.tsx` (`selectedId` lives only in React state) | Reloading in the reader returns to the library *(verified)*. Browser Back leaves the app. There are no deep links to a book or location, and each toolbar click opens a **new** tab (`entrypoints/background.ts`). | Use hash routes (`#/book/:id?loc=…`). Focus an existing Folio tab from the action button through `chrome.tabs.query`. Add a `BroadcastChannel` so tabs stay in sync. |
| P1-7 | Duplicate imports. Book identity is a random UUID. | `App.tsx:326-337` | Opening the sample twice gives 2 identical cards *(verified)*. Re-importing a book cannot recover its annotations. | Use a SHA-256 of the file (computed in a worker) plus the OPF `unique-identifier`. Offer "Already in library: open it or replace it?" |
| P1-8 | The progress bar is wrong. | `App.tsx:1213` | A freshly imported 5-chapter book shows 10% *(verified)*: a missing `page` is treated as a finished chapter. All chapters are weighted equally regardless of length. | Weight by chapter character count, which is cheap from the ZIP sizes or the text index. Show 0% until reading starts. |
| P1-9 | OCR modal shows the **latest OCR for the chapter** regardless of the selected image. Textarea edits are never saved. Each run adds a duplicate DB row. A new worker (≈11 MB model) is created per image. OCR text cannot be searched or overlaid. | `App.tsx:778-835, 1382-1404` | Recognition of image 2 is shown under image 1. | Key OCR by image path + content hash. Persist edits. Reuse one worker per session. Add "OCR all images in chapter/book" with a progress queue. Place an invisible text layer over images so they can be selected and searched. Add a language selector with lazily downloaded traineddata. |
| P1-10 | Google Drive is not production-viable. | `drive.ts`, `wxt.config.ts:12-21` | `drive.readonly` is a Google **restricted** scope: public distribution requires a third-party security assessment. The project's own RESEARCH.md recommends `drive.file` + Picker. There is no `removeCachedAuthToken` retry on 401, so an expired token fails until the cache expires. Files must end in `.epub` even when the `mimeType` is `application/epub+zip`. The integration has never been tested against a live account. | Switch to `drive.file` + Google Picker. Retry a 401 once after `removeCachedAuthToken`. Accept by MIME type. Move `identity` and the googleapis host to `optional_permissions`, requested on first Drive use. |
| P1-11 | The theme toggle discards Sepia. | `App.tsx:1443-1445` | Sepia → toggle → toggle ends on `paper` *(verified)*. | Remember the last light theme, or cycle through the three themes. |
| P1-12 | TOC fidelity. | `epub.ts:179-195` (NCX `depth: 0`), `App.tsx:1513-1524` | NCX hierarchies are flattened. TOC numbering uses the list index, not chapter numbers. "CHAPTER 01" in the toolbar counts cover, title and copyright pages as chapters. Every sub-entry pointing into the same file shows as "active". | Recurse `navPoint` for depth. Number only what the publisher numbers, or nothing. Show the TOC title of the current section, found from the nearest preceding anchor on the page. Add collapsible TOC levels. |
| P1-13 | Metadata is shallow. | `epub.ts:96-106` | Only the first `dc:title`, which can be a subtitle. All `dc:creator` values are joined, including editors and illustrators. No language, publisher, date, series (`belongs-to-collection` / `calibre:series`), description or subjects. | Parse the refined title (`title-type=main`) and author roles. Store the full metadata and show it in a book details sheet. |

---

## 4. P2: quality and robustness

- **The reading frame is unmounted during print or any busy state.** `App.tsx:1664` (`chapterLoading || busy ? spinner : iframe`). Printing destroys and rebuilds the chapter, which flickers and drops the selection.
- **No chapter prefetch or render cache.** Every chapter crossing calls `releaseResources()` and re-extracts its resources (`App.tsx:409-443`), so the reader shows "Turning the page…" at each chapter boundary. Pre-render chapter N+1 into a hidden frame and keep a small LRU of rendered HTML and object URLs.
- **Background page counting is expensive and not debounced.** `App.tsx:564-634` opens a **second** `Epub` and renders every chapter, including image extraction, in an off-screen iframe. Every font step (A+), margin change or window resize changes the layout key and restarts the full pass. Debounce by about 500 ms and use `requestIdleCallback`. Measure text-only HTML, with images given explicit dimensions. Persist counts for each layout key, which is already done.
- **Keyboard model is split** between the parent window (arrows and Page keys) and the iframe (also Space, Home and End). There are no shortcuts for bookmark, find, TOC or settings, and no `?` help overlay.
- **Single-slot toasts** overwrite each other and sit **on top of the page navigator** (screenshot evidence: they cover "Page 1 of 2" and the slider). Move them to the top, or stack them above the footer.
- **The three-dots "More" icon opens the destructive Remove dialog directly** (`App.tsx:1199-1207`). The affordance promises a menu.
- **Inconsistent book opening.** The cover button calls `setChapter(book.chapter)`; the title button does not (`App.tsx:1180-1197`).
- **Drag and drop** accepts only the first file, gives no drop-zone feedback and rejects folders without a message. The file picker lacks `multiple`.
- **Storage pre-check** compares the file size with `quota − usage`, but IndexedDB stores the blob plus the cover and overhead. Handle `QuotaExceededError` from `db.books.add` explicitly.
- **Settings** are 7 unversioned `localStorage` keys, including a legacy `folio-dark` that is still written on every change (`App.tsx:268-276`). Per-book overrides, such as a different font for a poetry book, are impossible.
- **Highlights draw in one fixed color** (`#f0de95`). It is the same in night mode and indistinguishable from search hits.
- **Bookmarks are labelled "Page N · Chapter title".** Page numbers change with layout, so labels become wrong after a font change. Store and show a text snippet.

---

## 5. Accessibility audit (WCAG 2.2 AA)

Measured with computed styles on the production build:

| View | Visible text elements | < 12 px | < 10 px | Contrast < 4.5:1 | Worst examples |
| --- | :-: | :-: | :-: | :-: | --- |
| Library, 1440×900 | 45 | 28 | 13 | **30** | "Bring your next read along." 10 px at 2.24:1 · import hint 9 px at 2.32:1 · art caption 7 px at 2.32:1 · footer 9 px at 2.35:1 |
| Reader, 1440×900 | 36 | 29 | 17 | **31** | TOC page counts 8 px at 2.06:1 · TOC numbers 9 px at 2.09:1 · "TABLE OF CONTENTS" 8 px at 2.21:1 · tab label "Saved" 10 px at 2.45:1 |
| Reader, 390×844 | — | — | 5 | — | chapter location **7 px** · Previous/Next page 8 px · "CHAPTER 01" 8 px |

Failures:

1. **1.4.3 Contrast (minimum).** 67% of library text and 86% of reader-chrome text fail 4.5:1. The mid-grey-green on off-white (`#8a927e`, `#a0a795` and similar) is the root cause.
2. **1.4.4 / 1.4.12 Text size and legibility.** 53 CSS declarations set text at 10 px or smaller (35 of them below 10 px), down to 6 px (`.cover-kicker`, `.sample-badge`). This is a legibility failure even where it is not strictly a WCAG failure.
3. **2.4.7 Focus visible.** `.search input` and `.chapter-find input` set `outline: none` (`style.css:424, 1137`) with no replacement. Verified: computed outline is `none`. `:focus-visible` styles cover only `button` and `a`.
4. **2.5.8 Target size (minimum).** On mobile, 11 controls are under 32 px and several are under 24 px: "Find" 18×10, Previous/Next page 18 px tall, chapter arrows 24×28, the toast close button 21×21.
5. **4.1.2 / ARIA tabs.** The reader tabs use `role="tab"` without `tabpanel`, `aria-controls` or roving `tabindex`, and arrow keys do nothing *(verified)*.
6. **Dialog.** Initial focus lands on "Close dialog" instead of the first meaningful control. The focus-trap selector omits `textarea`, so the OCR result cannot be reached by Tab cycling. Use `aria-labelledby` on the `<h2>` rather than a duplicate `aria-label`.
7. **The sample cover is a `<div onClick>`** (`App.tsx:1229`). A duplicate button exists, but pointer and keyboard paths differ.
8. **Language of parts (3.1.2).** Book `lang` is dropped (P1-1), so screen readers read French books with an English voice.
9. **Strengths:** reduced motion is respected, dialogs trap focus, the page count is announced via `aria-live`, and icon buttons have accessible names.

**Recommendation:** set a 12 px floor for UI text (14 px for body UI), a 4.5:1 floor for all text and 3:1 for UI boundaries. Add `@axe-core/playwright` to CI and fail on serious or critical violations.

---

## 6. Visual and interaction design review

### What works

- A coherent, calm, editorial identity: serif display type, forest-green palette, paper tones and good restraint in the reading view.
- Reading typography defaults are good: about 740 px measure, 1.7 leading, Georgia.
- Empty states and microcopy have personality. The reading-settings sheet is clear and well grouped.

### What does not

1. **There is no design system.**
   - `:root` defines 4 custom properties, while the stylesheet contains **194 unique hex colors**.
   - There are **18 distinct font sizes** from 6 px to 55 px, with no scale.
   - Night mode is implemented as `.night .selector` overrides (`style.css:1350-1386`), Sepia as `.app.sepia` overrides, and the **library has no dark mode at all** and ignores `prefers-color-scheme`. Verified: the library background stays light after choosing Night.
   - **Action:** define semantic tokens (`--surface-*`, `--text-primary/secondary/muted`, `--accent`, `--border`, `--focus`, `--highlight-*`), a modular type scale (12/14/16/20/24/32/48), and a spacing scale. Theme by swapping tokens on `:root[data-theme]`. Apply themes app-wide and follow the OS by default.
2. **UI text is too small and too pale** (§5). Letter-spaced 6 to 9 px micro-caps are a stylistic signature, but at this size they are illegible. Keep the style at 11 to 12 px minimum with darker ink.
3. **The hero never goes away.**
   - About 380 px of decorative fake books ("THE ART OF NOTICING", "the quiet in between") sit at the top of the library on **every** visit, pushing the user's own books below the fold.
   - Marketing taglines repeat in five places: top bar, sidebar footer, library footer twice, reader sidebar.
   - **Action:** show the hero only when the library is empty. Replace it with a **Continue reading** strip (cover, progress and time left), and remove taglines from working surfaces.
4. **Reader chrome takes 43% of the screen.**
   - At 1440×900 the reading frame is 1112×670 px. A header, a chapter toolbar, a footer, a sidebar and the card border with its padding are all stacked around it.
   - **Action:** add an **immersive mode**: auto-hide the chrome after 2 s of reading, reveal it on pointer movement near an edge or on tap in the center, and support the Fullscreen API. Merge find and bookmark into the header and drop the separate chapter toolbar.
5. **Single column at every width.** Above roughly 1200 px wide, offer a **two-page spread**, which is standard in desktop readers. Also honor `rendition:spread`.
6. **Page-turn affordances.** Add **tap or click zones** on the left and right thirds, which is the convention on every e-reader, and an optional subtle slide or fade turn animation that respects reduced motion.
7. **Selection toolbar offers only "Highlight".** Expected options: highlight colors, add note, copy, copy with citation, search book, define, translate and read aloud from here.
8. **Generated covers** all share one layout, and the sample's grey-blue cover is off-palette (`cover-${title.length % 4}`). Derive the cover color from a hash of the title within the brand palette, and use the publisher cover when present, which already works.
9. **Redundant controls.** A−/A+ and the theme toggle exist both in the header and in the settings sheet. Keep a single "Aa" entry point, the convention in Apple Books and Kindle.
10. **Mobile.** The library uses an icon-only 72 px rail where a bottom tab bar fits phones better. The "Find in chapter" input is truncated ("Find in chapte"). Footer text is 7 to 8 px. A bottom sheet for settings and TOC would follow phone conventions.
11. **Loading states.** Every chapter crossing replaces the page with a spinner. Prefetch removes this (§4).

---

## 7. Architecture, code quality, tests and CI

| Topic | Finding | Recommendation |
| --- | --- | --- |
| Component structure | `src/App.tsx` is **2,193 lines**: one component with about 45 `useState`, about 20 `useRef` and every feature (library, reader, OCR, print, Drive, settings, dialogs). | Split into `LibraryView`, `ReaderView`, `dialogs/*`, and hooks (`useReadingSettings`, `useBook`, `usePaginator`, `useAnnotations`, `useOcr`). Move DB access behind a repository module. |
| Error handling | No React error boundary. A render exception blanks the app. | Add a top-level boundary plus one around the reader, with a "Return to library" action. |
| Lint and format | No ESLint. Prettier is configured but not enforced in CI. Hook dependency arrays are incomplete (for example `App.tsx:452` and `:655`). | Add ESLint with `react-hooks` and `@typescript-eslint/strict`. Add `prettier --check` to CI. |
| Data layer | Dexie schema `version(1)` has no documented migration plan. `refresh()` loads **all** marks for **all** books after every change. | Plan v2 now (locators, content hash, collections). Query marks per book. |
| Rendering engine | The paginator, anchors and parser are hand-written. RESEARCH.md planned a Foliate.js (MIT) and Readium benchmark that was never done. | Hold that benchmark before investing further. Foliate.js already provides an XHTML-correct loader, CFI, fixed layout, spreads, RTL and vertical text. |
| Bundle | 562 kB single chunk. The extension is **32.2 MB**: 3 Tesseract core variants, each shipped as `.wasm` **and** base64 `.wasm.js`, plus a 10.9 MB model always bundled. | Code-split OCR and print. Ship only the core variants that are actually loaded. Consider downloading language data on first OCR use, with the existing SHA-256 pinning, to cut the install size by about 20 MB. |
| Permissions | `identity` and `https://www.googleapis.com/*` are requested even when Drive is not configured. | Use `optional_permissions` / `optional_host_permissions`. |
| Versioning | The version string is duplicated in `package.json`, `wxt.config.ts`, README badges and the package script. | Read it from `package.json` in `wxt.config.ts`. Use `changesets` or a release script. |
| Licensing | **No project license.** This legally blocks contributions, forks and Web Store distribution. | Choose a license (MIT, Apache-2.0 or MPL-2.0 fit the dependencies). |
| Tests | 14 end-to-end tests, all on the synthetic sample. None cover linked CSS, XHTML self-closing tags, non-linear items, RTL, NCX nesting or real-world books, so all four P0 rendering defects pass CI. No unit tests for `resolvePath`, the OPF/NCX parsers or anchoring. No a11y or visual-regression checks. | Add a **real-world corpus**: IDPF/W3C `epub3-samples`, a few Standard Ebooks and Project Gutenberg EPUB2/EPUB3 files, an RTL book, a CJK vertical book and a fixed-layout book, with snapshot assertions. Add Vitest unit tests, axe checks and Playwright screenshot comparisons. Add a performance budget test (time to first page, chapter-switch p95). |
| Docs | Accurate and candid, a real strength. | Two corrections: VALIDATION.md says "arbitrary publisher CSS still needs broader testing", but in fact **no** linked CSS applies. README says "EPUB 2 NCX" without noting that its hierarchy is flattened. |

---

## 8. Capability gap analysis

Legend: ✅ present · ◐ partial · ❌ absent. Comparators: Apple Books, Kindle, Thorium, Readest, Foliate and KOReader. A "baseline" item is one that all or nearly all of them offer.

| Capability | Folio | Baseline? | Priority |
| --- | :-: | :-: | :-: |
| Publisher CSS, fonts and XHTML fidelity | ❌ | ✅ | P0 |
| Footnote pop-ups | ❌ | ✅ | P1 |
| RTL and vertical writing | ❌ | ✅ (most) | P1 |
| Whole-book search with results list | ❌ | ✅ | P1 |
| Highlight colors, notes and editing | ❌ (one color, no notes) | ✅ | P1 |
| Two-page spread | ❌ | ✅ desktop | P1 |
| Tap zones and immersive or fullscreen mode | ❌ | ✅ | P1 |
| App-wide dark mode, OS sync | ◐ reader only | ✅ | P1 |
| Time left in chapter or book, reading speed | ❌ | ✅ | P2 |
| Library collections, status (to read, reading, finished), series | ❌ | ✅ | P2 |
| Metadata view and editing | ❌ | ✅ | P2 |
| Backup and restore | ❌ | ✅ | P0 |
| Sync across devices | ❌ | ✅ | P2 |
| Read aloud (TTS) with sentence highlighting | ❌ | ✅ | P2 |
| Dictionary and Wikipedia lookup | ❌ | ✅ | P2 |
| Translation of selection | ❌ | ◐ | P3 |
| Fixed-layout EPUB (comics, children's books) | ◐ (flag only) | ✅ | P2 |
| MathML and SVG fidelity | ◐ | ✅ (Thorium) | P3 |
| Media overlays (EPUB read-along) | ❌ | ◐ | P3 |
| OPDS catalogs | ❌ | ✅ (Thorium, KOReader) | P3 |
| Annotation export (Markdown, Readwise, Obsidian) and import | ◐ JSON only | ✅ | P2 |
| Font import (user fonts), hyphenation and justification controls | ❌ | ✅ | P2 |
| Brightness and warmth, custom theme colors | ❌ | ◐ | P3 |
| Keyboard shortcut map and help | ◐ | ✅ desktop | P2 |
| i18n of the UI | ❌ | ✅ | P3 |
| On-device OCR | ✅ | ❌ (a differentiator) | — |
| Print / Save as PDF | ✅ | ◐ (a differentiator) | — |

---

## 9. Recommended roadmap

### Phase 0: make real books readable and data safe (≈ 2 weeks)

Ordering matters: anchors and migration first, then the renderer fixes.

1. **Locator v2 and migration (P0-4).** Add TextQuote anchors, CFI where feasible, and re-anchoring with orphan reporting. Bump Dexie to v2.
2. **XHTML parsing (P0-2)**, **linked and imported CSS with scoping (P0-1)**, **non-linear items (P0-3)**, **lang/dir/body attributes (P1-1)**.
3. **Durability (P0-5).** Request `unlimitedStorage`, call `persist()`, and add Backup/Restore of `.folio` archives and notes import.
4. **Corpus tests.** Add real-world EPUBs to CI so these regressions cannot return.

**Exit criteria:** epub3-samples and 10 Standard Ebooks titles render with publisher styling. Zero blank chapters across the corpus. Highlights created on v0.2 survive the upgrade with ≥ 99% exact re-anchoring and the rest are flagged.

### Phase 1: reader parity and design system (≈ 4 weeks)

- Design tokens, a type scale, app-wide themes and OS dark mode. Close all §5 accessibility failures and add axe to CI.
- Immersive mode, tap zones, two-page spread and chapter prefetch.
- Whole-book search, footnote pop-overs, external links.
- A richer selection toolbar: colors, notes, copy with citation. An annotation sidebar that can be edited and filtered.
- Hash routing and deep links. Reuse a single Folio tab. Sync across tabs.
- Split `App.tsx`, add an error boundary and ESLint, choose a license.

### Phase 2: library and insight (≈ 4 weeks)

- Content-hash dedupe, bulk and folder import, collections and tags, reading status, a series view, a metadata sheet and editor, and a list/grid toggle.
- A Continue-reading strip, time left based on measured reading speed, and reading statistics (local only).
- Export to Markdown, CSV and a Readwise-compatible format. Obsidian-friendly highlights per book.
- Drive reworked to `drive.file` + Picker, optional permissions, and a live-account validation pass. Optional **Drive `appDataFolder` backup** as private sync.

### Phase 3: differentiators that fit "local-first"

- **Read aloud** with `chrome.tts` or Web Speech, highlighting each sentence, with sleep timer and speed controls.
- **On-device AI**, offered only where Chrome's built-in models are available and always opt-in:
  - **Summarizer API**: "recap the previous chapter" when resuming after a break, and summaries of highlights.
  - **Translator / Language Detector APIs**: inline translation of a selection.
  - **Prompt API**: "explain this passage" and character or term glossaries built from the book. No content leaves the device, which reinforces the privacy positioning.
- **Dictionary lookup:** offline Wiktionary-derived packs, downloadable per language.
- **OCR 2.0:** OCR a whole book or chapter in a queue, overlay text layers on images, multiple languages, and searchable scanned books. Evaluate a handwriting-capable model, as already planned in RESEARCH.md.
- **PDF 2.0:** export profiles (A5 or Letter, margins, typeface), a generated TOC and PDF outline, optional highlights in the output, and page headers or footers.
- **Open EPUBs from the web:** a context-menu "Open in Folio" on `.epub` links, download interception with consent, and the File Handling API for the web preview, installed as a PWA.
- **OPDS catalog browser** (Standard Ebooks, Project Gutenberg, a user's Calibre server).
- **Fixed-layout and comics support**, including spreads and guided panel view.
- **UI internationalization** (`chrome.i18n`), starting with the languages the OCR already supports.

---

## 10. Quick wins (≤ 1 day each)

1. Hide the hero when the library is not empty, and add a Continue-reading card.
2. Set a minimum of 12 px for UI text and darken muted greys to ≥ 4.5:1.
3. Add a `:focus-visible` ring to inputs and a `:focus-within` ring on `.search` and `.chapter-find`.
4. Make the theme toggle remember Sepia.
5. Move toasts to the top center.
6. Show 0% progress for unopened books.
7. Make Find advance to the next match and show "3 of 12".
8. Show a "This book is already in your library" prompt when the content hash matches.
9. Replace the "More" (…) icon with a trash icon, or make it open a real menu.
10. Call `navigator.storage.persist()` after the first import.
11. Mark the reader tabs up as a proper ARIA tablist with arrow-key navigation.
12. Treat print warnings as non-fatal.
13. Reuse a single OCR worker per session.
14. Add `prettier --check` and `tsc` to a pre-commit hook and to CI.

---

## Appendix A: reproduction

The probe EPUB has three linear chapters, one non-linear notes file and two stylesheets. These are the relevant fragments:

```xml
<!-- c1.xhtml: renders blank (P0-2) -->
<html xmlns="http://www.w3.org/1999/xhtml"><head><title/></head>
<body><h1>Chapter with empty title</h1><p>If you can read this…</p></body></html>

<!-- c2.xhtml: anchors and divs swallow content; footnote and external links fail (P0-2, P0-3, P1-3) -->
<body class="pub-body"><p>Before <a id="pg12"/>after page anchor.</p><div class="spacer"/>
<p>See note<a href="notes.xhtml#n1">1</a>. And <a href="https://example.org">an external link</a>.</p></body>

<!-- c3.xhtml: RTL lost; linked CSS never applied (P1-1, P0-1) -->
<html xmlns="http://www.w3.org/1999/xhtml" lang="ar" dir="rtl"><head>
<link rel="stylesheet" href="style.css"/></head><body><p>هذا نص عربي للاختبار.</p></body></html>

<!-- book.opf spine -->
<itemref idref="fn" linear="no"/>
<!-- style.css -->
@import url("base.css"); p{text-indent:1em}
```

Observed results on build `b8c6555`:

| Check | Expected | Observed |
| --- | --- | --- |
| c1 body text | Heading and paragraph | **empty string** |
| c2 href-less `<a>` count | 1 (empty) | 3, with `#pg12` containing "after page anchor." |
| c2 `.spacer` content | empty | contains the following paragraph |
| c2 `body.pub-body` kept | yes | **no** |
| c2 external link `href` | kept or openable | `null` |
| Footnote click | navigate or pop-over | toast: "This link does not point to a readable chapter." |
| Find pressed twice | second match | same first match (`Anchors@0`) |
| c3 direction | `rtl` | `ltr`, with `dir` and `lang` empty |
| c3 `p` `text-indent` | 1em (22 px at default size) | `0px`, no publisher `<style>` present |
| Sample opened twice | 1 book | 2 book cards |
| New-book progress | 0% | 10% |
| Reload while reading | stay in book | returns to library |
| Sepia → dark → light | Sepia | Paper |
| Reader tabs, ArrowRight | moves to next tab | no change, and no `tabpanel` |
| Reading frame at 1440×900 | — | 1112×670 (57% of viewport) |

Commands: `npm ci && npm run build && node scripts/serve.mjs`, then drive `http://127.0.0.1:4173/reader.html` with Playwright and import the probe EPUB through the hidden file input.
