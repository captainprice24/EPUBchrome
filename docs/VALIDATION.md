# Validation

What the automated checks cover in v0.6, and what they do not. Records for earlier versions are in the [validation log](history/VALIDATION_LOG.md).

## Checks

| Check | Command | Scope |
| --- | --- | --- |
| Formatting | `npm run format:check` | Prettier over source, tests and scripts |
| Static analysis | `npm run lint` | Oxlint correctness rules and React hook rules. Any warning fails; four effects carry a written reason for their dependency list |
| Types | `npm run typecheck` | Strict TypeScript; unused locals and parameters are errors |
| Unit tests | `npm run test:unit` | 42 tests of pure modules: chapter search, reading order of notes, progress, backup reminder, text locators, publisher CSS rewriting, archive paths, format detection, Markdown export |
| Browser tests | `npm test` | 71 scenarios in Chromium against the production build, served with the extension's content security policy |
| Installed extension | `npm run test:extension` | The built extension loaded in Chromium: permissions, the tab opened after installation, the sample, DjVu and PDF under the extension's own content security policy, tab reuse from the toolbar action |
| Web build | `npm run build:pages`, `npm run test:pages` | The same reader under the GitHub Pages path |
| Package | `npm run package` | Manifest checks, no secrets, no unused decoder files, every ZIP entry read back |
| Dependencies | `npm audit --omit=dev` | Known advisories in runtime dependencies |

GitHub Actions runs all of these on every push to `main` and every pull request, and deploys the web build only after they pass.

## What the browser tests cover

- **Reading:** import, chapters, pagination and repagination, saved place across reload and layout changes, right-to-left books, fullscreen, keyboard, wheel and swipe page turns, one and two pages in wide windows, touch taps that turn pages and hide the controls, the browser's Back button.
- **Notes:** bookmarks, highlights anchored to repeated text, reading-order lists, legacy note migration, JSON export and re-import, Markdown export.
- **Search:** every match in a chapter, next and previous, matches across inline markup.
- **Library:** Books and Documents shelves, previews, search and sorting, import of several files with a summary, editing title and author, delete dialogs, backup reminder, live updates from a second tab.
- **Formats:** EPUB 2 and 3, MOBI, Markdown, PDF and DjVu, including a pinned set of public IDPF/W3C sample books.
- **Safety:** removal of scripts, frames and forms, no network requests from book content, archive path and size limits, malformed XHTML recovery.
- **Storage:** schema upgrades from v1 and v2, failed-upgrade rollback, a second tab during upgrade, injected Blob write and read failures, backup and restore with checksum verification.
- **Appearance and accessibility:** page themes, interface theme, narrow screens, and axe checks of the application chrome for serious and critical violations.

## Not covered

- A click on the real toolbar button and an update from an older installed version. The extension test triggers the toolbar action from the service worker. Check both by hand in a clean Chrome profile before each store upload.
- Google Drive import with a live account.
- Windows and macOS Chrome, physical phones and tablets, and screen readers.
- Performance and memory with very large files. The size limits are safety ceilings, not performance claims.
- Print fidelity, and conformance with the full EPUB and PDF specifications.
- The content inside the book frame is excluded from the axe checks.

Passing tests show that these scenarios work in Chromium. They are not a security audit or a conformance certificate.
