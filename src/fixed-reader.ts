import { readerDocument } from "./epub";
import {
  layoutKey,
  themes,
  type ReadingSettings,
  type PageSnapshot,
  type Options,
} from "./reader";
import { textNodes } from "./locators";

// Text-layer positioning follows PDF.js's viewer CSS (Apache-2.0). Rendering
// stays scriptless inside the book iframe; only Folio operates its DOM.
export function createFixedReadingDocument(content: string) {
  return readerDocument(
    `<div id="folio-viewport" tabindex="0" aria-label="Document page"><div id="folio-track"><article id="folio-content">${content}</article></div></div>`,
  ).replace(
    "</head>",
    `<style>
html,body{width:100%;height:100%;margin:0!important;padding:0!important;max-width:none!important;overflow:hidden;background:var(--folio-bg,#edf0e5)!important}
#folio-viewport{position:fixed;inset:0;overflow:auto;overscroll-behavior:contain;outline:none}
#folio-track{box-sizing:border-box;min-width:100%;min-height:100%;width:max-content;display:flex;align-items:center;justify-content:center;padding:16px}
#folio-content{position:relative;flex-shrink:0;margin:0;padding:0;max-width:none;background:white;box-shadow:0 1px 8px #0002}
#folio-content>[data-folio-html]{transform:scale(var(--fixed-scale,1));transform-origin:0 0}
.folio-native-page{position:relative;background:white;color:black;overflow:hidden}
.folio-native-page>img{position:absolute;inset:0;width:100%;height:100%;max-width:none;user-select:none}
.textLayer,.djvu-text-layer{position:absolute;inset:0;overflow:clip;line-height:1;letter-spacing:normal;word-spacing:normal;text-align:initial;transform-origin:0 0;--total-scale-factor:1;--scale-round-x:1px;--scale-round-y:1px;--min-font-size:1;--text-scale-factor:calc(var(--total-scale-factor)*var(--min-font-size));--min-font-size-inv:calc(1/var(--min-font-size));text-size-adjust:none}
.textLayer :is(span,br),.djvu-text-layer span{position:absolute;color:transparent;white-space:pre;cursor:text;transform-origin:0 0;user-select:text}
.textLayer>:not(.markedContent),.textLayer .markedContent span:not(.markedContent){z-index:1;--font-height:0;font-size:calc(var(--text-scale-factor)*var(--font-height));--scale-x:1;--rotate:0deg;transform:rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv))}
.textLayer .markedContent{display:contents}
.textLayer[data-main-rotation="90"]{transform:rotate(90deg) translateY(-100%)}.textLayer[data-main-rotation="180"]{transform:rotate(180deg) translate(-100%,-100%)}.textLayer[data-main-rotation="270"]{transform:rotate(270deg) translateX(-100%)}
.folio-native-page mark[data-folio]{color:transparent!important;background:#ffd44870!important}
.folio-native-page ::selection{background:#4a90e266;color:transparent}
.native-link{position:absolute;display:block;z-index:3}.native-link:focus-visible{outline:3px solid #2158a3}
@media print{#folio-viewport{position:static;overflow:visible}#folio-track{padding:0}#folio-content{box-shadow:none}}
</style></head>`,
  );
}
export class FixedPaginator {
  private viewport: HTMLElement;
  private content: HTMLElement;
  private publisher: HTMLElement;
  private resize?: ResizeObserver;
  private cleanup: (() => void)[] = [];
  private disposed = false;
  private wheel = 0;
  private wheelTime = 0;
  private touch?: { x: number; y: number };
  readonly rightToLeft = false;
  constructor(
    private doc: Document,
    private settings: ReadingSettings,
    private size: { width: number; height: number },
    private options: Options,
  ) {
    this.viewport = doc.getElementById("folio-viewport")!;
    this.content = doc.getElementById("folio-content")!;
    this.publisher = this.content.querySelector("[data-folio-html]")!;
  }
  private listen(
    target: EventTarget,
    name: string,
    callback: EventListener,
    options?: AddEventListenerOptions,
  ) {
    target.addEventListener(name, callback, options);
    this.cleanup.push(() =>
      target.removeEventListener(name, callback, options),
    );
  }
  async start() {
    await Promise.all(
      Array.from(this.doc.images, (img) => img.decode().catch(() => {})),
    );
    if (this.disposed) return;
    this.layout();
    this.viewport.scrollTop =
      (this.options.progress || 0) *
      Math.max(0, this.viewport.scrollHeight - this.viewport.clientHeight);
    this.publish();
    this.resize = new ResizeObserver(() => this.layout());
    this.resize.observe(this.viewport);
    this.listen(this.viewport, "scroll", () => this.publish());
    this.listen(this.doc, "keydown", (event) => {
      const e = event as KeyboardEvent;
      if (
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        (e.target as Element).closest("input,textarea,select,button")
      )
        return;
      if (["ArrowRight", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        this.turn(e.shiftKey ? -1 : 1);
      } else if (["ArrowLeft", "PageUp"].includes(e.key)) {
        e.preventDefault();
        this.turn(-1);
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        this.options.onDocumentPage?.(
          e.key === "Home" ? 0 : (this.options.documentPages || 1) - 1,
        );
      }
    });
    this.listen(
      this.viewport,
      "wheel",
      (event) => {
        const e = event as WheelEvent;
        if (e.ctrlKey) return;
        const delta =
          Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (this.viewport.scrollHeight > this.viewport.clientHeight + 2) {
          if (
            delta > 0 &&
            this.viewport.scrollTop <
              this.viewport.scrollHeight - this.viewport.clientHeight - 2
          )
            return;
          if (delta < 0 && this.viewport.scrollTop > 2) return;
        }
        if (
          this.viewport.scrollWidth > this.viewport.clientWidth + 2 &&
          Math.abs(e.deltaX) > Math.abs(e.deltaY)
        )
          return;
        e.preventDefault();
        if (performance.now() - this.wheelTime < 350) return;
        if (Math.sign(delta) !== Math.sign(this.wheel)) this.wheel = 0;
        this.wheel +=
          delta *
          (e.deltaMode === 1
            ? 16
            : e.deltaMode === 2
              ? this.viewport.clientHeight
              : 1);
        if (Math.abs(this.wheel) >= 45) {
          this.turn(this.wheel > 0 ? 1 : -1);
          this.wheel = 0;
          this.wheelTime = performance.now();
        }
      },
      { passive: false },
    );
    this.listen(
      this.viewport,
      "touchstart",
      (event) => {
        const t = (event as TouchEvent).touches[0];
        if (t) this.touch = { x: t.clientX, y: t.clientY };
      },
      { passive: true },
    );
    this.listen(
      this.viewport,
      "touchend",
      (event) => {
        const t = (event as TouchEvent).changedTouches[0];
        if (
          this.settings.mode === "horizontal" &&
          (this.settings.zoom || 1) === 1 &&
          this.touch &&
          t &&
          this.doc.getSelection()?.isCollapsed
        ) {
          const x = t.clientX - this.touch.x,
            y = t.clientY - this.touch.y;
          if (Math.abs(x) > 45 && Math.abs(x) > Math.abs(y))
            this.turn(x < 0 ? 1 : -1);
        }
        this.touch = undefined;
      },
      { passive: true },
    );
  }
  private layout() {
    if (this.disposed) return;
    this.doc.documentElement.dataset.readingMode = this.settings.mode;
    const old =
      this.viewport.scrollTop /
      Math.max(1, this.viewport.scrollHeight - this.viewport.clientHeight);
    const { width, height } = this.size,
      w = this.viewport.clientWidth,
      h = this.viewport.clientHeight;
    const fit =
      this.settings.mode === "vertical"
        ? (w - 32) / width
        : Math.min((w - 32) / width, (h - 32) / height);
    const scale = Math.max(0.05, fit * (this.settings.zoom || 1));
    this.publisher.style.setProperty("--fixed-scale", String(scale));
    this.content.style.width = `${width * scale}px`;
    this.content.style.height = `${height * scale}px`;
    this.doc.documentElement.style.setProperty(
      "--folio-bg",
      themes[this.settings.theme].background,
    );
    this.viewport.scrollTop =
      old *
      Math.max(0, this.viewport.scrollHeight - this.viewport.clientHeight);
    this.publish();
  }
  private publish() {
    if (this.disposed) return;
    const rect = this.viewport.getBoundingClientRect();
    const snapshot: PageSnapshot = {
      page: 1,
      pages: 1,
      offset: 0,
      progress:
        this.viewport.scrollTop /
        Math.max(1, this.viewport.scrollHeight - this.viewport.clientHeight),
      key: layoutKey(this.settings, rect.width, rect.height),
    };
    this.options.onChange?.(snapshot);
  }
  configure(settings: ReadingSettings) {
    this.settings = settings;
    this.layout();
  }
  turn(direction: number) {
    this.options.onBoundary?.(direction);
  }
  refresh() {}
  pageForOffset(_offset?: number) {
    return 1;
  }
  goToPage(_page?: number) {
    this.viewport.scrollTop = 0;
    this.publish();
  }
  goToOffset(offset: number) {
    let current = 0;
    for (const node of textNodes(this.doc)) {
      if (current + node.length > offset) {
        node.parentElement?.scrollIntoView({
          block: "center",
          inline: "nearest",
        });
        return;
      }
      current += node.length;
    }
  }
  goToElement(element: Element) {
    element.scrollIntoView({ block: "center", inline: "nearest" });
  }
  destroy() {
    this.disposed = true;
    this.resize?.disconnect();
    for (const fn of this.cleanup) fn();
    this.cleanup = [];
  }
}
