import init, {
  WasmDocument,
  WasmLazyDocument,
  wasmSimd128Supported,
} from "djvu-rs";
let full: WasmDocument | undefined, lazy: WasmLazyDocument | undefined;
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent) => {
  queue = queue.then(async () => {
    const { id, command } = event.data;
    try {
      if (command === "open") {
        const { blob, scalar, simd } = event.data as {
          blob: Blob;
          scalar: string;
          simd: string;
        };
        await init(wasmSimd128Supported() ? simd : scalar);
        if (blob.size <= 64 * 1024 ** 2)
          full = WasmDocument.from_bytes(
            new Uint8Array(await blob.arrayBuffer()),
          );
        else
          lazy = await WasmLazyDocument.open(
            blob.size,
            async (offset: number, length: number) => {
              if (
                offset < 0 ||
                length > 128 * 1024 ** 2 ||
                offset + length > blob.size
              )
                throw Error("A DjVu page exceeds the range safety limit.");
              return new Uint8Array(
                await blob.slice(offset, offset + length).arrayBuffer(),
              );
            },
          );
        const count = full?.page_count() || lazy?.page_count() || 0;
        if (!count || count > 30000)
          throw Error(
            "This DjVu has no readable pages or exceeds 30,000 pages.",
          );
        self.postMessage({ id, result: { count } });
      } else if (command === "render") {
        const { index, options } = event.data;
        const page = full?.page(index);
        try {
          const info = page
            ? [
                page.width_at(page.dpi()),
                page.height_at(page.dpi()),
                page.dpi(),
              ]
            : Array.from(await lazy!.page_info(index));
          const [nativeWidth, nativeHeight, nativeDpi] = info as [
            number,
            number,
            number,
          ];
          if (!nativeWidth || !nativeHeight || !nativeDpi)
            throw Error("Invalid DjVu page dimensions.");
          const width = (nativeWidth * 96) / nativeDpi,
            height = (nativeHeight * 96) / nativeDpi;
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
          const dpi = Math.max(1, Math.floor(scale * 96));
          const estimateWidth = Math.ceil((nativeWidth * dpi) / nativeDpi),
            estimateHeight = Math.ceil((nativeHeight * dpi) / nativeDpi);
          if (
            estimateWidth * estimateHeight > 6500000 ||
            Math.max(estimateWidth, estimateHeight) > 4200
          )
            throw Error("DjVu page exceeds the render safety budget.");
          let pixels: Uint8ClampedArray, w: number, h: number;
          const pixmap = page ? undefined : await lazy!.render_page(index, dpi);
          try {
            w = page ? page.width_at(dpi) : pixmap!.width();
            h = page ? page.height_at(dpi) : pixmap!.height();
            if (w * h > 6500000 || !w || !h)
              throw Error("DjVu page exceeds the render safety budget.");
            pixels = page ? page.render(dpi) : pixmap!.to_bytes();
          } finally {
            pixmap?.free();
          }
          const canvas = new OffscreenCanvas(w, h);
          canvas
            .getContext("2d")!
            .putImageData(
              new ImageData(new Uint8ClampedArray(pixels), w, h),
              0,
              0,
            );
          const image = await canvas.convertToBlob({ type: "image/png" });
          let zones: unknown[] = [];
          if (page)
            try {
              zones = JSON.parse(page.text_zones_json(dpi) || "[]");
            } catch {
              /* image remains readable */
            }
          self.postMessage({
            id,
            result: {
              image,
              width,
              height,
              pixelWidth: w,
              pixelHeight: h,
              zones,
              lazy: !page,
            },
          });
        } finally {
          page?.free();
        }
      }
    } catch (error) {
      self.postMessage({
        id,
        error:
          error instanceof Error
            ? error.message
            : "DjVu decoding failed. Indirect documents need a bundled DjVu file.",
      });
    }
  });
};
