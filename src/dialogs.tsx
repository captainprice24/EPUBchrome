// The modal dialogs of the app. Each receives the state it shows and the
// actions it can trigger; none owns data.
import { backupLibrary } from "./backup";
import { type DocumentEngine } from "./document-types";
import { Icon } from "./icons";
import {
  writePreference,
  type BackupRecord,
  type InterfaceTheme,
} from "./prefs";
import { type ReadingSettings } from "./reader";
import { type RenderIssue } from "./render-issues";
import { storageStatus } from "./storage";
import {
  bytes,
  download,
  getBook,
  removeBook,
  updateBook,
  type Book,
  type BookMetadata,
} from "./store";
import { Button, Modal } from "./ui";
import { type Preferences } from "./usePreferences";
import {
  type BookDetails,
  type ModalName,
  type NoticeKind,
  type StorageStatus,
} from "./view-types";
import { type RefObject } from "react";

export function ReadingSettingsDialog({
  closeModal,
  fixedPages,
  preferences,
}: {
  closeModal: () => void;
  fixedPages: boolean;
  preferences: Preferences;
}) {
  const {
    font,
    fontChoice,
    interfaceTheme,
    margin,
    mode,
    setFont,
    setFontChoice,
    setInterfaceTheme,
    setMargin,
    setMode,
    setSpacing,
    setSpread,
    setTheme,
    spacing,
    spread,
    theme,
  } = preferences;
  return (
    <Modal title="Make yourself comfortable" onClose={closeModal}>
      <p className="reading-settings-intro">
        A reading experience that feels like yours.
      </p>
      <fieldset className="reading-field">
        <legend>READING DIRECTION</legend>
        <div className="segmented">
          <button
            aria-pressed={mode === "horizontal"}
            onClick={() => setMode("horizontal")}
          >
            <Icon name="next" size={17} />
            Horizontal pages
          </button>
          <button
            aria-pressed={mode === "vertical"}
            onClick={() => setMode("vertical")}
          >
            <Icon name="list" size={17} />
            Vertical reading
          </button>
        </div>
      </fieldset>
      <fieldset className="reading-field" hidden={fixedPages}>
        <legend>
          TEXT SIZE <span>{font}px</span>
        </legend>
        <div className="font-slider">
          <button
            className="icon-btn"
            aria-label="A− Smaller text"
            onClick={() => setFont((v) => Math.max(14, v - 1))}
          >
            A−
          </button>
          <input
            type="range"
            aria-label="Text size"
            min="14"
            max="36"
            value={font}
            onChange={(e) => setFont(Number(e.target.value))}
          />
          <button
            className="icon-btn"
            aria-label="A+ Larger text"
            onClick={() => setFont((v) => Math.min(36, v + 1))}
          >
            A+
          </button>
        </div>
      </fieldset>
      <fieldset className="reading-field" hidden={fixedPages}>
        <legend>TYPEFACE</legend>
        <div className="font-options">
          {(
            [
              ["publisher", "Publisher", "Georgia,serif"],
              ["literary", "Literary", "Georgia,serif"],
              ["classic", "Classic", "Palatino,serif"],
              ["modern", "Clean", "Arial,sans-serif"],
            ] as const
          ).map(([id, label, family]) => (
            <button
              key={id}
              style={{ fontFamily: family }}
              aria-label={label}
              aria-pressed={fontChoice === id}
              onClick={() => setFontChoice(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="reading-field">
        <legend>BOOK PAGE APPEARANCE</legend>
        <div className="theme-options">
          {(["paper", "sepia", "night"] as const).map((t) => (
            <button
              className={`theme-${t}`}
              key={t}
              aria-label={
                t === "paper" ? "Paper" : t === "sepia" ? "Sepia" : "Night"
              }
              aria-pressed={theme === t}
              onClick={() => setTheme(t)}
            >
              {t === "paper" ? "Paper" : t === "sepia" ? "Sepia" : "Night"}
            </button>
          ))}
        </div>
        <p className="fine-print">
          Applies to the reading pages. The library and controls follow the
          Interface setting below.
        </p>
      </fieldset>
      {fixedPages && (
        <p className="fine-print">
          PDF and DjVu keep their original page layout and type size. Use the
          zoom controls to enlarge the page.
        </p>
      )}
      <div className="reading-detail-controls">
        <label>
          Interface
          <select
            aria-label="Interface appearance"
            value={interfaceTheme}
            onChange={(e) =>
              setInterfaceTheme(e.target.value as InterfaceTheme)
            }
          >
            <option value="system">Follow device</option>
            <option value="pages">Match page theme</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label hidden={fixedPages || mode !== "horizontal"}>
          Wide windows
          <select
            aria-label="Pages in wide windows"
            value={spread ? "two" : "one"}
            onChange={(e) => setSpread(e.target.value === "two")}
          >
            <option value="one">One page</option>
            <option value="two">Two pages</option>
          </select>
        </label>
      </div>
      <div className="reading-detail-controls" hidden={fixedPages}>
        <label>
          Line spacing
          <select
            aria-label="Line spacing"
            value={spacing}
            onChange={(e) => setSpacing(Number(e.target.value))}
          >
            <option value="1.4">Compact</option>
            <option value="1.7">Relaxed</option>
            <option value="2">Spacious</option>
          </select>
        </label>
        <label>
          Margins
          <select
            aria-label="Reading margins"
            value={margin}
            onChange={(e) =>
              setMargin(e.target.value as ReadingSettings["margin"])
            }
          >
            <option value="narrow">Narrow</option>
            <option value="comfortable">Comfortable</option>
            <option value="wide">Wide</option>
          </select>
        </label>
      </div>
      <p className="fine-print">
        Page counts adapt to your text settings and window size. Your place
        follows the text when the layout changes. On a touch screen, tap the
        middle of the page to hide or show the controls; in horizontal reading,
        tap the sides to turn pages.
      </p>
      <div className="modal-actions">
        <Button
          kind="secondary"
          onClick={() => {
            setFont(22);
            setMode("horizontal");
            setFontChoice("publisher");
            setSpacing(1.7);
            setMargin("comfortable");
            setTheme("paper");
            setSpread(false);
          }}
        >
          Reset reading settings
        </Button>
        <Button onClick={closeModal}>Done</Button>
      </div>
    </Modal>
  );
}

export function DriveDialog({
  closeModal,
  driveBusy,
  driveLink,
  runDrive,
  setDriveLink,
}: {
  closeModal: () => void;
  driveBusy: string;
  driveLink: string;
  runDrive: () => Promise<void>;
  setDriveLink: (value: string) => void;
}) {
  return (
    <Modal title="Your books, from Drive" onClose={closeModal}>
      <div className="modal-illustration">
        <Icon name="drive" size={36} />
      </div>
      <div>
        <p>
          Bring a document from Google Drive into your private library. Your
          original file stays unchanged.
        </p>
        <label className="field-label" htmlFor="drive-link">
          GOOGLE DRIVE FILE LINK
        </label>
        <input
          className="text-input"
          id="drive-link"
          placeholder="https://drive.google.com/file/d/…"
          value={driveLink}
          onChange={(e) => setDriveLink(e.target.value)}
        />
        <p className="fine-print">
          Google sign-in is required. This version requests read-only Drive
          access to download the file you choose. Your library stays in this
          browser.
        </p>
        {driveBusy && <p role="status">{driveBusy}</p>}
        <div className="modal-actions">
          <Button kind="secondary" onClick={closeModal}>
            Cancel
          </Button>
          <Button
            onClick={() => void runDrive()}
            disabled={!driveLink.trim() || !!driveBusy}
          >
            <Icon name="drive" size={17} />
            {driveBusy ? "Connecting…" : "Connect & open"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function StorageDialog({
  backupScope,
  books,
  busy,
  closeModal,
  lastBackup,
  legacyText,
  restoreInput,
  safe,
  setBackupScope,
  setBusy,
  setLastBackup,
  setNotice,
  setStorage,
  storage,
}: {
  backupScope: string;
  books: BookMetadata[];
  busy: string;
  closeModal: () => void;
  lastBackup: BackupRecord | undefined;
  legacyText: boolean;
  restoreInput: RefObject<HTMLInputElement | null>;
  safe: (action: () => Promise<unknown>) => () => void;
  setBackupScope: (value: string) => void;
  setBusy: (value: string) => void;
  setLastBackup: (value: BackupRecord) => void;
  setNotice: (message: string, kind?: NoticeKind) => void;
  setStorage: (status: StorageStatus) => void;
  storage: StorageStatus | null;
}) {
  return (
    <Modal title="Storage & backup" onClose={closeModal}>
      <p>
        Your books and notes are stored in this browser. A backup includes
        original files, reading positions and annotations
        {legacyText ? ", and previously saved recognition text" : ""}.
      </p>
      <p>
        {lastBackup
          ? `Last full backup: ${new Date(lastBackup.at).toLocaleDateString(undefined, { dateStyle: "medium" })}.`
          : "No full backup has been made in this browser yet."}
      </p>
      <p role="status">
        {storage?.persistent
          ? "Storage is protected from automatic eviction."
          : "Storage is best effort; the browser has not granted persistence."}{" "}
        {storage
          ? `${bytes(storage.usage)} used${storage.quota ? ` of ${bytes(storage.quota)}` : ""}.`
          : ""}
      </p>
      <p className="fine-print">
        Private browsing may remove your library when private tabs close. Use a
        regular tab and keep backups for a lasting library. Persistence does not
        protect against clearing browser data, uninstalling the extension or
        losing this device. Keep a backup somewhere safe. Backups are not
        encrypted. Restore accepts archives below 2 GB and merges with existing
        books and notes.
      </p>
      <label className="field-label" htmlFor="backup-scope">
        What to back up
      </label>
      <select
        id="backup-scope"
        className="text-input"
        value={backupScope}
        onChange={(e) => setBackupScope(e.target.value)}
      >
        <option value="">Entire library</option>
        {books.map((book) => (
          <option key={book.id} value={book.id}>
            {book.title}
          </option>
        ))}
      </select>
      {busy && <p role="status">{busy}</p>}
      <div className="modal-actions">
        <Button
          kind="secondary"
          disabled={!!busy}
          onClick={safe(async () => {
            setStorage(await storageStatus(true));
          })}
        >
          Protect storage
        </Button>
        <Button
          kind="secondary"
          disabled={!!busy}
          onClick={() => restoreInput.current?.click()}
        >
          Restore / import notes
        </Button>
        <Button
          disabled={!!busy || !books.length}
          onClick={safe(async () => {
            setBusy("Backing up your library…");
            try {
              download(
                await backupLibrary(backupScope || undefined),
                `folio-library-${new Date().toISOString().slice(0, 10)}.folio`,
              );
              if (!backupScope) {
                const record = { at: Date.now(), items: books.length };
                writePreference("folio-last-backup", JSON.stringify(record));
                setLastBackup(record);
              }
              setNotice(
                "Backup created. Keep the downloaded file somewhere safe.",
              );
            } finally {
              setBusy("");
            }
          })}
        >
          Back up library
        </Button>
      </div>
    </Modal>
  );
}

export function DeleteDialog({
  closeModal,
  deleteId,
  deleteNoun,
  deleteTarget,
  refresh,
  safe,
  setModal,
  setNotice,
}: {
  closeModal: () => void;
  deleteId: string | null;
  deleteNoun: string;
  deleteTarget: BookMetadata | undefined;
  refresh: () => Promise<void>;
  safe: (action: () => Promise<unknown>) => () => void;
  setModal: (modal: ModalName | null) => void;
  setNotice: (message: string, kind?: NoticeKind) => void;
}) {
  return (
    <Modal title={`Remove this ${deleteNoun}?`} onClose={closeModal}>
      <p>
        This removes the local copy of <strong>{deleteTarget?.title}</strong>{" "}
        and its bookmarks and highlights. Your original file is unchanged.
      </p>
      <div className="modal-actions">
        <Button kind="secondary" onClick={closeModal}>
          Keep {deleteNoun}
        </Button>
        <Button
          kind="danger"
          onClick={safe(async () => {
            if (deleteId) await removeBook(deleteId);
            setModal(null);
            await refresh();
            setNotice(
              `${deleteNoun === "book" ? "Book" : "Document"} removed from this browser.`,
            );
          })}
        >
          Remove {deleteNoun}
        </Button>
      </div>
    </Modal>
  );
}

export function DetailsDialog({
  closeModal,
  details,
  refresh,
  safe,
  setDetails,
  setModal,
  setNotice,
}: {
  closeModal: () => void;
  details: BookDetails;
  refresh: () => Promise<void>;
  safe: (action: () => Promise<unknown>) => () => void;
  setDetails: (details: BookDetails) => void;
  setModal: (modal: ModalName | null) => void;
  setNotice: (message: string, kind?: NoticeKind) => void;
}) {
  return (
    <Modal title="Edit details" onClose={closeModal}>
      <p>
        Change how this item is listed in your library. The original file is not
        modified.
      </p>
      <label className="field-label" htmlFor="details-title">
        Title
      </label>
      <input
        className="text-input"
        id="details-title"
        maxLength={500}
        value={details.title}
        onChange={(e) => setDetails({ ...details, title: e.target.value })}
      />
      <label className="field-label" htmlFor="details-author">
        Author
      </label>
      <input
        className="text-input"
        id="details-author"
        maxLength={500}
        value={details.author}
        onChange={(e) => setDetails({ ...details, author: e.target.value })}
      />
      <div className="modal-actions">
        <Button kind="secondary" onClick={closeModal}>
          Cancel
        </Button>
        <Button
          disabled={!details.title.trim()}
          onClick={safe(async () => {
            await updateBook(details.id, {
              title: details.title.trim(),
              author: details.author.trim() || "Unknown author",
            });
            setModal(null);
            await refresh();
            setNotice("Details saved.", "success");
          })}
        >
          Save details
        </Button>
      </div>
    </Modal>
  );
}

export function PrintDialog({
  active,
  busy,
  chapter,
  closeModal,
  engine,
  fixedPages,
  openedBook,
  print,
  printReview,
  printScope,
  safe,
  setPrintReview,
  setPrintScope,
}: {
  active: BookMetadata | undefined;
  busy: string;
  chapter: number;
  closeModal: () => void;
  engine: DocumentEngine | null;
  fixedPages: boolean;
  openedBook: RefObject<Book | null>;
  print: (allowLoss?: boolean) => Promise<void>;
  printReview: RenderIssue[];
  printScope: string;
  safe: (action: () => Promise<unknown>) => () => void;
  setPrintReview: (issues: RenderIssue[]) => void;
  setPrintScope: (scope: string) => void;
}) {
  return (
    <Modal title="From a good book to paper" onClose={closeModal}>
      <div className="modal-illustration">
        <Icon name="print" size={34} />
      </div>
      <p>
        Open a clean print layout, then choose <strong>Save as PDF</strong> in
        the browser’s print dialog.{" "}
        {fixedPages
          ? "DjVu creates a raster image of the current page; text will not be selectable."
          : "Reflowable text stays selectable and available original images are used."}
      </p>
      <div className="radio-options">
        <label>
          <input
            type="radio"
            name="scope"
            disabled={!!busy}
            checked={printScope === "chapter"}
            onChange={() => {
              setPrintScope("chapter");
              setPrintReview([]);
            }}
          />
          <span>
            <strong>{fixedPages ? "Current page" : "Current chapter"}</strong>
            <small>{engine?.chapters[chapter]?.title}</small>
          </span>
        </label>
        <label hidden={fixedPages}>
          <input
            type="radio"
            name="scope"
            disabled={!!busy}
            checked={printScope === "book"}
            onChange={() => {
              setPrintScope("book");
              setPrintReview([]);
            }}
          />
          <span>
            <strong>Whole book</strong>
            <small>
              {engine?.linearCount} chapters · Larger books take longer
            </small>
          </span>
        </label>
      </div>
      <p className="fine-print">
        {fixedPages
          ? "DjVu printing creates a raster copy of the current page. "
          : ""}
        Print pagination may differ from the reading view. Large image-heavy
        books are best printed chapter by chapter. Highlights and saved notes
        are not included in this version.
      </p>
      {!!printReview.length && (
        <div className="print-review" role="status">
          <h3>Review before printing</h3>
          <p>
            The layout may differ or omit content. Continue only if these
            limitations are acceptable.
          </p>
          <ul>
            {printReview.map((issue, i) => (
              <li key={i}>
                {issue.level === "lossy" ? "Missing content: " : "Formatting: "}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="modal-actions">
        <Button kind="secondary" onClick={closeModal}>
          Cancel
        </Button>
        {engine?.format === "djvu" && active && (
          <Button
            kind="secondary"
            onClick={safe(async () => {
              const source = openedBook.current || (await getBook(active.id));
              if (source)
                download(
                  source.blob,
                  active.fileName || `${active.title}.djvu`,
                );
            })}
          >
            Download original DjVu
          </Button>
        )}
        <Button
          onClick={() => void print(!!printReview.length)}
          disabled={!!busy}
        >
          <Icon name="print" size={17} />
          {busy || (printReview.length ? "Print anyway" : "Open print dialog")}
        </Button>
      </div>
    </Modal>
  );
}
