import { readerDocument } from "./epub";
export type ReadingMode = "horizontal" | "vertical";
export type ReadingTheme = "paper" | "sepia" | "night";
export interface ReadingSettings {
  mode: ReadingMode;
  size: number;
  font: "publisher" | "literary" | "classic" | "modern";
  lineHeight: number;
  margin: "narrow" | "comfortable" | "wide";
  theme: ReadingTheme;
  zoom?: number;
}
export interface PageSnapshot {
  page: number;
  pages: number;
  offset: number;
  progress: number;
  key: string;
}
export const fontFamilies = {
  publisher: 'Georgia, "Times New Roman", serif',
  literary: 'Georgia, "Times New Roman", serif',
  classic: '"Palatino Linotype", "Book Antiqua", Palatino, serif',
  modern: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
};
export const themes = {
  paper: { background: "#fffdf8", color: "#343c32" },
  sepia: { background: "#f3e7ce", color: "#4d3d2b" },
  night: { background: "#242923", color: "#edece3" },
};
export function layoutKey(s: ReadingSettings, w: number, h: number) {
  return JSON.stringify([
    3, // Publisher layout and text locator generation.
    s.mode,
    s.size,
    s.font,
    s.lineHeight,
    s.margin,
    Math.round(w),
    Math.round(h),
  ]);
}
export function createReadingDocument(content: string) {
  return readerDocument(
    `<div id="folio-viewport" tabindex="0" aria-label="Chapter pages"><div id="folio-track"><article id="folio-content">${content}</article></div></div>`,
  ).replace(
    "</head>",
    `<style>
html,body{height:100%!important;width:100%!important;margin:0!important;padding:0!important;overflow:hidden!important;max-width:none!important;background:var(--folio-bg,#fffdf8)!important;color:var(--folio-fg,#343c32)!important}
#folio-viewport{position:fixed!important;inset:0!important;outline:none;overscroll-behavior:contain;background:var(--folio-bg);scroll-behavior:auto!important}
#folio-track{position:relative!important;box-sizing:border-box!important;margin:0!important;padding:0!important}
#folio-content{box-sizing:border-box!important;margin:0 auto!important;padding:var(--folio-y,40px) var(--folio-x,56px)!important;max-width:none!important;font-family:var(--folio-font,Georgia,serif)!important;font-size:var(--folio-size,20px)!important;line-height:var(--folio-leading,1.7)!important;overflow-wrap:anywhere!important;color:var(--folio-fg)!important;background:var(--folio-bg)!important}
#folio-content p,#folio-content li,#folio-content blockquote,#folio-content dd,#folio-content dt{font-size:1em!important;line-height:inherit!important}#folio-content h1,#folio-content h2,#folio-content h3{line-height:1.25!important}:where(#folio-content p){margin:0 0 1.25em}html[data-typography="custom"] #folio-content :is(p,li,blockquote,dd,dt,h1,h2,h3,[data-folio-html],[data-folio-body]){font-family:var(--folio-font)!important}#folio-content [data-folio-html],#folio-content [data-folio-body]{font-size:inherit!important;line-height:inherit!important;color:inherit!important;background:transparent!important}#folio-content img,#folio-content svg{max-width:100%!important;max-height:calc(var(--folio-h) - 2 * var(--folio-y))!important;object-fit:contain}#folio-content pre{white-space:pre-wrap!important;overflow-wrap:anywhere}#folio-content table{max-width:100%!important;table-layout:fixed}#folio-content h1{font-size:1.9em!important}#folio-content h2{font-size:1.5em!important}
html[data-reading-mode="horizontal"] #folio-viewport{overflow-x:auto!important;overflow-y:hidden!important;scrollbar-width:none;touch-action:pan-y}
html[data-reading-mode="horizontal"] #folio-content{height:calc(var(--folio-h) - 2 * var(--folio-y))!important;width:var(--folio-w)!important;padding:0 var(--folio-x)!important;margin:var(--folio-y) 0!important;column-width:calc(var(--folio-w) - 2 * var(--folio-x))!important;column-gap:calc(2 * var(--folio-x))!important;column-fill:auto!important;column-count:auto!important}
html[data-reading-mode="vertical"] #folio-viewport{overflow-y:auto!important;overflow-x:hidden!important;touch-action:pan-y}
html[data-reading-mode="vertical"] #folio-content{width:var(--folio-w)!important;column-count:auto!important;column-width:auto!important;height:auto!important}
</style></head>`,
  );
}
export interface Options {
  offset?: number;
  progress?: number;
  page?: number | "last";
  onChange?: (page: PageSnapshot) => void;
  onBoundary?: (direction: number) => void;
  interactive?: boolean;
  onDocumentPage?: (index: number) => void;
  documentPages?: number;
}
export class Paginator {
  readonly viewport: HTMLElement;
  readonly content: HTMLElement;
  private track: HTMLElement;
  private nodes: { node: Text; start: number; end: number }[] = [];
  private starts = new Map<Node, number>();
  private total = 1;
  private current = 1;
  private offset = 0;
  private layoutAnchor?: { offset: number; scroll: number };
  private disposed = false;
  private resize?: ResizeObserver;
  private frame = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private wheelAt = -Infinity;
  private wheelDelta = 0;
  private touch?: { x: number; y: number };
  private ready = false;
  private cleanup: (() => void)[] = [];
  private initial: Options;
  constructor(
    private doc: Document,
    private settings: ReadingSettings,
    private options: Options = {},
  ) {
    this.initial = options;
    this.viewport = doc.getElementById("folio-viewport")!;
    this.content = doc.getElementById("folio-content")!;
    this.track = doc.getElementById("folio-track")!;
  }
  async start() {
    if (this.options.interactive !== false) this.rebuildNodes();
    this.apply();
    // Load dimensions before counting columns. Resources are already local Blob URLs.
    await Promise.all(
      Array.from(this.doc.images).map(async (image) => {
        image.loading = "eager";
        await image.decode().catch(() => {});
      }),
    );
    await this.doc.fonts.ready;
    if (this.disposed) return;
    this.layout(this.initial.offset, this.initial.progress, this.initial.page);
    this.ready = true;
    this.listen(this.viewport, "scroll", () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.publish(), 90);
    });
    this.resize = new ResizeObserver(() => {
      if (!this.disposed && this.ready) this.schedule();
    });
    this.resize.observe(this.viewport);
    this.listen(this.doc, "load", () => this.schedule(), true);
    this.listen(this.doc.fonts, "loadingdone", () => this.schedule());
    if (this.options.interactive !== false) {
      this.listen(this.doc, "keydown", (event: Event) => {
        const e = event as KeyboardEvent;
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        let delta = 0;
        if (
          ["ArrowRight", "PageDown"].includes(e.key) ||
          (e.key === " " && !e.shiftKey)
        )
          delta = 1;
        if (
          ["ArrowLeft", "PageUp"].includes(e.key) ||
          (e.key === " " && e.shiftKey)
        )
          delta = -1;
        if (this.settings.mode === "vertical" && e.key === "ArrowDown")
          delta = 1;
        if (this.settings.mode === "vertical" && e.key === "ArrowUp")
          delta = -1;
        if (this.rtl && ["ArrowRight", "ArrowLeft"].includes(e.key))
          delta *= -1;
        if (delta) {
          e.preventDefault();
          this.turn(delta);
        } else if (e.key === "Home") {
          e.preventDefault();
          this.goToPage(1);
        } else if (e.key === "End") {
          e.preventDefault();
          this.goToPage(this.total);
        }
      });
      this.listen(
        this.viewport,
        "wheel",
        (event: Event) => {
          const e = event as WheelEvent;
          if (this.settings.mode !== "horizontal" || e.ctrlKey) return;
          e.preventDefault();
          const delta =
            Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
          if (performance.now() - this.wheelAt < 300) return;
          const pixels =
            delta *
            (e.deltaMode === 1
              ? 16
              : e.deltaMode === 2
                ? this.viewport.clientHeight
                : 1);
          if (Math.sign(pixels) !== Math.sign(this.wheelDelta))
            this.wheelDelta = 0;
          this.wheelDelta += pixels;
          if (Math.abs(this.wheelDelta) < 45) return;
          const direction = this.wheelDelta > 0 ? 1 : -1;
          this.wheelDelta = 0;
          this.wheelAt = performance.now();
          this.turn(direction);
        },
        { passive: false },
      );
      this.listen(
        this.viewport,
        "touchstart",
        (event: Event) => {
          const t = (event as TouchEvent).touches[0];
          if (t) this.touch = { x: t.clientX, y: t.clientY };
        },
        { passive: true },
      );
      this.listen(
        this.viewport,
        "touchend",
        (event: Event) => {
          const t = (event as TouchEvent).changedTouches[0];
          if (
            this.settings.mode === "horizontal" &&
            this.touch &&
            t &&
            this.doc.getSelection()?.isCollapsed
          ) {
            const dx = t.clientX - this.touch.x,
              dy = t.clientY - this.touch.y;
            if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy))
              this.turn((dx < 0 ? 1 : -1) * (this.rtl ? -1 : 1));
          }
          this.touch = undefined;
        },
        { passive: true },
      );
    }
  }
  private listen(
    target: EventTarget,
    name: string,
    handler: EventListener,
    options?: boolean | AddEventListenerOptions,
  ) {
    target.addEventListener(name, handler, options);
    this.cleanup.push(() => target.removeEventListener(name, handler, options));
  }
  private apply() {
    const root = this.doc.documentElement;
    root.dataset.readingMode = this.settings.mode;
    root.dataset.typography =
      this.settings.font === "publisher" ? "publisher" : "custom";
    const publisher =
      this.doc.querySelector<HTMLElement>("[data-folio-body]") ||
      this.doc.querySelector<HTMLElement>("[data-folio-html]");
    const rtl =
      publisher &&
      this.doc.defaultView?.getComputedStyle(publisher).direction === "rtl";
    this.viewport.dir = rtl ? "rtl" : "ltr";
    this.track.dir = this.viewport.dir;
    this.content.dir = this.viewport.dir;
    const width = this.viewport.clientWidth,
      height = this.viewport.clientHeight;
    const minimum = { narrow: 22, comfortable: 44, wide: 76 }[
      this.settings.margin
    ];
    const x = Math.min(width * 0.22, Math.max(minimum, (width - 740) / 2));
    const y = Math.max(22, Math.min(44, height * 0.07));
    const color = themes[this.settings.theme];
    const values: Record<string, string> = {
      "--folio-w": width + "px",
      "--folio-h": height + "px",
      "--folio-x": x + "px",
      "--folio-y": y + "px",
      "--folio-font": fontFamilies[this.settings.font],
      "--folio-size": this.settings.size + "px",
      "--folio-leading": String(this.settings.lineHeight),
      "--folio-bg": color.background,
      "--folio-fg": color.color,
    };
    for (const [k, v] of Object.entries(values)) root.style.setProperty(k, v);
    root.style.colorScheme = this.settings.theme === "night" ? "dark" : "light";
  }
  private get rtl() {
    return this.viewport.dir === "rtl";
  }
  get rightToLeft() {
    return this.rtl;
  }
  private get scrollX() {
    return (this.rtl ? -1 : 1) * this.viewport.scrollLeft;
  }
  private rebuildNodes() {
    this.nodes = [];
    this.starts.clear();
    const walker = this.doc.createTreeWalker(
      this.content,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (n) =>
          n.parentElement?.closest("style,script")
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT,
      },
    );
    let offset = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      this.starts.set(node, offset);
      this.nodes.push({ node, start: offset, end: offset + node.length });
      offset += node.length;
    }
  }
  refresh() {
    if (this.disposed) return;
    this.rebuildNodes();
  }
  configure(settings: ReadingSettings) {
    if (this.disposed) return;
    const changed =
      layoutKey(
        settings,
        this.viewport.clientWidth,
        this.viewport.clientHeight,
      ) !==
      layoutKey(
        this.settings,
        this.viewport.clientWidth,
        this.viewport.clientHeight,
      );
    this.settings = settings;
    if (changed) this.layout(this.offset);
    else this.apply();
  }
  private schedule() {
    if (this.frame || !this.ready) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (!this.disposed) this.layout(this.offset);
    });
  }
  private layout(offset?: number, progress = 0, page?: number | "last") {
    if (this.disposed) return;
    this.apply();
    this.track.style.width = "";
    this.track.style.minHeight = "";
    this.viewport.scrollTo(0, 0);
    const width = Math.max(1, this.viewport.clientWidth),
      height = Math.max(1, this.viewport.clientHeight);
    if (this.settings.mode === "horizontal") {
      this.total = Math.max(
        1,
        Math.ceil((this.content.scrollWidth - 1) / width),
      );
      this.track.style.width = this.total * width + "px";
    } else {
      this.total = Math.max(
        1,
        Math.ceil((this.content.offsetHeight - 1) / height),
      );
      this.track.style.minHeight = this.total * height + "px";
    }
    const target =
      page === "last"
        ? this.total
        : typeof page === "number"
          ? page
          : offset !== undefined
            ? this.pageForOffset(offset)
            : 1 + Math.round(progress * (this.total - 1));
    this.movePage(target, offset);
  }
  pageForOffset(offset: number) {
    let low = 0,
      high = this.nodes.length - 1,
      found = this.nodes.at(-1);
    while (low <= high) {
      const mid = (low + high) >> 1;
      const candidate = this.nodes[mid]!;
      if (offset < candidate.start) high = mid - 1;
      else if (offset >= candidate.end) low = mid + 1;
      else {
        found = candidate;
        break;
      }
    }
    if (!found || !found.node.isConnected || !found.node.length) return 1;
    const r = this.doc.createRange();
    const index = Math.max(
      0,
      Math.min(found.node.length - 1, offset - found.start),
    );
    r.setStart(found.node, index);
    r.setEnd(found.node, index + 1);
    const rect = r.getBoundingClientRect(),
      view = this.viewport.getBoundingClientRect();
    const axis =
      this.settings.mode === "horizontal"
        ? (this.rtl ? view.right - rect.right : rect.left - view.left) +
          this.scrollX
        : rect.top - view.top + this.viewport.scrollTop;
    const size =
      this.settings.mode === "horizontal"
        ? this.viewport.clientWidth
        : this.viewport.clientHeight;
    return Math.min(
      this.total,
      Math.max(1, 1 + Math.floor((axis + 0.5) / Math.max(1, size))),
    );
  }
  private capture() {
    const view = this.viewport.getBoundingClientRect();
    const style = this.doc.documentElement.style;
    const x = parseFloat(style.getPropertyValue("--folio-x")) || 30,
      y = parseFloat(style.getPropertyValue("--folio-y")) || 30;
    const caret = (
      this.doc as Document & {
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
      }
    ).caretRangeFromPoint?.(
      this.rtl ? view.right - x - 2 : view.left + x + 2,
      view.top + y + 3,
    );
    if (caret) {
      const start = this.starts.get(caret.startContainer);
      if (start !== undefined) return start + caret.startOffset;
    }
    // Fallback for engines that cannot obtain a caret at a column's leading edge.
    for (const item of this.nodes) {
      const r = this.doc.createRange();
      r.selectNodeContents(item.node);
      if (
        Array.from(r.getClientRects()).some(
          (b) =>
            b.width &&
            b.height &&
            b.right > view.left + x &&
            b.left < view.right - x &&
            b.bottom > view.top + y &&
            b.top < view.bottom - y,
        )
      )
        return item.start;
    }
    return this.offset;
  }
  private publish() {
    if (this.disposed) return;
    const size =
      this.settings.mode === "horizontal"
        ? this.viewport.clientWidth
        : this.viewport.clientHeight;
    const scroll =
      this.settings.mode === "horizontal"
        ? this.scrollX
        : this.viewport.scrollTop;
    this.current = Math.min(
      this.total,
      Math.max(1, 1 + Math.floor((scroll + 1) / Math.max(1, size))),
    );
    if (this.layoutAnchor && Math.abs(scroll - this.layoutAnchor.scroll) < 1)
      this.offset = this.layoutAnchor.offset;
    else {
      this.layoutAnchor = undefined;
      this.offset = this.options.interactive === false ? 0 : this.capture();
    }
    this.options.onChange?.({
      page: this.current,
      pages: this.total,
      offset: this.offset,
      progress: this.total > 1 ? (this.current - 1) / (this.total - 1) : 0,
      key: layoutKey(
        this.settings,
        this.viewport.getBoundingClientRect().width,
        this.viewport.getBoundingClientRect().height,
      ),
    });
  }
  goToPage(page: number) {
    this.movePage(page);
  }
  private movePage(page: number, anchor?: number) {
    if (this.disposed) return;
    this.current = Math.max(1, Math.min(this.total, Math.round(page)));
    if (this.settings.mode === "horizontal")
      this.viewport.scrollTo({
        left:
          (this.rtl ? -1 : 1) * (this.current - 1) * this.viewport.clientWidth,
        top: 0,
        behavior: "instant",
      });
    else
      this.viewport.scrollTo({
        left: 0,
        top: (this.current - 1) * this.viewport.clientHeight,
        behavior: "instant",
      });
    this.layoutAnchor =
      anchor === undefined
        ? undefined
        : {
            offset: anchor,
            scroll:
              this.settings.mode === "horizontal"
                ? this.scrollX
                : this.viewport.scrollTop,
          };
    this.publish();
  }
  goToOffset(offset: number) {
    this.movePage(this.pageForOffset(offset), offset);
  }
  goToElement(el: Element) {
    const rect = el.getBoundingClientRect(),
      view = this.viewport.getBoundingClientRect();
    const axis =
      this.settings.mode === "horizontal"
        ? (this.rtl ? view.right - rect.right : rect.left - view.left) +
          this.scrollX
        : rect.top - view.top + this.viewport.scrollTop;
    this.goToPage(
      1 +
        Math.floor(
          (axis + 0.5) /
            Math.max(
              1,
              this.settings.mode === "horizontal"
                ? this.viewport.clientWidth
                : this.viewport.clientHeight,
            ),
        ),
    );
  }
  turn(direction: number) {
    const target = this.current + direction;
    if (target < 1 || target > this.total) this.options.onBoundary?.(direction);
    else this.goToPage(target);
  }
  destroy() {
    this.disposed = true;
    this.ready = false;
    this.resize?.disconnect();
    cancelAnimationFrame(this.frame);
    clearTimeout(this.timer);
    for (const cleanup of this.cleanup) cleanup();
  }
}
export class ChapterCounter {
  private frame: HTMLIFrameElement;
  private paginator?: Paginator;
  constructor(width: number, height: number) {
    this.frame = document.createElement("iframe");
    this.frame.setAttribute("sandbox", "allow-same-origin");
    this.frame.setAttribute("aria-hidden", "true");
    this.frame.tabIndex = -1;
    this.frame.title = "Chapter page measurement";
    this.frame.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;border:0;visibility:hidden;pointer-events:none`;
    document.body.append(this.frame);
  }
  async count(html: string, settings: ReadingSettings, signal: AbortSignal) {
    signal.throwIfAborted();
    this.paginator?.destroy();
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(new DOMException("Page counting canceled", "AbortError"));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        reject(Error("Chapter counting timed out"));
      }, 10000);
      signal.addEventListener("abort", abort, { once: true });
      this.frame.onload = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        resolve();
      };
      this.frame.srcdoc = createReadingDocument(html);
    });
    signal.throwIfAborted();
    let pages = 1;
    this.paginator = new Paginator(this.frame.contentDocument!, settings, {
      interactive: false,
      onChange: (s) => {
        pages = s.pages;
      },
    });
    await this.paginator.start();
    signal.throwIfAborted();
    return pages;
  }
  destroy() {
    this.paginator?.destroy();
    this.frame.remove();
  }
}
