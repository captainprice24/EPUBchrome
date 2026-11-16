import { textNodes } from "./locators";

export interface TextMatch {
  start: number;
  end: number;
}

/** Case-insensitive matches in a chapter's text. Runs of whitespace in the
 * query match any whitespace, so a phrase is found across line breaks. */
export function findMatches(
  text: string,
  query: string,
  limit = 5000,
): TextMatch[] {
  const words = query.trim();
  if (!words) return [];
  const pattern = new RegExp(
    words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"),
    "giu",
  );
  const matches: TextMatch[] = [];
  for (
    let match = pattern.exec(text);
    match && matches.length < limit;
    match = pattern.exec(text)
  ) {
    if (!match[0].length) pattern.lastIndex++;
    else
      matches.push({ start: match.index, end: match.index + match[0].length });
  }
  return matches;
}

/** First match at or after an offset, wrapping to the start of the chapter. */
export function matchFrom(matches: TextMatch[], offset: number): number {
  const index = matches.findIndex((match) => match.end > offset);
  return index < 0 ? 0 : index;
}

/** Text offsets use the same node sequence as saved locators, so a match may
 * begin and end in different elements. */
export function rangeForOffsets(
  doc: Document,
  start: number,
  end: number,
): Range | undefined {
  const range = doc.createRange();
  let cursor = 0,
    started = false;
  for (const node of textNodes(doc)) {
    const next = cursor + node.length;
    if (!started && start < next) {
      range.setStart(node, start - cursor);
      started = true;
    }
    if (started && end <= next) {
      range.setEnd(node, end - cursor);
      return range;
    }
    cursor = next;
  }
  return undefined;
}
