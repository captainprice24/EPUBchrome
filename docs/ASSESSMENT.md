# Project assessment

**Reviewed:** Folio v0.5.1 (`78b08e9`), 16 November 2026 · **Acted on in:** v0.6.0

The review read the whole source tree, built the extension, ran the test suite and used the built app at desktop, dark and 390 px mobile sizes. No crash, data-loss defect or security hole was found. The findings were product gaps, a few functional bugs, package weight and upkeep cost.

This page lists every finding with its status after v0.6.0. Evidence line numbers refer to v0.5.1.

**The name stays Folio.** A rename was considered and dropped by the owner; no part of this work renames anything. The repository and web address keep the name EPUBchrome.

## Status at a glance

| Status | Count | Findings |
| --- | --- | --- |
| Fixed | 37 | B-1 to B-8, U-1 to U-9, P-1 to P-3, C-1 to C-4, K-1 to K-3, T-1 to T-4, R-2, R-3, R-4, A-1, A-2, A-3 |
| Partly done | 4 | K-4, K-5, R-5, A-4 |
| Open or closed without change | 2 | R-1 (owner decision), P-4 (reassessed, no change) |

Opportunities are tracked separately in [the last section](#opportunities).

## What was good and was kept

- **Document isolation.** Book markup passes DOMPurify, a real CSS parser and `@scope`, then runs in a script-less sandboxed frame with a `default-src 'none'` policy. Archive paths, entry counts, compression ratios and sizes are bounded.
- **One permission.** The store build asks only for `unlimitedStorage` and makes no network requests.
- **Storage robustness.** Metadata, files and previews are separate, writes are transactional, the WebKit Blob failure has a tested fallback, and restores are validated before any write.
- **Locators.** Highlights use text-quote anchors plus a full-text fingerprint; ambiguous matches are flagged, not guessed.
- **Honest documentation and deep browser tests.**

## Bugs

| ID | Finding in v0.5.1 | Status in v0.6.0 |
| --- | --- | --- |
| B-1 | Saved highlights and bookmarks were listed in the order of their random identifiers (`App.tsx:406`, `1319`, `2191`). Confirmed in the running app | **Fixed.** Reading order inside a book; library views group by book. `src/marks.ts`, unit and browser tests |
| B-2 | Identical highlight entries could not be told apart, and long quotes were printed in full | **Fixed.** Entries show the date saved, clamp to five lines and keep the full text as a tooltip. The library view also shows the book and chapter |
| B-3 | **Find** always returned the first match and could not match across elements (`App.tsx:1282-1305`) | **Fixed.** Every match is counted; next and previous by button, Enter and Shift+Enter; matches span inline markup and highlights. `src/find.ts` |
| B-4 | Only one file could be imported at a time (`App.tsx:1335`, `1356-1367`) | **Fixed.** Several files are added in turn with one summary; a failed file does not stop the rest |
| B-5 | Dialogs said "book" for documents; "Restored 1 books" | **Fixed** |
| B-6 | Progress never reached 100% (`App.tsx:2950-2966`) | **Fixed.** The last page is 100% and the card shows **Finished**. `src/progress.ts` |
| B-7 | A deleted item stayed selected as backup scope and produced an empty archive | **Fixed.** The scope resets, and an empty backup is refused |
| B-8 | Drive import treated an expired cached token as a permission error (`drive.ts:22-37`) | **Fixed in code**, untested against a live account like the rest of Drive import |

## User experience

| ID | Finding in v0.5.1 | Status in v0.6.0 |
| --- | --- | --- |
| U-1 | Nothing happened after installation; Chrome hides new toolbar icons | **Fixed.** The reader opens in a tab on first install; covered by the extension test |
| U-2 | Night pages sat inside a bright interface on a light system | **Fixed as an option.** **Reading settings → Interface**: follow device, match page theme, light, dark. The default stays "follow device", the behaviour chosen in v0.4.3 |
| U-3 | The only protection against losing the library was a backup the user had to remember | **Fixed, first step.** The date of the last full backup is recorded and shown; the Storage & backup button carries a reminder when items are uncovered or the backup is over 30 days old. A linked backup folder remains an opportunity (F-5) |
| U-4 | The sample card's badge covered the author line | **Fixed** |
| U-5 | The sample was detected by title and author | **Fixed.** A stored marker identifies it; samples opened before v0.6 are still matched by title. The marker is not part of a backup |
| U-6 | On a phone the header, toolbar and footer take about 230 px and notices cover the text | **Fixed.** On a touch screen a tap in the middle of the page hides every control and the page fills the screen; a second tap brings them back. In horizontal reading, taps on the sides turn pages. A small page indicator stays visible. Mouse clicks are unaffected. Notices can still overlap the page for a few seconds |
| U-7 | No two-page spread on wide screens | **Fixed.** Optional, off by default, for horizontal reading in windows from 1100 px |
| U-8 | Bookmarks were called "Saved" in the reader; tab tooltips showed raw ids | **Fixed** |
| U-9 | Library sort and PDF zoom were not remembered | **Fixed.** Sort is remembered; zoom is stored per document. Reading preferences are still global and not part of a backup |

Also fixed from earlier reviews: the browser's Back button now returns from a book to the library. Reloading still returns to the library, not to the open book; that is kept so a book that fails to open can never trap the app on reload.

## Performance

| ID | Finding in v0.5.1 | Status in v0.6.0 |
| --- | --- | --- |
| P-1 | Each render re-read the chapter text and computed its SHA-256 for every bookmark in the chapter (`App.tsx:1078-1095`) | **Fixed.** Text, fingerprint and bookmark offsets are computed once per loaded chapter |
| P-2 | Every bookmark or highlight reloads all book metadata and all marks, and re-applies all highlights | **Fixed.** Highlights are re-applied only when the open chapter's own set changes, and applying them is a single pass over the text instead of one pass per highlight. The library and notes follow database changes live, so a second tab of the web version stays current. Marks are still held as one list; that is fine for thousands of notes |
| P-3 | Changing the page theme restarted background page counting | **Fixed.** The count restarts only when the layout key changes. Counting still lays out every chapter once per layout |
| P-4 | Restore holds every restored file in memory before one atomic write (`backup.ts:266`, `383`) | **Closed without change; the finding was overstated.** The restored files are browser-managed Blobs, which Chrome keeps on disk when they are large, not in JavaScript memory. Making restore stream book by book would give up the guarantee that a failed restore leaves nothing behind. The tested, atomic restore stays |

## Code and architecture

| ID | Finding in v0.5.1 | Status in v0.6.0 |
| --- | --- | --- |
| C-1 | `App.tsx` was one 2,966-line component with no linter | **Fixed.** The component is split: `LibraryView.tsx`, `ReaderSidebar.tsx`, `dialogs.tsx` (six dialogs), `ui.tsx`, `usePreferences.ts`, plus the logic modules `find`, `marks`, `progress`, `prefs`, `notes-export`. `App.tsx` keeps the reader and the wiring (about 2,150 lines, down from 3,345 after the new features). The linter reports no warnings; four effects carry a written reason for their dependency list |
| C-2 | No unit tests | **Fixed.** 42 Vitest tests cover chapter search, note ordering, progress, backup reminders, text locators, publisher CSS rewriting, archive paths, format detection and the Markdown export. `xhtml.ts` and the backup validators need a real XML parser and stay covered through the browser |
| C-3 | The v0.2 renderer (`epub.ts:333-476`) and the `books` and `ocr` tables stay on the main path | **Fixed for the code.** The old renderer moved to `legacy-render.ts` and loads, with the migration, only for a book last opened by an older version. The `books` and `ocr` tables stay: they hold original files and text that existing libraries still read |
| C-4 | Unused imports and a stray block | **Fixed.** `noUnusedLocals` and `noUnusedParameters` are on |

A further step, when the reader itself is next changed: move the reader's loading, pagination and annotation logic into hooks (`useReaderEngine`, `useAnnotations`) and its toolbar and footer into components.

## Build, package and dependencies

| ID | Finding in v0.5.1 | Status in v0.6.0 |
| --- | --- | --- |
| K-1 | About 2.2 MB of the 8.9 MB package was never loaded: duplicate DjVu decoders, the PDF.js scripting sandbox, no-WebAssembly fallbacks | **Fixed.** 6.6 MB unpacked. The packaging script fails if those files return |
| K-2 | There was no licence, while the contributing guide invited contributions | **Fixed.** Apache License 2.0, chosen by the owner: `LICENSE`, `NOTICE`, `package.json`, and a copy in every build |
| K-3 | The main bundle carried the whole CSS grammar | **Fixed.** Parser, walker and generator are imported separately; the main chunk went from 866 KB to 754 KB |
| K-4 | Python was required to install and package a Node project | **Partly done, by choice.** Install, build and packaging are Node only, and Node 22 is supported. The browser tests still build their fixtures with Python, inline in about twenty places; rewriting them would risk the tests themselves for no benefit to users |
| K-5 | Drive import ships switched off and unverified | **Partly done; owner decision.** It loads on demand and handles expired tokens. Whether to rebuild it on the Google Picker with the `drive.file` scope or remove it needs a Google Cloud project and a live account to test against |

Also open: `minimum_chrome_version` is 147 because PDF.js 6 needs very new JavaScript APIs, and the same check blocks PDF reading in older browsers of the web version. The `pdfjs-dist/legacy` build would widen support at some size cost; measure before deciding.

## Tests and CI

| ID | Finding in v0.5.1 | Status in v0.6.0 |
| --- | --- | --- |
| T-1 | No linter in CI | **Fixed.** `npm run lint` uses Oxlint with the React hook rules and fails on any warning. `typescript-eslint` does not support TypeScript 7, which this project uses |
| T-2 | No tags, releases or release automation | **Fixed.** Pushing a `v*` tag runs the checks and publishes the ZIP with its checksum as a GitHub release. The workflow has not run yet; the store upload stays manual |
| T-3 | The installed extension was never tested | **Fixed.** `npm run test:extension` loads the built extension in Chromium and checks the permissions, the tab opened after installation, the sample, DjVu and PDF under the extension's own policy, and tab reuse from the toolbar action. It runs in CI |
| T-4 | Supply-chain hygiene | **Fixed.** Workflow actions are pinned to commit hashes, Dependabot keeps them and the npm packages current, CI runs `npm audit`, and `SECURITY.md` explains reporting. The MOBI parser fix stays a guarded script: it refuses to run unless the exact original or patched text is present |

## Documentation and repository

| ID | Finding in v0.5.1 | Status in v0.6.0 |
| --- | --- | --- |
| R-1 | Two names: the product is Folio, the repository and web path are EPUBchrome | **Open: owner decision.** Not changed |
| R-2 | The README was long and out of order | **Fixed.** Rewritten |
| R-3 | The removed OCR feature was described to every user | **Fixed.** The app mentions recognition text only when a library holds some; the documents mention it once each where it matters |
| R-4 | Audits and research were mixed with user documentation | **Fixed.** Moved to [history](history/README.md) |
| R-5 | No issue or pull-request templates; the privacy policy's only contact is the issue tracker | **Partly done.** Templates added. A contact address is the owner's to provide |

## Accessibility and languages

| ID | Finding in v0.5.1 | Status in v0.6.0 |
| --- | --- | --- |
| A-1 | Notices, including warnings, vanished after 4.5 seconds | **Fixed.** Warnings stay until dismissed; other notices last 6 seconds and wait while their close button is hovered or focused. Notices stay click-through so they never block the page |
| A-2 | Only two of four library sections announced the current one; the brand was a link to `#` | **Fixed** |
| A-3 | 14 px base size, 77 rules with 12 px text, 102 colour values against 10 variables | **Fixed for size and separators.** Secondary text is now at least 13 px and capital labels at least 12 px, through two size tokens. Sixteen near-identical separator greys became one `--line` token with a dark counterpart. The remaining one-off colours belong to illustrations and placeholder covers |
| A-4 | English only; interface text is inline | **Partly done.** The extension's name, store summary and toolbar tooltip are localizable (`public/_locales`); adding a language folder translates them. The interface text is still inline; extracting it is worth doing once a second language is chosen |

## Opportunities

| ID | Idea | Status |
| --- | --- | --- |
| F-1 | Highlight colours, a written note per highlight, editing, Markdown export | Markdown export and dates are done. Colours and written notes are open |
| F-2 | Whole-book search with snippets | Open |
| F-3 | Installable offline web app, on its own domain | Open |
| F-4 | Edit title, author and cover; sort by author; shelves; list view | Title, author and author sort are done |
| F-5 | Linked backup folder and reminders | Reminders are done |
| F-6 | Read aloud with the browser's offline voices | Open |
| F-7 | Firefox build | Open |
| F-8 | Open a link to an `.epub` in the reader, behind an optional permission | Open |
| F-9 | Reading statistics, finished shelf | **Finished** label is done |
| F-10 | Copy details for a bug report from the error screen | Done |
| F-11 | CBZ, FB2 and plain-text files | Open |

## Suggested next steps

1. Try the web version, then load the 0.6.0 ZIP in a clean Chrome profile and run the checks in [the store guide](CHROME_WEB_STORE.md).
2. Tag `v0.6.0` and upload the ZIP to the store.
3. Review the Dependabot pull requests; each one runs the full test suite.
4. Decide on Drive import (K-5), a contact address (R-5) and a second language (A-4).
5. Whole-book search (F-2) and highlight colours and notes (F-1).

## Appendix: an icon proposal, not applied

The current icon is the common outline "open book" on a green tile, the same shape most EPUB extensions use. During the review an alternative was drawn: **an open book whose two pages are two leaves**. "Folio" comes from the Latin for leaf, so the idea fits the existing name. It is solid and two-toned and was checked at 128, 48, 32 and 16 px on light and dark backgrounds. Nothing in the app uses it; applying it is the owner's choice.

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#24483a"/>
  <path d="M60 100C30 96 20 70 24 34C44 36 58 50 60 72Z" fill="#f4f1e4"/>
  <path d="M68 100C98 96 108 70 104 34C84 36 70 50 68 72Z" fill="#b9c68f"/>
</svg>
```

To apply it, replace the drawing code in `scripts/icons.mjs` with the function below, run `npm run icons`, then `npm run build && npm run store:assets` for the store artwork.

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
