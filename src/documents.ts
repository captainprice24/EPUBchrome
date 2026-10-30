import { Epub } from "./epub";
import {
  checkDocumentSize,
  type DocumentFormat,
  type DocumentEngine,
} from "./document-types";

export async function openDocument(
  blob: Blob,
  format: DocumentFormat = "epub",
  name = "Untitled document",
  prepared?: Blob,
): Promise<DocumentEngine> {
  checkDocumentSize(blob, format);
  if (format === "pdf" || format === "djvu") {
    const { openFixedDocument } = await import("./fixed-document");
    return openFixedDocument(blob, format, name);
  }
  let content = blob;
  if (format === "mobi" || format === "md") {
    const { prepareReflowDocument } = await import("./reflow-document");
    content = prepared || (await prepareReflowDocument(blob, format, name));
  }
  const engine = new Epub(content);
  try {
    await engine.open();
    if (format === "epub" && engine.title === "Untitled book")
      engine.title =
        name
          .replace(/\.epub$/i, "")
          .trim()
          .slice(0, 10000) || engine.title;
    engine.format = format;
    if (format !== "epub") engine.prepared = content;
    return engine;
  } catch (error) {
    await engine.close().catch(() => {});
    throw error;
  }
}
