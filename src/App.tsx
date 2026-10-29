import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createWorker, type Worker } from "tesseract.js";
import {
  db,
  asset,
  bytes,
  download,
  message,
  removeBook,
  type Book,
  type Mark,
} from "./store";
import { Epub, readerDocument, type Rendered } from "./epub";
import { applyHighlights, selectionOffsets } from "./annotations";
import { driveImport } from "./drive";
import { Icon } from "./icons";
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
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    const box = ref.current;
    box?.querySelector<HTMLElement>("button,input,select")?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && box) {
        const items = Array.from(
          box.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input,select,a[href]",
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
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
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
  book: Pick<Book, "title" | "author" | "cover">;
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
          <span className="cover-kicker">A FOLIO EDITION</span>
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
export function App() {
  const [books, setBooks] = useState<Book[]>([]),
    [marks, setMarks] = useState<Mark[]>([]),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState("recent");
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [modal, setModal] = useState<"drive" | "print" | "ocr" | "delete" | null>(
      null,
    ),
    [deleteId, setDeleteId] = useState<string | null>(null);
  const [chapter, setChapter] = useState(0),
    [engine, setEngine] = useState<Epub | null>(null),
    [rendered, setRendered] = useState<Rendered | null>(null),
    [chapterLoading, setChapterLoading] = useState(false),
    [tab, setTab] = useState("contents"),
    [sidebar, setSidebar] = useState(true),
    [selection, setSelection] =
      useState<ReturnType<typeof selectionOffsets>>(null),
    [find, setFind] = useState("");
  const [font, setFont] = useState(
      () => Number(localStorage.getItem("folio-font")) || 19,
    ),
    [dark, setDark] = useState(
      () => localStorage.getItem("folio-dark") === "true",
    );
  const [driveLink, setDriveLink] = useState(""),
    [driveBusy, setDriveBusy] = useState(""),
    [printScope, setPrintScope] = useState("chapter");
  const [ocrImage, setOcrImage] = useState(0),
    [ocrText, setOcrText] = useState(""),
    [ocrProgress, setOcrProgress] = useState(""),
    [ocrBusy, setOcrBusy] = useState(false),
    [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
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
    position = useRef(0);
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
    localStorage.setItem("folio-font", String(font));
    localStorage.setItem("folio-dark", String(dark));
  }, [font, dark]);
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
  const importFile = async (file: File) => {
    if (file.size > 1024 ** 3) {
      setError("This version supports EPUB files up to 1 GB.");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".epub")) {
      setError("Choose a file ending in .epub.");
      return;
    }
    setError("");
    setBusy("Opening your book…");
    const parser = new Epub(file);
    try {
      await parser.open();
      const estimate = await navigator.storage.estimate();
      if (estimate.quota && file.size > estimate.quota - (estimate.usage || 0))
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
        title: parser.title,
        author: parser.author,
        size: file.size,
        added: Date.now(),
        lastRead: Date.now(),
        chapter: 0,
        blob: file,
        cover,
        chapterCount: parser.chapters.length,
      };
      await db.books.add(book);
      await refresh();
      setChapter(0);
      setSelectedId(book.id);
      setFilter("all");
      setNotice("Added to your private library.");
    } catch (e) {
      setError(message(e));
    } finally {
      await parser.close().catch(() => {});
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
      return;
    }
    let canceled = false;
    let parser: Epub | undefined;
    setBusy("Opening your book…");
    setRendered(null);
    void (async () => {
      const book = await db.books.get(selectedId);
      if (!book) throw Error("This book is no longer in the library.");
      parser = new Epub(book.blob);
      await parser.open();
      if (canceled) {
        await parser.close();
        return;
      }
      setChapter(
        Math.max(0, Math.min(book.chapter, parser.chapters.length - 1)),
      );
      position.current = book.position || 0;
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
      if (parser) void parser.close().catch(() => {});
      setSelection(null);
    };
  }, [selectedId]);
  useEffect(() => {
    if (!engine || engineId.current !== selectedId) return;
    const seq = ++loadSequence.current;
    const controller = new AbortController();
    let cancel = false;
    setChapterLoading(true);
    setSelection(null);
    setRendered(null);
    engine.releaseResources();
    void engine
      .render(chapter, controller.signal)
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
    if (selectedId)
      void db.books
        .update(selectedId, { chapter })
        .catch((e) => setError(message(e)));
    return () => {
      cancel = true;
      controller.abort();
    };
  }, [engine, chapter, selectedId]);
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (doc?.body)
      applyHighlights(
        doc,
        currentMarks.filter((m) => m.kind === "highlight"),
      );
  }, [marks, chapter]);
  function navigate(index: number, anchor?: string) {
    if (!engine) return;
    const next = Math.max(0, Math.min(index, engine.chapters.length - 1));
    setSelection(null);
    position.current = 0;
    jump.current = anchor || null;
    if (next === chapter && frame.current?.contentDocument) {
      if (anchor)
        frame.current.contentDocument
          .querySelector(
            `[data-folio="${CSS.escape(anchor)}"],#${CSS.escape(anchor)}`,
          )
          ?.scrollIntoView({ block: "center" });
      else frame.current.contentWindow?.scrollTo(0, 0);
    } else setChapter(next);
  }
  function goHref(href: string) {
    if (!engine) return;
    const [path, fragment] = href.split("#");
    const i = engine.chapters.findIndex((c) => c.href === path);
    if (i >= 0)
      navigate(i, fragment ? decodeURIComponent(fragment) : undefined);
    else setNotice("This link does not point to a readable chapter.");
  }
  function loaded() {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    const savedPosition = position.current;
    const pendingJump = jump.current;
    const seq = loadSequence.current;
    applyHighlights(
      doc,
      currentMarks.filter((m) => m.kind === "highlight"),
    );
    if (jump.current) {
      const mark =
        doc.querySelector(`[data-folio="${CSS.escape(jump.current)}"]`) ||
        doc.getElementById(jump.current);
      mark?.scrollIntoView({ block: "center" });
      jump.current = null;
    }
    if (!pendingJump)
      requestAnimationFrame(() => {
        doc.defaultView?.scrollTo(
          0,
          savedPosition *
            Math.max(
              0,
              doc.documentElement.scrollHeight -
                (doc.defaultView?.innerHeight || 0),
            ),
        );
      });
    let scrollTimer: ReturnType<typeof setTimeout>;
    doc.defaultView?.addEventListener("scroll", () => {
      position.current =
        (doc.defaultView?.scrollY || 0) /
        Math.max(
          1,
          doc.documentElement.scrollHeight -
            (doc.defaultView?.innerHeight || 0),
        );
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        if (active && seq === loadSequence.current)
          void db.books.update(active.id, { position: position.current });
      }, 400);
    });
    doc.addEventListener("mouseup", () => setSelection(selectionOffsets(doc)));
    doc.addEventListener("keyup", () => setSelection(selectionOffsets(doc)));
    doc.addEventListener("click", (e) => {
      const a = (e.target as Element).closest("a");
      if (a) {
        e.preventDefault();
        const href = a.getAttribute("data-book-href");
        if (href) goHref(href);
      }
    });
    doc.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        navigate(chapter + 1);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigate(chapter - 1);
      }
    });
  }
  const addBookmark = async () => {
    if (!active || !engine) return;
    const existing = currentMarks.find((m) => m.kind === "bookmark");
    if (existing) {
      setTab("bookmarks");
      setNotice("This chapter is already bookmarked.");
      return;
    }
    await db.marks.add({
      id: crypto.randomUUID(),
      bookId: active.id,
      chapter,
      chapterTitle: engine.chapters[chapter]!.title,
      kind: "bookmark",
      text: engine.chapters[chapter]!.title,
      position: position.current,
      created: Date.now(),
    });
    await refresh();
    setNotice("Bookmark saved.");
  };
  const highlight = async () => {
    if (!selection || !active || !engine) return;
    await db.marks.add({
      id: crypto.randomUUID(),
      bookId: active.id,
      chapter,
      chapterTitle: engine.chapters[chapter]!.title,
      kind: "highlight",
      ...selection,
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
    if (mark.bookId !== selectedId) {
      jump.current = mark.kind === "highlight" ? mark.id : null;
      void db.books
        .update(mark.bookId, {
          chapter: mark.chapter,
          position: mark.position || 0,
        })
        .then(() => {
          setChapter(mark.chapter);
          setSelectedId(mark.bookId);
        });
    } else {
      navigate(mark.chapter, mark.kind === "highlight" ? mark.id : undefined);
      if (mark.kind === "bookmark") {
        position.current = mark.position || 0;
        if (mark.chapter === chapter) {
          const doc = frame.current?.contentDocument;
          doc?.defaultView?.scrollTo(
            0,
            position.current *
              Math.max(
                0,
                doc.documentElement.scrollHeight - doc.defaultView.innerHeight,
              ),
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
    if (worker.current) {
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
      instance = await createWorker("eng", 1, {
        workerPath: asset("ocr/worker.min.js"),
        corePath: asset("ocr/core"),
        langPath: asset("ocr/lang"),
        workerBlobURL: false,
        logger: (m) => {
          if (!ocrCanceled.current && job === ocrJob.current)
            setOcrProgress(
              m.status === "recognizing text"
                ? `Recognizing text… ${Math.round(m.progress * 100)}%`
                : "Preparing local recognition…",
            );
        },
      });
      if (ocrCanceled.current || job !== ocrJob.current) return;
      worker.current = instance;
      const result = await instance.recognize(blob);
      if (ocrCanceled.current || job !== ocrJob.current) return;
      setOcrText(result.data.text);
      setOcrConfidence(result.data.confidence);
      await db.ocr.add({
        id: crypto.randomUUID(),
        bookId: active.id,
        chapter,
        text: result.data.text,
        confidence: result.data.confidence,
        created: Date.now(),
      });
      setOcrProgress("Recognition complete. Original image unchanged.");
    } catch (e) {
      if (!ocrCanceled.current && job === ocrJob.current) setError(message(e));
    } finally {
      if (instance) await instance.terminate().catch(() => {});
      if (job === ocrJob.current) {
        worker.current = null;
        setOcrBusy(false);
      }
    }
  };
  const print = async () => {
    if (!engine) return;
    const controller = new AbortController();
    printAbort.current = controller;
    let printFrame: HTMLIFrameElement | undefined;
    let printed = false;
    setBusy("Preparing print layout…");
    setError("");
    try {
      let content = "";
      const indices =
        printScope === "book" ? engine.chapters.map((_, i) => i) : [chapter];
      if (indices.length > 300)
        throw Error(
          "Print one chapter at a time for books with more than 300 chapters.",
        );
      for (const i of indices) {
        setBusy(
          `Preparing chapter ${indices.indexOf(i) + 1} of ${indices.length}…`,
        );
        const r = await engine.render(i, controller.signal);
        if (r.warnings.length)
          throw Error("Cannot print an incomplete chapter: " + r.warnings[0]);
        content += `<section class="folio-print-chapter">${r.html}</section>`;
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
        node.parentElement?.scrollIntoView({ block: "center" });
        setSelection(selectionOffsets(doc));
        return;
      }
    }
    setNotice("No match in this chapter.");
  }
  const visibleBooks = books
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
      className={`app ${selectedId ? "reading" : ""} ${dark && selectedId ? "night" : ""}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && !busy) void importFile(file);
      }}
    >
      <input
        ref={input}
        type="file"
        accept=".epub,application/epub+zip"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
          e.target.value = "";
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
                setFilter("all");
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
                className={filter === "all" ? "active" : ""}
                onClick={() => setFilter("all")}
              >
                <Icon name="grid" />
                All books<span>{books.length}</span>
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
                Your books and notes stay
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
                {filter === "all"
                  ? "All books"
                  : filter === "bookmarks"
                    ? "Bookmarks"
                    : "Highlights"}
              </span>
              <span className="top-label">
                <Icon name="leaf" size={15} /> A little less scrolling. A little
                more reading.
              </span>
            </header>
            <section className="welcome">
              <div>
                <span className="eyebrow">MAKE ROOM FOR A GOOD BOOK</span>
                <h1>
                  Your next chapter
                  <br />
                  starts here<span>.</span>
                </h1>
                <p>
                  A quiet home for your books, ideas, and everything
                  <br className="desktop-br" /> you want to come back to.
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
                  EPUB files · Drag & drop anywhere · Private by default
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
                <span className="art-caption">A WORLD BETWEEN THE COVERS</span>
              </div>
            </section>
            <section className="collection">
              <div className="collection-heading">
                <div>
                  <h2>
                    {filter === "all"
                      ? "Your bookshelf"
                      : filter === "bookmarks"
                        ? "Your bookmarks"
                        : "Your highlights"}{" "}
                    <span>
                      {filter === "all" ? books.length : visibleMarks.length}
                    </span>
                  </h2>
                  <p>
                    {filter === "all"
                      ? "Good stories. New perspectives. All in one place."
                      : "The passages and places worth keeping."}
                  </p>
                </div>
                <div className="collection-controls">
                  <label className="search">
                    <Icon name="search" size={17} />
                    <input
                      aria-label="Search library"
                      placeholder={
                        filter === "all"
                          ? "Search your books…"
                          : "Search your notes…"
                      }
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  {filter === "all" && (
                    <select
                      aria-label="Sort books"
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
              {filter === "all" ? (
                <div className="books-grid">
                  {visibleBooks.map((book) => (
                    <article className="book-card" key={book.id}>
                      <button
                        className="book-open"
                        onClick={() => {
                          setChapter(book.chapter);
                          setSelectedId(book.id);
                        }}
                        aria-label={`Read ${book.title}`}
                      >
                        <Cover book={book} />
                        <span className="book-open-overlay">
                          <Icon name="book" />
                          Continue reading
                        </span>
                      </button>
                      <div className="book-meta">
                        <button
                          className="book-title"
                          onClick={() => setSelectedId(book.id)}
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
                          <Icon name="more" size={18} />
                        </button>
                        <p>{book.author}</p>
                        <div className="book-progress">
                          <span
                            style={{
                              width: `${Math.round(((book.chapter + 1) / book.chapterCount) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="book-detail">
                          Chapter {book.chapter + 1} of {book.chapterCount}
                          <span>{bytes(book.size)}</span>
                        </span>
                      </div>
                    </article>
                  ))}
                  {!search && (
                    <article className="sample-card">
                      <div
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
                      </div>
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
                      <h3>No books found</h3>
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
                    <p>Bring your next read along.</p>
                    <small>Choose an EPUB file</small>
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
              <span>Made for the joy of reading.</span>
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
                              books: books.map(({ id, title, author }) => ({
                                id,
                                title,
                                author,
                              })),
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
              <span>EPUB · Offline reading · Your books, your space</span>
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
                onClick={safe(async () => {
                  setOcrImage(0);
                  setOcrText("");
                  setOcrConfidence(null);
                  setOcrProgress("");
                  setModal("ocr");
                  if (active) {
                    const notes = await db.ocr
                      .where("[bookId+chapter]")
                      .equals([active.id, chapter])
                      .toArray();
                    const latest = notes.sort(
                      (a, b) => b.created - a.created,
                    )[0];
                    if (latest) {
                      setOcrText(latest.text);
                      setOcrConfidence(latest.confidence);
                      setOcrProgress(
                        "Previously recognized text, saved on this device.",
                      );
                    }
                  }
                })}
              >
                <Icon name="scan" />
              </button>
              <button
                className="icon-btn"
                title="Print or save as PDF"
                aria-label="Print or save as PDF"
                onClick={() => setModal("print")}
              >
                <Icon name="print" />
              </button>
              <span className="tool-separator" />
              <button
                className="icon-btn font-button"
                aria-label="Decrease font size"
                onClick={() => setFont((v) => Math.max(14, v - 1))}
              >
                A−
              </button>
              <span className="font-value">{font}</span>
              <button
                className="icon-btn font-button"
                aria-label="Increase font size"
                onClick={() => setFont((v) => Math.min(30, v + 1))}
              >
                A+
              </button>
              <button
                className="icon-btn"
                aria-label={dark ? "Use light theme" : "Use dark theme"}
                onClick={() => setDark((v) => !v)}
              >
                <Icon name={dark ? "sun" : "moon"} />
              </button>
            </div>
          </header>
          <div className="reader-layout">
            {sidebar && (
              <aside className="reader-sidebar">
                <header>
                  <span>IN THIS BOOK</span>
                  <button
                    className="icon-btn"
                    aria-label="Hide navigation"
                    onClick={() => setSidebar(false)}
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
                <div className="reader-nav-content">
                  {tab === "contents" ? (
                    <>
                      <div className="toc-heading">TABLE OF CONTENTS</div>
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
                              ? "Your saved chapters will appear here."
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
                  {!sidebar && (
                    <button
                      className="icon-btn"
                      aria-label="Show navigation"
                      onClick={() => setSidebar(true)}
                    >
                      <Icon name="list" />
                    </button>
                  )}
                  <span>CHAPTER {String(chapter + 1).padStart(2, "0")}</span>
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
                    aria-label="Find in chapter"
                    placeholder="Find in chapter"
                    value={find}
                    onChange={(e) => setFind(e.target.value)}
                  />
                  <button type="submit" className="text-button">
                    Find
                  </button>
                </form>
                <button
                  className={`bookmark-action ${currentMarks.some((m) => m.kind === "bookmark") ? "saved" : ""}`}
                  onClick={safe(addBookmark)}
                  disabled={!engine}
                >
                  <Icon name="bookmark" size={16} />
                  <span>
                    {currentMarks.some((m) => m.kind === "bookmark")
                      ? "Bookmarked"
                      : "Bookmark"}
                  </span>
                </button>
              </div>
              <div className="paper-wrap">
                {chapterLoading || busy ? (
                  <div className="reader-loading">
                    <span className="spinner" />
                    <p>{busy || "Turning the page…"}</p>
                  </div>
                ) : rendered ? (
                  <iframe
                    ref={frame}
                    title="Book chapter"
                    sandbox="allow-same-origin"
                    srcDoc={readerDocument(rendered.html, font, dark)}
                    onLoad={loaded}
                  />
                ) : (
                  <div className="empty">
                    <Icon name="book" />
                    <p>
                      {error
                        ? "Unable to open this chapter. Try another chapter or return to your library."
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
              <footer className="reader-footer">
                <button
                  className="page-button"
                  onClick={() => navigate(chapter - 1)}
                  disabled={chapter === 0 || chapterLoading}
                >
                  <Icon name="prev" size={16} />
                  Previous chapter
                </button>
                <div>
                  <span>
                    {chapter + 1} <i>/</i> {engine?.chapters.length || "—"}{" "}
                    chapters
                  </span>
                  <div className="reading-progress">
                    <i
                      style={{
                        width: `${engine ? ((chapter + 1) / engine.chapters.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
                <button
                  className="page-button"
                  onClick={() => navigate(chapter + 1)}
                  disabled={
                    !engine ||
                    chapter === engine.chapters.length - 1 ||
                    chapterLoading
                  }
                >
                  Next chapter
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
      {modal === "drive" && (
        <Modal title="Your books, from Drive" onClose={closeModal}>
          <div className="modal-illustration">
            <Icon name="drive" size={36} />
          </div>
          <p>
            Bring an EPUB from Google Drive into your private library. Your
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
                <strong>Current chapter</strong>
                <small>{engine?.chapters[chapter]?.title}</small>
              </span>
            </label>
            <label>
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
