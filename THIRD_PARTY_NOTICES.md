# Third-party notices

Folio uses React (MIT), WXT (MIT), zip.js (BSD-3-Clause), Dexie (Apache-2.0), DOMPurify (Apache-2.0 OR MPL-2.0), Tesseract.js / tesseract.js-core (Apache-2.0), CSS-tree (MIT), @noble/hashes (MIT), and their transitive dependencies. Consult pinned dependency license files for authoritative terms. Runtime dependency license texts are copied into `public/licenses` and included in the extension and Pages builds. Bundled worker distribution notices and OCR engine licenses are copied into `public/ocr/licenses` by the asset preparation script and included in the build.

The English model is obtained from `https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0/eng.traineddata.gz`. Model SHA-256: `ed350f3752f81ee8f38769edc14d92d997dababe23b565c59879372cc46a2468`. Tesseract traineddata is provided by the Tesseract community under Apache-2.0; preserve upstream licensing and attribution when distributing. The pinned digest detects any change to the retrieved model.

The Quiet Atlas sample prose is original demonstration content created for this project. All decorative book illustrations are generated using CSS; no external artwork or fonts are included.

IDPF/W3C EPUB samples are downloaded only for tests, not included in the app. Their pinned sources, CC BY-SA collection default and individual metadata/attribution are documented in [tests/corpus/README.md](tests/corpus/README.md). Axe-core and its Playwright adapter are development-only dependencies; consult their installed license files (MPL-2.0).
