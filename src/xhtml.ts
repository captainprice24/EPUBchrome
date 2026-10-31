import type { RenderIssue } from "./render-issues";
import { decodeHTMLStrict } from "entities";

const namespaces = {
  epub: "http://www.idpf.org/2007/ops",
  xlink: "http://www.w3.org/1999/xlink",
  m: "http://www.w3.org/1998/Math/MathML",
  svg: "http://www.w3.org/2000/svg",
};
const voidTags = new Set(
  "area base br col embed hr img input link meta param source track wbr".split(
    " ",
  ),
);
// A linear scanner avoids rescanning an unterminated tag/comment for every <.
// Quotes protect > characters inside attributes; comments and CDATA stay whole.
function mapMarkup(source: string, map: (token: string) => string) {
  const output: string[] = [];
  let at = 0;
  while (at < source.length) {
    if (source[at] !== "<") {
      const next = source.indexOf("<", at);
      const end = next < 0 ? source.length : next;
      output.push(map(source.slice(at, end)));
      at = end;
      continue;
    }
    const terminator = source.startsWith("<!--", at)
      ? "-->"
      : source.startsWith("<![CDATA[", at)
        ? "]]>"
        : "";
    if (terminator) {
      const next = source.indexOf(
        terminator,
        at + (terminator === "-->" ? 4 : 9),
      );
      if (next < 0) {
        output.push(source.slice(at));
        break;
      }
      const end = next + terminator.length;
      output.push(map(source.slice(at, end)));
      at = end;
      continue;
    }
    let quote = "",
      end = at + 1,
      complete = false;
    for (; end < source.length; end++) {
      const char = source[end]!;
      if (quote) {
        if (char === quote) quote = "";
        continue;
      }
      if (char === "'" || char === '"') {
        quote = char;
        continue;
      }
      if (char === "<") break;
      if (char === ">") {
        end++;
        complete = true;
        break;
      }
    }
    output.push(complete ? map(source.slice(at, end)) : source.slice(at, end));
    at = end;
  }
  return output.join("");
}
const parseXml = (source: string) => {
  const doc = new DOMParser().parseFromString(source, "application/xhtml+xml");
  // DOMPurify intentionally drops CDATA nodes. Convert their literal contents
  // to text before sanitizing so valid book text is retained without becoming markup.
  const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_CDATA_SECTION);
  const nodes: Node[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes)
    node.parentNode?.replaceChild(
      doc.createTextNode(node.nodeValue || ""),
      node,
    );
  return doc;
};
const invalid = (doc: Document) => !!doc.querySelector("parsererror");

function repairEntities(source: string, escapeUnknown = false) {
  const cache = new Map<string, string>();
  let unknown = false;
  const repaired = mapMarkup(source, (part) => {
    if (part.startsWith("<!--") || part.startsWith("<![CDATA[")) return part;
    return part.replace(/&([A-Za-z][A-Za-z0-9]+);/g, (token, name: string) => {
      if (["amp", "lt", "gt", "quot", "apos"].includes(name)) return token;
      if (cache.has(token)) return cache.get(token)!;
      // Strict WHATWG lookup never expands a known prefix of an unknown name.
      const text = decodeHTMLStrict(token);
      if (text === token) unknown = true;
      const result =
        text === token
          ? escapeUnknown
            ? `&amp;${name};`
            : token
          : Array.from(text, (c) => `&#${c.codePointAt(0)};`).join("");
      if (cache.size < 4096) cache.set(token, result);
      return result;
    });
  });
  return { source: repaired, unknown };
}

function repairNamespaces(source: string) {
  let done = false;
  return mapMarkup(source, (token) => {
    if (done || !/^<(?:[\w.-]+:)?html(?:\s|>)/i.test(token)) return token;
    done = true;
    const missing = Object.entries(namespaces)
      .filter(
        ([name]) =>
          new RegExp(`\\b${name}:`).test(source) &&
          !new RegExp(`\\bxmlns:${name}\\s*=`).test(token),
      )
      .map(([name, uri]) => ` xmlns:${name}="${uri}"`)
      .join("");
    return token.replace(/>$/, missing + ">");
  });
}

function expandEmptyElements(source: string) {
  let raw = "";
  return mapMarkup(source, (token) => {
    if (token.startsWith("<![CDATA[")) {
      const text = token.slice(9, -3);
      return raw === "style" || raw === "script"
        ? text
        : text
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;");
    }
    const match = /^<(\/?)([A-Za-z][\w:.-]*)\b/.exec(token);
    if (!match) return token;
    const [, closing, name] = match,
      tag = name!.toLowerCase();
    if (raw) {
      if (closing && tag === raw) raw = "";
      return token;
    }
    if (closing) return token;
    if (/\/\s*>$/.test(token) && !voidTags.has(tag))
      return token.replace(/\/\s*>$/, `></${name}>`);
    if (["script", "style", "title", "textarea"].includes(tag)) raw = tag;
    return token;
  });
}

export function parseChapter(source: string): {
  doc: Document;
  issues: RenderIssue[];
} {
  let doc = parseXml(source);
  if (!invalid(doc)) return { doc, issues: [] };
  const entities = repairEntities(source);
  const repaired = repairNamespaces(entities.source);
  doc = parseXml(repaired);
  if (!invalid(doc))
    return {
      doc,
      issues: [
        {
          level: "info",
          message: "Some formatting was repaired while opening this chapter.",
        },
      ],
    };
  // Sanitization still runs after recovery. Expand XHTML empty elements before
  // invoking the HTML tokenizer so they cannot swallow subsequent content.
  return {
    doc: new DOMParser().parseFromString(
      expandEmptyElements(
        entities.unknown ? repairEntities(repaired, true).source : repaired,
      ),
      "text/html",
    ),
    issues: [
      {
        level: "degraded",
        message:
          "Some formatting in this chapter was repaired. Review the layout before printing.",
      },
    ],
  };
}
