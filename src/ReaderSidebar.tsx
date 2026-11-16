// Contents, bookmarks and highlights of the open book.
import { type DocumentEngine } from "./document-types";
import { Icon } from "./icons";
import { markDate } from "./marks";
import { bookCollection, type BookMetadata, type Mark } from "./store";
import { type ReaderFullscreen } from "./useFullscreen";

export function ReaderSidebar({
  active,
  bookMarks,
  chapter,
  chapterCounts,
  counting,
  engine,
  fixedPages,
  fullscreen,
  goHref,
  orphanIds,
  removeMark,
  safe,
  selectMark,
  setNavigationOpen,
  setTab,
  tab,
}: {
  active: BookMetadata | undefined;
  bookMarks: Mark[];
  chapter: number;
  chapterCounts: number[];
  counting: boolean;
  engine: DocumentEngine | null;
  fixedPages: boolean;
  fullscreen: ReaderFullscreen;
  goHref: (href: string) => void;
  orphanIds: string[];
  removeMark: (id: string) => Promise<void>;
  safe: (action: () => Promise<unknown>) => () => void;
  selectMark: (mark: Mark) => void;
  setNavigationOpen: (open: boolean) => void;
  setTab: (tab: string) => void;
  tab: string;
}) {
  return (
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
      <div className="reader-tabs" role="tablist" aria-label="Book navigation">
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
                document.getElementById(`reader-tab-${next}`)?.focus();
              }
            }}
            aria-selected={tab === t}
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
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
                  ? "Bookmarks"
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
                {engine?.linearCount} original pages. Use the page slider to go
                anywhere in the document.
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
                  m.kind === (tab === "bookmarks" ? "bookmark" : "highlight"),
              )
              .map((m) => (
                <article className="reader-note" key={m.id}>
                  <span>{m.chapterTitle}</span>
                  <button
                    className="note-link"
                    title={m.text}
                    onClick={() => selectMark(m)}
                  >
                    {(m.unresolved ||
                      (m.chapter === chapter && orphanIds.includes(m.id))) && (
                      <small>Location needs review · </small>
                    )}
                    {m.kind === "highlight" ? "“" + m.text + "”" : m.text}
                  </button>
                  <small className="note-meta">Saved {markDate(m)}</small>
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
                m.kind === (tab === "bookmarks" ? "bookmark" : "highlight"),
            ) && (
              <div className="small-empty">
                <Icon
                  name={tab === "bookmarks" ? "bookmark" : "highlight"}
                  size={25}
                />
                <p>
                  {tab === "bookmarks"
                    ? "Your bookmarked pages will appear here."
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
  );
}
