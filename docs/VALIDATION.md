# Version 0.1 validation

The production UI is exercised in Chromium using a local test server, with the same script/worker WASM CSP as the extension manifest. The environment administrator blocks unpacked extension loading, so toolbar startup, extension-origin permissions and real Google OAuth require a separate Chrome smoke test.

Automated coverage:

1. Sample EPUB import, EPUB 3 chapters, bookmark and highlight creation, font adjustment, chapter navigation and annotation persistence after reload.
2. Malicious EPUB script/frame/form removal, no external image request, and malformed-container recovery.
3. Browser worker OCR on a generated printed-English image using the packaged WASM core and language model, followed by recognized-text download.
4. Whole-book print layout, generation of PDF bytes through Chromium, library search and book removal.
5. Drive browser-preview error handling and a 650-pixel responsive viewport.
6. Rejection of oversized expanded ZIP metadata and traversal names before extraction.
7. Scroll-position restoration across reopening and JSON note export contents.

`npm run typecheck`, `npm run build`, and `npm test` are the required checks. The application dependency audit reported no known advisories during development. This does not certify the code's security or all possible documents.

Not covered: a live Google account, extension-origin runtime, Windows/macOS Chrome, EPUB conformance corpus, actual 1 GB performance, handwriting/multilingual accuracy, print color/font fidelity, PDF/A/PDF/UA, or DRM-protected files. The 1 GB input limit is a safety ceiling, not a performance claim.

## Reproducibility check

The repository audit also tested the proposed source tree in a fresh temporary directory, without dependencies or generated OCR files from the working checkout. `npm ci` downloaded and verified the English model from its documented upstream. TypeScript checks, the production build, all seven browser tests and ZIP packaging passed there. A dummy public OAuth client ID in `.env` was verified in the generated manifest; this checks configuration loading only, not live Google sign-in.

The GitHub Actions workflow in `.github/workflows/ci.yml` installs its own Chromium, builds the app, runs the suite and uploads the extension ZIP on success. Local validation does not establish that a remote Actions run has completed; consult the repository’s Actions tab for that status.
