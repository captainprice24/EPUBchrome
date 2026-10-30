import { asset } from "./store";
import type { Chapter, Nav, Rendered } from "./epub";
import type {
  DocumentEngine,
  DocumentFormat,
  RenderOptions,
} from "./document-types";
import type {
  PDFDocumentProxy,
  PDFDocumentLoadingTask,
  PDFWorker,
} from "pdfjs-dist";

const escape = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const defaults: RenderOptions = {
  width: 1000,
  height: 800,
  zoom: 1,
  mode: "horizontal",
  pixelRatio: 1,
};
abstract class FixedDocument implements DocumentEngine {
  abstract format: DocumentFormat;
  fixedPages = true;
  fixedLayout = true;
  author = "Unknown author";
  chapters: Chapter[] = [];
  toc: Nav[] = [];
  pages: Nav[] = [];
  linearCount = 0;
  protected urls: string[] = [];
  protected closed = false;
  constructor(
    protected source: Blob,
    public title: string,
  ) {
    this.title = title.replace(/\.[^.]+$/, "").slice(0, 10000);
  }
  protected setCount(count: number) {
    if (!count || count > 30000)
      throw Error("Documents must contain between 1 and 30,000 pages.");
    this.linearCount = count;
    this.chapters = Array.from({ length: count }, (_, i) => ({
      href: `pages/p${i}.xhtml`,
      title: `Page ${i + 1}`,
      linear: true,
    }));
  }
  protected pageHTML(
    index: number,
    image: Blob,
    width: number,
    height: number,
    text = "",
    links = "",
    warnings: string[] = [],
  ): Rendered {
    if (this.closed) throw Error("Document has been closed.");
    const src = URL.createObjectURL(image);
    this.urls.push(src);
    return {
      html: `<div data-folio-html="${this.chapters[index]!.href}"><div class="folio-native-page" style="width:${width}px;height:${height}px"><img src="${src}" ${text ? 'alt="" aria-hidden="true"' : `alt="Page ${index + 1}"`}/>${text}${links}</div></div>`,
      fixedPage: { width, height },
      images: [
        {
          src,
          name: `Page ${index + 1}`,
          path: `${this.format}/page-${index + 1}.png`,
        },
      ],
      warnings,
    };
  }
  async blob(_path: string): Promise<Blob> {
    throw Error("This document has no archive cover resource.");
  }
  chapterSize() {
    return 0;
  }
  releaseResources() {
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls = [];
  }
  abstract render(
    index: number,
    signal?: AbortSignal,
    options?: RenderOptions,
  ): Promise<Rendered>;
  abstract close(): Promise<void>;
}

class PdfDocument extends FixedDocument {
  format = "pdf" as const;
  private task?: PDFDocumentLoadingTask;
  private pdf?: PDFDocumentProxy;
  private pdfWorker?: PDFWorker;
  private workerPort?: Worker;
  async open() {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = asset(
      "documents/pdf/pdf.worker.min.js",
    );
    // Explicit ownership avoids PDF.js's blob/CDN origin shim for extension
    // URLs, keeping the worker compatible with the self-only extension CSP.
    this.workerPort = new Worker(asset("documents/pdf/pdf.worker.min.js"), {
      type: "module",
    });
    this.pdfWorker = pdfjs.PDFWorker.create({ port: this.workerPort });
    const blob = this.source;
    class BlobRange extends pdfjs.PDFDataRangeTransport {
      private stopped = false;
      override requestDataRange(begin: number, end: number) {
        void blob
          .slice(begin, end)
          .arrayBuffer()
          .then((bytes) => {
            if (!this.stopped) this.onDataRange(begin, new Uint8Array(bytes));
          })
          .catch(() => this.abort());
      }
      override abort() {
        this.stopped = true;
      }
    }
    const range = new BlobRange(
      blob.size,
      new Uint8Array(await blob.slice(0, 65536).arrayBuffer()),
      false,
    );
    this.task = pdfjs.getDocument({
      worker: this.pdfWorker,
      range,
      rangeChunkSize: 65536,
      disableAutoFetch: true,
      disableStream: true,
      iccUrl: asset("documents/pdf/iccs/"),
      cMapUrl: asset("documents/pdf/cmaps/"),
      cMapPacked: true,
      standardFontDataUrl: asset("documents/pdf/standard_fonts/"),
      wasmUrl: asset("documents/pdf/wasm/"),
      canvasMaxAreaInBytes: 24000000,
    });
    try {
      this.pdf = await this.task.promise;
    } catch (error) {
      if (error instanceof Error && error.name === "PasswordException")
        throw Error(
          "This PDF needs a password. Password-protected PDFs are not supported in this version.",
        );
      throw error;
    }
    this.setCount(this.pdf.numPages);
    try {
      const { info } = await this.pdf.getMetadata();
      const metadata = info as { Title?: string; Author?: string };
      if (typeof metadata.Title === "string" && metadata.Title.trim())
        this.title = metadata.Title.trim().slice(0, 10000);
      if (typeof metadata.Author === "string")
        this.author = metadata.Author.slice(0, 10000);
      const labels = await this.pdf.getPageLabels();
      if (labels)
        for (let i = 0; i < this.chapters.length; i++)
          this.chapters[i]!.title =
            `Page ${i + 1}${labels[i] !== String(i + 1) ? ` (${labels[i]})` : ""}`;
    } catch {
      /* optional metadata */
    }
    const outline = await this.pdf.getOutline().catch(() => null);
    const walk = async (items: NonNullable<typeof outline>, depth = 0) => {
      for (const item of items) {
        if (this.toc.length >= 1000 || depth > 12) return;
        const index = await this.destination(item.dest).catch(() => undefined);
        if (index !== undefined)
          this.toc.push({
            href: this.chapters[index]!.href,
            title: item.title || this.chapters[index]!.title,
            depth,
          });
        if (item.items?.length) await walk(item.items, depth + 1);
      }
    };
    if (outline) await walk(outline);
    return this;
  }
  private async destination(dest: unknown) {
    const value =
      typeof dest === "string" ? await this.pdf!.getDestination(dest) : dest;
    if (!Array.isArray(value) || !value.length) return;
    const index =
      typeof value[0] === "number"
        ? value[0]
        : await this.pdf!.getPageIndex(value[0]);
    return Number.isInteger(index) && index >= 0 && index < this.linearCount
      ? index
      : undefined;
  }
  async render(index: number, signal?: AbortSignal, options = defaults) {
    signal?.throwIfAborted();
    const pdfjs = await import("pdfjs-dist"),
      page = await this.pdf!.getPage(index + 1);
    let canvas: HTMLCanvasElement | undefined;
    try {
      const logical = page.getViewport({ scale: 1 }),
        width = logical.width,
        height = logical.height;
      const fit =
        options.mode === "vertical"
          ? (options.width - 32) / width
          : Math.min(
              (options.width - 32) / width,
              (options.height - 32) / height,
            );
      const scale = Math.min(
        Math.max(0.1, fit * options.zoom * options.pixelRatio),
        Math.sqrt(6000000 / (width * height)),
        4096 / Math.max(width, height),
      );
      const viewport = page.getViewport({ scale });
      canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const rendering = page.render({ canvas, viewport });
      const cancel = () => rendering.cancel();
      signal?.addEventListener("abort", cancel, { once: true });
      try {
        await rendering.promise;
      } finally {
        signal?.removeEventListener("abort", cancel);
      }
      signal?.throwIfAborted();
      const image = await new Promise<Blob>((resolve, reject) =>
        canvas!.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(Error("Could not display this PDF page.")),
          "image/png",
        ),
      );
      const warnings: string[] = [];
      let text = "",
        links = "";
      try {
        const container = document.createElement("div");
        container.className = "textLayer";
        const layer = new pdfjs.TextLayer({
          textContentSource: await page.getTextContent(),
          container,
          viewport: logical,
        });
        await layer.render();
        text = container.textContent?.trim() ? container.outerHTML : "";
      } catch {
        warnings.push(
          "This page's text layer is unavailable; its original appearance is shown.",
        );
      }
      for (const annotation of await page.getAnnotations({
        intent: "display",
      })) {
        if (
          annotation.subtype !== "Link" ||
          !annotation.dest ||
          !Array.isArray(annotation.rect)
        )
          continue;
        const target = await this.destination(annotation.dest).catch(
          () => undefined,
        );
        if (target === undefined) continue;
        const box = [
          ...logical.convertToViewportPoint(
            annotation.rect[0],
            annotation.rect[1],
          ),
          ...logical.convertToViewportPoint(
            annotation.rect[2],
            annotation.rect[3],
          ),
        ];
        const x = Math.min(box[0]!, box[2]!),
          y = Math.min(box[1]!, box[3]!);
        links += `<a class="native-link" href="#" data-book-href="${this.chapters[target]!.href}" aria-label="Go to page ${target + 1}" style="left:${x}px;top:${y}px;width:${Math.abs(box[2]! - box[0]!)}px;height:${Math.abs(box[3]! - box[1]!)}px"></a>`;
      }
      signal?.throwIfAborted();
      return this.pageHTML(index, image, width, height, text, links, warnings);
    } finally {
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      page.cleanup();
    }
  }
  async close() {
    this.closed = true;
    this.releaseResources();
    try {
      await this.task?.destroy();
    } finally {
      this.pdfWorker?.destroy();
      this.workerPort?.terminate();
    }
  }
}

class DjvuConnection {
  worker = new Worker(new URL("./djvu-worker.ts", import.meta.url), {
    type: "module",
  });
  private next = 0;
  private pending = new Map<
    number,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor() {
    this.worker.onmessage = (event) => {
      const { id, result, error } = event.data,
        request = this.pending.get(id);
      if (!request) return;
      clearTimeout(request.timer);
      this.pending.delete(id);
      error ? request.reject(Error(error)) : request.resolve(result);
    };
    this.worker.onerror = () => this.close("The local DjVu decoder failed.");
  }
  request<T>(command: string, payload: object) {
    return new Promise<T>((resolve, reject) => {
      const id = ++this.next,
        timer = setTimeout(
          () =>
            this.close("DjVu decoding exceeded the 45-second safety limit."),
          45000,
        );
      this.pending.set(id, {
        resolve: (result) => resolve(result as T),
        reject,
        timer,
      });
      this.worker.postMessage({ id, command, ...payload });
    });
  }
  close(message = "DjVu decoding canceled.") {
    this.worker.terminate();
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(Error(message));
    }
    this.pending.clear();
  }
}
class DjvuDocument extends FixedDocument {
  format = "djvu" as const;
  private connection?: DjvuConnection;
  private renderedPages = 0;
  private async connect() {
    if (this.closed) throw Error("Document has been closed.");
    if (this.connection) return this.connection;
    const connection = new DjvuConnection();
    this.connection = connection;
    try {
      const { count } = await connection.request<{ count: number }>("open", {
        blob: this.source,
        scalar: asset("documents/djvu/scalar.wasm"),
        simd: asset("documents/djvu/simd.wasm"),
      });
      this.setCount(count);
      return connection;
    } catch (error) {
      connection.close();
      if (this.connection === connection) this.connection = undefined;
      throw error;
    }
  }
  async open() {
    await this.connect();
    return this;
  }
  async render(index: number, signal?: AbortSignal, options = defaults) {
    signal?.throwIfAborted();
    const connection = await this.connect();
    const cancel = () => {
      connection.close();
      if (this.connection === connection) this.connection = undefined;
    };
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      const result = await connection.request<{
        image: Blob;
        width: number;
        height: number;
        pixelWidth: number;
        pixelHeight: number;
        zones: { t: string; x: number; y: number; w: number; h: number }[];
        lazy: boolean;
      }>("render", { index, options });
      signal?.throwIfAborted();
      const container = document.createElement("div");
      container.className = "djvu-text-layer";
      const ctx = document.createElement("canvas").getContext("2d")!;
      for (const zone of result.zones.slice(0, 100000)) {
        if (
          typeof zone.t !== "string" ||
          ![zone.x, zone.y, zone.w, zone.h].every(Number.isFinite)
        )
          continue;
        const span = document.createElement("span"),
          height = (zone.h * result.height) / result.pixelHeight,
          width = (zone.w * result.width) / result.pixelWidth;
        span.textContent = zone.t + " ";
        ctx.font = `${height}px sans-serif`;
        const scaleX =
          width / Math.max(1, ctx.measureText(span.textContent).width);
        Object.assign(span.style, {
          left: `${(zone.x * result.width) / result.pixelWidth}px`,
          top: `${(zone.y * result.height) / result.pixelHeight}px`,
          fontSize: `${height}px`,
          transform: `scaleX(${scaleX})`,
        });
        container.append(span);
      }
      return this.pageHTML(
        index,
        result.image,
        result.width,
        result.height,
        container.childNodes.length ? container.outerHTML : "",
      );
    } finally {
      signal?.removeEventListener("abort", cancel);
      // Reset the decoder periodically so decoded page caches cannot grow with
      // the entire book. Originals remain browser-backed Blobs.
      if (++this.renderedPages >= 4 && this.connection === connection) {
        connection.close();
        this.connection = undefined;
        this.renderedPages = 0;
      }
    }
  }
  async close() {
    this.closed = true;
    this.connection?.close();
    this.connection = undefined;
    this.releaseResources();
  }
}
export async function openFixedDocument(
  blob: Blob,
  format: "pdf" | "djvu",
  name: string,
) {
  const engine =
    format === "pdf"
      ? new PdfDocument(blob, name)
      : new DjvuDocument(blob, name);
  try {
    return await engine.open();
  } catch (error) {
    await engine.close().catch(() => {});
    throw error;
  }
}
