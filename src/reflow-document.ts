import DOMPurify from "dompurify";
import { marked } from "marked";
import { ZipWriter, BlobWriter, BlobReader, TextReader } from "@zip.js/zip.js";
import type { Nav } from "./epub";
import type { MobiMetadata, MobiToc } from "@lingo-reader/mobi-parser";

interface MobiResult {
  error?: string;
  metadata: MobiMetadata;
  chapters: { id: string; html: string; css: { id: string; href: string }[] }[];
  toc: MobiToc;
  targets: { href: string; target?: { id: string; selector: string } }[];
  assets: { url: string; blob: Blob }[];
  cover: string;
}
const escape = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;")
    .replaceAll(">", "&gt;");
const fileTitle = (name: string) =>
  name.replace(/\.[^.]+$/, "").slice(0, 10000) || "Untitled document";
const xhtml = (doc: Document) =>
  new XMLSerializer().serializeToString(doc.documentElement);
function cleanDocument(html: string) {
  return new DOMParser().parseFromString(
    DOMPurify.sanitize(html, {
      WHOLE_DOCUMENT: true,
      FORBID_TAGS: [
        "script",
        "iframe",
        "object",
        "embed",
        "form",
        "input",
        "button",
        "audio",
        "video",
        "meta",
        "base",
      ],
    }),
    "text/html",
  );
}
function parseMobi(blob: Blob) {
  return new Promise<MobiResult>((resolve, reject) => {
    const worker = new Worker(new URL("./mobi-worker.ts", import.meta.url), {
      type: "module",
    });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(Error("MOBI decoding exceeded the 45-second safety limit."));
    }, 45000);
    const finish = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    worker.onmessage = (event: MessageEvent<MobiResult>) => {
      finish();
      event.data.error ? reject(Error(event.data.error)) : resolve(event.data);
    };
    worker.onerror = () => {
      finish();
      reject(Error("The MOBI parser could not open this document."));
    };
    worker.postMessage(blob);
  });
}
export async function prepareReflowDocument(
  blob: Blob,
  format: "md" | "mobi",
  name: string,
) {
  let title = fileTitle(name),
    author = "Unknown author",
    language = "en",
    cover: string | undefined;
  const sections: { href: string; doc: Document }[] = [],
    navigation: Nav[] = [];
  const resources = new Map<string, Blob>();
  if (format === "md") {
    const text = await blob.text();
    if (text.includes("\0"))
      throw Error("This does not appear to be a Markdown text file.");
    const doc = cleanDocument(await marked.parse(text, { gfm: true }));
    title =
      doc.querySelector("h1")?.textContent?.trim().slice(0, 10000) || title;
    const slugs = new Set<string>();
    for (const heading of Array.from(
      doc.querySelectorAll("h1,h2,h3,h4,h5,h6"),
    )) {
      const slug =
        (heading.textContent || "section")
          .toLowerCase()
          .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
          .trim()
          .replace(/\s+/g, "-") || "section";
      let id = heading.id || slug,
        suffix = 2;
      while (slugs.has(id)) id = `${slug}-${suffix++}`;
      heading.id = id;
      slugs.add(id);
    }
    let section = document.implementation.createHTMLDocument(title);
    const flush = () => {
      if (
        section.body.textContent?.trim() ||
        section.body.querySelector("img,table,pre,hr")
      )
        sections.push({
          href: `sections/s${sections.length}.xhtml`,
          doc: section,
        });
    };
    for (const node of Array.from(doc.body.childNodes)) {
      if (
        node instanceof Element &&
        node.matches("h1,h2") &&
        section.body.textContent?.trim()
      ) {
        flush();
        section = document.implementation.createHTMLDocument(title);
      }
      section.body.append(section.importNode(node, true));
    }
    flush();
    if (!sections.length)
      throw Error("This Markdown file has no readable content.");
    const anchors = new Map<string, string>();
    for (const section of sections)
      for (const node of Array.from(section.doc.querySelectorAll("[id]")))
        anchors.set(node.id, section.href);
    for (const section of sections) {
      for (const heading of Array.from(
        section.doc.querySelectorAll("h1,h2,h3,h4,h5,h6"),
      ))
        navigation.push({
          href: `${section.href}#${heading.id}`,
          title: heading.textContent?.trim() || "Section",
          depth: Math.max(0, Number(heading.tagName[1]) - 2),
        });
      for (const link of Array.from(
        section.doc.querySelectorAll("a[href^='#']"),
      )) {
        let id = "";
        try {
          id = decodeURIComponent(link.getAttribute("href")!.slice(1));
        } catch {
          continue;
        }
        const target = anchors.get(id);
        if (target)
          link.setAttribute("href", `${target.split("/").pop()}#${id}`);
      }
    }
    resources.set(
      "assets/markdown.css",
      new Blob(
        [
          "pre{padding:1em;background:#eee;white-space:pre-wrap}code{font-family:monospace}table{border-collapse:collapse}th,td{border:1px solid #888;padding:.4em}blockquote{border-inline-start:3px solid #888;padding-inline-start:1em}hr{margin:2em 0}",
        ],
        { type: "text/css" },
      ),
    );
    for (const section of sections) {
      const link = section.doc.createElement("link");
      link.rel = "stylesheet";
      link.href = "../assets/markdown.css";
      section.doc.head.append(link);
    }
  } else {
    const data = await parseMobi(blob);
    title = data.metadata.title?.slice(0, 10000) || title;
    author = data.metadata.author?.join(", ").slice(0, 10000) || author;
    language = data.metadata.language || language;
    const extensions: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/gif": "gif",
      "image/svg+xml": "svg",
      "image/webp": "webp",
      "text/css": "css",
      "font/woff": "woff",
      "font/woff2": "woff2",
      "application/x-font-ttf": "ttf",
      "font/ttf": "ttf",
      "font/otf": "otf",
    };
    const paths = new Map(
      data.assets.map((asset, i) => [
        asset.url,
        `assets/a${i}.${extensions[asset.blob.type] || "bin"}`,
      ]),
    );
    const rewrite = (text: string) => {
      for (const [url, path] of paths)
        text = text.replaceAll(url, "../" + path);
      return text;
    };
    for (const asset of data.assets)
      resources.set(
        paths.get(asset.url)!,
        asset.blob.type.includes("css")
          ? new Blob([rewrite(await asset.blob.text())], { type: "text/css" })
          : asset.blob,
      );
    for (const chapter of data.chapters) {
      const doc = cleanDocument(rewrite(chapter.html));
      for (const sheet of chapter.css) {
        const path = paths.get(sheet.href);
        if (path) {
          const link = doc.createElement("link");
          link.rel = "stylesheet";
          link.href = "../" + path;
          doc.head.append(link);
        }
      }
      sections.push({ href: `sections/s${sections.length}.xhtml`, doc });
    }
    const chapterIds = new Map(
      data.chapters.map((chapter, i) => [chapter.id, i]),
    );
    const targets = new Map<string, string>();
    for (const { href, target } of data.targets) {
      const index = target && chapterIds.get(target.id);
      if (index === undefined) continue;
      const section = sections[index]!;
      let node: Element | null = null;
      try {
        node = target?.selector
          ? section.doc.querySelector(target.selector)
          : null;
      } catch {
        /* chapter fallback */
      }
      targets.set(href, section.href + (node?.id ? "#" + node.id : ""));
    }
    const walk = (items: MobiToc, depth = 0) => {
      for (const item of items) {
        const href = targets.get(item.href);
        if (href)
          navigation.push({ href, title: item.label || "Section", depth });
        if (item.children && depth < 12) walk(item.children, depth + 1);
      }
    };
    walk(data.toc);
    for (const section of sections)
      for (const link of Array.from(section.doc.querySelectorAll("a[href]"))) {
        const target = targets.get(link.getAttribute("href")!);
        if (target) link.setAttribute("href", target.replace("sections/", ""));
      }
    cover = paths.get(data.cover);
  }
  if (sections.length > 30000)
    throw Error("This document contains too many sections.");
  const writer = new ZipWriter(new BlobWriter("application/epub+zip"));
  try {
    await writer.add("mimetype", new TextReader("application/epub+zip"), {
      level: 0,
    });
    await writer.add(
      "META-INF/container.xml",
      new TextReader(
        '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      ),
    );
    for (const section of sections) {
      section.doc.documentElement.lang = language;
      await writer.add(section.href, new TextReader(xhtml(section.doc)), {
        level: 0,
      });
    }
    for (const [path, blob] of resources)
      await writer.add(path, new BlobReader(blob), { level: 0 });
    const toc = navigation.length
      ? navigation
      : sections.map((s, i) => ({
          href: s.href,
          title:
            s.doc.querySelector("h1,h2,h3")?.textContent?.trim() ||
            `Section ${i + 1}`,
          depth: 0,
        }));
    const navRoot = document.createElement("ol"),
      lists = [navRoot];
    for (const item of toc) {
      const depth = Math.min(12, item.depth, lists.length);
      while (lists.length - 1 > depth) lists.pop();
      if (depth === lists.length) {
        const parent = lists.at(-1)!.lastElementChild;
        if (parent) {
          const list = document.createElement("ol");
          parent.append(list);
          lists.push(list);
        }
      }
      const li = document.createElement("li"),
        link = document.createElement("a");
      link.setAttribute("href", item.href);
      link.textContent = item.title;
      li.append(link);
      lists.at(-1)!.append(li);
    }
    await writer.add(
      "nav.xhtml",
      new TextReader(
        `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc">${navRoot.outerHTML}</nav></body></html>`,
      ),
    );
    const manifest =
      sections
        .map(
          (s, i) =>
            `<item id="s${i}" href="${s.href}" media-type="application/xhtml+xml"/>`,
        )
        .join("") +
      Array.from(
        resources,
        ([path, blob], i) =>
          `<item id="a${i}" href="${path}" media-type="${escape(blob.type || "application/octet-stream")}"${path === cover ? ' properties="cover-image"' : ""}/>`,
      ).join("");
    await writer.add(
      "book.opf",
      new TextReader(
        `<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">folio-normalized-v1</dc:identifier><dc:title>${escape(title)}</dc:title><dc:creator>${escape(author)}</dc:creator><dc:language>${escape(language)}</dc:language></metadata><manifest>${manifest}<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine page-progression-direction="${/^(ar|he|fa|ur)(-|$)/i.test(language) ? "rtl" : "ltr"}">${sections.map((_, i) => `<itemref idref="s${i}"/>`).join("")}</spine></package>`,
      ),
    );
    return await writer.close();
  } catch (error) {
    await writer.close().catch(() => {});
    throw error;
  }
}
