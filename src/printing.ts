import type { DocumentEngine } from "./document-types";
import { readerDocument } from "./epub";
import type { RenderIssue } from "./render-issues";

function waitFor<T>(
  promise: PromiseLike<T>,
  signal: AbortSignal,
  deadline: number,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const finish = (fn: () => void) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      fn();
    };
    const abort = () =>
      finish(() => reject(new DOMException("Print canceled.", "AbortError")));
    const timer = setTimeout(
      () =>
        finish(() => reject(Error("Print resources took too long to load."))),
      Math.max(1, deadline - performance.now()),
    );
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    Promise.resolve(promise).then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

/** Caller owns the returned frame and must remove it on review/cancel/error. */
export async function preparePrintLayout(
  engine: DocumentEngine,
  chapter: number,
  scope: string,
  signal: AbortSignal,
  progress: (message: string) => void,
) {
  const indices =
    scope === "book" && !engine.fixedPages
      ? engine.chapters.flatMap((c, i) => (c.linear ? [i] : []))
      : [chapter];
  if (indices.length > 300)
    throw Error(
      "Print one chapter at a time for books with more than 300 chapters.",
    );
  let content = "";
  const issues: RenderIssue[] = [];
  if (scope === "book")
    issues.push(
      ...(engine.warnings || []).map((message) => ({
        level: "lossy" as const,
        message,
      })),
    );
  for (const [at, i] of indices.entries()) {
    signal.throwIfAborted();
    progress(
      `Preparing ${engine.fixedPages ? "page" : "chapter"} ${at + 1} of ${indices.length}…`,
    );
    const rendered = await engine.render(i, signal, {
      width: 1754,
      height: 2480,
      zoom: 1,
      mode: "horizontal",
      pixelRatio: 1,
    });
    for (const issue of rendered.issues ??
      rendered.warnings.map((message) => ({
        level: "degraded" as const,
        message,
      }))) {
      if (issue.level !== "info")
        issues.push({
          ...issue,
          message: `${engine.chapters[i]!.title}: ${issue.message}`,
        });
    }
    const page = rendered.fixedPage
      ? `<img src="${rendered.images[0]?.src || ""}" alt="Page ${i + 1}" style="width:100%;height:auto"/>`
      : rendered.html;
    content += `<section class="folio-print-chapter">${page}</section>`;
    if (content.length > 16 * 1024 * 1024)
      throw Error(
        "This print layout is too large. Print individual chapters instead.",
      );
  }
  signal.throwIfAborted();
  const frame = document.createElement("iframe");
  frame.title = "Print layout";
  frame.className = "print-frame";
  frame.setAttribute("sandbox", "allow-same-origin allow-modals");
  const deadline = performance.now() + 30000;
  const loaded = new Promise<void>((resolve) => {
    frame.onload = () => {
      if (frame.contentDocument?.querySelector(".folio-print-chapter"))
        resolve();
    };
  });
  frame.srcdoc = readerDocument(content, 17, false);
  document.body.append(frame);
  try {
    await waitFor(loaded, signal, deadline);
    for (const image of Array.from(frame.contentDocument?.images || [])) {
      // Empty export placeholders never had image content. Missing resources
      // whose src was removed during rendering already have a lossy issue.
      if (!image.getAttribute("src")?.trim()) continue;
      image.loading = "eager";
      try {
        await waitFor(image.decode(), signal, deadline);
      } catch (error) {
        signal.throwIfAborted();
        if (performance.now() >= deadline) throw error;
        issues.push({
          level: "lossy",
          message: "An image could not be decoded for printing.",
        });
      }
    }
    if (frame.contentDocument)
      await waitFor(frame.contentDocument.fonts.ready, signal, deadline);
    signal.throwIfAborted();
    if (
      Array.from(frame.contentDocument?.fonts || []).some(
        (font) => font.status === "error",
      )
    )
      issues.push({
        level: "degraded",
        message:
          "A publisher font could not be loaded; fallback text will be used.",
      });
    const seen = new Set<string>();
    return {
      frame,
      issues: issues.filter((issue) => {
        const key = issue.level + issue.message;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    };
  } catch (error) {
    frame.remove();
    throw error;
  }
}
