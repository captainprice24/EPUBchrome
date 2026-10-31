import { useLayoutEffect, useEffect, useRef, useState } from "react";
import {
  bookCollection,
  getPreview,
  invalidatePreview,
  type BookMetadata,
} from "./store";
import { formatNames } from "./document-types";
const cache = new Map<string, Blob>();
let cacheBytes = 0;
function forget(key: string) {
  const old = cache.get(key);
  if (old) cacheBytes -= old.size;
  cache.delete(key);
}
function remember(key: string, blob: Blob) {
  const old = cache.get(key);
  if (old) cacheBytes -= old.size;
  cache.delete(key);
  cache.set(key, blob);
  cacheBytes += blob.size;
  while (cacheBytes > 8 * 1024 ** 2 || cache.size > 24) {
    const first = cache.keys().next().value!;
    cacheBytes -= cache.get(first)!.size;
    cache.delete(first);
  }
}
export function Cover({
  book,
  large = false,
  onVisible,
}: {
  book: Pick<BookMetadata, "title" | "author" | "format" | "collection"> &
    Partial<Pick<BookMetadata, "id" | "hasCover" | "previewVersion">>;
  large?: boolean;
  onVisible?: (id: string, visible: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!book.id || !root.current) return;
    const id = book.id;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      onVisible?.(id, true);
      return () => onVisible?.(id, false);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const near = entries.some((entry) => entry.isIntersecting);
        setVisible(near);
        onVisible?.(id, near);
      },
      { rootMargin: "240px" },
    );
    observer.observe(root.current);
    return () => {
      observer.disconnect();
      onVisible?.(id, false);
    };
  }, [book.id, onVisible]);
  const key = `${book.id}:${book.previewVersion || 0}`;
  useLayoutEffect(() => {
    setUrl("");
    if (!visible || !book.id || !book.hasCover) return;
    let canceled = false,
      objectUrl: string | undefined;
    const load = async () => {
      const blob = cache.get(key) || (await getPreview(book.id!));
      if (canceled) return;
      if (!blob || blob.size > 1024 ** 2) {
        forget(key);
        void invalidatePreview(book.id!).catch(() => {});
        return;
      }
      remember(key, blob);
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    };
    void load().catch(() => {});
    return () => {
      canceled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [visible, book.id, book.hasCover, key]);
  const theme = book.title.length % 4;
  return (
    <div
      ref={root}
      className={`cover cover-${theme} ${url ? "has-image" : ""} ${large ? "large" : ""}`}
      aria-hidden="true"
    >
      {url ? (
        <img
          src={url}
          alt=""
          onError={() => {
            setUrl("");
            forget(key);
            if (book.id) void invalidatePreview(book.id).catch(() => {});
          }}
        />
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
