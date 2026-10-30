# Privacy and local data

Folio v0.4 stores imported document copies, reading positions, bookmarks, highlights and OCR records in IndexedDB in the current browser profile. Original files are not rewritten. OCR records and annotations are separate from the original bytes. MOBI and Markdown also have a derived, local reading copy; the original remains unchanged. PDF and DjVu pages are decoded locally. No PDF JavaScript, interactive forms or embedded actions are executed by the reader.

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
| `unlimitedStorage` | Reduce automatic storage eviction risk for the extension library; not a backup |
| `identity` | Optional Google sign-in through Chrome’s identity API |
| `https://www.googleapis.com/*` | Drive metadata and file downloads when import is requested |

The identity and Google host permissions are included only in builds configured with an OAuth client. In those configured builds they are declared at installation, rather than requested dynamically. The app does not request broad access to all websites or write access to Drive.

## Storage is not a backup

Browser data removal, profile changes, extension identity changes, uninstalling or storage eviction can remove the local library. Keep original EPUBs. Use **Storage & backup** to download a restorable `.folio` archive with originals, positions, annotations and OCR. **Export notes** provides JSON without the originals, importable for matching books. Backups are unencrypted and must be protected by their owner. Persistent storage is requested, and the extension declares `unlimitedStorage`, but neither protects against uninstalling, deliberate clearing or losing the device.

Deleting a book in Folio removes its local book record and associated bookmarks, highlights and OCR records. It does not delete the original local file or the Drive source.

## Document isolation

Book markup is sanitized and displayed in a script-disabled sandbox with a restrictive resource CSP. Archive limits and path checks reduce the risk of malformed or oversized imports. These measures and the existing malicious-markup tests are not a complete security audit. Review the [validation scope](VALIDATION.md) before making security or compatibility claims.
