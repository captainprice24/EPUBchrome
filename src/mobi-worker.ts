import { initMobiFile, initKf8File } from "@lingo-reader/mobi-parser";

// The binary parser runs in a disposable worker; it never renders book markup.
self.onmessage = async (event: MessageEvent<Blob>) => {
  const owned = new Map<string, Blob>();
  const create = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => {
    if (!(blob instanceof Blob)) throw Error("Unexpected MOBI resource type.");
    const url = create(blob);
    owned.set(url, blob);
    return url;
  };
  let parser:
    | Awaited<ReturnType<typeof initMobiFile>>
    | Awaited<ReturnType<typeof initKf8File>>
    | undefined;
  try {
    const bytes = new Uint8Array(await event.data.arrayBuffer()),
      data = new DataView(bytes.buffer);
    if (
      bytes.length < 86 ||
      new TextDecoder().decode(bytes.subarray(60, 68)) !== "BOOKMOBI"
    )
      throw Error("This is not a supported MOBI file.");
    const count = data.getUint16(76),
      first = data.getUint32(78);
    if (!count || 78 + count * 8 > bytes.length || first + 248 > bytes.length)
      throw Error("Invalid MOBI record table.");
    let previous = 78 + count * 8 - 1;
    for (let i = 0; i < count; i++) {
      const offset = data.getUint32(78 + i * 8);
      if (offset <= previous || offset >= bytes.length)
        throw Error("Invalid MOBI record offsets.");
      previous = offset;
    }
    const validateHeader = (index: number) => {
      if (index >= count) throw Error("Invalid MOBI text record.");
      const start = data.getUint32(78 + index * 8);
      const end =
        index + 1 < count ? data.getUint32(78 + (index + 1) * 8) : bytes.length;
      if (
        start + 248 > end ||
        new TextDecoder().decode(bytes.subarray(start + 16, start + 20)) !==
          "MOBI"
      )
        throw Error("Invalid MOBI header.");
      if (data.getUint16(start + 12) !== 0)
        throw Error(
          "DRM-protected MOBI books cannot be opened. Use a DRM-free original.",
        );
      const textRecords = data.getUint16(start + 8);
      if (index + textRecords >= count)
        throw Error("Missing MOBI text records.");
      if (
        data.getUint32(start + 4) > 64 * 1024 ** 2 ||
        textRecords * Math.max(4096, data.getUint16(start + 10)) >
          64 * 1024 ** 2
      )
        throw Error("The expanded MOBI text exceeds the 64 MB safety limit.");
      let boundary: number | undefined;
      if (data.getUint32(start + 128) & 64) {
        const exth = start + 16 + data.getUint32(start + 20);
        if (
          exth + 12 > end ||
          new TextDecoder().decode(bytes.subarray(exth, exth + 4)) !== "EXTH"
        )
          throw Error("Invalid MOBI metadata.");
        const limit = exth + data.getUint32(exth + 4),
          records = data.getUint32(exth + 8);
        if (limit > end || records > 10000)
          throw Error("MOBI metadata exceeds its safety limit.");
        let offset = exth + 12;
        for (let i = 0; i < records; i++) {
          if (offset + 8 > limit) throw Error("Invalid MOBI metadata record.");
          const type = data.getUint32(offset),
            length = data.getUint32(offset + 4);
          if (length < 8 || offset + length > limit)
            throw Error("Invalid MOBI metadata length.");
          if (type === 121 && length >= 12)
            boundary = data.getUint32(offset + 8);
          offset += length;
        }
      }
      return { version: data.getUint32(start + 36), boundary };
    };
    const header = validateHeader(0);
    let kf8 = header.version >= 8;
    if (
      !kf8 &&
      header.boundary !== undefined &&
      header.boundary !== 0xffffffff
    ) {
      if (validateHeader(header.boundary).version < 8)
        throw Error("Invalid hybrid MOBI/KF8 header.");
      kf8 = true;
    }
    parser = await (kf8 ? initKf8File(bytes) : initMobiFile(bytes));
    const spine = parser.getSpine();
    if (!spine.length || spine.length > 30000)
      throw Error("This MOBI has no readable chapters or too many sections.");
    const chapters = spine.map((chapter) => {
      const result = parser!.loadChapter(chapter.id);
      if (!result) throw Error("A MOBI chapter could not be decoded.");
      return { id: chapter.id, html: result.html, css: result.css };
    });
    if (
      chapters.reduce((size, chapter) => size + chapter.html.length, 0) >
      64 * 1024 ** 2
    )
      throw Error("Expanded MOBI text exceeds the safety limit.");
    const links = new Set<string>();
    const toc = parser.getToc();
    const walk = (items: typeof toc) => {
      for (const item of items) {
        links.add(item.href);
        if (item.children) walk(item.children);
      }
    };
    walk(toc);
    for (const chapter of chapters)
      for (const match of chapter.html.matchAll(
        /href\s*=\s*["']([^"']+)["']/gi,
      ))
        links.add(match[1]!);
    const targets = Array.from(links, (href) => ({
      href,
      target: parser!.resolveHref(href),
    }));
    let cover = "";
    try {
      cover = parser.getCoverImage();
    } catch {
      /* optional cover */
    }
    let size = 0;
    const assets = Array.from(owned, ([url, blob]) => {
      size += blob.size;
      if (size > 128 * 1024 ** 2)
        throw Error("MOBI resources exceed the 128 MB safety limit.");
      return { url, blob };
    });
    self.postMessage({
      metadata: parser.getMetadata(),
      chapters,
      toc,
      targets,
      assets,
      cover,
    });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "This MOBI could not be decoded.",
    });
  } finally {
    parser?.destroy();
    for (const url of owned.keys()) URL.revokeObjectURL(url);
  }
};
