import {
  useCallback,
  useMemo,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import {
  db,
  asset,
  download,
  message,
  updateBook,
  flushBookUpdates,
  bookCollection,
  type LibraryCollection,
  type Book,
  type BookMetadata,
  type DatabaseState,
  getBook,
  getPreview,
  addBook,
  replaceBookFiles,
  savePreview,
  bookTables,
  openLibrary,
  watchDatabase,
  type Mark,
} from "./store";
import { liveQuery } from "dexie";
import { ZoomControls } from "./ui";
import { usePreferences } from "./usePreferences";
import { LibraryView } from "./LibraryView";
import { ReaderSidebar } from "./ReaderSidebar";
import {
  ReadingSettingsDialog,
  DriveDialog,
  StorageDialog,
  DeleteDialog,
  DetailsDialog,
  PrintDialog,
} from "./dialogs";
import { Epub, type Rendered } from "./epub";
import { openDocument } from "./documents";
import {
  detectFormat,
  checkDocumentSize,
  documentAccept,
  formatNames,
  type DocumentEngine,
  type DocumentFormat,
} from "./document-types";
import { FixedPaginator, createFixedReadingDocument } from "./fixed-reader";
import { useReaderFullscreen } from "./useFullscreen";
import { applyHighlights, selectionOffsets } from "./annotations";
import { Icon } from "./icons";
import {
  documentText,
  quoteLocator,
  locatorFactory,
  resolveLocator,
  textHasher,
  RENDERER_VERSION,
  type TextLocator,
} from "./locators";
import { contentHash } from "./content-hash";
import { persistBookWrites } from "./binary-storage";
import { preparePrintLayout } from "./printing";
import type { RenderIssue } from "./render-issues";
import { createDocumentPreview, PREVIEW_VERSION } from "./thumbnails";
import { restoreLibrary } from "./backup";
import { storageStatus } from "./storage";
import { compareMarks, compareLibraryMarks } from "./marks";
import {
  findMatches,
  matchFrom,
  rangeForOffsets,
  type TextMatch,
} from "./find";
import { readChoice, writePreference, readLastBackup } from "./prefs";
import {
  Paginator,
  ChapterCounter,
  createReadingDocument,
  layoutKey,
  type ReadingSettings,
  type ReadingMode,
  type PageSnapshot,
} from "./reader";
export function App() {
  const webPreview = import.meta.env.MODE === "pages";
  // Drive import needs a Google OAuth client in the manifest; store and
  // web-preview builds ship without one, so the entry point is hidden.
  const driveConfigured =
    typeof chrome !== "undefined" &&
    !!chrome.runtime?.getManifest?.().oauth2?.client_id;
  const [books, setBooks] = useState<BookMetadata[]>([]),
    [marks, setMarks] = useState<Mark[]>([]),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [filter, setFilter] = useState<
      LibraryCollection | "bookmarks" | "highlights"
    >(() =>
      localStorage.getItem("folio-collection") === "documents"
        ? "documents"
        : "books",
    ),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState(() =>
      readChoice(
        "folio-sort",
        ["recent", "added", "title", "author"] as const,
        "recent",
      ),
    );
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notification, setNotification] = useState<{
      message: string;
      kind: "info" | "warning" | "success";
    }>({ message: "", kind: "info" }),
    [modal, setModal] = useState<
      "drive" | "print" | "delete" | "reading" | "storage" | "details" | null
    >(null),
    [deleteId, setDeleteId] = useState<string | null>(null),
    [details, setDetails] = useState({ id: "", title: "", author: "" }),
    [noticeHeld, setNoticeHeld] = useState(false);
  const notice = notification.message;
  const setNotice = useCallback(
    (message: string, kind: "info" | "warning" | "success" = "info") =>
      setNotification({ message, kind }),
    [],
  );
  const [chapter, setChapter] = useState(0),
    [engine, setEngine] = useState<DocumentEngine | null>(null),
    [rendered, setRendered] = useState<Rendered | null>(null),
    [chapterLoading, setChapterLoading] = useState(false),
    [readingError, setReadingError] = useState(""),
    [tab, setTab] = useState("contents"),
    [sidebar, setSidebar] = useState(() => window.innerWidth > 760),
    [selection, setSelection] =
      useState<ReturnType<typeof selectionOffsets>>(null),
    [find, setFind] = useState("");
  const preferences = usePreferences();
  const {
    font,
    setFont,
    mode,
    fontChoice,
    spacing,
    margin,
    theme,
    setTheme,
    interfaceDark,
    spread,
    lastLightTheme,
  } = preferences;
  const [lastBackup, setLastBackup] = useState(readLastBackup);
  const [legacyText, setLegacyText] = useState(false);
  const [backupScope, setBackupScope] = useState("");
  const [storage, setStorage] = useState<Awaited<
    ReturnType<typeof storageStatus>
  > | null>(null);
  const [orphanIds, setOrphanIds] = useState<string[]>([]);
  const [returnLocation, setReturnLocation] = useState<{
    chapter: number;
    offset: number;
  } | null>(null);
  const resumeLocator = useRef<TextLocator | undefined>(undefined);
  const restoreInput = useRef<HTMLInputElement>(null);
  const restoreQueue = useRef<Promise<void>>(Promise.resolve());
  const previewAttempts = useRef(new Set<string>());
  const previewQueue = useRef<Promise<void>>(Promise.resolve());
  const [pageZoom, setPageZoom] = useState(1);
  const fullscreen = useReaderFullscreen(!!selectedId);
  const previewBanner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const banner = previewBanner.current,
      root = fullscreen.ref.current;
    if (!banner || !root) return;
    const measure = () =>
      root.style.setProperty(
        "--preview-banner-height",
        `${banner.getBoundingClientRect().height}px`,
      );
    const observer = new ResizeObserver(measure);
    measure();
    observer.observe(banner);
    return () => observer.disconnect();
  }, [webPreview, fullscreen.ref]);
  const changeZoom = (value: number | ((previous: number) => number)) => {
    const next = typeof value === "function" ? value(pageZoom) : value;
    setPageZoom(next);
    // Each document keeps its own zoom.
    if (selectedId && engineId.current === selectedId)
      void updateBook(selectedId, { zoom: next }).catch((error) =>
        setError(message(error)),
      );
  };
  // Opening a book adds a history entry; the browser's Back button then
  // returns to the library instead of leaving the app.
  const closeBook = async () => {
    if (!selectedId) return;
    await flushBookUpdates(selectedId).catch((error) =>
      setError(message(error)),
    );
    setSelectedId(null);
    setEngine(null);
    await refresh().catch((error) => setError(message(error)));
  };
  const onHistoryBack = useEffectEvent(() => void closeBook());
  useEffect(() => {
    if (!selectedId) return;
    if (history.state?.folio === "closed")
      history.replaceState({ folio: "book" }, "");
    else if (history.state?.folio !== "book")
      history.pushState({ folio: "book" }, "");
    const back = () => onHistoryBack();
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [selectedId]);
  // Set by a tap in the middle of the page on a touch screen.
  const [chromeHidden, setChromeHidden] = useState(false);
  useEffect(() => {
    if (!selectedId) setChromeHidden(false);
  }, [selectedId]);
  const [immersiveSidebar, setImmersiveSidebar] = useState(false);
  const navigationOpen = fullscreen.enabled ? immersiveSidebar : sidebar;
  const setNavigationOpen = fullscreen.enabled
    ? setImmersiveSidebar
    : setSidebar;
  useEffect(() => {
    if (!fullscreen.enabled) setImmersiveSidebar(false);
  }, [fullscreen.enabled]);
  useEffect(() => {
    if (fullscreen.enabled && immersiveSidebar)
      document.getElementById(`reader-tab-${tab}`)?.focus();
  }, [fullscreen.enabled, immersiveSidebar, tab]);
  const fixedPages = !!engine?.fixedPages;
  const paper = useRef<HTMLDivElement>(null);
  const darkPages = theme === "night";
  const settings = useMemo<ReadingSettings>(
    () => ({
      mode,
      size: font,
      font: fontChoice,
      lineHeight: spacing,
      margin,
      theme,
      zoom: pageZoom,
      spread,
    }),
    [mode, font, fontChoice, spacing, margin, theme, pageZoom, spread],
  );
  const [pageInfo, setPageInfo] = useState<PageSnapshot | null>(null);
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const fixedRenderKey = fixedPages
    ? JSON.stringify([pageZoom, mode, dimensions?.width, dimensions?.height])
    : "";
  const [chapterCounts, setChapterCounts] = useState<number[]>([]);
  const [counting, setCounting] = useState(false);
  const [driveLink, setDriveLink] = useState(""),
    [driveBusy, setDriveBusy] = useState(""),
    [printScope, setPrintScope] = useState("chapter"),
    [printReview, setPrintReview] = useState<RenderIssue[]>([]);
  const openedBook = useRef<Book | null>(null);
  const [databaseState, setDatabaseState] = useState<DatabaseState>("opening");
  const [visibleCovers, setVisibleCovers] = useState<Set<string>>(
    () => new Set(),
  );
  const coverVisibility = useCallback(
    (id: string, visible: boolean) =>
      setVisibleCovers((current) => {
        if (current.has(id) === visible) return current;
        const next = new Set(current);
        if (visible) next.add(id);
        else next.delete(id);
        return next;
      }),
    [],
  );
  useEffect(() => watchDatabase(setDatabaseState), []);
  useEffect(() => {
    // A removed item must not remain the selected backup scope.
    if (backupScope && !books.some((b) => b.id === backupScope))
      setBackupScope("");
  }, [books, backupScope]);
  const input = useRef<HTMLInputElement>(null),
    frame = useRef<HTMLIFrameElement>(null),
    driveAbort = useRef<AbortController | null>(null),
    loadSequence = useRef(0),
    engineId = useRef<string | null>(null),
    jump = useRef<string | null>(null),
    printAbort = useRef<AbortController | null>(null),
    position = useRef(0),
    textOffset = useRef<number | undefined>(undefined),
    requestedPage = useRef<number | "last" | undefined>(undefined),
    paginator = useRef<Paginator | FixedPaginator | null>(null),
    countsKey = useRef(""),
    countsRef = useRef<number[]>([]);
  const active = books.find((b) => b.id === selectedId);
  const bookMarks = marks
    .filter((m) => m.bookId === selectedId)
    .sort(compareMarks);
  const currentMarks = bookMarks.filter((m) => m.chapter === chapter);
  const refresh = useCallback(async () => {
    await openLibrary();
    const [b, m] = await Promise.all([
      db.library.orderBy("lastRead").reverse().toArray(),
      db.marks.toArray(),
    ]);
    setBooks(b);
    setMarks(m);
  }, []);
  useEffect(() => {
    void refresh().catch((e) => setError(message(e)));
  }, [refresh]);
  // Follow changes made elsewhere, such as another tab of the web version.
  // Marks are few and change rarely. The catalogue changes with every page
  // turn of an open book, so it is followed only while the library is shown.
  useEffect(() => {
    const subscription = liveQuery(() => db.marks.toArray()).subscribe({
      next: setMarks,
      error: () => {},
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (selectedId) return;
    const subscription = liveQuery(() =>
      db.library.orderBy("lastRead").reverse().toArray(),
    ).subscribe({ next: setBooks, error: () => {} });
    return () => subscription.unsubscribe();
  }, [selectedId]);
  useEffect(() => {
    if (selectedId || busy || (filter !== "books" && filter !== "documents"))
      return;
    const book = books.find(
      (item) =>
        bookCollection(item) === filter &&
        !item.hasCover &&
        visibleCovers.has(item.id) &&
        item.previewVersion !== PREVIEW_VERSION &&
        !previewAttempts.current.has(item.id),
    );
    if (!book) return;
    const attempts = previewAttempts.current;
    attempts.add(book.id);
    const controller = new AbortController();
    let finished = false;
    // A visibility/filter change may cancel a file read that is already in
    // flight. Wait for that job to release its parser before starting another.
    const job = previewQueue.current
      .catch(() => {})
      .then(async () => {
        if (controller.signal.aborted) return;
        let parser: DocumentEngine | undefined;
        try {
          const source = await getBook(book.id);
          controller.signal.throwIfAborted();
          if (!source) return;
          parser = await openDocument(
            source.blob,
            book.format || "epub",
            book.fileName || book.title,
            source.preparedVersion === 1 ? source.prepared : undefined,
          );
          controller.signal.throwIfAborted();
          const cover = await createDocumentPreview(parser, controller.signal);
          controller.signal.throwIfAborted();
          await savePreview(book.id, cover, PREVIEW_VERSION);
        } catch {
          // Optional previews never overwrite originals, saved places or notes.
        } finally {
          await parser?.close().catch(() => {});
          finished = true;
        }
        if (!controller.signal.aborted) await refresh();
      });
    previewQueue.current = job;
    void job.catch(() => {});
    return () => {
      controller.abort();
      if (!finished) attempts.delete(book.id);
    };
  }, [books, selectedId, busy, filter, refresh, visibleCovers]);
  useEffect(() => {
    if (filter === "books" || filter === "documents")
      localStorage.setItem("folio-collection", filter);
  }, [filter]);
  useEffect(() => writePreference("folio-sort", sort), [sort]);
  useEffect(() => {
    paginator.current?.configure(settings);
  }, [settings]);
  useEffect(() => {
    // Warnings stay until dismissed. Other notices wait while the pointer or
    // keyboard focus is on them, so they can be read at any pace.
    if (!notification.message || noticeHeld || notification.kind === "warning")
      return;
    const t = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(t);
  }, [notification, noticeHeld, setNotice]);
  useEffect(() => setNoticeHeld(false), [notification]);
  useEffect(
    // On unmount, abort whichever request is running at that moment; the
    // refs are meant to be read late.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    () => () => {
      driveAbort.current?.abort();
      printAbort.current?.abort();
    },
    [],
  );
  useEffect(() => {
    const narrow = window.matchMedia("(max-width:760px)");
    const change = () => {
      if (narrow.matches) setSidebar(false);
    };
    narrow.addEventListener("change", change);
    return () => narrow.removeEventListener("change", change);
  }, []);
  // With `batch`, the caller reports one summary for all files: the item is
  // stored but not opened, and no notice or error is shown per file.
  const importFile = async (
    file: File,
    batch?: { label: string },
  ): Promise<{
    ok: boolean;
    existing?: boolean;
    id?: string;
    error?: string;
  }> => {
    const fail = (text: string) => {
      if (!batch) setError(text);
      return { ok: false, error: text };
    };
    let format: DocumentFormat;
    try {
      format = detectFormat(file.name, file.type);
      checkDocumentSize(file, format);
    } catch (error) {
      return fail(message(error));
    }
    if (!batch) setError("");
    setBusy(batch?.label || "Opening your document…");
    let parser: DocumentEngine | undefined;
    try {
      const hash = await contentHash(file);
      let existing = await db.library.where("contentHash").equals(hash).first();
      if (!existing) {
        for (const candidate of await db.library
          .filter((b) => !b.contentHash && b.size === file.size)
          .toArray()) {
          const source = await getBook(candidate.id);
          if (!source) continue;
          const candidateHash = await contentHash(source.blob);
          await updateBook(candidate.id, { contentHash: candidateHash });
          if (candidateHash === hash) {
            existing = candidate;
            break;
          }
        }
      }
      if (existing) {
        // The same original can repair a missing browser-backed file. Validate
        // the fresh source, then replace only its binary fields transactionally.
        // Keep the current record's ID, annotations, category and reading state.
        parser = await openDocument(
          file,
          existing.format || "epub",
          existing.fileName || file.name,
        );
        const cover =
          (await getPreview(existing.id)) ||
          (await createDocumentPreview(parser));
        const repaired = {
          blob: file,
          prepared: parser.prepared,
          preparedVersion: parser.prepared ? 1 : undefined,
        };
        await persistBookWrites(() =>
          db.transaction("rw", bookTables, async () => {
            const current = await db.library.get(existing!.id);
            if (!current || current.contentHash !== hash)
              throw Error(
                "This library entry changed. Return to the library and try again.",
              );
            await replaceBookFiles(current.id, repaired, cover);
          }),
        );
        if (!batch) {
          await refresh();
          setFilter(bookCollection(existing));
          setChapter(existing.chapter);
          setSelectedId(existing.id);
          setNotice(
            "This book is already in your library. Its local file copy was refreshed; your saved place and notes are preserved.",
          );
        }
        return { ok: true, existing: true, id: existing.id };
      }
      parser = await openDocument(file, format, file.name);
      const estimate = await storageStatus(true);
      if (
        estimate.quota &&
        file.size + (parser.prepared?.size || 0) >
          estimate.quota - (estimate.usage || 0)
      )
        throw Error(
          "There is not enough browser storage for this book. Remove a book or free up storage and try again.",
        );
      const cover = await createDocumentPreview(parser);
      const book: Book = {
        id: crypto.randomUUID(),
        format,
        fileName: file.name,
        prepared: parser.prepared,
        preparedVersion: parser.prepared ? 1 : undefined,
        title: parser.title,
        author: parser.author,
        size: file.size,
        added: Date.now(),
        lastRead: Date.now(),
        chapter: parser.initialChapter || 0,
        blob: file,
        cover,
        previewVersion: PREVIEW_VERSION,
        chapterCount: parser.linearCount,
        contentHash: hash,
        rendererVersion: RENDERER_VERSION,
      };
      const stored = await persistBookWrites(() =>
        db.transaction("rw", bookTables, async () => {
          const match = await db.library
            .where("contentHash")
            .equals(hash)
            .first();
          if (match) return match;
          await addBook(book);
          return book;
        }),
      );
      if (!batch) {
        await refresh();
        setChapter(stored.chapter);
        setSelectedId(stored.id);
        setFilter(bookCollection(stored));
        setNotice(
          stored.id === book.id
            ? "Added to your private library."
            : "This book is already in your library. Your saved place and notes are preserved.",
        );
      }
      return { ok: true, existing: stored.id !== book.id, id: stored.id };
    } catch (e) {
      return fail(
        e instanceof Error && e.name === "QuotaExceededError"
          ? "Browser storage is full. Back up your library, then free storage and try again."
          : message(e),
      );
    } finally {
      await parser?.close().catch(() => {});
      if (!batch) setBusy("");
    }
  };
  // One file opens straight away. Several are stored one after another and
  // reported together, so one unreadable file does not stop the rest.
  const importFiles = async (files: File[]) => {
    if (files.length === 1) {
      await importFile(files[0]!);
      return;
    }
    if (!files.length) return;
    setError("");
    let added = 0,
      existing = 0;
    const failed: string[] = [];
    try {
      for (const [i, file] of files.entries()) {
        const result = await importFile(file, {
          label: `Importing ${i + 1} of ${files.length}…`,
        });
        if (!result.ok) failed.push(`${file.name}: ${result.error}`);
        else if (result.existing) existing++;
        else added++;
      }
    } finally {
      setBusy("");
      await refresh().catch(() => {});
    }
    const summary =
      `Added ${added} of ${files.length} files to your library.` +
      (existing
        ? ` ${existing} ${existing === 1 ? "was" : "were"} already there.`
        : "");
    if (failed.length)
      setError(
        `${summary} Could not import ${failed.slice(0, 3).join(" · ")}${failed.length > 3 ? ` and ${failed.length - 3} more.` : ""}`,
      );
    else setNotice(summary, "success");
  };
  const openSample = async () => {
    try {
      setBusy("Preparing your first chapter…");
      const response = await fetch(asset("demo.epub"));
      if (!response.ok) throw Error("The sample book could not be loaded.");
      const result = await importFile(
        new File([await response.blob()], "The Quiet Atlas.epub", {
          type: "application/epub+zip",
        }),
      );
      // Remember which item is the bundled sample without relying on its title.
      if (result.id) {
        await updateBook(result.id, { sample: true });
        await refresh();
      }
    } catch (e) {
      setBusy("");
      setError(message(e));
    }
  };
  useEffect(() => {
    setReadingError("");
    setPrintReview([]);
    if (!selectedId) {
      openedBook.current = null;
      setEngine(null);
      setRendered(null);
      setPageInfo(null);
      setBusy((current) => (current === "Opening your book…" ? "" : current));
      return;
    }
    let canceled = false;
    let parser: DocumentEngine | undefined;
    setBusy("Opening your book…");
    setPageInfo(null);
    setRendered(null);
    void (async () => {
      let book = await getBook(selectedId);
      if (!book) throw Error("This book is no longer in the library.");
      if (canceled) return;
      openedBook.current = book;
      parser = await openDocument(
        book.blob,
        book.format || "epub",
        book.fileName || book.title,
        book.preparedVersion === 1 ? book.prepared : undefined,
      );
      if (canceled) {
        await parser.close();
        return;
      }
      if (
        parser instanceof Epub &&
        (book.format || "epub") === "epub" &&
        book.rendererVersion !== RENDERER_VERSION
      ) {
        // Only books last opened with an older renderer need this module.
        const { migrateLocators } = await import("./migrate-locators");
        book = await migrateLocators(book, parser);
      }
      await refresh();
      if (canceled) {
        await parser.close();
        return;
      }
      setChapter(
        Math.max(0, Math.min(book.chapter, parser.chapters.length - 1)),
      );
      resumeLocator.current = book.locator;
      setReturnLocation(null);
      position.current = book.position || 0;
      textOffset.current = book.textOffset;
      requestedPage.current = undefined;
      engineId.current = selectedId;
      if (parser.fixedPages) setPageZoom(book.zoom || 1);
      setEngine(parser);
      setBusy("");
      await updateBook(book.id, { lastRead: Date.now() });
    })().catch((e) => {
      if (!canceled) {
        setReadingError(message(e));
        setError(message(e));
        setBusy("");
      }
    });
    return () => {
      canceled = true;
      paginator.current?.destroy();
      paginator.current = null;
      if (parser) void parser.close().catch(() => {});
      if (openedBook.current?.id === selectedId) openedBook.current = null;
      setSelection(null);
    };
  }, [selectedId, refresh]);
  useEffect(() => {
    if (!engine || engineId.current !== selectedId) return;
    if (engine.fixedPages && !dimensions && paper.current) {
      setDimensions({
        width: paper.current.clientWidth,
        height: paper.current.clientHeight,
      });
      return;
    }
    const seq = ++loadSequence.current;
    const controller = new AbortController();
    let cancel = false;
    paginator.current?.destroy();
    paginator.current = null;
    setPageInfo(null);
    setChapterLoading(true);
    setPrintReview([]);
    setReadingError("");
    setSelection(null);
    setRendered(null);
    engine.releaseResources();
    void engine
      .render(chapter, controller.signal, {
        width:
          dimensions?.width || paper.current?.clientWidth || window.innerWidth,
        height:
          dimensions?.height ||
          paper.current?.clientHeight ||
          window.innerHeight,
        zoom: pageZoom,
        mode,
        pixelRatio: Math.min(3, Math.max(1.5, window.devicePixelRatio || 1)),
      })
      .then((r) => {
        if (!cancel && seq === loadSequence.current) {
          setRendered(r);
          const warning =
            r.issues === undefined
              ? r.warnings[0]
              : r.issues.find((issue) => issue.level !== "info")?.message;
          if (warning) setNotice(warning, "warning");
        }
      })
      .catch((e) => {
        if (!cancel) {
          setReadingError(message(e));
          setError(message(e));
        }
      })
      .finally(() => {
        if (!cancel) setChapterLoading(false);
      });
    return () => {
      cancel = true;
      controller.abort();
    };
    // fixedRenderKey stands for zoom, mode and page size, and is empty for
    // reflowing books, whose layout the paginator adjusts without a new render.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, chapter, selectedId, fixedRenderKey]);
  // Highlights are re-applied only when this chapter's own set changes, not
  // for every change to any mark in the library.
  const painted = useRef<{ doc: Document; ids: string } | null>(null);
  const paintHighlights = (doc: Document) => {
    const highlights = currentMarks.filter((m) => m.kind === "highlight");
    const ids = highlights.map((m) => m.id).join(" ");
    if (painted.current?.doc === doc && painted.current.ids === ids)
      return false;
    painted.current = { doc, ids };
    setOrphanIds(applyHighlights(doc, highlights));
    return true;
  };
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (doc?.body && paintHighlights(doc)) paginator.current?.refresh();
    // paintHighlights compares against what is already painted; it only needs
    // to run when the marks or the chapter change.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [marks, chapter]);
  function navigate(index: number, anchor?: string, last = false) {
    if (!engine) return;
    const next = Math.max(0, Math.min(index, engine.chapters.length - 1));
    if (window.innerWidth <= 760) setNavigationOpen(false);
    setSelection(null);
    position.current = 0;
    textOffset.current = undefined;
    requestedPage.current = last ? "last" : undefined;
    jump.current = anchor || null;
    resumeLocator.current = undefined;
    if (engine.fixedPages && selectedId && next !== chapter)
      // Original page indices are known before rasterization. Keep an explicit
      // page turn even if the user returns to the library before it finishes.
      void updateBook(selectedId, {
        chapter: next,
        page: next + 1,
        pageCount: engine.linearCount,
        position: 0,
        textOffset: undefined,
        locator: undefined,
      }).catch((error) => setError(message(error)));
    if (next === chapter && frame.current?.contentDocument) {
      const target = anchor
        ? frame.current.contentDocument.querySelector(
            `[data-folio="${CSS.escape(anchor)}"],#${CSS.escape(anchor)}`,
          )
        : null;
      if (target) paginator.current?.goToElement(target);
      else paginator.current?.goToPage(last ? Number.MAX_SAFE_INTEGER : 1);
      jump.current = null;
    } else setChapter(next);
  }
  function turnPage(direction: number) {
    if (fixedPages && !paginator.current) {
      navigate(chapter + direction);
      return;
    }
    paginator.current?.turn(direction);
  }
  function goHref(href: string) {
    if (!engine) return;
    const [path, fragment] = href.split("#");
    const i = engine.chapters.findIndex((c) => c.href === path);
    if (i >= 0) {
      if (!engine.chapters[i]!.linear && engine.chapters[chapter]?.linear)
        setReturnLocation({ chapter, offset: pageInfo?.offset || 0 });
      navigate(i, fragment ? decodeURIComponent(fragment) : undefined);
    } else setNotice("This link does not point to a readable chapter.");
  }
  function loaded() {
    const doc = frame.current?.contentDocument;
    if (!doc || !active || !engine) return;
    const seq = loadSequence.current;
    const bookId = active.id;
    const chapterIndex = chapter;
    const savedJump = jump.current;
    jump.current = null;
    findState.current = null;
    setFindStatus({ text: "", count: 0 });
    painted.current = null;
    paintHighlights(doc);
    const text = documentText(doc);
    const captureLocator = locatorFactory(
      text,
      engine.chapters[chapterIndex]!.href,
    );
    if (resumeLocator.current) {
      const restored = resolveLocator(text, resumeLocator.current);
      textOffset.current = restored?.start;
      if (!restored)
        setNotice(
          "Your saved passage could not be located. The approximate reading position was restored.",
        );
      resumeLocator.current = undefined;
    }
    paginator.current?.destroy();
    const paginationOptions = {
      offset: textOffset.current,
      progress: position.current,
      page: requestedPage.current,
      onBoundary: (direction: number) => {
        if (
          direction < 0 &&
          chapterIndex > 0 &&
          engine.chapters[chapterIndex]?.linear
        )
          navigate(chapterIndex - 1, undefined, true);
        if (
          direction > 0 &&
          engine.chapters[chapterIndex]?.linear &&
          chapterIndex < engine.linearCount - 1
        )
          navigate(chapterIndex + 1);
      },
      onChange: (s: PageSnapshot) => {
        if (seq !== loadSequence.current) return;
        position.current = s.progress;
        textOffset.current = s.offset;
        setPageInfo(s);
        const { width, height } = doc
          .getElementById("folio-viewport")!
          .getBoundingClientRect();
        setDimensions((d) =>
          d?.width === width && d.height === height ? d : { width, height },
        );
        if (countsKey.current !== s.key) {
          countsKey.current = s.key;
          countsRef.current = Array(engine.chapters.length).fill(
            engine.fixedPages ? 1 : 0,
          );
        }
        if (countsRef.current[chapterIndex] !== s.pages) {
          const counts = [...countsRef.current];
          counts[chapterIndex] = s.pages;
          countsRef.current = counts;
          setChapterCounts(counts);
        }
        if (engine.chapters[chapterIndex]?.linear)
          void updateBook(bookId, {
            chapter: chapterIndex,
            position: s.progress,
            textOffset: s.offset,
            locator: captureLocator(s.offset),
            page: engine.fixedPages ? chapterIndex + 1 : s.page,
            pageCount: engine.fixedPages ? engine.linearCount : s.pages,
            readingMode: doc.documentElement.dataset.readingMode as ReadingMode,
          }).catch((e) => setError(message(e)));
      },
      onDocumentPage: (index: number) => navigate(index),
      documentPages: engine.linearCount,
    };
    const controller = rendered?.fixedPage
      ? new FixedPaginator(doc, settings, rendered.fixedPage, paginationOptions)
      : new Paginator(doc, settings, paginationOptions);
    paginator.current = controller;
    void controller
      .start()
      .then(() => {
        if (seq !== loadSequence.current) return;
        if (savedJump) {
          const target =
            doc.querySelector(`[data-folio="${CSS.escape(savedJump)}"]`) ||
            doc.getElementById(savedJump);
          if (target) controller.goToElement(target);
        }
        requestedPage.current = undefined;
      })
      .catch((e) => setError(message(e)));
    doc.addEventListener("mouseup", () => setSelection(selectionOffsets(doc)));
    doc.addEventListener("keyup", () => setSelection(selectionOffsets(doc)));
    doc.addEventListener("selectionchange", () => {
      const selected = selectionOffsets(doc);
      if (selected) setSelection(selected);
    });
    doc.addEventListener("keydown", (event) => {
      if (event.key === "Escape") fullscreen.exit();
      if (
        event.key.toLowerCase() === "f" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        doc.getSelection()?.isCollapsed &&
        !(event.target as Element).closest("input,textarea,select")
      ) {
        event.preventDefault();
        fullscreen.toggle();
      }
    });
    // A click that follows a touch is a tap. On touch screens the sides of a
    // page turn it and the middle hides or shows the controls, so the page
    // can use the whole screen. Mouse clicks keep their usual meaning.
    let lastTouch = -Infinity;
    doc.addEventListener(
      "touchend",
      () => {
        lastTouch = performance.now();
      },
      { passive: true },
    );
    doc.addEventListener("click", (e) => {
      const a = (e.target as Element).closest("a");
      if (a) {
        e.preventDefault();
        const href = a.getAttribute("data-book-href");
        if (href) goHref(href);
        return;
      }
      // Browsers that report the pointer say so directly; others are
      // recognized by the touch that just ended.
      const pointer = (e as PointerEvent).pointerType;
      const tapped = pointer
        ? pointer === "touch"
        : performance.now() - lastTouch < 800;
      if (!tapped || !doc.getSelection()?.isCollapsed) return;
      const place = e.clientX / Math.max(1, doc.documentElement.clientWidth);
      const sides = doc.documentElement.dataset.readingMode === "horizontal";
      const forward = paginator.current?.rightToLeft ? -1 : 1;
      if (sides && place < 0.25) paginator.current?.turn(-forward);
      else if (sides && place > 0.75) paginator.current?.turn(forward);
      else setChromeHidden((hidden) => !hidden);
    });
  }
  const countKey =
    dimensions && !fixedPages
      ? layoutKey(settings, dimensions.width, dimensions.height)
      : "";
  useEffect(() => {
    if (
      !selectedId ||
      !engine ||
      engine.fixedPages ||
      engineId.current !== selectedId ||
      !dimensions ||
      !countKey
    )
      return;
    const key = countKey;
    let canceled = false;
    const abort = new AbortController();
    let parser: DocumentEngine | undefined;
    const counter = new ChapterCounter(dimensions.width, dimensions.height);
    setCounting(true);
    void (async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 450));
      if (canceled) return;
      const metadata = await db.library.get(selectedId);
      const source = openedBook.current;
      if (!metadata || !source || source.id !== selectedId || canceled) return;
      const book = { ...source, ...metadata };
      const cached = book.pagination?.key === key ? book.pagination.counts : [];
      const values = engine.chapters.map((_, i) =>
        countsKey.current === key && countsRef.current[i]
          ? countsRef.current[i]!
          : cached[i] || 0,
      );
      countsKey.current = key;
      countsRef.current = values;
      setChapterCounts(values);
      parser = await openDocument(
        book.blob,
        book.format || "epub",
        book.fileName || book.title,
        book.preparedVersion === 1 ? book.prepared : undefined,
      );
      for (let i = 0; i < engine.chapters.length; i++) {
        if (canceled) break;
        if (
          !engine.chapters[i]!.linear ||
          countsRef.current[i] ||
          parser.chapterSize(i) > 2 * 1024 * 1024
        )
          continue;
        await new Promise<void>((resolve) => setTimeout(resolve, 35));
        if (canceled) break;
        parser.releaseResources();
        try {
          const rendered = await parser.render(i, abort.signal);
          const pages = await counter.count(
            rendered.html,
            settings,
            abort.signal,
          );
          if (canceled) break;
          const counts = [...countsRef.current];
          counts[i] = pages;
          countsRef.current = counts;
          setChapterCounts(counts);
        } catch {
          if (canceled) break;
        }
      }
      if (!canceled && countsKey.current === key)
        await updateBook(selectedId, {
          pagination: { key, counts: countsRef.current },
        });
    })()
      .catch(() => {
        /* Counting is optional; the open chapter always has a measured count. */
      })
      .finally(() => {
        counter.destroy();
        void parser?.close().catch(() => {});
        if (!canceled) setCounting(false);
      });
    return () => {
      canceled = true;
      abort.abort();
      counter.destroy();
      void parser?.close().catch(() => {});
    };
    // countKey stands for the settings and page size that affect layout.
    // Theme and zoom leave the layout unchanged; they are not in the key.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, selectedId, countKey]);
  // The handler always sees the current engine, chapter and paginator.
  const onReaderKey = useEffectEvent((e: KeyboardEvent) => {
    if (
      e.key.toLowerCase() === "f" &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      !(e.target as Element).closest("input,textarea,select")
    ) {
      e.preventDefault();
      fullscreen.toggle();
      return;
    }
    if (
      (e.target as Element).closest("input,textarea,select,button") ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey
    )
      return;
    if (["ArrowRight", "PageDown"].includes(e.key)) {
      e.preventDefault();
      turnPage(
        e.key === "ArrowRight" && paginator.current?.rightToLeft ? -1 : 1,
      );
    } else if (["ArrowLeft", "PageUp"].includes(e.key)) {
      e.preventDefault();
      turnPage(
        e.key === "ArrowLeft" && paginator.current?.rightToLeft ? 1 : -1,
      );
    }
  });
  useEffect(() => {
    if (!selectedId || modal) return;
    const key = (e: KeyboardEvent) => onReaderKey(e);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [selectedId, modal]);
  // This runs while rendering. Read and fingerprint the chapter text once per
  // loaded chapter, and resolve each bookmark once, rather than on every render.
  const chapterText = useRef<{
    doc: Document;
    text: string;
    fingerprint: () => string;
    offsets: Map<string, number | undefined>;
  } | null>(null);
  const bookmarkOffset = (mark: Mark) => {
    const doc = frame.current?.contentDocument;
    if (!doc || !mark.locator) return undefined;
    if (doc.readyState !== "complete")
      return resolveLocator(documentText(doc), mark.locator)?.start;
    let cache = chapterText.current;
    if (cache?.doc !== doc) {
      const text = documentText(doc);
      cache = chapterText.current = {
        doc,
        text,
        fingerprint: textHasher(text),
        offsets: new Map(),
      };
    }
    if (!cache.offsets.has(mark.id))
      cache.offsets.set(
        mark.id,
        resolveLocator(cache.text, mark.locator, cache.fingerprint)?.start,
      );
    return cache.offsets.get(mark.id);
  };
  const currentBookmark = currentMarks.find(
    (m) =>
      m.kind === "bookmark" &&
      (fixedPages || (!m.unresolved && !!m.locator)) &&
      pageInfo &&
      (fixedPages ||
        (bookmarkOffset(m) !== undefined
          ? paginator.current?.pageForOffset(bookmarkOffset(m)!) ===
            pageInfo.page
          : 1 + Math.round((m.position || 0) * (pageInfo.pages - 1)) ===
            pageInfo.page)),
  );
  const addBookmark = async () => {
    if (!active || !engine) return;
    const existing = currentBookmark;
    if (existing) {
      await db.marks.delete(existing.id);
      await refresh();
      setNotice("Bookmark removed.");
      return;
    }
    await db.marks.add({
      id: crypto.randomUUID(),
      bookId: active.id,
      chapter,
      chapterTitle: engine.chapters[chapter]!.title,
      kind: "bookmark",
      text: fixedPages
        ? engine.chapters[chapter]!.title
        : `Page ${pageInfo?.page || 1} · ${engine.chapters[chapter]!.title}`,
      textOffset: pageInfo?.offset,
      locator: frame.current?.contentDocument
        ? quoteLocator(
            documentText(frame.current.contentDocument),
            engine.chapters[chapter]!.href,
            pageInfo?.offset || 0,
          )
        : undefined,
      page: fixedPages ? chapter + 1 : pageInfo?.page,
      pageCount: fixedPages ? engine.linearCount : pageInfo?.pages,
      readingMode: mode,
      position: position.current,
      created: Date.now(),
    });
    await refresh();
    setNotice("Bookmark saved.", "success");
  };
  const highlight = async () => {
    if (!selection || !active || !engine) return;
    if (selection.end - selection.start > 10000) {
      setNotice(
        "Highlight passages of up to 10,000 characters. Select a shorter passage.",
      );
      return;
    }
    await db.marks.add({
      id: crypto.randomUUID(),
      bookId: active.id,
      chapter,
      chapterTitle: engine.chapters[chapter]!.title,
      kind: "highlight",
      ...selection,
      locator: frame.current?.contentDocument
        ? quoteLocator(
            documentText(frame.current.contentDocument),
            engine.chapters[chapter]!.href,
            selection.start,
            selection.end,
          )
        : undefined,
      created: Date.now(),
    });
    frame.current?.contentDocument?.getSelection()?.removeAllRanges();
    setSelection(null);
    await refresh();
    setTab("highlights");
    setNotice("Highlight saved.", "success");
  };
  const removeMark = async (id: string) => {
    await db.marks.delete(id);
    await refresh();
  };
  function selectMark(mark: Mark) {
    if (
      mark.unresolved ||
      (mark.chapter === chapter && orphanIds.includes(mark.id))
    ) {
      setNotice(
        "This saved passage needs review. Its text is preserved, but its location could not be resolved safely.",
      );
      return;
    }
    if (mark.bookId !== selectedId) {
      jump.current = mark.kind === "highlight" ? mark.id : null;
      void updateBook(mark.bookId, {
        chapter: mark.chapter,
        position: mark.position || 0,
        textOffset: mark.textOffset,
        locator: mark.locator,
        page: mark.page,
      })
        .then(() => {
          setChapter(mark.chapter);
          setSelectedId(mark.bookId);
        })
        .catch((e) => setError(message(e)));
    } else {
      navigate(mark.chapter, mark.kind === "highlight" ? mark.id : undefined);
      if (mark.kind === "bookmark") {
        position.current = mark.position || 0;
        textOffset.current = bookmarkOffset(mark);
        resumeLocator.current = mark.locator;
        if (mark.chapter === chapter) {
          if (bookmarkOffset(mark) !== undefined)
            paginator.current?.goToOffset(bookmarkOffset(mark)!);
          else
            paginator.current?.goToPage(
              1 +
                Math.round((mark.position || 0) * ((pageInfo?.pages || 1) - 1)),
            );
        }
      }
    }
  }
  const runDrive = async () => {
    const controller = new AbortController();
    driveAbort.current = controller;
    setError("");
    try {
      const { driveImport } = await import("./drive");
      const result = await driveImport(
        driveLink,
        setDriveBusy,
        controller.signal,
      );
      try {
        setModal(null);
        await importFile(result.file);
      } finally {
        await result.cleanup();
      }
    } catch (e) {
      if (!controller.signal.aborted) setError(message(e));
    } finally {
      setDriveBusy("");
      driveAbort.current = null;
    }
  };
  const closeModal = useCallback(() => {
    setPrintReview([]);
    setModal(null);
    driveAbort.current?.abort();
    printAbort.current?.abort();
  }, []);
  const print = async (allowLoss = false) => {
    if (!engine) return;
    if (engine.format === "pdf" && active) {
      const source = openedBook.current || (await getBook(active.id));
      if (source)
        download(source.blob, active.fileName || `${active.title}.pdf`);
      return;
    }
    const controller = new AbortController();
    printAbort.current = controller;
    let printFrame: HTMLIFrameElement | undefined;
    let printed = false;
    setBusy("Preparing print layout…");
    setError("");
    try {
      const prepared = await preparePrintLayout(
        engine,
        chapter,
        printScope,
        controller.signal,
        setBusy,
      );
      const p = prepared.frame;
      printFrame = p;
      const sameReview =
        JSON.stringify(prepared.issues) === JSON.stringify(printReview);
      if (prepared.issues.length && (!allowLoss || !sameReview)) {
        setPrintReview(prepared.issues);
        return;
      }
      setPrintReview([]);
      setModal(null);
      p.contentWindow?.focus();
      p.contentWindow?.print();
      printed = true;
      setTimeout(() => p.remove(), 60000);
      setNotice("Choose “Save as PDF” in the print dialog.");
    } catch (e) {
      if (!controller.signal.aborted) setError(message(e));
    } finally {
      if (!printed) printFrame?.remove();
      printAbort.current = null;
      setBusy("");
    }
  };
  const findState = useRef<{
    doc: Document;
    query: string;
    matches: TextMatch[];
    index: number;
  } | null>(null);
  const [findStatus, setFindStatus] = useState({ text: "", count: 0 });
  function findText(direction = 1) {
    const doc = frame.current?.contentDocument;
    const query = find.trim();
    if (!doc?.body || !query) return;
    let state = findState.current;
    if (!state || state.doc !== doc || state.query !== query) {
      // Search the same text sequence that locators use, so a match can span
      // inline elements and existing highlights.
      const matches = findMatches(documentText(doc), query);
      state = findState.current = {
        doc,
        query,
        matches,
        index: fixedPages ? 0 : matchFrom(matches, pageInfo?.offset || 0),
      };
    } else if (state.matches.length)
      state.index =
        (state.index + direction + state.matches.length) % state.matches.length;
    const match = state.matches[state.index];
    const range = match && rangeForOffsets(doc, match.start, match.end);
    if (!match || !range) {
      setFindStatus({ text: "No matches", count: 0 });
      setNotice(
        fixedPages ? "No match on this page." : "No match in this chapter.",
      );
      return;
    }
    const selected = doc.getSelection();
    selected?.removeAllRanges();
    selected?.addRange(range);
    paginator.current?.goToOffset(match.start);
    setSelection(selectionOffsets(doc));
    setFindStatus({
      text: `${state.index + 1} of ${state.matches.length}`,
      count: state.matches.length,
    });
  }
  const collectionView = filter === "books" || filter === "documents";
  const deleteTarget = books.find((b) => b.id === deleteId);
  const deleteNoun =
    deleteTarget && bookCollection(deleteTarget) === "documents"
      ? "document"
      : "book";
  const collectionBooks = books.filter((b) => bookCollection(b) === filter);
  const visibleBooks = collectionBooks
    .filter((b) =>
      (b.title + " " + b.author).toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title)
        : sort === "author"
          ? a.author.localeCompare(b.author) || a.title.localeCompare(b.title)
          : sort === "added"
            ? b.added - a.added
            : b.lastRead - a.lastRead,
    );
  const bookTitles = new Map(books.map((b) => [b.id, b.title]));
  const visibleMarks = marks
    .filter(
      (m) =>
        m.kind === (filter === "bookmarks" ? "bookmark" : "highlight") &&
        `${m.text} ${m.chapterTitle} ${bookTitles.get(m.bookId) || ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort(compareLibraryMarks(new Map(books.map((b, i) => [b.id, i]))));
  const safe = (fn: () => Promise<unknown>) => () =>
    void fn().catch((e) => setError(message(e)));
  return (
    <div
      ref={fullscreen.ref}
      className={`app ${fullscreen.enabled ? "immersive" : ""} ${fixedPages ? "native-reading" : ""} ${selectedId ? "reading" : ""} ${selectedId && chromeHidden ? "chrome-hidden" : ""} ${interfaceDark ? "night" : ""}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files);
        if (files.length && !busy) void importFiles(files);
      }}
    >
      {webPreview && (
        <div className="web-preview-banner" ref={previewBanner}>
          <span>
            <strong>Folio web preview</strong> · Your private EPUB book library,
            with PDF and other documents too. Files stay in this browser. No
            registration, no ads, no fees.
          </span>
          <a
            href="https://chromewebstore.google.com/detail/ledggmakmbckalemicbpioibgiakheop"
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="plus" size={15} />
            Get Chrome extension
          </a>
        </div>
      )}
      <input
        ref={input}
        aria-label="Import document file"
        type="file"
        accept={documentAccept}
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          if (files.length) void importFiles(files);
        }}
      />
      <input
        ref={restoreInput}
        type="file"
        accept=".folio,.zip,.json"
        aria-label="Restore library file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file)
            void (restoreQueue.current = restoreQueue.current.then(async () => {
              setBusy("Restoring your library…");
              try {
                const result = await restoreLibrary(file);
                await refresh();
                setStorage(await storageStatus());
                setNotice(
                  `Restored ${result.books} ${result.books === 1 ? "item" : "items"}. Notes were merged without replacing existing notes.`,
                );
              } catch (error) {
                setError(message(error));
              } finally {
                setBusy("");
              }
            }));
        }}
      />
      {!selectedId ? (
        <>
          <LibraryView
            bookTitles={bookTitles}
            books={books}
            busy={busy}
            collectionBooks={collectionBooks}
            collectionView={collectionView}
            coverVisibility={coverVisibility}
            driveConfigured={driveConfigured}
            filter={filter}
            input={input}
            lastBackup={lastBackup}
            marks={marks}
            openSample={openSample}
            refresh={refresh}
            removeMark={removeMark}
            safe={safe}
            search={search}
            selectMark={selectMark}
            setChapter={setChapter}
            setDeleteId={setDeleteId}
            setDetails={setDetails}
            setFilter={setFilter}
            setLegacyText={setLegacyText}
            setModal={setModal}
            setNotice={setNotice}
            setSearch={setSearch}
            setSelectedId={setSelectedId}
            setSort={setSort}
            setStorage={setStorage}
            sort={sort}
            visibleBooks={visibleBooks}
            visibleMarks={visibleMarks}
          />
        </>
      ) : (
        <>
          <header className="reader-top">
            <button
              className="icon-btn"
              aria-label="Back to library"
              onClick={safe(async () => {
                await closeBook();
                // Keep the entry for the next book instead of stepping back:
                // a history step is asynchronous and could land on whatever
                // is opened next.
                if (history.state?.folio === "book")
                  history.replaceState({ folio: "closed" }, "");
              })}
            >
              <Icon name="arrow" />
            </button>
            <span className="reader-brand">
              folio<span>.</span>
            </span>
            <span className="reader-top-divider" />
            <div className="reader-book-title">
              <strong>{active?.title || "Opening book…"}</strong>
              <span>{active?.author}</span>
            </div>
            <div className="reader-tools">
              <button
                className="icon-btn"
                aria-label="Enter fullscreen"
                title="Fullscreen (F)"
                onClick={fullscreen.toggle}
              >
                <Icon name="expand" />
              </button>
              <button
                className="icon-btn"
                title={
                  engine?.format === "pdf"
                    ? "Download original PDF"
                    : "Print or save as PDF"
                }
                aria-label={
                  engine?.format === "pdf"
                    ? "Download original PDF"
                    : "Print or save as PDF"
                }
                onClick={safe(async () => {
                  if (engine?.format === "pdf" && active) {
                    const source =
                      openedBook.current || (await getBook(active.id));
                    if (source)
                      download(
                        source.blob,
                        active.fileName || `${active.title}.pdf`,
                      );
                  } else setModal("print");
                })}
              >
                <Icon name={engine?.format === "pdf" ? "download" : "print"} />
              </button>
              <button
                className="icon-btn"
                aria-label="Reading settings"
                title="Reading settings"
                onClick={() => setModal("reading")}
              >
                <Icon name="settings" />
              </button>
              {fixedPages && (
                <ZoomControls zoom={pageZoom} onChange={changeZoom} />
              )}
              <span className="tool-separator" hidden={fixedPages} />
              <button
                hidden={fixedPages}
                className="icon-btn font-button"
                aria-label="A− Decrease font size"
                onClick={() => setFont((v) => Math.max(14, v - 1))}
              >
                A−
              </button>
              <span className="font-value" hidden={fixedPages}>
                {font}
              </span>
              <button
                hidden={fixedPages}
                className="icon-btn font-button"
                aria-label="A+ Increase font size"
                onClick={() => setFont((v) => Math.min(36, v + 1))}
              >
                A+
              </button>
              <button
                className="icon-btn"
                aria-label={darkPages ? "Use light pages" : "Use dark pages"}
                title={
                  darkPages
                    ? "Return to the previous light page theme"
                    : "Switch book pages to Night"
                }
                onClick={() =>
                  setTheme((t) =>
                    t === "night" ? lastLightTheme.current : "night",
                  )
                }
              >
                <Icon name={darkPages ? "sun" : "moon"} />
              </button>
            </div>
          </header>
          {fullscreen.enabled && (
            <div className="immersive-controls">
              <div
                className="immersive-tools"
                role="group"
                aria-label="Fullscreen reading tools"
              >
                <button
                  className="text-button"
                  aria-label="Contents"
                  title="Show chapter navigation"
                  aria-expanded={navigationOpen}
                  aria-controls={
                    navigationOpen ? "reader-navigation" : undefined
                  }
                  onClick={() => {
                    setTab("contents");
                    setNavigationOpen(!navigationOpen || tab !== "contents");
                  }}
                >
                  <Icon name="list" size={17} /> Contents
                </button>
                <button
                  className={`bookmark-action ${currentBookmark ? "saved" : ""}`}
                  aria-label={currentBookmark ? "Bookmarked" : "Bookmark"}
                  aria-pressed={!!currentBookmark}
                  onClick={safe(addBookmark)}
                  disabled={!engine || !pageInfo || chapterLoading}
                >
                  <Icon name="bookmark" size={17} />
                  {currentBookmark ? "Bookmarked" : "Bookmark"}
                </button>
                <button
                  className="text-button"
                  aria-label="Notes — bookmarks and highlights"
                  aria-expanded={navigationOpen && tab !== "contents"}
                  aria-controls={
                    navigationOpen ? "reader-navigation" : undefined
                  }
                  onClick={() => {
                    setTab("highlights");
                    setNavigationOpen(!navigationOpen || tab === "contents");
                  }}
                >
                  <Icon name="highlight" size={17} /> Notes
                </button>
                <button
                  className="text-button"
                  aria-label="Reading settings"
                  onClick={() => setModal("reading")}
                >
                  <Icon name="settings" size={17} /> Settings
                </button>
              </div>
              <span className="immersive-label">
                {fullscreen.fallback
                  ? "Distraction-free view"
                  : "Fullscreen reading"}
              </span>
              {fixedPages && (
                <ZoomControls zoom={pageZoom} onChange={changeZoom} />
              )}
              <button
                className="text-button"
                aria-label="Exit fullscreen"
                onClick={fullscreen.exit}
              >
                <Icon name="contract" size={17} /> Exit fullscreen
              </button>
            </div>
          )}
          {!!engine?.warnings?.length && (
            <details className="document-warning">
              <summary>
                <Icon name="info" size={16} /> This EPUB has missing
                reading-order entries
              </summary>
              {engine.warnings.map((warning, i) => (
                <p key={i}>{warning}</p>
              ))}
            </details>
          )}
          <div className="reader-layout">
            {navigationOpen && (
              <ReaderSidebar
                active={active}
                bookMarks={bookMarks}
                chapter={chapter}
                chapterCounts={chapterCounts}
                counting={counting}
                engine={engine}
                fixedPages={fixedPages}
                fullscreen={fullscreen}
                goHref={goHref}
                orphanIds={orphanIds}
                removeMark={removeMark}
                safe={safe}
                selectMark={selectMark}
                setNavigationOpen={setNavigationOpen}
                setTab={setTab}
                tab={tab}
              />
            )}
            <main className="reader-main">
              <div className="chapter-toolbar">
                <div>
                  {!navigationOpen && (
                    <button
                      className="icon-btn"
                      aria-label="Show navigation"
                      onClick={() => setNavigationOpen(true)}
                    >
                      <Icon name="list" />
                    </button>
                  )}
                  <button
                    hidden={fixedPages}
                    className="icon-btn chapter-skip"
                    aria-label="Previous chapter"
                    onClick={() => navigate(chapter - 1)}
                    disabled={
                      chapter === 0 ||
                      !engine?.chapters[chapter]?.linear ||
                      chapterLoading
                    }
                  >
                    <Icon name="prev" size={15} />
                  </button>
                  {returnLocation && (
                    <button
                      className="text-button"
                      onClick={() => {
                        const location = returnLocation;
                        navigate(location.chapter);
                        textOffset.current = location.offset;
                        setReturnLocation(null);
                      }}
                    >
                      Back to text
                    </button>
                  )}
                  <span>
                    {engine?.chapters[chapter]?.title || "Opening chapter"}
                  </span>
                  <button
                    hidden={fixedPages}
                    className="icon-btn chapter-skip"
                    aria-label="Next chapter"
                    onClick={() => navigate(chapter + 1)}
                    disabled={
                      !engine ||
                      chapter >= engine.linearCount - 1 ||
                      chapterLoading
                    }
                  >
                    <Icon name="next" size={15} />
                  </button>
                  {engine?.fixedLayout && (
                    <span className="tag">Fixed layout</span>
                  )}
                </div>
                <form
                  className="chapter-find"
                  onSubmit={(e) => {
                    e.preventDefault();
                    findText(1);
                  }}
                >
                  <Icon name="search" size={15} />
                  <input
                    aria-label={fixedPages ? "Find in page" : "Find in chapter"}
                    placeholder={
                      fixedPages ? "Find in page" : "Find in chapter"
                    }
                    value={find}
                    onChange={(e) => {
                      setFind(e.target.value);
                      setFindStatus({ text: "", count: 0 });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && e.shiftKey) {
                        e.preventDefault();
                        findText(-1);
                      }
                    }}
                  />
                  <span className="find-status" role="status">
                    {findStatus.text}
                  </span>
                  {findStatus.count > 1 && (
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Previous match"
                      title="Previous match (Shift+Enter)"
                      onClick={() => findText(-1)}
                    >
                      <Icon name="prev" size={14} />
                    </button>
                  )}
                  <button
                    type="submit"
                    className="text-button"
                    title={findStatus.count > 1 ? "Next match (Enter)" : "Find"}
                  >
                    {findStatus.count > 1 ? "Next" : "Find"}
                  </button>
                </form>
                <button
                  className={`bookmark-action ${currentBookmark ? "saved" : ""}`}
                  aria-label={currentBookmark ? "Bookmarked" : "Bookmark"}
                  onClick={safe(addBookmark)}
                  disabled={!engine || !pageInfo || chapterLoading}
                >
                  <Icon name="bookmark" size={16} />
                  <span>{currentBookmark ? "Bookmarked" : "Bookmark"}</span>
                </button>
              </div>
              <div className="paper-wrap" data-page-theme={theme} ref={paper}>
                {chapterLoading ? (
                  <div className="reader-loading">
                    <span className="spinner" />
                    <p>{busy || "Turning the page…"}</p>
                  </div>
                ) : rendered ? (
                  <iframe
                    ref={frame}
                    title="Book chapter"
                    sandbox="allow-same-origin"
                    srcDoc={
                      rendered.fixedPage
                        ? createFixedReadingDocument(rendered.html)
                        : createReadingDocument(rendered.html)
                    }
                    onLoad={loaded}
                  />
                ) : (
                  <div className="empty">
                    <Icon name="book" />
                    <p>
                      {readingError
                        ? fixedPages
                          ? "Unable to open this page. Try another page or return to your library."
                          : "Unable to open this chapter. Try another chapter or return to your library."
                        : "Opening your reading room…"}
                    </p>
                    {readingError && <p>{readingError}</p>}
                    {readingError && (
                      <button
                        className="button secondary"
                        onClick={() => {
                          setSelectedId(null);
                          input.current?.click();
                        }}
                      >
                        Choose original file
                      </button>
                    )}
                  </div>
                )}
                {chromeHidden && pageInfo && (
                  <span className="page-pill" aria-hidden="true">
                    {fixedPages && engine
                      ? `${chapter + 1} / ${engine.linearCount}`
                      : `${pageInfo.page} / ${pageInfo.pages}`}
                  </span>
                )}
                {selection && (
                  <div className="selection-bar">
                    <span>
                      {selection.text.length > 55
                        ? selection.text.slice(0, 55) + "…"
                        : selection.text}
                    </span>
                    <button onClick={safe(highlight)}>
                      <Icon name="highlight" size={16} />
                      Highlight
                    </button>
                    <button
                      className="icon-btn"
                      aria-label="Dismiss selection"
                      onClick={() => setSelection(null)}
                    >
                      <Icon name="close" size={15} />
                    </button>
                  </div>
                )}
              </div>
              <footer className="reader-footer paginated-footer">
                <button
                  className="page-button"
                  onClick={() => turnPage(-1)}
                  disabled={
                    chapterLoading ||
                    (fixedPages
                      ? chapter === 0
                      : !pageInfo ||
                        (pageInfo.page === 1 &&
                          (chapter === 0 ||
                            !engine?.chapters[chapter]?.linear)))
                  }
                >
                  <Icon name="prev" size={16} />
                  Previous page
                </button>
                <div className="page-location">
                  <span className="page-count" aria-live="polite">
                    {readingError && !rendered && !chapterLoading
                      ? fixedPages
                        ? "Page unavailable"
                        : "Chapter unavailable"
                      : fixedPages && engine
                        ? `Page ${chapter + 1} of ${engine.linearCount}`
                        : pageInfo
                          ? `Page ${pageInfo.page} of ${pageInfo.pages}`
                          : "Counting pages…"}
                  </span>
                  <span className="chapter-location">
                    {fixedPages
                      ? `${engine ? formatNames[engine.format] : ""} · Original pages`
                      : engine?.chapters[chapter]?.linear
                        ? `Chapter ${chapter + 1} of ${engine.linearCount}`
                        : "Supplementary content"}
                    {!fixedPages &&
                    chapterCounts.length > 0 &&
                    engine?.chapters[chapter]?.linear &&
                    chapterCounts
                      .slice(0, engine?.linearCount)
                      .every((n) => n > 0) &&
                    pageInfo
                      ? ` · Book page ${chapterCounts.slice(0, chapter).reduce((a, b) => a + b, 0) + pageInfo.page} of ${chapterCounts.slice(0, engine?.linearCount).reduce((a, b) => a + b, 0)}`
                      : ""}
                  </span>
                  <input
                    type="range"
                    aria-label={
                      fixedPages ? "Page in document" : "Page in chapter"
                    }
                    min="1"
                    max={
                      fixedPages
                        ? engine?.linearCount || 1
                        : pageInfo?.pages || 1
                    }
                    value={fixedPages ? chapter + 1 : pageInfo?.page || 1}
                    disabled={
                      fixedPages
                        ? chapterLoading || (engine?.linearCount || 1) < 2
                        : !pageInfo || pageInfo.pages < 2
                    }
                    onChange={(e) =>
                      fixedPages
                        ? navigate(Number(e.target.value) - 1)
                        : paginator.current?.goToPage(Number(e.target.value))
                    }
                  />
                </div>
                <button
                  className="page-button"
                  onClick={() => turnPage(1)}
                  disabled={
                    !engine ||
                    chapterLoading ||
                    (fixedPages
                      ? chapter >= engine.linearCount - 1
                      : !pageInfo ||
                        (chapter >= engine.linearCount - 1 &&
                          pageInfo.page === pageInfo.pages))
                  }
                >
                  Next page
                  <Icon name="next" size={16} />
                </button>
              </footer>
            </main>
          </div>
        </>
      )}
      {databaseState !== "ready" && databaseState !== "opening" && (
        <div className="database-notice" role="alert">
          <p>
            {databaseState === "blocked"
              ? "Close other Folio tabs to finish updating your library. Your files and notes are preserved."
              : databaseState === "reload"
                ? "The library was updated in another tab. Reload this tab before continuing."
                : "The library update could not finish. Existing records have not been cleared. Free storage if necessary, then reload to retry."}
          </p>
          <button
            className="button secondary"
            onClick={() => window.location.reload()}
          >
            Reload Folio
          </button>
        </div>
      )}
      {busy && !selectedId && (
        <div className="busy-banner" role="status">
          <span className="spinner" />
          {busy}
        </div>
      )}
      {error && (
        <div className="toast error" role="alert">
          <Icon name="info" size={19} />
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <Icon name="close" size={17} />
          </button>
        </div>
      )}
      {notice && !error && (
        <div
          className={`toast ${notification.kind}`}
          role="status"
          onMouseEnter={() => setNoticeHeld(true)}
          onMouseLeave={() => setNoticeHeld(false)}
          onFocus={() => setNoticeHeld(true)}
          onBlur={() => setNoticeHeld(false)}
        >
          <Icon
            name={notification.kind === "success" ? "check" : "info"}
            size={18}
          />
          <span>{notice}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <Icon name="close" size={17} />
          </button>
        </div>
      )}
      {modal === "reading" && (
        <ReadingSettingsDialog
          closeModal={closeModal}
          fixedPages={fixedPages}
          preferences={preferences}
        />
      )}
      {modal === "drive" && (
        <DriveDialog
          closeModal={closeModal}
          driveBusy={driveBusy}
          driveLink={driveLink}
          runDrive={runDrive}
          setDriveLink={setDriveLink}
        />
      )}
      {modal === "storage" && (
        <StorageDialog
          backupScope={backupScope}
          books={books}
          busy={busy}
          closeModal={closeModal}
          lastBackup={lastBackup}
          legacyText={legacyText}
          restoreInput={restoreInput}
          safe={safe}
          setBackupScope={setBackupScope}
          setBusy={setBusy}
          setLastBackup={setLastBackup}
          setNotice={setNotice}
          setStorage={setStorage}
          storage={storage}
        />
      )}
      {modal === "delete" && (
        <DeleteDialog
          closeModal={closeModal}
          deleteId={deleteId}
          deleteNoun={deleteNoun}
          deleteTarget={deleteTarget}
          refresh={refresh}
          safe={safe}
          setModal={setModal}
          setNotice={setNotice}
        />
      )}
      {modal === "details" && (
        <DetailsDialog
          closeModal={closeModal}
          details={details}
          refresh={refresh}
          safe={safe}
          setDetails={setDetails}
          setModal={setModal}
          setNotice={setNotice}
        />
      )}
      {modal === "print" && (
        <PrintDialog
          active={active}
          busy={busy}
          chapter={chapter}
          closeModal={closeModal}
          engine={engine}
          fixedPages={fixedPages}
          openedBook={openedBook}
          print={print}
          printReview={printReview}
          printScope={printScope}
          safe={safe}
          setPrintReview={setPrintReview}
          setPrintScope={setPrintScope}
        />
      )}
    </div>
  );
}
