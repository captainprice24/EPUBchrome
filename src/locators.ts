import { sha256 } from "@noble/hashes/sha2.js";
export const RENDERER_VERSION = 4;
export interface TextLocator {
  version: 1;
  spineHref: string;
  rendererVersion: number;
  offsetHint: number;
  textHash?: string;
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
  fingerprint?: string,
): TextLocator | undefined {
  start = Math.max(0, Math.min(start, text.length));
  end = Math.min(end, text.length);
  if (end <= start || !text.slice(start, end).trim()) return;
  const locator: TextLocator = {
    version: 1,
    spineHref,
    rendererVersion: RENDERER_VERSION,
    offsetHint: start,
    textQuote: {
      exact: text.slice(start, end),
      prefix: text.slice(Math.max(0, start - 256), start),
      suffix: text.slice(end, end + 256),
    },
  };
  locator.textHash = fingerprint || textFingerprint(text);
  return locator;
}
const textFingerprint = (text: string) =>
  Array.from(sha256(new TextEncoder().encode(text)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
export function textHasher(text: string) {
  let hash: string | undefined;
  return () => (hash ??= textFingerprint(text));
}
export function locatorFactory(text: string, href: string) {
  const hash = textHasher(text);
  return (start: number, end?: number) =>
    quoteLocator(text, href, start, end, hash());
}
const normalize = (text: string) => text.replace(/\s+/g, " ");
export function resolveLocator(
  text: string,
  locator: TextLocator,
  fingerprint = textHasher(text),
): { start: number; end: number } | null {
  const quote = locator.textQuote;
  if (!quote.exact.trim()) return null;
  // Same renderer alone is insufficient. Verify the complete text fingerprint
  // and the exact quote at its saved offset before trusting that offset.
  const start = locator.offsetHint,
    end = start + quote.exact.length;
  if (
    locator.rendererVersion === RENDERER_VERSION &&
    locator.textHash &&
    Number.isSafeInteger(start) &&
    start >= 0 &&
    text.slice(start, end) === quote.exact &&
    locator.textHash === fingerprint()
  )
    return { start, end };

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
  // Unverified legacy or changed-text ties must stay in review.
  if (candidates.length > 1 && candidates[0]!.score === candidates[1]!.score)
    return null;
  const best = candidates[0]!;
  return { start: best.start, end: best.end };
}
