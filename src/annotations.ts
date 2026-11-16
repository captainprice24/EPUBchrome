import type { Mark } from "./store";
import {
  textNodes as nodes,
  documentText,
  resolveLocator,
  textHasher,
} from "./locators";
export function selectionOffsets(doc: Document) {
  const s = doc.getSelection();
  if (!s?.rangeCount || s.isCollapsed) return null;
  const range = s.getRangeAt(0);
  const list = nodes(doc);
  let cursor = 0,
    start = -1,
    end = -1;
  for (const n of list) {
    // Select-all and touch selection can put range boundaries on elements,
    // rather than text nodes. Intersect accepted text nodes so both use the
    // same offsets as saved quote locators, without counting scripts/styles.
    if (range.intersectsNode(n)) {
      const from = n === range.startContainer ? range.startOffset : 0;
      const to = n === range.endContainer ? range.endOffset : n.length;
      if (to > from) {
        if (start < 0) start = cursor + from;
        end = cursor + to;
      }
    }
    cursor += n.length;
  }
  if (start < 0 || end < 0 || end <= start) return null;
  return { start, end, text: s.toString().slice(0, 10000) };
}
export function applyHighlights(doc: Document, marks: Mark[]) {
  const unresolved: string[] = [];
  for (const m of Array.from(doc.querySelectorAll("mark[data-folio]"))) {
    m.replaceWith(...m.childNodes);
  }
  doc.body.normalize();
  const text = documentText(doc);
  const fingerprint = textHasher(text);
  const href = doc
    .querySelector("[data-folio-html]")
    ?.getAttribute("data-folio-html");
  const resolved = marks.flatMap((mark) => {
    const range =
      mark.locator && mark.locator.spineHref === href
        ? resolveLocator(text, mark.locator, fingerprint)
        : null;
    if (!range) {
      unresolved.push(mark.id);
      return [];
    }
    return [{ ...mark, ...range }];
  });
  // Index the text nodes once. Marks are wrapped from the end of the chapter
  // backwards, so wrapping one never moves the text of an earlier mark. Only a
  // mark that overlaps the previous one needs a fresh index.
  const index = () => {
    let cursor = 0;
    return nodes(doc).map((node) => {
      const item = { node, start: cursor };
      cursor += node.length;
      return item;
    });
  };
  let list = index(),
    wrappedFrom = Infinity;
  for (const mark of [...resolved].sort(
    (a, b) => (b.start || 0) - (a.start || 0),
  )) {
    if (mark.start === undefined || mark.end === undefined) continue;
    if (mark.end > wrappedFrom) list = index();
    wrappedFrom = mark.start;
    let low = 0,
      high = list.length - 1,
      first = list.length;
    while (low <= high) {
      const middle = (low + high) >> 1,
        item = list[middle]!;
      if (item.start + item.node.length > mark.start) {
        first = middle;
        high = middle - 1;
      } else low = middle + 1;
    }
    const selected: { node: Text; from: number; to: number }[] = [];
    for (let i = first; i < list.length; i++) {
      const { node, start } = list[i]!;
      if (start >= mark.end) break;
      const from = Math.max(0, mark.start - start),
        to = Math.min(node.length, mark.end - start);
      if (to > from) selected.push({ node, from, to });
    }
    for (const { node, from, to } of selected.reverse()) {
      const range = doc.createRange();
      range.setStart(node, from);
      range.setEnd(node, to);
      const el = doc.createElement("mark");
      el.dataset.folio = mark.id;
      range.surroundContents(el);
    }
  }
  return unresolved;
}
