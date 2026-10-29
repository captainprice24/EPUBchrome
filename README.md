<div align="center">

# Folio · EPUBchrome

**Your books. Your notes. Your reading room.**

A local-first Chrome extension for reading EPUBs, saving the passages that matter, and taking your reading to paper.

![Version 0.1.0](https://img.shields.io/badge/version-0.1.0-385546)
![Chrome Manifest V3](https://img.shields.io/badge/Chrome-Manifest_V3-70865b)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)
[![Build and test](https://github.com/captainprice24/EPUBchrome/actions/workflows/ci.yml/badge.svg)](https://github.com/captainprice24/EPUBchrome/actions/workflows/ci.yml)

[Get started](#get-started) · [Features](#features) · [Google Drive](docs/GOOGLE_DRIVE.md) · [Contribute](CONTRIBUTING.md) · [Research](docs/RESEARCH.md)

</div>

![Folio library with EPUB import and an included sample book](docs/images/library.png)

## Read at your own pace

Bring in a DRM-free EPUB from your computer, follow its chapters, and save bookmarks and highlights. Your library and notes live in your browser. The included **The Quiet Atlas** sample is an original short read, so you can try Folio immediately.

![Folio reader showing a saved text highlight and chapter navigation](docs/images/reader.png)

## Features

| Feature | Available in v0.1 |
| --- | --- |
| Local EPUB library | File picker, drag and drop, title/author search, sorting and removal |
| Chapter navigation | EPUB 3 contents, EPUB 2 NCX, spine order and publisher page lists when supplied |
| Reading tools | Font sizing, dark mode, chapter search and reading-position restoration |
| Bookmarks and highlights | Persistent annotations, navigation and JSON note export |
| On-device OCR | Printed English in chapter images; bundled worker, WASM and model; text download |
| PDF printing | Current chapter or whole book through Chrome’s **Save as PDF** dialog |
| Google Drive | File-link import after configuring a Google OAuth client; live-account validation pending |

**This is an early development build.** Handwriting recognition, accurate native fixed-layout rendering, automated PDF conversion and verified very-large-book performance are still future work. The 1 GB input ceiling is a safety limit, not a performance guarantee. See [current limits](docs/INSTALLATION.md#current-limits) and [validation coverage](docs/VALIDATION.md).

## Get started

You need **Node.js 24.x**, npm, Python 3 (`python3`) and `curl` on your development machine. On Windows, use WSL for the build commands; the resulting extension can be loaded in Windows Chrome.

```sh
git clone https://github.com/captainprice24/EPUBchrome.git
cd EPUBchrome
npm ci
npm run build
```

Installation downloads approximately 11 MB of English OCR model data, verifies its pinned SHA-256 digest, and packages the OCR code locally. After building, local reading and OCR do not need a network connection.

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**, then choose **Load unpacked**.
3. Select the `.output/chrome-mv3` folder inside the project.
4. Pin **Folio** and click its toolbar icon.
5. Choose **Import a book**, drop an EPUB into the app, or open the included sample.

The app itself does not require a server, a Google account or an OCR subscription for local files.

### Make a portable build

```sh
npm run package
```

This creates `.output/folio-0.1.0-chrome.zip`. Unzip it and load the extracted folder as above. The GitHub **Code → Download ZIP** option downloads source code, which must be built first; it is not an installable extension. This project has not been published to the Chrome Web Store.

### Develop and test

```sh
npm run dev          # WXT development browser
npm run typecheck    # Strict TypeScript checks
npm run build        # Production Chrome MV3 build
npm test             # Seven browser integration tests
```

Browser tests require Chromium. Set `CHROMIUM_PATH` to its executable, or follow the [test setup instructions](CONTRIBUTING.md#browser-tests). GitHub Actions builds and tests the app and is configured to upload an extension ZIP after successful checks; workflow results appear in the **Actions** tab.

## Google Drive

Drive import is optional. It needs a public OAuth client ID associated with the extension’s stable ID, a consent screen and an enabled Drive API. No OAuth client secret belongs in the extension.

Follow the [Google Drive configuration guide](docs/GOOGLE_DRIVE.md). The current implementation requests read-only Drive access and has not yet been tested with a live configured account.

## Privacy and document safety

- Original EPUBs are never rewritten; annotations and OCR results are stored separately.
- Local reading and OCR run in your browser. No analytics or telemetry are included.
- Imported scripts, forms, frames and external resource URLs are blocked.
- Browser data removal or uninstalling Folio can delete the local library. Keep your original EPUBs and export your notes.

See the [privacy guide](docs/PRIVACY.md) for storage, permissions and data-loss considerations.

## Project guide

| Guide | Contents |
| --- | --- |
| [Installation and troubleshooting](docs/INSTALLATION.md) | Loading the extension, printing, OCR, packaging and supported limits |
| [Google Drive setup](docs/GOOGLE_DRIVE.md) | OAuth configuration, extension identity and permissions |
| [Contributing](CONTRIBUTING.md) | Development commands, testing and source layout |
| [Validation](docs/VALIDATION.md) | What was tested and what remains unverified |
| [Engineering research](docs/RESEARCH.md) | Reader, OCR and PDF references; language decisions; REA investigation plan |
| [Third-party notices](THIRD_PARTY_NOTICES.md) | Dependency attribution and OCR model provenance |

Built with **TypeScript, React, WXT, zip.js, Dexie and Tesseract.js**. Rust/WASM modules and a Python OCR backend are research options; neither is required by the app. A project source-code license has not been selected; third-party components retain their own licenses.
