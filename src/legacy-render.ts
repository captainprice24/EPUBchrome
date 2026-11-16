import DOMPurify from "dompurify";
import { resolvePath, type Epub, type Rendered } from "./epub";

// The renderer of v0.2, kept byte-for-byte in behaviour. Notes saved by that
// version store offsets into its output, so it is needed once per old book to
// turn those offsets into text-quote locators. It is loaded on demand.
async function legacyCss(
  epub: Epub,
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
        next = await epub.resource(resolvePath(base, ref), signal);
      } catch {
        warnings?.push("A style resource could not be loaded safely.");
      }
    }
    css = css.replace(match[0], `url("${next.replaceAll('"', "%22")}")`);
  }
  return css;
}
/** Frozen v0.2 output, used only to capture locators before the renderer upgrade. */
export async function renderLegacy(
  epub: Epub,
  index: number,
  signal?: AbortSignal,
): Promise<Rendered> {
  signal?.throwIfAborted();
  const warnings: string[] = [];
  const chapter = epub.chapters[index];
  if (!chapter) throw Error("Chapter not found.");
  const source = await epub.text(chapter.href);
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
    style.textContent = await legacyCss(
      epub,
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
        s.textContent = await legacyCss(
          epub,
          await epub.text(p),
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
      await legacyCss(
        epub,
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
      const src = await epub.resource(p, signal);
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
            (ref.includes("#") ? "#" + ref.split("#").slice(1).join("#") : ""),
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
