import type { Chapter, Nav, Rendered } from "./epub";
export type DocumentFormat = "epub" | "pdf" | "djvu" | "mobi" | "md";
export interface RenderOptions {
  width: number;
  height: number;
  zoom: number;
  mode: "horizontal" | "vertical";
  pixelRatio: number;
}
export interface DocumentEngine {
  format: DocumentFormat;
  fixedPages: boolean;
  title: string;
  author: string;
  chapters: Chapter[];
  toc: Nav[];
  pages: Nav[];
  linearCount: number;
  fixedLayout: boolean;
  prepared?: Blob;
  coverPath?: string;
  blob(path: string): Promise<Blob>;
  render(
    index: number,
    signal?: AbortSignal,
    options?: RenderOptions,
  ): Promise<Rendered>;
  chapterSize(index: number): number;
  releaseResources(): void;
  close(): Promise<void>;
}
export const formatNames: Record<DocumentFormat, string> = {
  epub: "EPUB",
  pdf: "PDF",
  djvu: "DjVu",
  mobi: "MOBI",
  md: "Markdown",
};
export const mimeTypes: Record<DocumentFormat, string> = {
  epub: "application/epub+zip",
  pdf: "application/pdf",
  djvu: "image/vnd.djvu",
  mobi: "application/x-mobipocket-ebook",
  md: "text/markdown",
};
export const documentAccept =
  ".epub,.pdf,.djvu,.djv,.mobi,.md,.markdown,application/epub+zip,application/pdf,image/vnd.djvu,application/x-mobipocket-ebook,text/markdown";
export function detectFormat(name: string, mime = ""): DocumentFormat {
  const extension = name.toLowerCase().split(".").pop();
  if (extension === "djv" || extension === "djvu") return "djvu";
  if (extension === "markdown" || extension === "md") return "md";
  if (extension === "epub" || extension === "pdf" || extension === "mobi")
    return extension;
  const format = (Object.keys(mimeTypes) as DocumentFormat[]).find(
    (f) => mimeTypes[f] === mime,
  );
  if (format) return format;
  throw Error("Choose an EPUB, PDF, DjVu, MOBI or Markdown file.");
}
export const documentSizeLimit = (format: DocumentFormat) =>
  format === "md"
    ? 16 * 1024 ** 2
    : format === "mobi"
      ? 64 * 1024 ** 2
      : 1024 ** 3;
export function checkDocumentSize(blob: Blob, format: DocumentFormat) {
  const limit = documentSizeLimit(format);
  if (!blob.size) throw Error("This document is empty.");
  if (blob.size > limit)
    throw Error(
      `${formatNames[format]} files must be below ${limit / 1024 ** 2} MB in this version.`,
    );
}
