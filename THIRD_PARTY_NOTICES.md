# Third-party notices

Folio uses React (MIT), WXT (MIT), zip.js (BSD-3-Clause), Dexie (Apache-2.0), DOMPurify (Apache-2.0 OR MPL-2.0), CSS-tree (MIT), @noble/hashes (MIT), and their transitive dependencies. Consult pinned dependency license files for authoritative terms. Runtime dependency license texts are copied into `public/licenses` and included in the extension and Pages builds.

The Quiet Atlas sample prose is original demonstration content created for this project. All decorative book illustrations are generated using CSS; no external artwork or fonts are included.

IDPF/W3C EPUB samples are downloaded only for tests, not included in the app. Their pinned sources, CC BY-SA collection default and individual metadata/attribution are documented in [tests/corpus/README.md](tests/corpus/README.md). Axe-core and its Playwright adapter are development-only dependencies; consult their installed license files (MPL-2.0).

PDF reading uses Mozilla PDF.js (`pdfjs-dist`, Apache-2.0), including its packaged CMaps, standard fonts, ICC profiles and decoder WASM. Their individual license files are preserved in `documents/pdf`. DjVu uses `djvu-rs` (MIT); its Rust dependency notices are bundled in `licenses/djvu-rs-dependencies.txt`. No DjVuLibre/GPL runtime is shipped.

MOBI/KF8 parsing uses `@lingo-reader/mobi-parser` and `@lingo-reader/shared` (MIT), with `fflate`, `sax`, `events` and `path-browserify` under their included licenses. The parser derives from John Factotum's MIT-licensed Foliate.js MOBI implementation; that license is retained in `third-party/foliate-mobi-LICENSE` and copied into the build. `scripts/patch-mobi.mjs` records the narrow local fixes to the pinned parser. Markdown uses `marked` (MIT).

The original DjVu test fixture was generated with DjVuLibre as a development tool; that tool and its libraries are not included in the application. See `tests/fixtures/README.md`.

Library first-page previews of reflowing documents use `html2canvas` (MIT), with `css-line-break`, `text-segmentation`, `utrie` and `base64-arraybuffer` under their included MIT licenses. Rendering happens locally with the scriptless reader's sanitized content and packaged assets. No document is sent to a screenshot or conversion service.

XHTML recovery uses the strict WHATWG entity decoder from `entities` 8.1.0 (BSD-2-Clause). Its license is included in `licenses/entities.txt`; entity tables are bundled locally.
