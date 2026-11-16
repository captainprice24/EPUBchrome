import { describe, expect, it } from "vitest";
import { backupReminder } from "../../src/prefs";

const day = 86400000;
describe("backupReminder", () => {
  const now = 100 * day;
  it("stays quiet for an empty library and a recent full backup", () => {
    expect(backupReminder(undefined, 0, now)).toBe("");
    expect(backupReminder({ at: now - 3 * day, items: 4 }, 4, now)).toBe("");
    expect(backupReminder({ at: now - 3 * day, items: 6 }, 4, now)).toBe("");
  });
  it("asks for a first backup", () => {
    expect(backupReminder(undefined, 2, now)).toBe("No backup yet");
  });
  it("counts items added since the last full backup", () => {
    expect(backupReminder({ at: now - day, items: 4 }, 7, now)).toBe(
      "3 new since your last backup",
    );
  });
  it("reminds after thirty days", () => {
    expect(backupReminder({ at: now - 45 * day, items: 4 }, 4, now)).toBe(
      "Last backup 45 days ago",
    );
  });
});
