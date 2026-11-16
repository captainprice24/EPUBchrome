# Security

Folio opens files from unknown sources, so reports about document isolation are especially welcome: script execution from a book, a network request caused by book content, a path that escapes an archive, or a file that exhausts memory despite the documented limits.

## Report a vulnerability

Please report privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue for a suspected vulnerability.

Include the app version, browser and operating system, the steps to reproduce, and a minimal file that shows the problem if you may share one. Do not send private books or personal data.

## Scope

- The extension, the web build and the build scripts in this repository.
- Only the latest released version receives fixes.

Out of scope: content that a document legitimately displays, DRM, and the browser's own PDF or printing components.

## How documents are isolated

Book markup is sanitized, publisher CSS is parsed and rewritten, and content is shown in a sandboxed frame without scripts and with a content security policy that blocks network access. See [docs/PRIVACY.md](docs/PRIVACY.md) for details and limits.
