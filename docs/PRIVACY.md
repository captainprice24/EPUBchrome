# Privacy and local data

Folio v0.1 stores imported EPUB copies, reading positions, bookmarks, highlights and OCR records in IndexedDB in the current browser profile. Original files are not rewritten. OCR records and annotations are separate from the book bytes.

## Network activity

- Local reading and printed-English OCR do not upload your books or pages.
- The packaged OCR engine and model run on your device. Installation downloads dependencies and the model; recognition itself is offline.
- No analytics or telemetry are included.
- Optional Drive import contacts Google for sign-in and the requested file. See [Google Drive access](GOOGLE_DRIVE.md).
- External resource URLs embedded in imported book content are blocked rather than fetched.

## Chrome permissions

| Permission | Purpose |
| --- | --- |
| `storage` | Extension storage permission declared for the app; the current library itself uses IndexedDB |
| `identity` | Optional Google sign-in through Chrome’s identity API |
| `https://www.googleapis.com/*` | Drive metadata and file downloads when import is requested |

These permissions are declared in the manifest even when the optional OAuth client has not been configured. The app does not request broad access to all websites or write access to Drive.

## Storage is not a backup

Browser data removal, profile changes, extension identity changes, uninstalling or storage eviction can remove the local library. Keep original EPUBs. Use **Export notes** to keep a JSON record of annotations and OCR results; it does not contain the books or provide an automatic restore flow.

Deleting a book in Folio removes its local book record and associated bookmarks, highlights and OCR records. It does not delete the original local file or the Drive source.

## Document isolation

Book markup is sanitized and displayed in a script-disabled sandbox with a restrictive resource CSP. Archive limits and path checks reduce the risk of malformed or oversized imports. These measures and the existing malicious-markup tests are not a complete security audit. Review the [validation scope](VALIDATION.md) before making security or compatibility claims.
