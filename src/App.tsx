import {
  useCallback,
  useId,
  useMemo,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Worker } from "tesseract.js";
import {
  db,
  asset,
  bytes,
  download,
  message,
  removeBook,
  bookCollection,
  type LibraryCollection,
  type Book,
  type Mark,
} from "./store";
import { Epub, readerDocument, type Rendered } from "./epub";
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
import { driveImport } from "./drive";
import { Icon } from "./icons";
import {
  documentText,
  quoteLocator,
  resolveLocator,
  RENDERER_VERSION,
  type TextLocator,
} from "./locators";
import { migrateLocators } from "./migrate-locators";
import { contentHash } from "./content-hash";
import { persistBooks } from "./binary-storage";
import { backupLibrary, restoreLibrary } from "./backup";
import { storageStatus } from "./storage";
import {
  Paginator,
  ChapterCounter,
  createReadingDocument,
  layoutKey,
  type ReadingSettings,
  type ReadingMode,
  type ReadingTheme,
  type PageSnapshot,
} from "./reader";
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    const box = ref.current;
    (
      box?.querySelector<HTMLElement>(
        "input:not(:disabled),select:not(:disabled),textarea:not(:disabled),.modal-actions button:not(:disabled)",
      ) || box?.querySelector<HTMLElement>("button")
    )?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && box) {
        const items = Array.from(
          box.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not(:disabled):not([type=hidden]),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex='0']",
          ),
        );
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      old?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <button
            className="icon-btn"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
function Cover({
  book,
  large = false,
}: {
  book: Pick<Book, "title" | "author" | "cover" | "format" | "collection">;
  large?: boolean;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!book.cover) {
      setUrl("");
      return;
    }
    const u = URL.createObjectURL(book.cover);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [book.cover]);
  const theme = book.title.length % 4;
  return (
    <div
      className={`cover cover-${theme} ${large ? "large" : ""}`}
      aria-hidden="true"
    >
      {url ? (
        <img src={url} alt="" />
      ) : (
        <>
          <span className="cover-kicker">
            {bookCollection(book) === "documents"
              ? `${formatNames[book.format || "pdf"]} DOCUMENT`
              : "A FOLIO EDITION"}
          </span>
          <div className="cover-orbit" />
          <strong>{book.title}</strong>
          <span className="cover-author">{book.author}</span>
          <span className="cover-bottom">F &nbsp; / &nbsp; READING ROOM</span>
        </>
      )}
    </div>
  );
}
function Button({
  children,
  onClick,
  kind = "primary",
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  kind?: string;
  disabled?: boolean;
}) {
  return (
    <button className={`button ${kind}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
function ZoomControls({
  zoom,
  onChange,
}: {
  zoom: number;
  onChange: (value: number | ((previous: number) => number)) => void;
}) {
  return (
    <div className="native-zoom">
      <button
        className="icon-btn"
        aria-label="Zoom out"
        onClick={() =>
          onChange((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))
        }
      >
        −
      </button>
      <button
        className="text-button"
        aria-label={`Fit page ${Math.round(zoom * 100)}%`}
        onClick={() => onChange(1)}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        className="icon-btn"
        aria-label="Zoom in"
        onClick={() =>
          onChange((z) => Math.min(4, Math.round((z + 0.25) * 100) / 100))
        }
      >
        +
      </button>
    </div>
  );
}
export function App() {
  const webPreview = import.meta.env.MODE === "pages";
  const [books, setBooks] = useState<Book[]>([]),
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
    [sort, setSort] = useState("recent");
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [modal, setModal] = useState<
      "drive" | "print" | "ocr" | "delete" | "reading" | "storage" | null
    >(null),
    [deleteId, setDeleteId] = useState<string | null>(null);
  const [chapter, setChapter] = useState(0),
    [engine, setEngine] = useState<DocumentEngine | null>(null),
    [rendered, setRendered] = useState<Rendered | null>(null),
    [chapterLoading, setChapterLoading] = useState(false),
    [tab, setTab] = useState("contents"),
    [sidebar, setSidebar] = useState(() => window.innerWidth > 760),
    [selection, setSelection] =
      useState<ReturnType<typeof selectionOffsets>>(null),
    [find, setFind] = useState("");
  const [font, setFont] = useState(() =>
    Math.max(
      14,
      Math.min(36, Number(localStorage.getItem("folio-font")) || 22),
    ),
  );
  const [mode, setMode] = useState<ReadingMode>(() =>
    localStorage.getItem("folio-reading-mode") === "vertical"
      ? "vertical"
      : "horizontal",
  );
  const [fontChoice, setFontChoice] = useState<ReadingSettings["font"]>(() => {
    const f = localStorage.getItem("folio-reading-font");
    return f === "classic" || f === "modern" || f === "literary"
      ? f
      : "publisher";
  });
  const [spacing, setSpacing] = useState(() => {
    const n = Number(localStorage.getItem("folio-spacing"));
    return [1.4, 1.7, 2].includes(n) ? n : 1.7;
  });
  const [margin, setMargin] = useState<ReadingSettings["margin"]>(() => {
    const v = localStorage.getItem("folio-margin");
    return v === "narrow" || v === "wide" ? v : "comfortable";
  });
  const [theme, setTheme] = useState<ReadingTheme>(() => {
    const t = localStorage.getItem("folio-theme");
    return t === "paper" || t === "sepia" || t === "night"
      ? t
      : localStorage.getItem("folio-dark") === "true"
        ? "night"
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "night"
          : "paper";
  });
  const lastLightTheme = useRef<ReadingTheme>(
    localStorage.getItem("folio-light-theme") === "sepia" ? "sepia" : "paper",
  );
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
  const [ocrNoteId, setOcrNoteId] = useState<string | null>(null);
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
  }, [webPreview]);
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
  const dark = theme === "night";
  const settings = useMemo<ReadingSettings>(
    () => ({
      mode,
      size: font,
      font: fontChoice,
      lineHeight: spacing,
      margin,
      theme,
      zoom: pageZoom,
    }),
    [mode, font, fontChoice, spacing, margin, theme, pageZoom],
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
    [printScope, setPrintScope] = useState("chapter");
  const [ocrImage, setOcrImage] = useState(0),
    [ocrText, setOcrText] = useState(""),
    [ocrProgress, setOcrProgress] = useState(""),
    [ocrBusy, setOcrBusy] = useState(false),
    [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const ocrBusyRef = useRef(false);
  ocrBusyRef.current = ocrBusy;
  const input = useRef<HTMLInputElement>(null),
    frame = useRef<HTMLIFrameElement>(null),
    worker = useRef<Worker | null>(null),
    driveAbort = useRef<AbortController | null>(null),
    loadSequence = useRef(0),
    engineId = useRef<string | null>(null),
    jump = useRef<string | null>(null),
    ocrCanceled = useRef(false),
    ocrJob = useRef(0),
    printAbort = useRef<AbortController | null>(null),
    position = useRef(0),
    textOffset = useRef<number | undefined>(undefined),
    requestedPage = useRef<number | "last" | undefined>(undefined),
    paginator = useRef<Paginator | FixedPaginator | null>(null),
    countsKey = useRef(""),
    countsRef = useRef<number[]>([]);
  const active = books.find((b) => b.id === selectedId);
  const bookMarks = marks.filter((m) => m.bookId === selectedId);
  const currentMarks = bookMarks.filter((m) => m.chapter === chapter);
  const refresh = useCallback(async () => {
    const [b, m] = await Promise.all([
      db.books.orderBy("lastRead").reverse().toArray(),
      db.marks.toArray(),
    ]);
    setBooks(b);
    setMarks(m);
  }, []);
  useEffect(() => {
    void refresh().catch((e) => setError(message(e)));
  }, [refresh]);
  useEffect(() => {
    if (filter === "books" || filter === "documents")
      localStorage.setItem("folio-collection", filter);
  }, [filter]);
  useEffect(() => {
    localStorage.setItem("folio-font", String(font));
    if (theme !== "night") {
      lastLightTheme.current = theme;
      localStorage.setItem("folio-light-theme", theme);
    }
    localStorage.setItem("folio-reading-mode", mode);
    localStorage.setItem("folio-reading-font", fontChoice);
    localStorage.setItem("folio-spacing", String(spacing));
    localStorage.setItem("folio-margin", margin);
    localStorage.setItem("folio-theme", theme);
  }, [font, dark, mode, fontChoice, spacing, margin, theme]);
  useEffect(() => {
    paginator.current?.configure(settings);
  }, [settings]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(
    () => () => {
      driveAbort.current?.abort();
      void worker.current?.terminate();
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
  const importFile = async (file: File) => {
    let format: DocumentFormat;
    try {
      format = detectFormat(file.name, file.type);
      checkDocumentSize(file, format);
    } catch (error) {
      setError(message(error));
      return;
    }
    setError("");
    setBusy("Opening your document…");
    let parser: DocumentEngine | undefined;
    try {
      const hash = await contentHash(file);
      let existing = await db.books.where("contentHash").equals(hash).first();
      if (!existing) {
        for (const candidate of await db.books
          .filter((b) => !b.contentHash && b.size === file.size)
          .toArray()) {
          const candidateHash = await contentHash(candidate.blob);
          await db.books.update(candidate.id, { contentHash: candidateHash });
          if (candidateHash === hash) {
            existing = candidate;
            break;
          }
        }
      }
      if (existing) {
        await refresh();
        setFilter(bookCollection(existing));
        setChapter(existing.chapter);
        setSelectedId(existing.id);
        setNotice(
          "This book is already in your library. Your saved place and notes are preserved.",
        );
        return;
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
      let cover: Blob | undefined;
      if (parser.coverPath)
        try {
          cover = await parser.blob(parser.coverPath);
        } catch {
          /* cover is optional */
        }
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
        chapter: 0,
        blob: file,
        cover,
        chapterCount: parser.linearCount,
        contentHash: hash,
        rendererVersion: RENDERER_VERSION,
      };
      const stored = await persistBooks([book], () =>
        db.transaction("rw", db.books, async () => {
          const match = await db.books
            .where("contentHash")
            .equals(hash)
            .first();
          if (match) return match;
          await db.books.add(book);
          return book;
        }),
      );
      await refresh();
      setChapter(stored.chapter);
      setSelectedId(stored.id);
      setFilter(bookCollection(stored));
      setNotice(
        stored.id === book.id
          ? "Added to your private library."
          : "This book is already in your library. Your saved place and notes are preserved.",
      );
    } catch (e) {
      setError(
        e instanceof Error && e.name === "QuotaExceededError"
          ? "Browser storage is full. Back up your library, then free storage and try again."
          : message(e),
      );
    } finally {
      await parser?.close().catch(() => {});
      setBusy("");
    }
  };
  const openSample = async () => {
    try {
      setBusy("Preparing your first chapter…");
      const response = await fetch(asset("demo.epub"));
      if (!response.ok) throw Error("The sample book could not be loaded.");
      await importFile(
        new File([await response.blob()], "The Quiet Atlas.epub", {
          type: "application/epub+zip",
        }),
      );
    } catch (e) {
      setBusy("");
      setError(message(e));
    }
  };
  useEffect(() => {
    if (!selectedId) {
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
      let book = await db.books.get(selectedId);
      if (!book) throw Error("This book is no longer in the library.");
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
      if (parser instanceof Epub && (book.format || "epub") === "epub")
        book = await migrateLocators(book, parser);
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
      setEngine(parser);
      setBusy("");
      await db.books.update(book.id, { lastRead: Date.now() });
    })().catch((e) => {
      if (!canceled) {
        setError(message(e));
        setBusy("");
      }
    });
    return () => {
      canceled = true;
      paginator.current?.destroy();
      paginator.current = null;
      if (parser) void parser.close().catch(() => {});
      setSelection(null);
    };
  }, [selectedId]);
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
          if (r.warnings.length) setNotice(r.warnings[0]!);
        }
      })
      .catch((e) => {
        if (!cancel) setError(message(e));
      })
      .finally(() => {
        if (!cancel) setChapterLoading(false);
      });
    if (selectedId && engine.chapters[chapter]?.linear)
      void db.books
        .update(selectedId, { chapter })
        .catch((e) => setError(message(e)));
    return () => {
      cancel = true;
      controller.abort();
    };
  }, [engine, chapter, selectedId, fixedRenderKey]);
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (doc?.body)
      setOrphanIds(
        applyHighlights(
          doc,
          currentMarks.filter((m) => m.kind === "highlight"),
        ),
      );
    paginator.current?.refresh();
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
    setOrphanIds(
      applyHighlights(
        doc,
        currentMarks.filter((m) => m.kind === "highlight"),
      ),
    );
    const text = documentText(doc);
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
          void db.books
            .update(bookId, {
              chapter: chapterIndex,
              position: s.progress,
              textOffset: s.offset,
              locator: quoteLocator(
                text,
                engine.chapters[chapterIndex]!.href,
                s.offset,
              ),
              page: engine.fixedPages ? chapterIndex + 1 : s.page,
              pageCount: engine.fixedPages ? engine.linearCount : s.pages,
              readingMode: doc.documentElement.dataset
                .readingMode as ReadingMode,
            })
            .catch((e) => setError(message(e)));
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
    doc.addEventListener("click", (e) => {
      const a = (e.target as Element).closest("a");
      if (a) {
        e.preventDefault();
        const href = a.getAttribute("data-book-href");
        if (href) goHref(href);
      }
    });
  }
  useEffect(() => {
    if (
      !selectedId ||
      !engine ||
      engine.fixedPages ||
      engineId.current !== selectedId ||
      !dimensions
    )
      return;
    const key = layoutKey(settings, dimensions.width, dimensions.height);
    let canceled = false;
    const abort = new AbortController();
    let parser: DocumentEngine | undefined;
    const counter = new ChapterCounter(dimensions.width, dimensions.height);
    setCounting(true);
    void (async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 450));
      if (canceled) return;
      const book = await db.books.get(selectedId);
      if (!book || canceled) return;
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
        await db.books.update(selectedId, {
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
  }, [engine, selectedId, dimensions, settings]);
  useEffect(() => {
    if (!selectedId || modal) return;
    const key = (e: KeyboardEvent) => {
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
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [selectedId, modal, chapter]);
  const bookmarkOffset = (mark: Mark) => {
    const doc = frame.current?.contentDocument;
    return doc && mark.locator
      ? resolveLocator(documentText(doc), mark.locator)?.start
      : undefined;
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
    setNotice("Bookmark saved.");
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
    setNotice("Highlight saved.");
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
      void db.books
        .update(mark.bookId, {
          chapter: mark.chapter,
          position: mark.position || 0,
          textOffset: mark.textOffset,
          locator: mark.locator,
          page: mark.page,
        })
        .then(() => {
          setChapter(mark.chapter);
          setSelectedId(mark.bookId);
        });
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
    setModal(null);
    driveAbort.current?.abort();
    ocrCanceled.current = true;
    ocrJob.current++;
    printAbort.current?.abort();
    if (worker.current && ocrBusyRef.current) {
      void worker.current.terminate();
      worker.current = null;
    }
    setOcrBusy(false);
  }, []);
  const startOCR = async () => {
    const image = rendered?.images[ocrImage];
    if (!image || !active) return;
    setOcrBusy(true);
    setOcrText("");
    setOcrConfidence(null);
    setOcrProgress("Preparing local recognition…");
    ocrCanceled.current = false;
    const job = ++ocrJob.current;
    let instance: Worker | undefined;
    try {
      const blob = await (await fetch(image.src)).blob();
      const bitmap = await createImageBitmap(blob);
      const pixels = bitmap.width * bitmap.height;
      bitmap.close();
      if (pixels > 40000000)
        throw Error(
          "This image is too large for local OCR. Use an image below 40 megapixels.",
        );
      const { createWorker } = await import("tesseract.js");
      instance =
        worker.current ||
        (await createWorker("eng", 1, {
          workerPath: asset("ocr/worker.min.js"),
          corePath: asset("ocr/core"),
          langPath: asset("ocr/lang"),
          workerBlobURL: false,
          logger: (m) => {
            if (!ocrCanceled.current)
              setOcrProgress(
                m.status === "recognizing text"
                  ? `Recognizing text… ${Math.round(m.progress * 100)}%`
                  : "Preparing local recognition…",
              );
          },
        }));
      if (ocrCanceled.current || job !== ocrJob.current) return;
      worker.current = instance;
      const result = await instance.recognize(blob);
      if (ocrCanceled.current || job !== ocrJob.current) return;
      setOcrText(result.data.text);
      setOcrConfidence(result.data.confidence);
      const noteId = `${active.id}:${chapter}:${image.path || image.name}`;
      await db.ocr.put({
        id: noteId,
        imagePath: image.path || image.name,
        bookId: active.id,
        chapter,
        text: result.data.text,
        confidence: result.data.confidence,
        created: Date.now(),
      });
      setOcrNoteId(noteId);
      setOcrProgress("Recognition complete. Original image unchanged.");
    } catch (e) {
      if (instance) {
        await instance.terminate().catch(() => {});
        instance = undefined;
        worker.current = null;
      }
      if (!ocrCanceled.current && job === ocrJob.current) setError(message(e));
    } finally {
      if (instance && (ocrCanceled.current || job !== ocrJob.current))
        await instance.terminate().catch(() => {});
      if (job === ocrJob.current) {
        setOcrBusy(false);
      }
    }
  };
  useEffect(() => {
    if (modal !== "ocr" || !active) return;
    let canceled = false;
    setOcrText("");
    setOcrConfidence(null);
    setOcrProgress("");
    setOcrNoteId(null);
    const image = rendered?.images[ocrImage];
    if (image)
      void db.ocr
        .where("[bookId+chapter]")
        .equals([active.id, chapter])
        .toArray()
        .then((notes) => {
          const note = notes.find(
            (n) => n.imagePath === (image.path || image.name),
          );
          if (note && !canceled) {
            setOcrText(note.text);
            setOcrConfidence(note.confidence);
            setOcrNoteId(note.id);
            setOcrProgress("Previously recognized text, saved on this device.");
          }
        })
        .catch((error) => {
          if (!canceled) setError(message(error));
        });
    return () => {
      canceled = true;
    };
  }, [modal, active?.id, chapter, ocrImage, rendered]);
  const print = async () => {
    if (!engine) return;
    if (engine.format === "pdf" && active) {
      download(active.blob, active.fileName || `${active.title}.pdf`);
      return;
    }
    const controller = new AbortController();
    printAbort.current = controller;
    let printFrame: HTMLIFrameElement | undefined;
    let printed = false;
    setBusy("Preparing print layout…");
    setError("");
    try {
      let content = "";
      const indices =
        printScope === "book" && !engine.fixedPages
          ? engine.chapters.flatMap((c, i) => (c.linear ? [i] : []))
          : [chapter];
      if (indices.length > 300)
        throw Error(
          "Print one chapter at a time for books with more than 300 chapters.",
        );
      for (const i of indices) {
        setBusy(
          `Preparing chapter ${indices.indexOf(i) + 1} of ${indices.length}…`,
        );
        const r = await engine.render(i, controller.signal, {
          width: 1754,
          height: 2480,
          zoom: 1,
          mode: "horizontal",
          pixelRatio: 1,
        });
        if (r.warnings.length)
          throw Error("Review this chapter before printing: " + r.warnings[0]);
        const pageContent = r.fixedPage
          ? `<img src="${r.images[0]?.src}" alt="Page ${i + 1}" style="width:100%;height:auto"/>`
          : r.html;
        content += `<section class="folio-print-chapter">${pageContent}</section>`;
        if (content.length > 16 * 1024 * 1024)
          throw Error(
            "This print layout is too large. Print individual chapters instead.",
          );
      }
      const p = document.createElement("iframe");
      printFrame = p;
      p.title = "Print layout";
      p.setAttribute("sandbox", "allow-same-origin allow-modals");
      p.className = "print-frame";
      document.body.append(p);
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(Error("Print layout took too long to load.")),
          30000,
        );
        controller.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timeout);
            reject(new DOMException("Print canceled.", "AbortError"));
          },
          { once: true },
        );
        p.onload = () => {
          clearTimeout(timeout);
          resolve();
        };
        p.srcdoc = readerDocument(content, 17, false);
      });
      for (const img of Array.from(p.contentDocument?.images || [])) {
        img.loading = "eager";
        controller.signal.throwIfAborted();
        await img.decode().catch(() => {
          throw Error(
            "An image failed to decode. No incomplete PDF was printed.",
          );
        });
      }
      await p.contentDocument?.fonts.ready;
      controller.signal.throwIfAborted();
      if (
        Array.from(p.contentDocument?.fonts || []).some(
          (font) => font.status === "error",
        )
      )
        throw Error(
          "A book font failed to load. Please print another chapter.",
        );
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
  function findText() {
    const doc = frame.current?.contentDocument;
    if (!doc || !find.trim()) return;
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest("style,script")) continue;
      const at = (node.textContent || "")
        .toLowerCase()
        .indexOf(find.toLowerCase());
      if (at >= 0) {
        const r = doc.createRange();
        r.setStart(node, at);
        r.setEnd(node, at + find.length);
        doc.getSelection()?.removeAllRanges();
        doc.getSelection()?.addRange(r);
        if (node.parentElement)
          paginator.current?.goToElement(node.parentElement);
        setSelection(selectionOffsets(doc));
        return;
      }
    }
    setNotice("No match in this chapter.");
  }
  const collectionView = filter === "books" || filter === "documents";
  const collectionBooks = books.filter((b) => bookCollection(b) === filter);
  const visibleBooks = collectionBooks
    .filter((b) =>
      (b.title + " " + b.author).toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title)
        : sort === "added"
          ? b.added - a.added
          : b.lastRead - a.lastRead,
    );
  const visibleMarks = marks.filter(
    (m) =>
      m.kind === (filter === "bookmarks" ? "bookmark" : "highlight") &&
      (m.text + " " + m.chapterTitle)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const safe = (fn: () => Promise<unknown>) => () =>
    void fn().catch((e) => setError(message(e)));
  return (
    <div
      ref={fullscreen.ref}
      className={`app ${fullscreen.enabled ? "immersive" : ""} ${fixedPages ? "native-reading" : ""} ${selectedId ? "reading" : ""} ${dark ? "night" : ""} ${theme === "sepia" ? "sepia" : ""}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && !busy) void importFile(file);
      }}
    >
      {webPreview && (
        <div className="web-preview-banner" ref={previewBanner}>
          <span>
            <strong>Folio web preview</strong> · Your private EPUB book library,
            with PDF and other documents too. Files stay in this browser; the
            extension has a separate library.
          </span>
          <a href={asset("folio-chrome.zip")} download>
            <Icon name="download" size={15} />
            Get Chrome extension
          </a>
        </div>
      )}
      <input
        ref={input}
        aria-label="Import document file"
        type="file"
        accept={documentAccept}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
          e.target.value = "";
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
                  `Restored ${result.books} books. Notes were merged without replacing existing notes.`,
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
          <aside className="library-sidebar">
            <a
              href="#"
              className="brand"
              onClick={(e) => {
                e.preventDefault();
                setFilter("books");
              }}
            >
              <span className="brand-icon">
                <Icon name="book" size={24} />
              </span>
              folio<span className="brand-dot">.</span>
            </a>
            <p className="sidebar-caption">YOUR READING ROOM</p>
            <nav aria-label="Library">
              <button
                aria-current={filter === "books" ? "page" : undefined}
                className={filter === "books" ? "active" : ""}
                onClick={() => setFilter("books")}
              >
                <Icon name="grid" />
                Books
                <span aria-hidden="true">
                  {books.filter((b) => bookCollection(b) === "books").length}
                </span>
              </button>
              <button
                aria-current={filter === "documents" ? "page" : undefined}
                className={filter === "documents" ? "active" : ""}
                onClick={() => setFilter("documents")}
              >
                <Icon name="document" />
                Documents
                <span aria-hidden="true">
                  {
                    books.filter((b) => bookCollection(b) === "documents")
                      .length
                  }
                </span>
              </button>
              <button
                className={filter === "bookmarks" ? "active" : ""}
                onClick={() => setFilter("bookmarks")}
              >
                <Icon name="bookmark" />
                Bookmarks
                <span>{marks.filter((m) => m.kind === "bookmark").length}</span>
              </button>
              <button
                className={filter === "highlights" ? "active" : ""}
                onClick={() => setFilter("highlights")}
              >
                <Icon name="highlight" />
                Highlights
                <span>
                  {marks.filter((m) => m.kind === "highlight").length}
                </span>
              </button>
            </nav>
            <div className="sidebar-bottom">
              <div className="privacy-icon">
                <Icon name="leaf" />
              </div>
              <strong>A library that’s yours.</strong>
              <p>
                Your books, documents and notes stay
                <br />
                in this browser.
              </p>
              <span className="local-badge">
                <i /> LOCAL FIRST
              </span>
            </div>
          </aside>
          <main className="library-main">
            <header className="library-top">
              <span className="breadcrumb">
                Your library <span>/</span>{" "}
                {filter === "books"
                  ? "Books"
                  : filter === "documents"
                    ? "Documents"
                    : filter === "bookmarks"
                      ? "Bookmarks"
                      : "Highlights"}
              </span>
              <span className="top-label">
                <Icon name="leaf" size={15} /> A little less scrolling. A little
                more reading.
              </span>
            </header>
            {filter === "books" && !collectionBooks.length && !search && (
              <section className="welcome">
                <div>
                  <span className="eyebrow">MAKE ROOM FOR A GOOD BOOK</span>
                  <h1>
                    Your next chapter
                    <br />
                    starts here<span>.</span>
                  </h1>
                  <p>
                    Your private book library, built around EPUB.
                    <br className="desktop-br" /> Read MOBI books too, with PDF,
                    DjVu and Markdown in a separate Documents collection.
                  </p>
                  <div className="welcome-actions">
                    <Button
                      onClick={() => input.current?.click()}
                      disabled={!!busy}
                    >
                      <Icon name="plus" size={18} /> Import a book
                    </Button>
                    <Button kind="ghost" onClick={() => setModal("drive")}>
                      <Icon name="drive" size={18} /> Open from Drive
                    </Button>
                  </div>
                  <span className="import-hint">
                    Books first · EPUB & MOBI · Documents welcome · Private by
                    default
                  </span>
                </div>
                <div className="welcome-art" aria-hidden="true">
                  <div className="art-circle" />
                  <div className="art-book art-back">
                    <span>
                      THE ART
                      <br />
                      OF NOTICING
                    </span>
                    <i />
                  </div>
                  <div className="art-book art-front">
                    <span className="art-small">A FIELD GUIDE TO</span>
                    <span>
                      the quiet
                      <br />
                      <em>in between.</em>
                    </span>
                    <div className="art-lines" />
                    <span className="art-bottom">
                      FOLIO EDITIONS &nbsp; / &nbsp; 01
                    </span>
                  </div>
                  <span className="art-star">✳</span>
                  <span className="art-caption">
                    A WORLD BETWEEN THE COVERS
                  </span>
                </div>
              </section>
            )}
            <section className="collection">
              <div className="collection-heading">
                <div>
                  <h2>
                    {filter === "books"
                      ? "Your bookshelf"
                      : filter === "documents"
                        ? "Your documents"
                        : filter === "bookmarks"
                          ? "Your bookmarks"
                          : "Your highlights"}{" "}
                    <span>
                      {collectionView
                        ? collectionBooks.length
                        : visibleMarks.length}
                    </span>
                  </h2>
                  <p>
                    {filter === "books"
                      ? "An EPUB-first home for your books. Your next chapter belongs here."
                      : filter === "documents"
                        ? "PDF, DjVu and Markdown, with the same private reading tools."
                        : "The passages and places worth keeping."}
                  </p>
                </div>
                <div className="collection-controls">
                  <label className="search">
                    <Icon name="search" size={17} />
                    <input
                      aria-label="Search library"
                      placeholder={
                        filter === "books"
                          ? "Search your books…"
                          : filter === "documents"
                            ? "Search your documents…"
                            : "Search your notes…"
                      }
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  {collectionView && (
                    <select
                      aria-label={
                        filter === "books" ? "Sort books" : "Sort documents"
                      }
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="recent">Recently read</option>
                      <option value="added">Date added</option>
                      <option value="title">Title A–Z</option>
                    </select>
                  )}
                </div>
              </div>
              {collectionView ? (
                <div className="books-grid">
                  {visibleBooks.map((book) => (
                    <article className="book-card" key={book.id}>
                      <button
                        className="book-open"
                        onClick={() => {
                          setChapter(book.chapter);
                          setSelectedId(book.id);
                        }}
                      >
                        <span className="sr-only">Read {book.title}</span>
                        <Cover book={book} />
                        <span className="book-open-overlay">
                          <Icon name="book" />
                          Continue reading
                        </span>
                      </button>
                      <div className="book-meta">
                        <button
                          className="book-title"
                          title={book.title}
                          onClick={() => {
                            setChapter(book.chapter);
                            setSelectedId(book.id);
                          }}
                        >
                          {book.title}
                        </button>
                        <button
                          className="icon-btn subtle"
                          aria-label={`Remove ${book.title}`}
                          onClick={() => {
                            setDeleteId(book.id);
                            setModal("delete");
                          }}
                        >
                          <Icon name="trash" size={18} />
                        </button>
                        <p>{book.author}</p>
                        <div className="book-progress">
                          <span
                            style={{
                              width: `${bookProgress(book)}%`,
                            }}
                          />
                        </div>
                        <span className="book-detail">
                          {book.format === "pdf" || book.format === "djvu" ? (
                            `${formatNames[book.format]} · Page ${book.chapter + 1} of ${book.chapterCount}`
                          ) : (
                            <>
                              Ch. {book.chapter + 1}
                              {book.page
                                ? ` · Page ${book.page} of ${book.pageCount || "—"}`
                                : ` of ${book.chapterCount}`}
                            </>
                          )}
                          <span>{bytes(book.size)}</span>
                        </span>
                        <button
                          className="text-button collection-move"
                          onClick={safe(async () => {
                            const collection =
                              bookCollection(book) === "books"
                                ? "documents"
                                : "books";
                            await db.books.update(book.id, { collection });
                            await refresh();
                            setNotice(
                              `Moved “${book.title}” to ${collection === "books" ? "Books" : "Documents"}.`,
                            );
                          })}
                        >
                          <Icon
                            name={
                              bookCollection(book) === "books"
                                ? "document"
                                : "book"
                            }
                            size={14}
                          />
                          Move to{" "}
                          {bookCollection(book) === "books"
                            ? "Documents"
                            : "Books"}
                        </button>
                      </div>
                    </article>
                  ))}
                  {filter === "books" && !search && (
                    <article className="sample-card">
                      <button
                        title="Read The Quiet Atlas sample"
                        className="sample-cover"
                        onClick={() => void openSample()}
                      >
                        <Cover
                          book={{
                            title: "The Quiet Atlas",
                            author: "Folio Studio",
                          }}
                        />
                        <span className="sample-badge">
                          A LITTLE SOMETHING TO START
                        </span>
                      </button>
                      <div className="book-meta">
                        <h3>The Quiet Atlas</h3>
                        <p>An original short read by Folio Studio</p>
                        <button
                          className="text-button"
                          onClick={() => void openSample()}
                          disabled={!!busy}
                        >
                          Open the sample <Icon name="next" size={15} />
                        </button>
                      </div>
                    </article>
                  )}
                  {!visibleBooks.length && search && (
                    <div className="empty">
                      <Icon name="search" size={30} />
                      <h3>
                        No {filter === "books" ? "books" : "documents"} found
                      </h3>
                      <p>Try another title or author.</p>
                    </div>
                  )}
                  <button
                    className="import-card"
                    onClick={() => input.current?.click()}
                    disabled={!!busy}
                  >
                    <span>
                      <Icon name="plus" size={26} />
                    </span>
                    <strong>Room for one more.</strong>
                    <p>
                      {filter === "books"
                        ? "Bring your next book along."
                        : "Keep your reference reading here."}
                    </p>
                    <small>
                      {filter === "books"
                        ? "Import a book"
                        : "Import a document"}
                    </small>
                  </button>
                </div>
              ) : (
                <div className="library-notes">
                  {visibleMarks.map((mark) => (
                    <article className="library-note" key={mark.id}>
                      <span className="note-eyebrow">
                        {books.find((b) => b.id === mark.bookId)?.title} ·{" "}
                        {mark.chapterTitle}
                      </span>
                      <button onClick={() => selectMark(mark)}>
                        {mark.kind === "highlight"
                          ? "“" + mark.text + "”"
                          : mark.text}
                      </button>
                      <button
                        className="icon-btn"
                        aria-label="Delete note"
                        onClick={safe(() => removeMark(mark.id))}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </article>
                  ))}
                  {!visibleMarks.length && (
                    <div className="empty">
                      <Icon
                        name={filter === "bookmarks" ? "bookmark" : "highlight"}
                        size={32}
                      />
                      <h3>A place for your discoveries.</h3>
                      <p>
                        {filter === "bookmarks"
                          ? "Bookmark a chapter while reading to find it here."
                          : "Select text in a book and choose Highlight to save it here."}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </section>
            <footer className="library-footer">
              <button
                className="text-button"
                onClick={safe(async () => {
                  setStorage(await storageStatus());
                  setModal("storage");
                })}
              >
                <Icon name="download" size={17} /> Storage & backup
              </button>
              {
                <button
                  className="text-button"
                  onClick={safe(async () => {
                    const notes = await db.ocr.toArray();
                    download(
                      new Blob(
                        [
                          JSON.stringify(
                            {
                              version: 1,
                              exportedAt: new Date().toISOString(),
                              books: books.map(
                                ({ id, title, author, contentHash }) => ({
                                  id,
                                  title,
                                  author,
                                  contentHash,
                                }),
                              ),
                              annotations: marks,
                              ocr: notes,
                            },
                            null,
                            2,
                          ),
                        ],
                        { type: "application/json" },
                      ),
                      "folio-notes.json",
                    );
                  })}
                >
                  <Icon name="download" size={13} />
                  Export notes
                </button>
              }
              <span>Your books first. Your documents alongside.</span>
            </footer>
          </main>
        </>
      ) : (
        <>
          <header className="reader-top">
            <button
              className="icon-btn"
              aria-label="Back to library"
              onClick={() => {
                setSelectedId(null);
                setEngine(null);
                void refresh();
              }}
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
                title="Recognize printed text in chapter images"
                aria-label="Open OCR"
                onClick={() => {
                  setOcrImage(0);
                  setOcrText("");
                  setOcrConfidence(null);
                  setOcrProgress("");
                  setModal("ocr");
                }}
              >
                <Icon name="scan" />
              </button>
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
                onClick={() =>
                  engine?.format === "pdf" && active
                    ? download(
                        active.blob,
                        active.fileName || `${active.title}.pdf`,
                      )
                    : setModal("print")
                }
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
                <ZoomControls zoom={pageZoom} onChange={setPageZoom} />
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
                aria-label={dark ? "Use light theme" : "Use dark theme"}
                onClick={() =>
                  setTheme((t) =>
                    t === "night" ? lastLightTheme.current : "night",
                  )
                }
              >
                <Icon name={dark ? "sun" : "moon"} />
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
                <ZoomControls zoom={pageZoom} onChange={setPageZoom} />
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
          <div className="reader-layout">
            {navigationOpen && (
              <aside
                className="reader-sidebar"
                id="reader-navigation"
                aria-label="Reading navigation"
              >
                <header>
                  <span>
                    {active && bookCollection(active) === "documents"
                      ? "IN THIS DOCUMENT"
                      : "IN THIS BOOK"}
                  </span>
                  <button
                    className="icon-btn"
                    aria-label="Hide navigation"
                    onClick={() => {
                      setNavigationOpen(false);
                      if (fullscreen.enabled)
                        fullscreen.ref.current
                          ?.querySelector<HTMLButtonElement>(
                            '.immersive-controls [aria-controls="reader-navigation"]',
                          )
                          ?.focus();
                    }}
                  >
                    <Icon name="list" size={18} />
                  </button>
                </header>
                <div
                  className="reader-tabs"
                  role="tablist"
                  aria-label="Book navigation"
                >
                  {["contents", "bookmarks", "highlights"].map((t) => (
                    <button
                      role="tab"
                      id={`reader-tab-${t}`}
                      aria-controls="reader-navigation-panel"
                      tabIndex={tab === t ? 0 : -1}
                      onKeyDown={(e) => {
                        const tabs = ["contents", "bookmarks", "highlights"];
                        const i = tabs.indexOf(t);
                        const next =
                          e.key === "ArrowRight"
                            ? tabs[(i + 1) % 3]
                            : e.key === "ArrowLeft"
                              ? tabs[(i + 2) % 3]
                              : e.key === "Home"
                                ? tabs[0]
                                : e.key === "End"
                                  ? tabs[2]
                                  : undefined;
                        if (next) {
                          e.preventDefault();
                          setTab(next);
                          document
                            .getElementById(`reader-tab-${next}`)
                            ?.focus();
                        }
                      }}
                      aria-selected={tab === t}
                      key={t}
                      className={tab === t ? "active" : ""}
                      onClick={() => setTab(t)}
                      title={t}
                    >
                      <Icon
                        name={
                          t === "contents"
                            ? "list"
                            : t === "bookmarks"
                              ? "bookmark"
                              : "highlight"
                        }
                        size={17}
                      />
                      <span>
                        {t === "contents"
                          ? "Contents"
                          : t === "bookmarks"
                            ? "Saved"
                            : "Highlights"}
                      </span>
                    </button>
                  ))}
                </div>
                <div
                  className="reader-nav-content"
                  id="reader-navigation-panel"
                  role="tabpanel"
                  aria-labelledby={`reader-tab-${tab}`}
                  tabIndex={0}
                >
                  {tab === "contents" ? (
                    <>
                      <div className="toc-heading">TABLE OF CONTENTS</div>
                      {fixedPages && !engine?.toc.length && (
                        <p className="pagination-note">
                          {engine?.linearCount} original pages. Use the page
                          slider to go anywhere in the document.
                        </p>
                      )}
                      {engine?.toc.map((n, i) => {
                        const idx = engine.chapters.findIndex(
                          (c) => c.href === n.href.split("#")[0],
                        );
                        return (
                          <button
                            key={i}
                            className={`toc-item ${idx === chapter ? "active" : ""}`}
                            style={{ paddingLeft: 16 + n.depth * 12 }}
                            onClick={() => goHref(n.href)}
                          >
                            <span className="toc-number">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <span>{n.title}</span>
                            <small className="toc-page-count">
                              {fixedPages
                                ? `Page ${idx + 1}`
                                : chapterCounts[idx]
                                  ? `${chapterCounts[idx]} ${chapterCounts[idx] === 1 ? "page" : "pages"}`
                                  : counting
                                    ? "…"
                                    : "Open to count"}
                            </small>
                            {idx === chapter && <i />}
                          </button>
                        );
                      })}
                      {!!engine?.pages.length && (
                        <>
                          <div className="toc-heading">PUBLISHER PAGE LIST</div>
                          {engine.pages.map((p, i) => (
                            <button
                              className="toc-item"
                              key={i}
                              onClick={() => goHref(p.href)}
                            >
                              {p.title}
                            </button>
                          ))}
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      {bookMarks
                        .filter(
                          (m) =>
                            m.kind ===
                            (tab === "bookmarks" ? "bookmark" : "highlight"),
                        )
                        .map((m) => (
                          <article className="reader-note" key={m.id}>
                            <span>{m.chapterTitle}</span>
                            <button
                              className="note-link"
                              onClick={() => selectMark(m)}
                            >
                              {(m.unresolved ||
                                (m.chapter === chapter &&
                                  orphanIds.includes(m.id))) && (
                                <small>Location needs review · </small>
                              )}
                              {m.kind === "highlight"
                                ? "“" + m.text + "”"
                                : m.text}
                            </button>
                            <button
                              className="note-delete"
                              aria-label="Remove annotation"
                              onClick={safe(() => removeMark(m.id))}
                            >
                              <Icon name="trash" size={14} />
                            </button>
                          </article>
                        ))}
                      {!bookMarks.some(
                        (m) =>
                          m.kind ===
                          (tab === "bookmarks" ? "bookmark" : "highlight"),
                      ) && (
                        <div className="small-empty">
                          <Icon
                            name={
                              tab === "bookmarks" ? "bookmark" : "highlight"
                            }
                            size={25}
                          />
                          <p>
                            {tab === "bookmarks"
                              ? "Your saved pages will appear here."
                              : "Select a passage, then choose Highlight."}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="reader-sidebar-bottom">
                  <Icon name="leaf" size={15} />
                  <span>Just you and a good book.</span>
                </div>
              </aside>
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
                    findText();
                  }}
                >
                  <Icon name="search" size={15} />
                  <input
                    aria-label={fixedPages ? "Find in page" : "Find in chapter"}
                    placeholder={
                      fixedPages ? "Find in page" : "Find in chapter"
                    }
                    value={find}
                    onChange={(e) => setFind(e.target.value)}
                  />
                  <button type="submit" className="text-button">
                    Find
                  </button>
                </form>
                <button
                  className={`bookmark-action ${!!currentBookmark ? "saved" : ""}`}
                  aria-label={currentBookmark ? "Bookmarked" : "Bookmark"}
                  onClick={safe(addBookmark)}
                  disabled={!engine || !pageInfo || chapterLoading}
                >
                  <Icon name="bookmark" size={16} />
                  <span>{!!currentBookmark ? "Bookmarked" : "Bookmark"}</span>
                </button>
              </div>
              <div className="paper-wrap" ref={paper}>
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
                      {error
                        ? fixedPages
                          ? "Unable to open this page. Try another page or return to your library."
                          : "Unable to open this chapter. Try another chapter or return to your library."
                        : "Opening your reading room…"}
                    </p>
                  </div>
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
                    {fixedPages && engine
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
        <div className="toast" role="status">
          <Icon name="check" size={18} />
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
            <legend>APPEARANCE</legend>
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
          </fieldset>
          {fixedPages && (
            <p className="fine-print">
              PDF and DjVu keep their original page layout and type size. Use
              the zoom controls to enlarge the page.
            </p>
          )}
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
            follows the text when the layout changes.
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
              }}
            >
              Reset reading settings
            </Button>
            <Button onClick={closeModal}>Done</Button>
          </div>
        </Modal>
      )}
      {modal === "drive" && (
        <Modal title="Your books, from Drive" onClose={closeModal}>
          <div className="modal-illustration">
            <Icon name="drive" size={36} />
          </div>
          {webPreview ? (
            <>
              <p>
                This web preview opens books and documents from your computer.
                Google Drive sign-in uses the Chrome extension and needs its
                OAuth setup.
              </p>
              <a
                className="button secondary"
                href={asset("folio-chrome.zip")}
                download
              >
                Download Chrome extension
              </a>
              <p className="fine-print">
                Unzip the download, open chrome://extensions, enable Developer
                mode and choose Load unpacked.{" "}
                <a
                  href="https://github.com/captainprice24/EPUBchrome/blob/main/docs/GOOGLE_DRIVE.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google Drive setup guide
                </a>
              </p>
              <div className="modal-actions">
                <Button kind="secondary" onClick={closeModal}>
                  Close
                </Button>
                <Button
                  onClick={() => {
                    closeModal();
                    input.current?.click();
                  }}
                >
                  Import local EPUB
                </Button>
              </div>
            </>
          ) : (
            <>
              <p>
                Bring a document from Google Drive into your private library.
                Your original file stays unchanged.
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
                Google sign-in is required. This version requests read-only
                Drive access to download the file you choose. Your library stays
                in this browser.
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
            </>
          )}
        </Modal>
      )}
      {modal === "storage" && (
        <Modal title="Storage & backup" onClose={closeModal}>
          <p>
            Your books and notes are stored in this browser. A backup includes
            original files, reading positions, annotations and OCR notes.
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
            Private browsing may remove your library when private tabs close.
            Use a regular tab and keep backups for a lasting library.{" "}
            Persistence does not protect against clearing browser data,
            uninstalling the extension or losing this device. Keep a backup
            somewhere safe. Backups are not encrypted. Restore accepts archives
            below 2 GB and merges with existing books and notes.
          </p>
          <label className="field-label" htmlFor="backup-scope">
            Books to back up
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
      )}
      {modal === "delete" && (
        <Modal title="Remove this book?" onClose={closeModal}>
          <p>
            This removes the local copy of{" "}
            <strong>{books.find((b) => b.id === deleteId)?.title}</strong> and
            its bookmarks, highlights, and OCR notes. Your original file is
            unchanged.
          </p>
          <div className="modal-actions">
            <Button kind="secondary" onClick={closeModal}>
              Keep book
            </Button>
            <Button
              kind="danger"
              onClick={safe(async () => {
                if (deleteId) await removeBook(deleteId);
                setModal(null);
                await refresh();
                setNotice("Book removed from this browser.");
              })}
            >
              Remove book
            </Button>
          </div>
        </Modal>
      )}
      {modal === "print" && (
        <Modal title="From a good book to paper" onClose={closeModal}>
          <div className="modal-illustration">
            <Icon name="print" size={34} />
          </div>
          <p>
            Open a clean print layout, then choose <strong>Save as PDF</strong>{" "}
            in Chrome’s print dialog. Text stays selectable and original images
            are used.
          </p>
          <div className="radio-options">
            <label>
              <input
                type="radio"
                name="scope"
                checked={printScope === "chapter"}
                onChange={() => setPrintScope("chapter")}
              />
              <span>
                <strong>
                  {fixedPages ? "Current page" : "Current chapter"}
                </strong>
                <small>{engine?.chapters[chapter]?.title}</small>
              </span>
            </label>
            <label hidden={fixedPages}>
              <input
                type="radio"
                name="scope"
                checked={printScope === "book"}
                onChange={() => setPrintScope("book")}
              />
              <span>
                <strong>Whole book</strong>
                <small>
                  {engine?.chapters.length} chapters · Larger books take longer
                </small>
              </span>
            </label>
          </div>
          <p className="fine-print">
            {fixedPages
              ? "DjVu printing creates a raster copy of the current page. "
              : ""}
            Print pagination may differ from the reading view. Large image-heavy
            books are best printed chapter by chapter. Highlights and OCR text
            layers are not included in this version.
          </p>
          <div className="modal-actions">
            <Button kind="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button onClick={() => void print()} disabled={!!busy}>
              <Icon name="print" size={17} />
              {busy || "Open print dialog"}
            </Button>
          </div>
        </Modal>
      )}
      {modal === "ocr" && (
        <Modal title="Find the words in an image" onClose={closeModal}>
          <p>
            Recognize printed English text locally. Nothing is uploaded, and
            your original book is unchanged.
          </p>
          {rendered?.images.length ? (
            <>
              <label className="field-label" htmlFor="ocr-image">
                IMAGE IN THIS CHAPTER
              </label>
              <select
                className="text-input"
                id="ocr-image"
                value={ocrImage}
                disabled={ocrBusy}
                onChange={(e) => setOcrImage(Number(e.target.value))}
              >
                {rendered.images.map((im, i) => (
                  <option key={i} value={i}>
                    {i + 1}. {im.name}
                  </option>
                ))}
              </select>
              <img
                className="ocr-preview"
                src={rendered.images[ocrImage]?.src}
                alt="Selected page for text recognition"
              />
              {ocrProgress && (
                <p className="ocr-status" role="status">
                  {ocrBusy && <span className="spinner" />}
                  {ocrProgress}
                </p>
              )}
              {ocrText && (
                <>
                  <textarea
                    className="ocr-result"
                    aria-label="Recognized text"
                    value={ocrText}
                    onChange={(e) => setOcrText(e.target.value)}
                  />
                  <p className="fine-print">
                    Model confidence: {ocrConfidence?.toFixed(0)}%. Check the
                    text for recognition errors. A derivative OCR note was saved
                    locally.
                  </p>
                </>
              )}
              <p className="fine-print">
                Best for clean, printed pages. Handwriting and other languages
                are not supported in this version.
              </p>
              <div className="modal-actions">
                {ocrNoteId && (
                  <Button
                    kind="secondary"
                    disabled={ocrBusy}
                    onClick={safe(async () => {
                      await db.ocr.update(ocrNoteId, { text: ocrText });
                      setOcrProgress("Your edits were saved on this device.");
                    })}
                  >
                    Save edits
                  </Button>
                )}
                {ocrText && (
                  <Button
                    kind="secondary"
                    onClick={() =>
                      download(
                        new Blob([ocrText], { type: "text/plain" }),
                        "recognized-text.txt",
                      )
                    }
                  >
                    <Icon name="download" size={17} />
                    Save text
                  </Button>
                )}
                <Button kind="secondary" onClick={closeModal}>
                  {ocrBusy ? "Cancel recognition" : "Close"}
                </Button>
                <Button onClick={() => void startOCR()} disabled={ocrBusy}>
                  {ocrBusy ? "Recognizing…" : "Recognize text"}
                </Button>
              </div>
            </>
          ) : (
            <div className="empty">
              <Icon name="scan" size={35} />
              <h3>No images in this chapter</h3>
              <p>
                This chapter already contains selectable text. Open an
                image-based chapter to use OCR.
              </p>
              <Button kind="secondary" onClick={closeModal}>
                Back to reading
              </Button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function bookProgress(book: Book) {
  if (book.format === "pdf" || book.format === "djvu")
    return Math.round((100 * book.chapter) / Math.max(1, book.chapterCount));
  if (!book.page || !book.pageCount || book.chapter >= book.chapterCount)
    return 0;
  const counts = book.pagination?.counts.slice(0, book.chapterCount);
  if (counts?.length === book.chapterCount && counts.every((n) => n > 0)) {
    const before = counts.slice(0, book.chapter).reduce((a, b) => a + b, 0);
    return Math.round(
      (100 * (before + (book.page - 1))) / counts.reduce((a, b) => a + b, 0),
    );
  }
  return Math.round(
    (100 * (book.chapter + (book.page - 1) / book.pageCount)) /
      book.chapterCount,
  );
}
