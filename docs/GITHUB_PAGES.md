# GitHub Pages test site

Configured address: **https://captainprice24.github.io/EPUBchrome/**.

The repository builds a standalone web edition of the same React reader. It is intended for testing local EPUB/PDF/DjVu/MOBI/Markdown import, sample reading, chapter navigation, bookmarks, highlights and Chrome PDF printing without loading an unpacked extension. It also includes a downloadable ZIP of the extension, plus loading instructions.

## Automatic deployment

The `Build and test` workflow runs on pushes to `main`, pull requests and manual dispatch. It builds and tests the extension, builds the web preview, and runs six Pages-specific tests under `/EPUBchrome/`. Successful `main` runs upload a Pages artifact and deploy it through the `github-pages` environment. Pull requests are tested but not published.

The workflow attempts to enable Pages with `actions/configure-pages` and set the build source to GitHub Actions. If the workflow token cannot change that repository setting, it reports a warning and continues deployment. A repository owner should select **Settings → Pages → Source → GitHub Actions** once. This prevents a separate branch/Jekyll build from replacing the tested reader with the repository README. If GitHub does not permit automatic enablement for the workflow token:

1. Open the repository **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Open **Actions → Build and test**, then select **Run workflow** on `main`.
4. Check the deployment job and its published URL. Repository or organization environment protection rules may also require approval there.

GitHub Pages availability depends on repository visibility and the account's plan/settings. This workflow does not change repository visibility or any organization protection rule. It does not upload local reader data or credentials. Check Actions and the Pages settings for the live deployment status; a successful local build alone does not prove publication.

## What differs from the extension

- Books, notes and previously saved recognition text remain in the browser; the web library is separate from extension storage. GitHub Pages content is public, but selected books are read locally rather than uploaded.
- Storage is scoped to the website's origin. Other pages under the same GitHub Pages origin share that browser security boundary. Keep originals and export notes before clearing browser data.
- Google Drive uses Chrome extension identity APIs and is unavailable in the web preview. The preview explains this rather than attempting a non-working sign-in.
- PDF originals download unchanged; reflowing documents and current-page DjVu output use the browser's print dialog. Browser support and formatting can vary; Chrome is the primary test target.
- No service worker is installed for offline website caching. After initial load, local recognition uses bundled assets, but a first visit or reload still needs the site resources to be available.
- Language, file-size, rendering and export limitations are the same as those documented for v0.4 in [Installation](INSTALLATION.md).

## Build and test locally

```sh
npm ci
npm run build:pages
npm run test:pages
npm run preview:pages
```

The local server serves the site on port 4174 under `/EPUBchrome/`, matching GitHub Pages rather than testing only at the domain root. The output is `.output/pages`. Vite rewrites JavaScript/CSS paths; the runtime asset helper uses the same base for the EPUB sample, PDF worker/fonts/CMaps, DjVu WASM and extension download.

Changing the repository or Pages path requires updating `vite.web.config.ts`, the local server prefix, the Pages tests and documentation links together. No custom domain is configured.

Version 0.5 removes OCR and upgrades the local catalogue without rewriting originals. The upgrade may ask you to close another Folio tab; reload an older open tab after the upgrade. [Storage details](STORAGE.md).
