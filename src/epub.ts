import {
  ZipReader,
  BlobReader,
  BlobWriter,
  TextWriter,
  configure,
  type Entry,
} from "@zip.js/zip.js";
import DOMPurify from "dompurify";
configure({ useWebWorkers: false });
export interface Chapter {
  href: string;
  title: string;
}
export interface Nav {
  href: string;
  title: string;
  depth: number;
}
export interface Rendered {
  html: string;
  images: { src: string; name: string }[];
  warnings: string[];
}
const MAX_ENTRY = 64 * 1024 * 1024;
export function resolvePath(base: string, ref: string): string {
  if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(ref))
    throw Error("External book resources are blocked.");
  const raw = decodeURIComponent(ref.split("#")[0]!.split("?")[0]!);
  if (raw.includes("\\") || raw.includes("\0"))
    throw Error("Invalid archive path.");
  if (!raw) return base;
  const stack = raw.startsWith("/") ? [] : base.split("/").slice(0, -1);
  for (const part of raw.split("/")) {
    if (part === "..") {
      if (!stack.length) throw Error("Archive path escapes book root.");
      stack.pop();
    } else if (part && part !== ".") stack.push(part);
  }
  return stack.join("/");
}
function xml(text: string) {
  const d = new DOMParser().parseFromString(text, "application/xml");
  if (d.querySelector("parsererror"))
    throw Error("The book contains invalid XML.");
  return d;
}
const elements = (node: Document | Element, name: string) =>
  Array.from(node.getElementsByTagNameNS("*", name));
export class Epub {
  private reader: ZipReader<Blob>;
  private entries = new Map<string, Entry>();
  private urls = new Map<string, string>();
  private disposed = false;
  private resourceSize = 0;
  title = "Untitled book";
  author = "Unknown author";
  chapters: Chapter[] = [];
  toc: Nav[] = [];
  pages: Nav[] = [];
  coverPath?: string;
  fixedLayout = false;
  constructor(blob: Blob) {
    if (blob.size > 1024 ** 3)
      throw Error("This version supports EPUB files up to 1 GB.");
    this.reader = new ZipReader(new BlobReader(blob));
  }
  async open() {
    let total = 0,
      count = 0;
    for await (const e of this.reader.getEntriesGenerator()) {
      if (++count > 30000)
        throw Error("This archive contains too many entries.");
      if (
        e.filename.startsWith("/") ||
        e.filename.split("/").includes("..") ||
        e.filename.includes("\\")
      )
        throw Error("Unsafe archive path.");
      if (this.entries.has(e.filename)) throw Error("Duplicate archive entry.");
      total += e.uncompressedSize;
      if (total > 2 * 1024 ** 3)
        throw Error("The expanded book exceeds the 2 GB safety limit.");
      this.entries.set(e.filename, e);
    }
    const mime = this.entries.get("mimetype");
    if (mime && (await this.text("mimetype")).trim() !== "application/epub+zip")
      throw Error("This file is not an EPUB.");
    const container = xml(await this.text("META-INF/container.xml"));
    const packagePath = elements(container, "rootfile")[0]?.getAttribute(
      "full-path",
    );
    if (!packagePath) throw Error("EPUB package not found.");
    const opfPath = resolvePath("", packagePath);
    const opf = xml(await this.text(opfPath));
    this.title = elements(opf, "title")[0]?.textContent?.trim() || this.title;
    this.author =
      elements(opf, "creator")
        .map((e) => e.textContent)
        .filter(Boolean)
        .join(", ") || this.author;
    this.fixedLayout = elements(opf, "meta").some(
      (e) =>
        e.getAttribute("property") === "rendition:layout" &&
        e.textContent === "pre-paginated",
    );
    const items = elements(opf, "item");
    const manifest = new Map(items.map((e) => [e.getAttribute("id"), e]));
    this.chapters = elements(opf, "itemref")
      .filter((e) => e.getAttribute("linear") !== "no")
      .map((e, i) => {
        const item = manifest.get(e.getAttribute("idref"));
        if (!item) throw Error("A chapter is missing from the EPUB manifest.");
        return {
          href: resolvePath(opfPath, item.getAttribute("href") || ""),
          title: `Chapter ${i + 1}`,
        };
      });
    if (!this.chapters.length)
      throw Error("This EPUB has no readable chapters.");
    const coverId = elements(opf, "meta")
      .find((e) => e.getAttribute("name") === "cover")
      ?.getAttribute("content");
    const cover =
      items.find((e) =>
        e.getAttribute("properties")?.split(/\s+/).includes("cover-image"),
      ) || manifest.get(coverId || "");
    if (cover)
      this.coverPath = resolvePath(opfPath, cover.getAttribute("href") || "");
    const nav = items.find((e) =>
      e.getAttribute("properties")?.split(/\s+/).includes("nav"),
    );
    if (nav) {
      const p = resolvePath(opfPath, nav.getAttribute("href") || "");
      const doc = xml(await this.text(p));
      for (const section of elements(doc, "nav")) {
        const type =
          section.getAttribute("epub:type") ||
          section.getAttributeNS("http://www.idpf.org/2007/ops", "type");
        const target =
          type === "toc"
            ? this.toc
            : type === "page-list"
              ? this.pages
              : undefined;
        if (target)
          for (const a of elements(section, "a")) {
            const href = a.getAttribute("href") || "";
            let depth = -1;
            for (
              let n: Element | null = a;
              n && n !== section;
              n = n.parentElement
            )
              if (n.localName === "ol") depth++;
            try {
              target.push({
                href:
                  resolvePath(p, href) +
                  (href.includes("#")
                    ? "#" + href.split("#").slice(1).join("#")
                    : ""),
                title: a.textContent?.trim() || "Untitled",
                depth: Math.max(0, depth),
              });
            } catch {
              /* skip external navigation */
            }
          }
      }
    }
    if (!this.toc.length) {
      const ncx = items.find(
        (e) => e.getAttribute("media-type") === "application/x-dtbncx+xml",
      );
      if (ncx) {
        const p = resolvePath(opfPath, ncx.getAttribute("href") || "");
        const doc = xml(await this.text(p));
        for (const point of elements(doc, "navPoint")) {
          const src = elements(point, "content")[0]?.getAttribute("src");
          if (src) {
            try {
              this.toc.push({
                href:
                  resolvePath(p, src) +
                  (src.includes("#") ? "#" + src.split("#")[1] : ""),
                title: elements(point, "text")[0]?.textContent || "Chapter",
                depth: 0,
              });
            } catch {
              /* external navigation */
            }
          }
        }
      }
    }
    for (const ch of this.chapters) {
      const nav = this.toc.find((n) => n.href.split("#")[0] === ch.href);
      if (nav) ch.title = nav.title;
    }
    if (!this.toc.length)
      this.toc = this.chapters.map((c) => ({ ...c, depth: 0 }));
    return this;
  }
  private entry(path: string) {
    if (this.disposed) throw Error("Book has been closed.");
    const e = this.entries.get(path);
    if (!e || e.directory) throw Error(`Missing book resource: ${path}`);
    if (e.uncompressedSize > MAX_ENTRY)
      throw Error(`Book resource exceeds the 64 MB safety limit: ${path}`);
    if (e.compressedSize > 0 && e.uncompressedSize / e.compressedSize > 2000)
      throw Error("Suspicious archive compression ratio.");
    return e;
  }
  async text(path: string) {
    return this.entry(path).getData(new TextWriter(), { checkSignature: true });
  }
  async blob(path: string) {
    const ext = path.split(".").pop()?.toLowerCase();
    const type: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      woff: "font/woff",
      woff2: "font/woff2",
      ttf: "font/ttf",
      otf: "font/otf",
    };
    return this.entry(path).getData(
      new BlobWriter(type[ext || ""] || "application/octet-stream"),
      { checkSignature: true },
    );
  }
  private async resource(path: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (this.urls.has(path)) return this.urls.get(path)!;
    const blob = await this.blob(path);
    signal?.throwIfAborted();
    if (this.resourceSize + blob.size > 128 * 1024 * 1024)
      throw Error("Chapter resources exceed the 128 MB memory safety budget.");
    this.resourceSize += blob.size;
    if (this.disposed) throw Error("Book has been closed.");
    const url = URL.createObjectURL(blob);
    this.urls.set(path, url);
    return url;
  }
  private async css(
    css: string,
    base: string,
    warnings?: string[],
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    if (/@import\s/i.test(css))
      warnings?.push("Imported stylesheets are not supported by this version.");
    css = css.replace(/@import\s+(?:url\([^)]*\)|[^;]*);?/gi, "");
    const matches = [...css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)];
    for (const match of matches) {
      const ref = match[2]!;
      let next = "";
      if (ref.startsWith("data:image/") || ref.startsWith("data:font/"))
        next = ref;
      else if (ref.startsWith("#")) next = ref;
      else {
        try {
          next = await this.resource(resolvePath(base, ref), signal);
        } catch {
          warnings?.push("A style resource could not be loaded safely.");
        }
      }
      css = css.replace(match[0], `url("${next.replaceAll('"', "%22")}")`);
    }
    return css;
  }
  async render(index: number, signal?: AbortSignal): Promise<Rendered> {
    signal?.throwIfAborted();
    const warnings: string[] = [];
    const chapter = this.chapters[index];
    if (!chapter) throw Error("Chapter not found.");
    const source = await this.text(chapter.href);
    signal?.throwIfAborted();
    const clean = DOMPurify.sanitize(source, {
      WHOLE_DOCUMENT: true,
      FORBID_TAGS: [
        "script",
        "iframe",
        "frame",
        "object",
        "embed",
        "form",
        "input",
        "button",
        "audio",
        "video",
        "base",
        "meta",
      ],
      FORBID_ATTR: ["srcset", "formaction", "autofocus"],
    });
    const doc = new DOMParser().parseFromString(clean, "text/html");
    for (const style of Array.from(doc.querySelectorAll("style")))
      style.textContent = await this.css(
        style.textContent || "",
        chapter.href,
        warnings,
        signal,
      );
    for (const link of Array.from(doc.querySelectorAll("link"))) {
      if (link.rel === "stylesheet" && link.getAttribute("href")) {
        try {
          const p = resolvePath(chapter.href, link.getAttribute("href")!);
          const s = doc.createElement("style");
          s.textContent = await this.css(
            await this.text(p),
            p,
            warnings,
            signal,
          );
          doc.head.append(s);
        } catch {
          warnings.push("Some book styles could not be loaded.");
        }
      }
      link.remove();
    }
    for (const element of Array.from(doc.querySelectorAll("[style]")))
      element.setAttribute(
        "style",
        await this.css(
          element.getAttribute("style") || "",
          chapter.href,
          warnings,
          signal,
        ),
      );
    const images: { src: string; name: string }[] = [];
    for (const img of Array.from(doc.querySelectorAll("img,image"))) {
      const ref =
        img.getAttribute("src") ||
        img.getAttribute("href") ||
        img.getAttribute("xlink:href");
      if (!ref) continue;
      try {
        const p = resolvePath(chapter.href, ref);
        const src = await this.resource(p, signal);
        if (img.localName === "image") {
          img.setAttribute("href", src);
          img.removeAttribute("xlink:href");
        } else {
          img.setAttribute("src", src);
          img.setAttribute("loading", "lazy");
        }
        images.push({ src, name: p.split("/").pop() || "Page image" });
      } catch {
        warnings.push("An image could not be loaded safely.");
        img.removeAttribute("src");
        img.removeAttribute("href");
        img.removeAttribute("xlink:href");
        img.setAttribute("alt", "Image unavailable");
      }
    }
    for (const a of Array.from(doc.querySelectorAll("a"))) {
      const ref = a.getAttribute("href");
      a.removeAttribute("target");
      if (ref) {
        try {
          const path = resolvePath(chapter.href, ref);
          a.setAttribute("href", "#");
          a.setAttribute(
            "data-book-href",
            path +
              (ref.includes("#")
                ? "#" + ref.split("#").slice(1).join("#")
                : ""),
          );
        } catch {
          a.removeAttribute("href");
        }
      }
    }
    const content =
      (doc.head.querySelector("style")
        ? Array.from(doc.head.querySelectorAll("style"))
            .map((s) => s.outerHTML)
            .join("")
        : "") + doc.body.innerHTML;
    signal?.throwIfAborted();
    return { html: content, images, warnings };
  }
  releaseResources() {
    for (const u of this.urls.values()) URL.revokeObjectURL(u);
    this.urls.clear();
    this.resourceSize = 0;
  }
  async close() {
    this.disposed = true;
    this.releaseResources();
    await this.reader.close();
  }
}
export function readerDocument(content: string, size = 19, dark = false) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob: data:; font-src blob: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>html{color-scheme:${dark ? "dark" : "light"};background:${dark ? "#242923" : "#fffdf8"};color:${dark ? "#edece3" : "#343c32"}}body{box-sizing:border-box;max-width:790px;margin:auto;padding:64px 70px 96px;font-family:Georgia,serif;font-size:${size}px!important;line-height:1.85;overflow-wrap:break-word}h1,h2,h3{line-height:1.25;font-weight:normal}h1{font-size:2em;margin:14px 0 36px}p{margin:0 0 1.4em}img,svg{max-width:100%;height:auto}table{max-width:100%}.chapter-label{font:11px Arial,sans-serif;letter-spacing:3px;color:#868d7e}mark[data-folio]{background:#f0de95;color:#302c1c;border-radius:2px}a{color:inherit}@media(max-width:650px){body{padding:30px 24px}}@media print{html,body{background:white!important;color:black!important}body{max-width:none;padding:0;font-size:12pt!important}img{break-inside:avoid}section.folio-print-chapter{break-before:page}section.folio-print-chapter:first-of-type{break-before:auto}@page{size:auto;margin:18mm}}</style></head><body>${content}</body></html>`;
}
