# Local storage and upgrades

Folio 0.5 keeps the library catalogue separate from document bytes. Opening a shelf, searching, sorting, saving a reading position or moving a category operates on small metadata records. It does not load or rewrite all originals. There is no server or account sync.

## Stores and migration

The IndexedDB database remains `folio-library`. Dexie schema v3 (native IndexedDB version 30) adds:

| Store | Contents |
| --- | --- |
| `library` | IDs, titles, authors, hashes, categories, reading positions, locators and pagination counts; no binary fields |
| `files` | Originals and optional prepared MOBI/Markdown reading copies for new imports, restores and repaired items |
| `previews` | Bounded library cover images, at most 1 MiB each |
| `books` | Existing v1/v2 originals retained in place for read-on-demand fallback; optional old oversized covers retained for export |
| `marks` | Existing bookmarks and highlights, with preserved IDs |
| `ocr` | Legacy recognition text retained for notes export and backup/restore; no new recognition engine |

The additive migration reads **one old row at a time**, strips binary fields into a new metadata row and copies only known bounded previews. It never gathers the old library into one array or rewrites originals/prepared files. Native Blob and typed-chunk originals remain unchanged in the legacy store. A selected legacy item is still read as a whole record by IndexedDB; the migration and selected-file read are not chunk-streaming storage.

All upgrade writes share one version-change transaction. A failed metadata/preview write aborts the upgrade: the old version, original records, marks and saved text remain. An unreadable optional cover is skipped for regeneration rather than blocking original access. Failed upgrades show retry guidance and do not clear the database. Another connection can block an upgrade; close the other Folio tabs. A tab observing a newer database closes its connection and asks for a reload before further work.

New source/metadata/preview writes are atomic. A matching-original repair preserves the ID, reading position and notes. The legacy source can then be removed when its optional cover no longer requires retention. Old oversized covers restored from backups are archived for export and never used directly as library thumbnails. Removing an item deletes all its local stores and associated notes; it never deletes the user's source file.

## Memory boundaries

- Originals are fetched for the selected reader, an explicit export/backup, repair, or a missing-preview job for a visible card. Dexie's object cache is disabled.
- Background chapter counting reuses the opened source rather than requesting another byte-backed copy from IndexedDB.
- Covers load within 240 px of the viewport. Offscreen/unmounted cards release object URLs. The cache holds at most 24 compressed preview blobs and 8 MiB of their logical payload; these are not browser process-memory limits.
- Existing missing covers are generated one at a time as cards become visible. Unsuccessful optional previews keep the title card.
- Backups snapshot metadata/notes and read one source at a time. The final archive still occupies memory/storage managed by the browser. Restore validates the complete archive before an atomic commit and can retain many originals during validation; it is **not** a streaming, constant-memory restore.
- Blob-rejecting browsers use bounded typed-byte storage with a 64 MiB limit per file record, including its prepared reading copy. This fallback does not raise the general format limits or guarantee large-file performance.

OCR's engine, models, controls and dependencies were removed in v0.5. Scanned documents still render, and embedded PDF/DjVu text remains usable where supported. Previously saved recognition text remains in Export notes and `.folio` backups and can be restored. This preservation does not load an OCR worker.

## Backups and compatibility

`.folio` remains backup version 2; originals, IDs, positions, covers, annotations and saved recognition text remain portable. Prepared reading copies are regenerated. Native database downgrades are unsupported: keep old `.folio` backups and use the current Folio build on the same browser profile. Keep source files and backups outside browser storage; uninstalling, clearing data or losing a device can still remove the library.

Browser regressions cover both legacy binary forms, prepared-copy retention, original-byte backup equality, restore/dedup, metadata-only source access, no file writes on position changes, migration rollback/retry and blocked/stale connections. These checks establish access boundaries, not a measured peak-memory guarantee on physical iPhones or complex gigabyte documents. See [validation](VALIDATION.md).
