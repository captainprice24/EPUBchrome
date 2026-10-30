export const RENDERER_VERSION = 3;
export interface TextLocator {
  version: 1;
  spineHref: string;
  rendererVersion: number;
  offsetHint: number;
  textQuote: { exact: string; prefix: string; suffix: string };
}
export function textNodes(doc: Document) {
  const walker = doc.createTreeWalker(
    doc.getElementById("folio-content") || doc.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (n) =>
        n.parentElement?.closest("style,script")
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    },
  );
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  return nodes;
}
export const documentText = (doc: Document) =>
  textNodes(doc)
    .map((n) => n.data)
    .join("");
export function quoteLocator(
  text: string,
  spineHref: string,
  start: number,
  end = start + 96,
): TextLocator | undefined {
  start = Math.max(0, Math.min(start, text.length));
  end = Math.min(end, text.length);
  if (end <= start || !text.slice(start, end).trim()) return;
  return {
    version: 1,
    spineHref,
    rendererVersion: RENDERER_VERSION,
    offsetHint: start,
    textQuote: {
      exact: text.slice(start, end),
      prefix: text.slice(Math.max(0, start - 48), start),
      suffix: text.slice(end, end + 48),
    },
  };
}
const normalize = (text: string) => text.replace(/\s+/g, " ");
export function resolveLocator(
  text: string,
  locator: TextLocator,
): { start: number; end: number } | null {
  const quote = locator.textQuote;
  if (!quote.exact.trim()) return null;
  // Store only whitespace-run deltas, not a pair of numeric arrays for every
  // character. Large chapters must not allocate hundreds of MB for one locator.
  const changes: { at: number; removed: number }[] = [];
  let removed = 0;
  const normalized = text.replace(/\s+/g, (space, rawStart: number) => {
    const at = rawStart - removed;
    removed += space.length - 1;
    if (space.length > 1) changes.push({ at, removed });
    return " ";
  });
  const rawOffset = (index: number) => {
    let low = 0,
      high = changes.length - 1,
      delta = 0;
    while (low <= high) {
      const middle = (low + high) >> 1,
        change = changes[middle]!;
      if (change.at < index) {
        delta = change.removed;
        low = middle + 1;
      } else high = middle - 1;
    }
    return index + delta;
  };
  const exact = normalize(quote.exact),
    prefix = normalize(quote.prefix),
    suffix = normalize(quote.suffix);
  const candidates: { start: number; end: number; score: number }[] = [];
  for (
    let at = normalized.indexOf(exact);
    at >= 0;
    at = normalized.indexOf(exact, at + 1)
  ) {
    let score = 0;
    const before = normalized.slice(Math.max(0, at - prefix.length), at),
      after = normalized.slice(
        at + exact.length,
        at + exact.length + suffix.length,
      );
    for (let i = 1; i <= Math.min(before.length, prefix.length); i++) {
      if (before.at(-i) !== prefix.at(-i)) break;
      score++;
    }
    for (let i = 0; i < Math.min(after.length, suffix.length); i++) {
      if (after[i] !== suffix[i]) break;
      score++;
    }
    candidates.push({
      start: rawOffset(at),
      end: rawOffset(at + exact.length),
      score,
    });
    if (candidates.length > 10000) return null;
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  // Offsets are a hint only; ambiguity must not silently select another passage.
  if (candidates.length > 1 && candidates[0]!.score === candidates[1]!.score)
    return null;
  const { start, end } = candidates[0]!;
  return { start, end };
}
