import type { DocumentEngine } from "./document-types";
import { createReadingDocument, Paginator } from "./reader";

const WIDTH = 384,
  HEIGHT = 544;
export const PREVIEW_VERSION = 1;

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

async function png(canvas: HTMLCanvasElement, signal: AbortSignal) {
  signal.throwIfAborted();
  return abortable(
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(Error("Preview image unavailable.")),
        "image/png",
      );
    }),
    signal,
  );
}

async function imagePreview(blob: Blob, signal: AbortSignal) {
  // Avoid decoding oversized cover resources just to populate a library card.
  if (blob.size > 8 * 1024 ** 2) return;
  const image = new Image(),
    url = URL.createObjectURL(blob);
  const canvas = document.createElement("canvas");
  try {
    image.src = url;
    await abortable(image.decode(), signal);
    if (!image.naturalWidth || !image.naturalHeight) return;
    const scale = Math.min(
      WIDTH / image.naturalWidth,
      HEIGHT / image.naturalHeight,
      1,
    );
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#fffdf8";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await png(canvas, signal);
  } finally {
    image.src = "";
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 0;
  }
}

async function firstPagePreview(engine: DocumentEngine, signal: AbortSignal) {
  const index = engine.fixedPages ? 0 : engine.initialChapter || 0;
  if (!engine.fixedPages && engine.chapterSize(index) > 2 * 1024 ** 2) return;
  const page = await engine.render(index, signal, {
    width: WIDTH + 32,
    height: HEIGHT + 32,
    zoom: 1,
    mode: "horizontal",
    pixelRatio: 1,
  });
  if (engine.fixedPages) {
    const source = page.images[0]?.src;
    if (!source?.startsWith("blob:")) return;
    return imagePreview(await (await fetch(source, { signal })).blob(), signal);
  }
  const parsed = new DOMParser().parseFromString(page.html, "text/html");
  const text = parsed.body.textContent?.trim() || "";
  if (page.images.length && (text.length < 100 || page.images.length > 24)) {
    const source = page.images[0]!.src;
    if (source.startsWith("blob:"))
      return imagePreview(
        await (await fetch(source, { signal })).blob(),
        signal,
      );
  }
  // Reuse the scriptless reader's page layout. The screenshot is a local,
  // bounded derivative; publisher assets were already resolved to local URLs.
  const frame = document.createElement("iframe");
  frame.title = "Generating local library preview";
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${WIDTH}px;height:${HEIGHT}px;border:0;pointer-events:none`;
  let paginator: Paginator | undefined;
  try {
    const loaded = new Promise<void>((resolve) => {
      frame.onload = () => resolve();
    });
    frame.srcdoc = createReadingDocument(page.html);
    document.body.append(frame);
    await abortable(loaded, signal);
    const doc = frame.contentDocument!;
    paginator = new Paginator(
      doc,
      {
        mode: "horizontal",
        size: 18,
        font: "publisher",
        lineHeight: 1.7,
        margin: "narrow",
        theme: "paper",
      },
      { interactive: false },
    );
    await abortable(paginator.start(), signal);
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await abortable(
      html2canvas(paginator.viewport, {
        width: WIDTH,
        height: HEIGHT,
        windowWidth: WIDTH,
        windowHeight: HEIGHT,
        scale: 1,
        scrollX: 0,
        scrollY: 0,
        backgroundColor: "#fffdf8",
        allowTaint: false,
        useCORS: false,
        imageTimeout: 3000,
        logging: false,
      }),
      signal,
    );
    try {
      return await png(canvas, signal);
    } finally {
      canvas.width = canvas.height = 0;
    }
  } finally {
    paginator?.destroy();
    frame.remove();
  }
}

export async function createDocumentPreview(
  engine: DocumentEngine,
  parent?: AbortSignal,
): Promise<Blob | undefined> {
  const controller = new AbortController();
  const abort = () => controller.abort(parent?.reason);
  if (parent?.aborted) abort();
  parent?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(
    () =>
      controller.abort(new DOMException("Preview timed out.", "TimeoutError")),
    10000,
  );
  try {
    controller.signal.throwIfAborted();
    if (engine.coverPath) {
      try {
        const cover = await imagePreview(
          await abortable(engine.blob(engine.coverPath), controller.signal),
          controller.signal,
        );
        if (cover) return cover;
      } catch {
        controller.signal.throwIfAborted();
      }
    }
    return await abortable(
      firstPagePreview(engine, controller.signal),
      controller.signal,
    );
  } catch (error) {
    if (parent?.aborted) throw error;
    // Preview failures must not prevent reading or replace the source file.
    return undefined;
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", abort);
    engine.releaseResources();
  }
}
