# EPUBchrome: engineering research and development decisions

Research date: 29 October 2026. Scope: first-stage Chrome extension for local and Google Drive EPUBs, navigation, annotations, OCR and PDF export. This is a source-backed architecture investigation, not a claim that these features have been implemented. Upstream documentation was retrieved into `research/`; most URLs use mutable HEAD. Research describes the retrieved versions rather than establishing ongoing maintenance or benchmark results.

## Decisions on languages and tools

**Use TypeScript in strict mode for the extension, React for its interface, WXT/Vite for Manifest V3 packaging, and HTML/CSS for book presentation and print layouts.** Chrome's APIs, browser DOM and EPUB XHTML rendering are JavaScript-native. TypeScript adds useful checks around locators, jobs, archive entries, storage migrations and message boundaries. Runtime validation remains necessary for imported files and messages. React manages the reader controls; keep the renderer DOM outside React's reconciliation loop.

**Reserve Rust compiled to WebAssembly for measured processing bottlenecks.** It can be appropriate for bounded decompression, image transforms or specialized indexing, but adds build complexity and copies across the JS/WASM boundary. It does not remove browser memory limits or improve OCR recognition automatically. Do not adopt it before profiling zip.js and browser workers. No Rust code or toolchain is required by the selected initial workflow.

**Use Python only for an optional OCR/conversion service if later evaluations justify one.** Python provides access to PaddleOCR and other document models; it cannot run directly inside the extension. The first implementation should operate locally without requiring a backend. A remote handwriting service would introduce deployment, privacy, model licensing and latency decisions. The system Python 3.12 runtime is available; GPU models and server infrastructure have not been installed.

Installed evaluation/development tools: TypeScript, React, WXT, Vite, Chrome types, Playwright, zip.js, Dexie, DOMPurify, Tesseract.js and pdf-lib. Dependencies are pinned in the tools directory's lockfile. They are not yet application dependencies. REA is installed separately with Node 24.22.2 because its current release rejects the host's older Node 24.19.0 runtime range.

## Projects and what to take from them

| Primary source | Findings and intended use | Fit and tradeoff |
|---|---|---|
| [Foliate.js](https://github.com/johnfactotum/foliate-js) | Modular EPUB loaders, CFI utilities, reflowable/fixed-layout renderers, annotation overlays, TOC and page-list interfaces. Explicitly avoids loading the whole file. | Leading candidate for the large-book reader spike. MIT. Upstream explicitly calls the API unstable and recommends pinning a commit. Its paginator still documents performance/CSS limitations. Not adopted or benchmarked yet. |
| [EPUB.js](https://github.com/futurepress/epub.js) | Rendering, CFI, pagination and highlight examples. Useful baseline for implementation and reader behavior. | BSD-style license. An evaluation install produced moderate/high npm advisories in EPUB.js and its XML parser dependency; removed from the prepared tools. Would require dependency remediation before production consideration. |
| [Readium Web / TS toolkit](https://github.com/readium/ts-toolkit) | TypeScript publication models and web navigator packages. | BSD-3-Clause license verified in LICENSE. Strong alternative for publication abstraction and standards support; validate packaging, resource delivery and annotation integration in MV3 rather than assuming the SDK supplies an entire reader. |
| [Thorium Reader](https://github.com/edrlab/thorium-reader) | Desktop reference for TOC, page list, bookmarks, customization and accessibility with screen readers. | BSD-3-Clause verified in LICENSE. Desktop architecture is not directly a Chrome extension. Production LCP support requires components outside the open source tree. |
| [Foliate desktop](https://github.com/johnfactotum/foliate) | Navigation, annotation and reading-interface reference. | GPL-3.0-or-later application; distinguish it from the MIT Foliate.js library. Use as UX inspiration; copying application code needs license review. |
| [BookLore](https://github.com/booklore-app/booklore) | Browser library and reader with progress, highlights and annotations. | AGPLv3. Self-hosted server architecture, not an extension base. Retrieved README says BookOrbit is the successor and active-development home; assess successor separately before any adoption. |
| [Calibre](https://github.com/kovidgoyal/calibre) | Conversion architecture and a useful future comparison engine for EPUB-to-PDF output. | GPLv3 license text retrieved. Native application/toolchain, not extension code; not installed or tested here. Its conversions are a comparator, not a quality guarantee. |
| [zip.js](https://github.com/gildas-lormeau/zip.js) | Incremental ZIP processing, streams, workers, Zip64 and large archive support. | BSD-3-Clause. Selected for archive experiments. Zip64 capability does not establish that a browser can open any size book. |
| [Tesseract.js](https://github.com/naptha/tesseract.js) | Local WASM OCR in browser/Node; reuse a worker across images. | Apache-2.0. Selected printed-text baseline. Does not accept PDF directly and does not improve the underlying recognition model. Handwriting must be evaluated separately. |
| [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) | OCR and document parsing; current README describes document models with handwriting support. | Apache-2.0 project; review the chosen weights separately. Candidate for optional service or model experiments, not a drop-in browser dependency. Accuracy claims are upstream claims, not our measurements. |
| [Scribe.js](https://github.com/scribeocr/scribe.js) | Image/PDF extraction and searchable PDF text layers; same-origin deployment requirements. | Potential OCR/PDF pipeline reference. License and transitive/native/WASM components require explicit review before adoption. Not installed. |
| [OCRmyPDF](https://github.com/ocrmypdf/OCRmyPDF) | Non-destructive searchable text layers, PDF/A and deskewing. | Useful quality reference for scanned output; a native pipeline rather than an EPUB renderer or browser OCR engine. Not installed. |
| [pdf-lib](https://github.com/Hopding/pdf-lib) | PDF creation and modification in JavaScript. | MIT. Selected for PDF assembly experiments. It is not an HTML/CSS layout engine or a complete EPUB-to-PDF converter. |
| [WXT](https://github.com/wxt-dev/wxt) | TypeScript extension entrypoints and production MV3 builds. | Selected extension build system; a real background-entrypoint fixture builds successfully. |
| [Chrome identity sample](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/api-samples/identity) and [Drive browser quickstart](https://github.com/googleworkspace/browser-samples/tree/main/drive/quickstart) | Identity token acquisition and authenticated Drive requests. | Reference integration patterns. The Drive quickstart requests metadata scope and cannot by itself download file content; do not copy that scope as if it enables reading EPUBs. |
| [REA](https://github.com/morluto/rea) | Reverse Engineer Anything: static JavaScript/Electron analysis, passive CDP observations, capture comparisons and native analysis providers. | MIT REA-authored code; third-party tools retain their licenses. User-suggested investigation aid for Acrobat-like functionality, not a rendering dependency. Installed CLI separately; no global agent registration or native decompiler setup. |

## Proposed architecture

Open a dedicated reader tab rather than rendering a large book inside a toolbar popup. The MV3 service worker should coordinate extension events and lightweight messages; it is not a reliable place for uninterrupted OCR/conversion jobs. Keep heavy operations in workers owned by the reader tab, with persisted checkpoints for resume after tab or browser restart. Evaluate offscreen documents only when a concrete background requirement needs them.

Use adapters for local `File` input and Drive download. Desktop OS registration is separate from selecting a local file; a Chrome extension alone does not automatically become the operating system's default EPUB handler on Windows or macOS. Direct `file://` handling also involves Chrome's user-granted file access settings.

Stage original bytes without overwriting them. Prefer OPFS for large blobs and IndexedDB/Dexie for metadata, bookmarks, annotations, progress and job checkpoints. Query storage estimates, reserve headroom and handle quota failures. Request persistent storage where available, while allowing denial. Bound archive entry count, individual entry size, total decompressed bytes, compression ratio and image dimensions; reject traversal paths and malformed archives before extraction. Read necessary ZIP entries on demand, use bounded queues and evict decoded images and object URLs.

Keep book XHTML isolated from privileged extension pages. Strip script/event handlers and dangerous URLs; enforce sandboxing and a restrictive content policy. Imported book content must not access extension APIs. Package all executable code and OCR workers/WASM locally; test MV3 CSP and WASM configuration. DOMPurify alone is not the complete isolation boundary. The current smoke fixture tests sanitization, not the final book iframe security design.

TOC comes from EPUB3 navigation or EPUB2 NCX, following the spine for reading order. Use explicit page-list navigation where supplied. Reflowable EPUBs have no universal page count: font, viewport and layout change pagination. Label generated positions separately from publisher-provided page numbers. Support fixed-layout page navigation distinctly.

Use a book content identity and versioned locator model for annotations: spine item/href, EPUB CFI or text-position anchor, selected text quote and surrounding context. CFI alone can break if content changes. Highlights refer to text ranges, not screen coordinates; scanned pages need page identity plus normalized region coordinates and OCR-backed text anchors. Preserve annotations across reloads and reflow; export them separately from original content. Make export/deletion/migrations explicit.

## OCR: printed scans versus handwriting

Detect useful existing text first; do not OCR ordinary text EPUB chapters. For image-heavy chapters, create OCR derivatives while retaining originals. Run one or a small bounded number of workers, downsample only for recognition as needed, reuse worker/model state, cache recognition by image digest, expose progress/cancel and checkpoint after each page. Preserve confidence, language, coordinates, model version and original image dimensions. OCR words support search and accessible overlays without replacing the source image or silently modifying a book.

Tesseract.js is the local baseline for printed scans. The completed test recognizes a synthetic English heading, not handwriting, arbitrary scans or browser-extension OCR. Handwriting requires a representative multilingual corpus and a dedicated handwriting-capable model evaluation. Compare character/word error rate, confidence calibration, reading order, time per page and peak memory. Offer corrections and show uncertainty. If local quality is inadequate, propose explicit opt-in remote processing; do not silently upload books. No OCR model can guarantee perfect recognition of every handwritten page.

## PDF export: preserve content, define the output

Separate reflowable text EPUB and fixed-layout/image EPUB. For text, use a dedicated print layout that retains text, fonts where embedding is permitted, vector graphics, links and a useful outline. Wait for fonts and images, control page size/margins and inspect clipping, tables, RTL and vertical text. For scanned pages, preserve original image resolution/compression where practical and add an invisible OCR text layer with correct coordinates. Avoid turning all text pages into screenshots.

Chrome print-to-PDF is a practical first-stage interactive option. Playwright's `page.pdf()` validates a developer-side Chromium printing path; it is not an API available to ordinary extension pages. Fully automated in-extension PDF export requires a separate implementation (layout plus PDF assembly), or an explicitly chosen conversion service/native companion. pdf-lib can assemble PDFs but does not solve CSS pagination. Very large output also needs bounded generation; many JS PDF libraries accumulate the complete document in memory.

Reflowable EPUB has no unique original page layout, so promise selectable quality profiles and preservation criteria rather than identical pagination or universal losslessness. Test embedded fonts, searchable text, images, hyperlinks, outline, annotations, accessibility and document integrity. Do not claim PDF/A or PDF/UA compliance without validation. DRM-protected EPUBs are outside the first implementation's supported import path.

## Google Drive integration prerequisites

Plan user-initiated selection and per-file access, preferably `drive.file` with a compatible picker/selection flow rather than full-library access. Validate that the chosen flow grants access to existing selected books. A hosted picker bridge may be necessary if its remote scripts conflict with extension CSP; do not assume a web quickstart embeds unchanged into MV3. Use authenticated media download, stream into local storage where supported, handle expired/revoked tokens and downloads interrupted by restart. Avoid treating compressed size as required working memory.

Future integration needs a real Google Cloud project, enabled Drive/Picker services as appropriate, configured consent screen and OAuth client tied to the stable extension ID. Client ID is public configuration; no client secret belongs in extension code. Tokens must never be saved in research files or exposed to book content. No OAuth credentials were needed or requested for this environment preparation. Drive end-to-end access is not yet configured or tested.

## REA and Acrobat investigation plan

REA is appropriate for understanding observable behavior and inspecting supported local artifacts. Use controlled fixtures to compare page layout, text selection, OCR coordinates, bookmarks and PDF output before and after an action. Record the application version, exact settings, input/output digests, timings and screenshots. Use REA's static application analysis or CDP capture where the target supports it; native Acrobat analysis needs an actual installation/binary and an appropriate compatible provider. No Acrobat binary, license or decompiler is present, so no Acrobat function has been inspected. A captured behavior is evidence about that version and fixture, not proof that we reconstructed the original algorithm.

REA CLI is isolated under `rea/` with a compatible local Node runtime. After supported dependency updates, its separate audit reports two high-severity findings (Zod and the dependent REA package), with no fix available in the audit response; keep it out of extension dependencies and review/upgrade those dependencies before processing untrusted external artifacts. CLI help and a self-created JavaScript fixture can be checked without activating native providers or registering a persistent MCP server.

## Delivery sequence and acceptance gates

1. Build a minimal MV3 reader with local import, TOC, fixed/reflowable rendering and persistence. Benchmark Foliate.js versus Readium with the same fixtures before selecting the rendering engine. Pin the selected source release/commit and review licenses.
2. Add robust highlights/bookmarks and location restoration across font/viewport changes, interrupted imports and browser restart. Cover keyboard and screen-reader navigation.
3. Integrate Drive with a real OAuth client and test revoked access, per-file selection, interrupted downloads and multiple accounts.
4. Add optional printed OCR with cancellation, cache and overlays; separately evaluate handwriting and supported languages.
5. Implement print/export profiles, then assess automated export from actual quality and memory measurements.

Build a corpus including EPUB2/3, fixed and reflowable layout, RTL/vertical text, fonts, long chapters, many small chapters, image-heavy scans, malformed ZIP/XML, inaccessible files and quota exhaustion. Suggested benchmark buckets: 10 MB, 100 MB, 500 MB and 1 GB, with separately controlled decompressed sizes and image dimensions. These are proposed test buckets, not supported limits. Measure cold time-to-first-chapter, p95 chapter navigation, input responsiveness, peak JS/native/image memory, OCR latency/error rate and PDF output size/fidelity on agreed low/mid/high-end machines. Establish supported limits from measurements; there is no finite-machine guarantee for 'the largest EPUB'. No large-file or target-OS benchmark has run yet.

## What the prepared environment establishes

The WXT MV3 production fixture builds; the TypeScript/browser fixture builds. Chromium successfully decodes a ZIP chapter, persists and reopens a bookmark in IndexedDB, sanitizes malicious HTML, creates/reloads a one-page PDF and prints a page to PDF. Node Tesseract recognizes the generated heading. These are real component checks using tiny synthetic fixtures, not an implemented reader, complete valid EPUB conformance test or stress test.

The supplied Chromium refuses unpacked extension loading by administrator policy. We have not bypassed that policy. MV3 runtime loading, browser WASM OCR packaging and full extension integration require a browser/environment that permits development extensions. Current results are in `results/smoke.json`; OAuth, handwriting, large files and Windows/macOS behavior remain unvalidated.
