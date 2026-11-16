# Project assessment and rebrand plan

**Assessed:** Folio v0.5.1 (`78b08e9`), 16 November 2026 · **Scope:** full source read (`src/`, `entrypoints/`, `scripts/`, `tests/`, CI, docs), a production build, the complete reader test suite, and a hands-on pass of the built app at desktop, dark and 390 px mobile sizes.

This document is a work order. Part 1 lists problems and improvements with evidence and a fix for each. Part 2 proposes the new name. Part 3 gives the new logo as ready-to-use SVG. Part 4 is the step-by-step rename, including what must **not** be renamed. Part 5 orders everything into releases.

Findings marked **(known)** are already listed as open in [AUDIT_V2_RESPONSE.md](AUDIT_V2_RESPONSE.md); they are repeated here only where this review adds evidence or a concrete plan. Everything else is new.

## Contents

1. [Assessment](#1-assessment)
2. [New name](#2-new-name)
3. [New logo](#3-new-logo)
4. [Rename execution plan](#4-rename-execution-plan)
5. [Roadmap](#5-roadmap)
6. [Sources for the name research](#6-sources-for-the-name-research)

---

## 1. Assessment

### 1.1 What was run

| Check | Result |
| --- | --- |
| `npm ci` | Passed, 0 advisories. Ran on Node 22.23 although `engines` demands `>=24 <25` |
| `npm run format:check` | Passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed, 8.91 MB unpacked |
| `npx playwright test` (reader suite) | **63 passed** in 2.2 min |
| `tsc --noUnusedLocals --noUnusedParameters` | 3 errors (see C-4) |
| Pages build and Pages tests | Not run in this review |
| Real extension context (toolbar, service worker) | Not testable here; also untested in CI (see T-3) |

No crash, data-loss defect or security hole was found. The problems below are about product gaps, a few functional bugs, maintainability, package weight and the name.

### 1.2 What is good and should be kept

- **Document isolation.** Book markup goes through DOMPurify, a real CSS parser (`publisher-css.ts`), `@scope`, then a script-less `sandbox="allow-same-origin"` iframe with a `default-src 'none'` CSP. Archive paths, entry counts, compression ratios and sizes are bounded. This is better than most extensions in the category.
- **One permission.** The store build asks only for `unlimitedStorage` and makes no network requests.
- **Storage robustness.** Metadata, files and previews are separate tables, writes are transactional, the WebKit Blob failure has a tested fallback, and restores are validated before any write.
- **Locators.** Highlights use text-quote anchors plus a full-text fingerprint, and ambiguous matches are flagged instead of guessed.
- **Honest documentation.** Limits and untested areas are stated plainly.
- **Test depth.** 63 browser scenarios, including injected storage failures and a pinned public EPUB corpus.

### 1.3 Priority summary

| Priority | Meaning | Items |
| --- | --- | --- |
| P1 | Fix in the next release | B-1, B-2, B-3, U-1, U-2, U-3, P-1, D-1, K-1, K-2, R-1, R-2 |
| P2 | Fix soon; visible quality or upkeep cost | B-4 to B-8, U-4 to U-9, P-2 to P-4, C-1 to C-4, T-1 to T-4, K-3 to K-5, R-3 to R-5, A-1 to A-4 |
| P3 | Opportunities | Section 1.12 |

### 1.4 Bugs

**B-1 (P1). Saved highlights and bookmarks are listed in random order.** `refresh()` reads `db.marks.toArray()` (`src/App.tsx:406`), which returns rows by primary key, and the key is a random UUID. Neither the reader sidebar (`App.tsx:2191`) nor the library views (`App.tsx:1319`) sort. Verified: highlights created on paragraphs 4, 2, 3 were listed as 3, 2, 4, which is neither creation order nor reading order.
*Fix:* sort by `chapter`, then resolved `start`/`textOffset`/`page`, falling back to `created`. In the library views sort by book, then the same key, or by `created` descending with a sort control. Add an index `[bookId+chapter]` query instead of loading every mark (see P-2).

**B-2 (P1). Identical highlight entries cannot be told apart.** A list entry shows only the chapter title and the quoted text (`App.tsx:2198-2212`). Two highlights of a repeated passage look the same, and long highlights are printed in full (up to 10,000 characters) with no truncation.
*Fix:* show page or percentage and creation date, clamp the quote to about 3 lines with expand, and keep the full text in a `title`/details view.

**B-3 (P1). "Find" always returns the first match.** `findText()` (`App.tsx:1282-1305`) restarts from the top of the chapter on every submit and stops at the first hit. Verified: pressing **Find** twice selects the same occurrence. It also cannot match text that crosses an element boundary (for example across `<em>` or an existing highlight), and it leaves the **Highlight** bar open as a side effect. **(known as N-8; this confirms the behaviour and adds the cross-node case.)**
*Fix:* search over `documentText(doc)` (the same string locators use), keep a match index, add next/previous buttons and Enter/Shift+Enter, show "3 of 17", and map offsets back to ranges with the existing text-node table in `Paginator`.

**B-4 (P2). Only one file can be imported at a time.** The file input has no `multiple` attribute (`App.tsx:1356-1367`) and the drop handler takes `files[0]` (`App.tsx:1335`). For a library app, importing a folder of books one by one is the largest friction in first use.
*Fix:* accept multiple files, import sequentially through one queue, show "3 of 12" progress, collect per-file failures into one summary, and do not auto-open a book after a batch.

**B-5 (P2). Wrong nouns for documents.** The delete dialog always says "Remove this book?" and "Remove book" (`App.tsx:2813-2833`), restore always reports "Restored N books" (`App.tsx:1385`), and the backup selector is labelled "Books to back up" even when the library holds PDFs.
*Fix:* derive the noun from `bookCollection()`; use "items" for mixed sets.

**B-6 (P2). Progress never reaches 100%.** `bookProgress()` (`App.tsx:2950-2966`) computes `(pages before + page − 1) / total`, so the last page of the last chapter shows less than 100%, and a PDF on its final page shows `(n−1)/n`. There is no "finished" state.
*Fix:* treat the last page as 100%, and add a "Finished" badge with a filter.

**B-7 (P2). Stale backup scope after deleting a book.** `backupScope` keeps a deleted book's ID (`App.tsx:297`, `2759-2771`). The next backup filters to zero books and still downloads an archive that looks valid. *(From code reading; not reproduced.)*
*Fix:* reset `backupScope` when the book disappears and refuse to write an empty backup.

**B-8 (P2). Drive import does not recover from an expired cached token.** `drive.ts:22-37` treats any non-OK response as a permission problem. With `chrome.identity`, a cached token that has expired returns 401 until `removeCachedAuthToken` is called. *(From code reading; Drive has never been tested live, as the docs say.)*
*Fix:* on 401, remove the cached token and retry once. Better, decide Drive's future first (see K-5).

### 1.5 User experience

**U-1 (P1). Nothing happens after installation.** `entrypoints/background.ts` only handles `action.onClicked`. Chrome hides new extension icons in the puzzle menu, so a new user sees no sign that the install worked.
*Fix:* add `chrome.runtime.onInstalled` with `reason === "install"` and open `reader.html`. On `reason === "update"`, show a one-line "What's new" notice inside the app, not a new tab.

**U-2 (P1). Night pages inside a light interface.** Page theme and interface theme are deliberately independent, and the interface follows only the operating system (`App.tsx:285-293`). On a light system, choosing Night gives a dark page framed by bright cream toolbars and sidebar (screenshot verified). At night this defeats the purpose of the Night theme.
*Fix:* add an **Interface** setting with `Match page theme` (new default), `Follow system`, `Light`, `Dark`. Keep the current independence as an option.

**U-3 (P1). The only protection against losing the library is a manual backup the user must remember.** Uninstalling, clearing site data or a profile reset deletes everything. The app never records when a backup was last made and never reminds.
*Fix, in order:* store `lastBackupAt` and item count; show a quiet reminder in the library footer when more than 30 days or 5 new items have passed; later add an optional **linked backup folder** using the File System Access API (`showDirectoryPicker`), writing an incremental backup when the library changes. This stays fully local and matches the privacy promise.

**U-4 (P2). The sample card's badge covers the author line.** On the sample cover, "A LITTLE SOMETHING TO START" overlaps the cover's author text at every width (`.sample-badge`, `src/style.css:630`). On mobile the badge wraps to three lines and covers a third of the cover.
*Fix:* hide `.cover-author` inside `.sample-cover`, or move the badge above the cover.

**U-5 (P2). The sample card is detected by title and author strings** (`App.tsx:1694-1698`). A user's own book with that title hides the card; a renamed sample shows it forever. **(known as N-10.)**
*Fix:* compare `contentHash` against a constant list of known sample hashes (see section 4.3, this matters for the rename).

**U-6 (P2). Mobile reading area is small.** At 390×844 the header, chapter toolbar and footer take about 230 px, the footer text wraps to three lines, the find field is cut to "Find in chapte", and toasts cover the text being read.
*Fix:* on narrow screens hide chrome while reading and reveal it on a centre tap (the usual e-reader pattern), move find into the navigation sheet, and place toasts above the footer.

**U-7 (P2). No two-page spread on wide screens.** The paginator clamps the text column to about 740 px (`src/reader.ts:244`), so a 1440 px window shows one narrow column with empty space on both sides. **(known, listed under design polish.)**
*Fix:* above about 1200 px offer "Two pages" using two CSS columns per viewport width.

**U-8 (P2). Inconsistent vocabulary.** The same things are called Bookmarks, Saved, Notes, Highlights, annotations and "saved notes" in different places. The sidebar tab for bookmarks is labelled "Saved"; the fullscreen "Notes" button opens highlights; tab tooltips show raw internal ids in lower case (`title={t}`, `App.tsx:2108`).
*Fix:* settle on **Bookmarks** and **Highlights**, with **Notes** reserved for user-written text once that exists (see F-1).

**U-9 (P2). Preferences that are not remembered.** Library sort resets to "Recently read" on reload (`App.tsx:223`); PDF zoom resets and is shared by all documents in a session (`App.tsx:311`); reading settings are global, never per book, and are not part of a backup.
*Fix:* persist sort; store zoom per document; include preferences in the backup manifest.

Also still open and worth doing: reload returns to the library instead of the open book and the browser Back button is not wired **(known, N-8)**; reader settings are duplicated between the header (`A− 22 A+`) and the settings dialog; "Publisher" and "Literary" use the same font stack (`reader.ts:20-25`), so the choice looks like it does nothing on books without embedded fonts.

### 1.6 Performance

**P-1 (P1). Whole-chapter hashing on every render while reading.** `currentBookmark` (`App.tsx:1078-1095`) runs during render. For each bookmark in the current chapter it calls `bookmarkOffset()` up to twice; each call walks every text node of the chapter (`documentText`) and `resolveLocator` then computes a SHA-256 of the full chapter text. This repeats on every page turn, every keystroke in the find box and every toast. With a 500 KB chapter and a few bookmarks this is tens of milliseconds of blocking work per render.
*Fix:* compute chapter text and its fingerprint once in `loaded()`, keep them in a ref, and resolve bookmark offsets in a `useMemo` keyed on chapter load and marks. `applyHighlights` already shares one hasher; reuse the same object.

**P-2 (P2). Every annotation change reloads the whole library and all marks.** `refresh()` (`App.tsx:402-410`) re-reads all book metadata and every mark in the database after each bookmark or highlight, and `applyHighlights` (`src/annotations.ts`) unwraps and re-wraps all highlights with an O(marks × text nodes) loop.
*Fix:* use Dexie `liveQuery` (or `dexie-react-hooks`) with per-book queries; apply a single new highlight incrementally. This also fixes stale state when two tabs of the web version are open.

**P-3 (P2). Background page counting re-renders the entire book.** The counter (`App.tsx:958-1041`) opens a second parser on the same file and lays out every chapter in a hidden iframe, restarting when the window or text settings change. The effect also depends on `settings`, which includes `theme`, so toggling Night restarts it even though the layout key ignores theme. **(progressive pagination is known as open.)**
*Fix now:* key the effect on `layoutKey(...)` instead of the whole settings object, and reuse the open engine. *Fix later:* estimate chapter lengths from text size and refine lazily.

**P-4 (P2). Restore holds every restored file in memory before writing.** `restoreLibrary` builds `imported: Book[]` with all blobs (`src/backup.ts:266`, `383`) and writes them in one transaction. This is what makes the restore atomic, but a 2 GB archive can exhaust memory on a phone or low-RAM Chromebook.
*Fix:* validate the manifest and checksums in a first pass, then write book by book, recording a restore journal so a failed restore can be rolled back by ID.

### 1.7 Code and architecture

**C-1 (P2). `App.tsx` is one 2,966-line component.** It holds about 50 `useState` and 20 `useRef` values and covers the library, the reader, five dialogs, import, printing, search and keyboard handling. Effects reference values outside their dependency lists (for example `App.tsx:710`, `767`, `778`, `1077`), which is safe today only by convention. **(known as N-7.)**
*Plan, in this order, one PR each:*
1. Add ESLint with `typescript-eslint` and `eslint-plugin-react-hooks`; record the current violations as a baseline, fix or annotate each one.
2. Move pure helpers out: `bookProgress`, preference parsing (`App.tsx:250-296` into `prefs.ts`), notes export (`App.tsx:1811-1839`).
3. Extract dialogs as components: `ReadingSettingsDialog`, `StorageDialog`, `PrintDialog`, `DeleteDialog`, `DriveDialog`.
4. Split `LibraryView` and `ReaderView`; the app shell keeps only `selectedId`, toasts and the modal slot.
5. Extract hooks: `useLibrary()` (liveQuery), `useReaderEngine(bookId)`, `useAnnotations(bookId, chapter)`, `usePreferences()`.

**C-2 (P2). No unit tests.** All 63 tests are end-to-end. Pure modules with tricky logic (`locators.ts`, `xhtml.ts`, `publisher-css.ts`, `resolvePath`, backup validators, `detectFormat`, `bookProgress`) are only reachable through a browser, which makes edge cases slow to cover.
*Fix:* add Vitest (with `happy-dom` or browser mode for DOM-dependent modules) and move parser and locator edge cases there.

**C-3 (P2). Legacy code kept on the hot path.** `Epub.renderLegacy` and `legacyCss` (`src/epub.ts:333-476`, about 150 lines) exist only for the v0.2 locator migration, and the `books` and `ocr` tables are carried in every schema version.
*Fix:* move the legacy renderer to `migrate-locators.ts` behind a dynamic `import()`. Plan a schema v4 that drops `books` rows already copied, and keep `ocr` export-only.

**C-4 (P2). Dead code.** `useLayoutEffect` and `readerDocument` are imported but unused in `App.tsx:6`, `35`; `escape` is unused in `src/fixed-document.ts:14`; a stray `{ ... }` block wraps the export button (`App.tsx:1808-1844`); `<>` wraps the Drive dialog body for no reason (`App.tsx:2697`).
*Fix:* enable `noUnusedLocals` and `noUnusedParameters` in `tsconfig.json`.

### 1.8 Build, package and dependencies

**K-1 (P1). About 2.2 MB of the 8.9 MB package is never used.**

| Files | Size | Why unused |
| --- | --- | --- |
| `assets/djvu_rs_bg-*.wasm` (2 files) | 1.16 MB | Byte-identical to `documents/djvu/scalar.wasm` and `simd.wasm`. The worker is given explicit URLs, so the bundler's hashed copies are never fetched |
| `documents/pdf/wasm/quickjs-eval.wasm` + `.js` | 0.48 MB | PDF.js scripting sandbox; Folio never enables PDF scripting |
| `documents/pdf/wasm/*_nowasm_fallback.js` | 0.60 MB | Fallbacks for browsers without WebAssembly; the CSP allows WASM |

*Fix:* in `src/djvu-worker.ts`, stop passing URLs and let the bundler's hashed assets load (then delete the copy step in `scripts/assets.mjs`), or keep the explicit copies and mark the package's own `.wasm` imports as external. In `scripts/assets.mjs`, copy only `openjpeg.wasm`, `jbig2.wasm`, `qcms_bg.wasm` and their licence files. Removing a file named `quickjs-eval` also removes a question a store reviewer could ask about a listing that declares no remote code.

**K-2 (P1). There is no licence.** The README says a licence "has not been selected", while `CONTRIBUTING.md` invites contributions. Without a licence, nobody may legally reuse or contribute to the code, and contributions arrive under unclear terms.
*Fix:* choose one and add `LICENSE`. All runtime dependencies are MIT, BSD, Apache-2.0 or MPL-2.0 (DOMPurify dual), so MIT or Apache-2.0 both work. Apache-2.0 adds a patent grant and matches PDF.js. Add `"license"` to `package.json`. **This is the owner's decision.**

**K-3 (P2). The main bundle carries the whole CSS grammar.** `publisher-css.ts` imports `* as css from "css-tree"`, which pulls the property and value lexer data (`mdn-data`) into the 866 KB main chunk; the string `length-percentage` appears 126 times in it. Only parsing, walking and generating are used.
*Fix:* import from `css-tree/parser`, `css-tree/walker` and `css-tree/generator` (all exported by the installed version), and lazy-load the module with the EPUB engine.

**K-4 (P2). Python is required to install a Node project.** `postinstall` runs `scripts/assets.mjs`, which executes `python3 scripts/demo.py`; packaging, fixtures, the corpus and the CI summary are also Python. This is why the README tells Windows users to use WSL.
*Fix:* port `demo.py`, `package.py`, `fixtures.py`, `corpus.py` and `ci-summary.py` to Node using the `@zip.js/zip.js` dependency already present. Then relax `engines` to `>=22`, since the whole pipeline passed on Node 22 in this review.

**K-5 (P2). Drive import is shipped but switched off and unverified.** The store build hides it, the code has never run against a live account, and the `drive.readonly` scope would require Google's restricted-scope verification.
*Fix:* remove it from the main bundle now (dynamic import behind the build flag), and either rebuild it on the Google Picker with `drive.file`, or delete it and the related docs.

Also: `minimum_chrome_version` is 147 because PDF.js 6 calls very new JavaScript APIs (`wxt.config.ts:14`). The same check blocks PDF reading in the web version on browsers that lack them (`src/fixed-document.ts:100-108`). Evaluate the `pdfjs-dist/legacy` build, which bundles polyfills, to widen support; measure the size cost before deciding.

### 1.9 Tests and CI

**T-1 (P2). No linter in CI.** Formatting and types are checked; correctness rules (hooks, floating promises, unused code) are not. See C-1 step 1.

**T-2 (P2). No release automation.** There are no git tags and no GitHub Releases, the version badge in the README is typed by hand, and uploads to the store are manual.
*Fix:* a `release.yml` triggered by a `v*` tag that runs the checks, attaches the ZIP and its SHA-256 to a GitHub Release, and optionally uploads to the Chrome Web Store through its API with stored secrets. Generate the badge from the latest release.

**T-3 (P2). The real extension is never tested.** Tests run against a static server, so the service worker, toolbar click, tab reuse and the extension CSP are unverified.
*Fix:* add one Playwright project using `chromium.launchPersistentContext` with `--load-extension=.output/chrome-mv3` that clicks through open, import sample, reload, second-click focus.

**T-4 (P2). Supply-chain hygiene.** Actions are pinned by tag instead of commit SHA, there is no Dependabot or Renovate configuration although all versions are pinned exactly, there is no `npm audit` step, no `SECURITY.md`, and `postinstall` rewrites a file inside `node_modules` with string replacement (`scripts/patch-mobi.mjs`).
*Fix:* pin actions by SHA, add Dependabot for npm and actions, add `npm audit --omit=dev` to CI, add `SECURITY.md`, and move the MOBI fix to `patch-package` format so it is a reviewable diff.

Smaller points: test files are named after audits (`audit.spec.ts`, `audit-v2.spec.ts`) instead of features; the suite runs serially (`workers: 1`) and could shard by file with a per-worker port.

### 1.10 Documentation and repository

**R-1 (P1). Two names for one product.** The repository, package, Pages path and page title say "EPUBchrome"; the product, store listing and database say "Folio". The README heading is "Folio · EPUBchrome". "Chrome" is a Google trademark and Google's branding guidelines say not to use Google marks in an extension's name. See Part 2.

**R-2 (P1). The README is long and out of order.** It mixes marketing, changelog ("OCR was removed in v0.5"), audit history and build steps; the section "More formats, the same private library" sits after the project guide; three of ten paragraphs explain recovery from rare storage failures.
*Fix:* rewrite to: one-paragraph pitch, screenshot, install, features table, privacy, build from source, links. Move the rest into `docs/`.

**R-3 (P2). A removed feature is still described everywhere.** OCR left in v0.5, but "previously saved recognition text" appears in the Storage dialog (`App.tsx:2736-2738`, shown to every user), the README (4 times), `PRIVACY.md`, `STORAGE.md`, `INSTALLATION.md` and `CONTRIBUTING.md`. New users have no such text.
*Fix:* mention it once in `STORAGE.md`. In the app, show the sentence only when the `ocr` table is not empty.

**R-4 (P2). Internal history is mixed with user documentation.** `AUDIT.md`, `AUDIT_RESPONSE.md`, `AUDIT_V2.md`, `AUDIT_V2_RESPONSE.md`, `RESEARCH.md` and most of `VALIDATION.md` are a development log (about 1,100 lines).
*Fix:* move them to `docs/history/`. Keep `VALIDATION.md` as a short current-state page.

**R-5 (P2). Missing repository basics.** No issue or pull-request templates, no `CODEOWNERS`, no `.editorconfig`, and the privacy policy's only contact is the issue tracker (`web/privacy.html`), which requires a GitHub account.
*Fix:* add templates and a contact email address in the policy and store listing.

### 1.11 Accessibility and internationalisation

**A-1 (P2). Notices disappear after 4.5 seconds** (`App.tsx:484-488`), including warnings such as "Your saved passage could not be located". Users who read slowly or use a screen magnifier can miss them (WCAG 2.2.1).
*Fix:* auto-dismiss only `success`; keep `warning` until dismissed; pause the timer on hover and focus.

**A-2 (P2). Navigation state is announced inconsistently.** Books and Documents set `aria-current`; Bookmarks and Highlights do not (`App.tsx:1438-1455`). Their counts are read aloud for two items and hidden for the other two. The brand is an `<a href="#">` that acts as a button (`App.tsx:1398-1410`).
*Fix:* same attributes on all four; make the brand a `<button>` or a real link.

**A-3 (P2). Small text and ad-hoc colours.** The root size is 14 px and 77 rules set 12 px text (`src/style.css`). The stylesheet uses 102 distinct colour values but defines 10 custom properties. **(design tokens are known as open.)**
*Fix:* raise the base to 16 px with a minimum of 13 px for secondary text; introduce a token set (about 12 colours per theme, 6 type sizes, 6 spacings) and replace literals. Do this together with the rebrand palette in Part 3.

**A-4 (P2). English only.** All interface text is inline in JSX, there is no `default_locale`, and the interface cannot switch to right-to-left although Arabic books are supported.
*Fix:* move strings to a message catalogue that works in both the extension and web builds, add `_locales/en`, then add languages. Start with the store listing, which can be localised without code.

No reading aids exist yet: no hyphenation or justification control, no bundled accessible typeface (for example Atkinson Hyperlegible, which is under the Open Font License), and no read-aloud. See F-6.

### 1.12 Opportunities (P3)

Ordered by value for effort.

| ID | Feature | Why | Notes |
| --- | --- | --- | --- |
| F-1 | Highlight colours, a written note per highlight, edit, copy, Markdown export | Annotation is the main reason to choose a reader over the browser's PDF viewer. **(known, R-6)** | Add `color` and `note` to `Mark`; export one `.md` per book |
| F-2 | Whole-book search with snippets | Expected in every reader. **(known, N-8)** | Run in a worker over rendered text; cache per `contentHash` |
| F-3 | Installable offline web app (PWA) | The Pages build is already a full reader and the code carries extensive Safari fallbacks. A web manifest and a service worker make it installable on iPhone, iPad, Firefox and Safari, where the extension cannot go | Rename "web preview" to the web app; give it its own domain (see 4.4) |
| F-4 | Edit title, author and cover; sort by author; tags or shelves; list view | PDFs often import as "Unknown author" with a filename title | Metadata only; never touch the original bytes |
| F-5 | Linked backup folder and reminders | See U-3 | File System Access API |
| F-6 | Read aloud | The Web Speech API works offline with system voices and needs no permission | Sentence highlighting can reuse text offsets |
| F-7 | Firefox build | WXT can target Firefox from the same source | `chrome.runtime.getContexts` needs a fallback |
| F-8 | Open a link to an `.epub` in the reader | The most-used feature of the incumbent extensions | Needs `contextMenus` and an optional host permission; keep it optional to preserve the one-permission install |
| F-9 | Reading statistics, "finished" shelf, time left in chapter | Low cost once progress is correct (B-6) | Stay local |
| F-10 | "Copy diagnostics" in the error screen | There is no telemetry, so bug reports need a way to carry version, browser and storage state | Text only, user-initiated |
| F-11 | CBZ comics, FB2, plain text | Small parsers, broad demand | CBZ reuses the fixed-page reader |

---

## 2. New name

### 2.1 Why change it

1. **"Folio" is taken in this exact category.** There is already a local-first desktop reader named Folio for EPUB, MOBI and PDF; Foliate is a well-known Linux e-book reader (this project even ships a parser derived from Foliate's); FolioReader is a widely used EPUB library for iOS and Android. A user searching "Folio reader" will not find this project first.
2. **"EPUBchrome" uses a Google trademark** and describes neither the product (five formats) nor its other target (the web app).
3. **Two names cause real confusion** in the repository, store, page titles and issue reports.
4. **The store name has no search terms.** "Folio — Private book library" contains neither "EPUB" nor "reader", which are the words people type.

The extension was first published on 3 November 2026, so renaming now costs far less than later.

### 2.2 Candidates checked

Web searches were run on 16 November 2026 for each candidate against e-reader apps, browser extensions and general software. This is not a trademark search.

| Candidate | Meaning | Result | Verdict |
| --- | --- | --- | --- |
| **Endleaf** | The blank leaves at the front and back of a bound book, where owners write their name and notes | Only a small, inactive Ruby gem for Rails static pages. No app, reader or extension found | **Recommended** |
| Lamplit | Reading by lamplight | No product found | Runner-up |
| Incipit | "Here begins", the opening words of a manuscript | No product found in English; a common word in Italian, so Italian-market products are likely | Runner-up; unclear pronunciation |
| Carrel | A private study desk in a library | "Carrel — Notion Web Clipper" is already on the Chrome Web Store; also a library-computer SaaS | Rejected |
| Deckle | The rough edge of handmade paper | Deckle Studio, commercial novel-writing software | Rejected |
| Lectern | A reading stand | "Lectern: EPUB & PDF Reader" on Android, plus a second Lectern reading app | Rejected |
| Octavo | The common book size (folio, quarto, octavo) | Octavo Reader, an EPUB and PDF plugin for Obsidian | Rejected |
| Shelfmark | A library's location code for a book | A popular self-hosted book-request tool | Rejected |
| Stillpage | Calm page | A Linux EPUB/PDF reader and two other apps | Rejected |
| Quietleaf | Quiet page | A local-only iOS writing app | Rejected |

### 2.3 Recommendation: **Endleaf**

- **It means the right thing.** The endleaf is the part of a book that belongs to its owner: the place for a name, a bookplate and notes. That is the product's promise ("A library that's yours").
- **It fits what already exists.** "Leaf" is the bookbinding word for a page, the app already uses a leaf as its privacy mark, and the palette is green. The current wordmark ends in a full stop, which becomes a small joke with "end": `endleaf.`
- **It is practical.** Seven letters, two syllables, spelled as it sounds, no trademarked term inside it, and distinct from Foliate, Folio and Overleaf.

Weaknesses to accept: the word is uncommon, so the tagline has to carry the meaning; and "end" can suggest finality, which the logo counters with new growth.

### 2.4 Naming system

| Use | Text |
| --- | --- |
| Product name | Endleaf |
| Wordmark | `endleaf.` lower case, serif, the full stop in the accent colour |
| Store and manifest `name` (35 characters) | `Endleaf — Private EPUB & PDF reader` |
| Manifest `short_name` | `Endleaf` |
| Manifest `description` (132 characters, the limit) | `Read EPUB, MOBI, PDF, DjVu and Markdown books in a private offline library. Bookmarks, highlights, backups. No account, no tracking.` |
| Toolbar tooltip | `Open Endleaf` |
| Tagline | `Your private reading room.` |
| Longer line | `Your books. Your notes. Your reading room.` (unchanged) |
| Page titles | `Endleaf · Your reading room` and `Endleaf · Read in your browser` (web) |
| Repository and package | `endleaf` |
| Sample book author | `Endleaf Editions` (replaces "Folio Studio") |
| Placeholder cover line | `AN ENDLEAF EDITION` (replaces "A FOLIO EDITION") |
| Backup file | `endleaf-library-YYYY-MM-DD.endleaf`; restore keeps accepting `.folio` |

### 2.5 Checks to do before committing to the name

These could not be done in this review:

- [ ] Trademark search for "Endleaf" in software classes 9 and 42 (EUIPO, USPTO, WIPO Global Brand Database).
- [ ] Search the Chrome Web Store, Firefox Add-ons, App Store and Google Play for "Endleaf".
- [ ] Domain: `endleaf.app`, `endleaf.dev` or `getendleaf.com`.
- [ ] GitHub repository name `endleaf` under the owner account; npm package name if one will ever be published.

If Endleaf fails a check, use **Lamplit**; the logo in Part 3 then changes to a lamp and the rest of this plan applies unchanged.

---

## 3. New logo

### 3.1 Idea

**An open book whose two pages are two leaves.** Seen one way it is a book lying open; seen the other way it is a pair of new leaves. The left leaf is cream (the page being read), the right is sage (the page to come).

Why replace the current mark: it is the stock outline "open book" icon on a green tile, the same shape used by most EPUB extensions in the store, so it cannot be recognised in the toolbar. The new mark is solid, two-toned and readable at 16 px (rendered and checked at 128, 48, 32 and 16 px on light and dark backgrounds).

### 3.2 Colours

| Token | Hex | Use |
| --- | --- | --- |
| `--brand-green` | `#24483a` | Tile, wordmark on light, primary buttons |
| `--brand-cream` | `#f4f1e4` | Left leaf, wordmark on dark |
| `--brand-sage` | `#b9c68f` | Right leaf, full stop on dark |
| `--brand-sage-deep` | `#9aab6c` | Full stop on light backgrounds |
| `--brand-ink` | `#22382e` | Wordmark text on light backgrounds |
| `--brand-night` | `#1f2823` | Dark interface background |

The green is within two points of the current `--green: #284d3e`, so existing screens stay consistent.

### 3.3 Master icon (128 × 128, full tile)

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#24483a"/>
  <path d="M60 100C30 96 20 70 24 34C44 36 58 50 60 72Z" fill="#f4f1e4"/>
  <path d="M68 100C98 96 108 70 104 34C84 36 70 50 68 72Z" fill="#b9c68f"/>
</svg>
```

### 3.4 Store icon (128 × 128 with 16 px transparent padding)

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect x="16" y="16" width="96" height="96" rx="21" fill="#24483a"/>
  <g transform="translate(64 66) scale(0.75) translate(-64 -67)">
    <path d="M60 100C30 96 20 70 24 34C44 36 58 50 60 72Z" fill="#f4f1e4"/>
    <path d="M68 100C98 96 108 70 104 34C84 36 70 50 68 72Z" fill="#b9c68f"/>
  </g>
</svg>
```

### 3.5 Toolbar sizes

Same artwork, with the glyph enlarged slightly at small sizes so the gap between the leaves stays open.

| File | Tile padding | Glyph scale |
| --- | --- | --- |
| `public/icon/128.png` | 16 px | 1.00 |
| `public/icon/48.png` | 2 px (of 48) | 1.00 |
| `public/icon/32.png` | 1 px (of 32) | 1.06 |
| `public/icon/16.png` | 0 | 1.14 |

Replacement for the drawing code in `scripts/icons.mjs` (the Playwright rendering loop below it stays as it is):

```js
const GREEN = "#24483a", CREAM = "#f4f1e4", SAGE = "#b9c68f";
const LEFT = "M60 100C30 96 20 70 24 34C44 36 58 50 60 72Z";
const RIGHT = "M68 100C98 96 108 70 104 34C84 36 70 50 68 72Z";

// size: output pixels. pad: transparent padding in output pixels. k: glyph scale.
function tile(size, pad, k = 1) {
  const p = (pad / size) * 128, inner = 128 - p * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <rect x="${p}" y="${p}" width="${inner}" height="${inner}" rx="${inner * 0.22}" fill="${GREEN}"/>
  <g transform="translate(64 66) scale(${(inner / 128) * k}) translate(-64 -67)">
    <path d="${LEFT}" fill="${CREAM}"/><path d="${RIGHT}" fill="${SAGE}"/>
  </g>
</svg>`;
}

const icons = [
  { file: "public/icon/16.png", svg: tile(16, 0, 1.14) },
  { file: "public/icon/32.png", svg: tile(32, 1, 1.06) },
  { file: "public/icon/48.png", svg: tile(48, 2) },
  { file: "public/icon/128.png", svg: tile(128, 16) },
];
```

### 3.6 In-app glyph (24 × 24, one colour)

For the sidebar brand, the reader header, the error screen and the favicon fallback. It inherits the text colour; the right leaf is the same colour at 62% opacity.

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
  <path d="M11.25 18.75C5.6 18 3.75 13.1 4.5 6.4c3.75.35 6.4 3 6.75 7.1z"/>
  <path d="M12.75 18.75c5.65-.75 7.5-5.65 6.75-12.35-3.75.35-6.4 3-6.75 7.1z" opacity=".62"/>
</svg>
```

`src/icons.tsx` draws stroked paths only, so add this as a separate `BrandMark` component instead of a new entry in `paths`.

### 3.7 Wordmark

- Text: `endleaf.` in lower case.
- Typeface: the serif stack the app already uses for headings (`Georgia, "Times New Roman", serif`), weight 400, letter-spacing −0.03em. No font file needs to be shipped.
- Colour: `#22382e` on light, `#f4f1e4` on dark. The full stop is `#9aab6c` on light and `#b9c68f` on dark.
- Lock-up: tile icon to the left, gap equal to a quarter of the icon's width, wordmark cap height about 45% of the icon's height.

### 3.8 Rules

- Minimum size 16 px for the tile; below 24 px use the tile, not the bare glyph.
- Keep clear space of a quarter of the icon's width on every side.
- Do not rotate, outline, add gradients or shadows, or swap the two leaf colours.
- On photographs or coloured backgrounds use the tile version only.

### 3.9 Where the artwork is used

| Place | File | Change |
| --- | --- | --- |
| Toolbar and extension icons | `scripts/icons.mjs` → `public/icon/*.png` | Replace `tile()` as above, run `npm run icons` |
| Favicon | `entrypoints/reader/index.html`, `web/index.html`, `web/privacy.html` | Uses `icon/32.png`; regenerated by the step above |
| Sidebar brand | `src/App.tsx:1406-1409` | `BrandMark` plus `endleaf.` |
| Reader header | `src/App.tsx:1869-1871` | `endleaf.` |
| Placeholder covers | `src/Cover.tsx:109`, `114` | "AN ENDLEAF EDITION"; bottom line `E / READING ROOM` |
| Welcome illustration | `src/App.tsx:1536` | "ENDLEAF EDITIONS / 01" |
| Store artwork | `scripts/store-assets.mjs` (colours at lines 16-17, promo text, `FOLIO DEMO EDITION` at line 78) → `store/*.png` | New glyph, wordmark and tagline; run `npm run build && npm run store:assets` |
| README and docs screenshots | `docs/images/*.png` | Regenerate after the interface change |

---

## 4. Rename execution plan

### 4.1 Do not rename these

They identify data that existing users already have. Renaming any of them makes libraries, preferences or backups disappear.

| Identifier | Where | Why it must stay |
| --- | --- | --- |
| IndexedDB name `folio-library` | `src/store.ts:91` | A new name opens an empty database. Existing libraries would look deleted |
| `folioBinary: 1` marker | `src/binary-storage.ts` (6 uses) | Stored inside every byte-backed file record |
| Backup manifest `format: "folio-library"` | `src/backup.ts:98`, `259` | Old backups must restore. Keep writing this value; it is never shown to users |
| `.folio` in the restore file filter | `src/App.tsx:1371` | Add `.endleaf`; keep `.folio` |
| `localStorage` keys `folio-collection`, `folio-dark`, `folio-font`, `folio-light-theme`, `folio-margin`, `folio-reading-font`, `folio-reading-mode`, `folio-spacing`, `folio-theme` | `src/App.tsx:218-295`, `465-480` | Renaming resets every reader's settings. Move them into `prefs.ts` as constants with a comment that the prefix is historical |
| Chrome Web Store item `ledggmakmbckalemicbpioibgiakheop` | Store dashboard | Rename the existing listing. A new item would have a new extension ID and an empty library for every user |

Add a regression test that creates a v0.5.1 database and preferences, loads the renamed build and asserts that books, marks and settings are intact.

### 4.2 Leave for a separate, optional change

These contain "folio" but are never stored. Renaming them is safe but touches the sanitiser and about 100 test selectors, so do it alone or not at all:

- DOM ids and attributes inside the reading iframe: `#folio-viewport`, `#folio-track`, `#folio-content`, `data-folio`, `data-folio-html`, `data-folio-body`, `.folio-native-page`, `.folio-print-chapter`.
- CSS variables `--folio-*` (`src/reader.ts`, `src/fixed-reader.ts`).
- The sanitiser rule that strips `data-folio*` attributes and `folio-` ids from book content (`src/epub.ts:538-545`) and the selector rewrite in `src/publisher-css.ts`. These must change together with the list above.
- `dc:identifier` value `folio-normalized-v1` inside prepared MOBI and Markdown copies (`src/reflow-document.ts:327`).
- Middleware name `FolioBinaryStorage`.

### 4.3 Rename these

**Manifest and build**

- [ ] `wxt.config.ts`: `name`, add `short_name`, `description`, `action.default_title`, `homepage_url`.
- [ ] `package.json`: `name`, `description`, `repository`, `homepage`, `bugs`; add `license`.
- [ ] `scripts/package.py`: the assertion `default_title == 'Open Folio'` and the output name `folio-<version>-chrome.zip`.
- [ ] `scripts/pages-assets.mjs`: ZIP names and the text of `INSTALL_EXTENSION.txt`.
- [ ] `.github/workflows/ci.yml`: artifact name and path `folio-*-chrome.zip`, the `FOLIO_CORPUS_CACHE` variable and cache key (change together with `scripts/corpus.py:12`).
- [ ] `vite.web.config.ts` `base`, `scripts/serve.mjs` `prefix`, `playwright.pages.config.ts` URL, `tests/pages.spec.ts`: `/EPUBchrome/` → the new path.

**Interface text** (31 occurrences in `src/App.tsx`, plus the files below)

- [ ] `src/App.tsx`: preview banner (`1342`), brand (`1409`), reader brand (`1870`), welcome art (`1536`), database notices and "Reload Folio" (`2495-2504`), download names `folio-notes.json` (`1837`) and `folio-library-….folio` (`2797`).
- [ ] `src/ErrorBoundary.tsx:15`: "Folio could not display this view."
- [ ] `src/Cover.tsx:109`, `114`.
- [ ] `src/drive.ts`: temporary file prefix `folio-drive-`.
- [ ] `entrypoints/reader/index.html`, `web/index.html` (title and description), `web/privacy.html` (17 occurrences, plus a new effective date and a line stating the product was formerly named Folio).

**Sample book**

- [ ] `scripts/demo.py`: author "Folio Studio" → "Endleaf Editions", identifier `folio-original-demo`.
- [ ] `src/App.tsx:1694-1717`: replace the title-and-author check with a list of known sample content hashes containing **both** the old and the new sample (this implements U-5). Otherwise users who already opened the old sample will be offered it again and end up with two copies.
- [ ] `scripts/fixtures.py:59` and the tests that assert "Folio Studio".

**Tests** (about 100 occurrences across 12 spec files): update visible-text assertions only. Selectors from section 4.2 stay.

**Documentation**: `README.md`, `CHANGELOG.md` (add a rename entry; do not rewrite history), `CONTRIBUTING.md`, `THIRD_PARTY_NOTICES.md`, and every file in `docs/` except the audit history, which should keep the old name with a note at the top.

### 4.4 The GitHub Pages address will break

Renaming the repository redirects git and web links to the repository, but **GitHub Pages does not redirect**: `…github.io/EPUBchrome/` stops working. Three things depend on that address today:

1. The privacy-policy URL registered in the store listing.
2. `homepage_url` inside the already-published 0.5.1 package.
3. Bookmarks of people using the web version.

The web version's library is safe either way: browser storage belongs to the origin (`<account>.github.io`), not the path, so the same database opens at the new path. Moving to a custom domain is different: that is a new origin with an empty library, so tell users to download a backup first and restore it at the new address.

Order of operations:

1. Release the renamed build from the current repository name first, with all in-app text changed.
2. Rename the repository and publish Pages at the new path.
3. Immediately create a new, tiny repository named `EPUBchrome` with Pages enabled, containing `index.html` and `privacy.html` that redirect (`<meta http-equiv="refresh">` plus a visible link) to the new addresses.
4. Update the privacy-policy URL, homepage and support URL in the store dashboard.
5. Keep the redirect repository for at least a year.

Recommended alongside: put the web app on its own domain. On `github.io` it shares storage quota and origin with every other Pages site of the same account.

### 4.5 Store listing

- [ ] Name, summary and detailed description from section 2.4; start the description with "Endleaf (formerly Folio)" for the first two releases.
- [ ] New icon, five screenshots, small promo tile and marquee from `npm run store:assets`.
- [ ] Privacy-policy, homepage and support URLs.
- [ ] Expect a fresh review because the name and artwork change. Submit the rename as its own release with no new permissions so the review stays simple.

### 4.6 Tell existing users

- [ ] One-time notice in the app after updating: "Folio is now Endleaf. Your library, notes and settings are unchanged."
- [ ] The same line at the top of the README and in the changelog.
- [ ] Old `.folio` backups keep restoring; say so in the Storage dialog.

---

## 5. Roadmap

### Release 0.6.0: rename and housekeeping (no behaviour risk)

- [ ] Owner decisions: confirm the name (2.5), choose a licence (K-2).
- [ ] Rename and new artwork (Parts 3 and 4), including the upgrade regression test.
- [ ] Open the reader on first install (U-1).
- [ ] Remove unused package weight (K-1) and dead code (C-4).
- [ ] Sort and label saved highlights and bookmarks (B-1, B-2).
- [ ] Correct nouns, sample badge, 100% progress, backup scope (B-5, U-4, B-6, B-7).
- [ ] README rewrite, OCR wording, move history documents (R-2, R-3, R-4).
- [ ] Tag the release and add the release workflow (T-2).

### Release 0.7.0: reading quality

- [ ] Find next/previous with counts (B-3), then whole-book search (F-2).
- [ ] Multi-file import (B-4).
- [ ] Interface theme setting (U-2).
- [ ] Stop hashing during render (P-1).
- [ ] Backup reminders (U-3, first step).
- [ ] Mobile reading chrome (U-6), persistent preferences (U-9), notice timing (A-1), navigation semantics (A-2).

### Release 0.8.0: foundations

- [ ] ESLint baseline, then split `App.tsx` (C-1).
- [ ] Vitest for pure modules (C-2).
- [ ] Live queries instead of full refresh (P-2); counter effect key (P-3).
- [ ] Slim `css-tree` import, lazy Drive, Node-only scripts (K-3, K-5, K-4).
- [ ] Real-extension test and supply-chain hygiene (T-3, T-4).
- [ ] Design tokens and 16 px base (A-3).

### Release 0.9.0 and later: growth

- [ ] Highlight colours, notes and Markdown export (F-1).
- [ ] Metadata editing and shelves (F-4).
- [ ] Linked backup folder (F-5).
- [ ] Installable web app on its own domain (F-3).
- [ ] Read aloud (F-6), two-page spread (U-7), message catalogue and first translations (A-4).
- [ ] Firefox build (F-7); streaming restore (P-4); legacy code removal (C-3).

---

## 6. Sources for the name research

Searches run on 16 November 2026.

- Existing "Folio" readers: [Folio desktop reader user guide](https://damoiseau-xyz.pages.dev/docs/folio/user-guide/), [Foliate (Wikipedia)](https://en.wikipedia.org/wiki/Foliate_(software)), [FolioReader-Android](https://github.com/FolioReader/FolioReader-Android/issues), [FolioReaderKit](https://gitee.com/adfan/FolioReaderKit)
- Google marks in extension names: [Chrome Web Store branding guidelines](https://developer.chrome.com/docs/webstore/branding)
- Endleaf: [wittawasw/endleaf (Ruby gem)](https://github.com/wittawasw/endleaf)
- Carrel: [Carrel — Notion Web Clipper](https://chromewebstore.google.com/detail/carrel-—-notion-web-clipp/oabnehggdbfebcgfnkilhmocccpknghg), [Latchwork Systems Carrel](https://librarytechnology.org/pr/33123/latchwork-systems-introduces-carrel-a-hosted-public-computer-management-system-for-libraries-and-opens-its-pilot-program)
- Deckle: [Deckle Studio](https://deckle.studio/)
- Lectern: [Lectern: EPUB & PDF Reader](https://apkpure.com/lectern-epub-pdf-reader/nl.hofstack.lectern)
- Octavo: [Octavo Reader for Obsidian](https://community.obsidian.md/plugins/octavo)
- Shelfmark: [calibrain/shelfmark](https://github.com/calibrain/shelfmark)
- Stillpage: [sujayrittikar/stillpage](https://github.com/sujayrittikar/stillpage)
- Quietleaf: [Quietleaf: Writing Space](https://marlvel.ai/apps/quietleaf-writing-space)
