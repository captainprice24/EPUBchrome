import type { Mark } from "./store";
import { textNodes as nodes, documentText, resolveLocator } from "./locators";
export function selectionOffsets(doc: Document) {
  const s = doc.getSelection();
  if (!s?.rangeCount || s.isCollapsed) return null;
  const range = s.getRangeAt(0);
  const list = nodes(doc);
  let cursor = 0,
    start = -1,
    end = -1;
  for (const n of list) {
    if (n === range.startContainer) start = cursor + range.startOffset;
    if (n === range.endContainer) end = cursor + range.endOffset;
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
  const href = doc
    .querySelector("[data-folio-html]")
    ?.getAttribute("data-folio-html");
  const resolved = marks.flatMap((mark) => {
    const range =
      mark.locator && mark.locator.spineHref === href
        ? resolveLocator(text, mark.locator)
        : null;
    if (!range) {
      unresolved.push(mark.id);
      return [];
    }
    return [{ ...mark, ...range }];
  });
  for (const mark of [...resolved].sort(
    (a, b) => (b.start || 0) - (a.start || 0),
  )) {
    if (mark.start === undefined || mark.end === undefined) continue;
    let cursor = 0;
    const selected: { node: Text; from: number; to: number }[] = [];
    for (const node of nodes(doc)) {
      const from = Math.max(0, mark.start - cursor),
        to = Math.min(node.length, mark.end - cursor);
      if (to > from) selected.push({ node, from, to });
      cursor += node.length;
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
