// The library: shelves, notes lists, search and import entry points.
import { Cover } from "./Cover";
import { formatNames } from "./document-types";
import { Icon } from "./icons";
import { markDate } from "./marks";
import { notesJson, notesMarkdown } from "./notes-export";
import { backupReminder, type BackupRecord } from "./prefs";
import { bookProgress } from "./progress";
import { storageStatus } from "./storage";
import {
  bookCollection,
  bytes,
  db,
  download,
  updateBook,
  type BookMetadata,
  type Mark,
} from "./store";
import { Button } from "./ui";
import {
  type BookDetails,
  type LibraryFilter,
  type LibrarySort,
  type ModalName,
  type NoticeKind,
  type StorageStatus,
} from "./view-types";
import { type RefObject } from "react";

export function LibraryView({
  bookTitles,
  books,
  busy,
  collectionBooks,
  collectionView,
  coverVisibility,
  driveConfigured,
  filter,
  input,
  lastBackup,
  marks,
  openSample,
  refresh,
  removeMark,
  safe,
  search,
  selectMark,
  setChapter,
  setDeleteId,
  setDetails,
  setFilter,
  setLegacyText,
  setModal,
  setNotice,
  setSearch,
  setSelectedId,
  setSort,
  setStorage,
  sort,
  visibleBooks,
  visibleMarks,
}: {
  bookTitles: Map<string, string>;
  books: BookMetadata[];
  busy: string;
  collectionBooks: BookMetadata[];
  collectionView: boolean;
  coverVisibility: (id: string, visible: boolean) => void;
  driveConfigured: boolean;
  filter: LibraryFilter;
  input: RefObject<HTMLInputElement | null>;
  lastBackup: BackupRecord | undefined;
  marks: Mark[];
  openSample: () => Promise<void>;
  refresh: () => Promise<void>;
  removeMark: (id: string) => Promise<void>;
  safe: (action: () => Promise<unknown>) => () => void;
  search: string;
  selectMark: (mark: Mark) => void;
  setChapter: (chapter: number) => void;
  setDeleteId: (id: string | null) => void;
  setDetails: (details: BookDetails) => void;
  setFilter: (value: LibraryFilter) => void;
  setLegacyText: (value: boolean) => void;
  setModal: (modal: ModalName | null) => void;
  setNotice: (message: string, kind?: NoticeKind) => void;
  setSearch: (value: string) => void;
  setSelectedId: (id: string | null) => void;
  setSort: (value: LibrarySort) => void;
  setStorage: (status: StorageStatus) => void;
  sort: LibrarySort;
  visibleBooks: BookMetadata[];
  visibleMarks: Mark[];
}) {
  return (
    <>
      <aside className="library-sidebar">
        <button
          type="button"
          className="brand"
          aria-label="Folio home"
          onClick={() => setFilter("books")}
        >
          <span className="brand-icon">
            <Icon name="book" size={24} />
          </span>
          folio<span className="brand-dot">.</span>
        </button>
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
              {books.filter((b) => bookCollection(b) === "documents").length}
            </span>
          </button>
          <button
            aria-current={filter === "bookmarks" ? "page" : undefined}
            className={filter === "bookmarks" ? "active" : ""}
            onClick={() => setFilter("bookmarks")}
          >
            <Icon name="bookmark" />
            Bookmarks
            <span aria-hidden="true">
              {marks.filter((m) => m.kind === "bookmark").length}
            </span>
          </button>
          <button
            aria-current={filter === "highlights" ? "page" : undefined}
            className={filter === "highlights" ? "active" : ""}
            onClick={() => setFilter("highlights")}
          >
            <Icon name="highlight" />
            Highlights
            <span aria-hidden="true">
              {marks.filter((m) => m.kind === "highlight").length}
            </span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-icon">
            <Icon name="leaf" />
          </div>
          <strong>A library that’s yours.</strong>
          <p>Local first. Private by default.</p>
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
                {driveConfigured && (
                  <Button kind="ghost" onClick={() => setModal("drive")}>
                    <Icon name="drive" size={18} /> Open from Drive
                  </Button>
                )}
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
              <span className="art-caption">A WORLD BETWEEN THE COVERS</span>
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
              {!collectionView && (
                <button
                  className="text-button"
                  disabled={!marks.length}
                  onClick={() =>
                    download(notesMarkdown(books, marks), "folio-notes.md")
                  }
                >
                  <Icon name="download" size={15} /> Notes as Markdown
                </button>
              )}
              {collectionView && (
                <select
                  aria-label={
                    filter === "books" ? "Sort books" : "Sort documents"
                  }
                  value={sort}
                  onChange={(e) => setSort(e.target.value as typeof sort)}
                >
                  <option value="recent">Recently read</option>
                  <option value="added">Date added</option>
                  <option value="title">Title A–Z</option>
                  <option value="author">Author A–Z</option>
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
                    <Cover book={book} onVisible={coverVisibility} />
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
                      {bookProgress(book) === 100 ? (
                        "Finished"
                      ) : book.format === "pdf" || book.format === "djvu" ? (
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
                        await updateBook(book.id, { collection });
                        await refresh();
                        setNotice(
                          `Moved “${book.title}” to ${collection === "books" ? "Books" : "Documents"}.`,
                        );
                      })}
                    >
                      <Icon
                        name={
                          bookCollection(book) === "books" ? "document" : "book"
                        }
                        size={14}
                      />
                      Move to{" "}
                      {bookCollection(book) === "books" ? "Documents" : "Books"}
                    </button>
                    <button
                      className="text-button collection-move"
                      aria-label={`Edit details of ${book.title}`}
                      onClick={() => {
                        setDetails({
                          id: book.id,
                          title: book.title,
                          author: book.author,
                        });
                        setModal("details");
                      }}
                    >
                      <Icon name="settings" size={14} />
                      Edit details
                    </button>
                  </div>
                </article>
              ))}
              {filter === "books" &&
                !search &&
                !books.some(
                  (b) =>
                    b.sample ||
                    // Samples opened before v0.6 carry no marker.
                    (b.title === "The Quiet Atlas" &&
                      b.author === "Folio Studio"),
                ) && (
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
                  <h3>No {filter === "books" ? "books" : "documents"} found</h3>
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
                  {filter === "books" ? "Import a book" : "Import a document"}
                </small>
              </button>
            </div>
          ) : (
            <div className="library-notes">
              {visibleMarks.map((mark) => (
                <article className="library-note" key={mark.id}>
                  <span className="note-eyebrow">
                    {bookTitles.get(mark.bookId)} · {mark.chapterTitle} · Saved{" "}
                    {markDate(mark)}
                  </span>
                  <button title={mark.text} onClick={() => selectMark(mark)}>
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
              setLegacyText((await db.ocr.count()) > 0);
              setModal("storage");
            })}
          >
            <Icon name="download" size={17} /> Storage & backup
            {backupReminder(lastBackup, books.length) && (
              <span className="backup-reminder">
                {backupReminder(lastBackup, books.length)}
              </span>
            )}
          </button>
          <button
            className="text-button"
            onClick={safe(async () =>
              download(
                notesJson(books, marks, await db.ocr.toArray()),
                "folio-notes.json",
              ),
            )}
          >
            <Icon name="download" size={13} />
            Export notes
          </button>
          <span className="privacy-statement">
            Your books, documents and notes stay in this browser.
          </span>
        </footer>
      </main>
    </>
  );
}
