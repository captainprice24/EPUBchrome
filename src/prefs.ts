// Small reader preferences kept in localStorage. Key names are part of what
// existing installations have stored; changing one resets that preference.
export type InterfaceTheme = "system" | "light" | "dark" | "pages";

export function readChoice<T extends string>(
  key: string,
  choices: readonly T[],
  fallback: T,
): T {
  try {
    const value = localStorage.getItem(key);
    return choices.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writePreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Preferences are optional; reading continues without them. */
  }
}

export interface BackupRecord {
  at: number;
  items: number;
}

export function readLastBackup(): BackupRecord | undefined {
  try {
    const value = JSON.parse(localStorage.getItem("folio-last-backup") || "");
    return Number.isFinite(value?.at) && Number.isFinite(value?.items)
      ? { at: value.at, items: value.items }
      : undefined;
  } catch {
    return undefined;
  }
}

/** A reminder is due when the library has items that no full backup covers,
 * or when the last full backup is more than 30 days old. */
export function backupReminder(
  last: BackupRecord | undefined,
  items: number,
  now = Date.now(),
): string {
  if (!items) return "";
  if (!last) return "No backup yet";
  const days = Math.floor((now - last.at) / 86400000);
  if (items > last.items)
    return `${items - last.items} new since your last backup`;
  return days >= 30 ? `Last backup ${days} days ago` : "";
}
