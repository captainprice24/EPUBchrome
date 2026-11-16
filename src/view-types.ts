// Small shared types of the views split out of App.tsx.
import type { LibraryCollection } from "./store";
import type { storageStatus } from "./storage";

export type LibraryFilter = LibraryCollection | "bookmarks" | "highlights";
export type LibrarySort = "recent" | "added" | "title" | "author";
export type ModalName =
  | "drive"
  | "print"
  | "delete"
  | "reading"
  | "storage"
  | "details";
export type NoticeKind = "info" | "warning" | "success";
export interface BookDetails {
  id: string;
  title: string;
  author: string;
}
export type StorageStatus = Awaited<ReturnType<typeof storageStatus>>;
