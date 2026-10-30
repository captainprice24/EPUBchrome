import * as css from "css-tree";

// A parser, rather than URL regexes, handles escaped URLs and nested at-rules.
// The iframe CSP remains the final network boundary.
export async function rewriteCss(
  source: string,
  base: string,
  resolve: (base: string, ref: string) => string,
  read: (path: string) => Promise<string>,
  resource: (path: string) => Promise<string>,
  warnings: string[],
  budget = { sheets: 0, bytes: 0, seen: new Set<string>() },
  depth = 0,
): Promise<string> {
  budget.bytes += source.length;
  if (++budget.sheets > 32 || budget.bytes > 2 * 1024 * 1024 || depth > 6)
    throw Error("Publisher styles exceed the stylesheet safety budget.");
  const tree = css.parse(source);
  const imports: {
    node: css.Atrule;
    item: css.ListItem<css.CssNode>;
    list: css.List<css.CssNode>;
  }[] = [];
  const urls: css.Url[] = [];
  css.walk(tree, {
    enter(
      node: css.CssNode,
      item: css.ListItem<css.CssNode> | null,
      list: css.List<css.CssNode> | null,
    ) {
      if (
        node.type === "Atrule" &&
        node.name.toLowerCase() === "import" &&
        item &&
        list
      ) {
        imports.push({ node, item, list });
        return css.walk.skip;
      }
      if (node.type === "TypeSelector") {
        const name = node.name.toLowerCase();
        if (name === "html" || name === "body")
          node.name = `[data-folio-${name}]`;
      }
      if (node.type === "PseudoClassSelector" && node.name === "root") {
        // :root refers to the publisher's html surrogate, never Folio's shell.
        if (item && list)
          list.replace(
            item,
            list.createItem({
              type: "AttributeSelector",
              name: { type: "Identifier", name: "data-folio-html" },
              matcher: null,
              value: null,
              flags: null,
            }),
          );
      }
      if (
        node.type === "Declaration" &&
        (/^(?:behavior|-moz-binding)$/i.test(node.property) ||
          /expression\s*\(/i.test(css.generate(node.value)))
      ) {
        if (item && list) list.remove(item);
        return css.walk.skip;
      }
      if (node.type === "Url") urls.push(node);
    },
  });
  for (const { node, item, list } of imports) {
    let replacement = "";
    try {
      const first =
        node.prelude?.type === "AtrulePrelude"
          ? node.prelude.children.first
          : undefined;
      if (!first || (first.type !== "Url" && first.type !== "String"))
        throw Error("Invalid stylesheet import.");
      const path = resolve(base, first.value);
      if (!budget.seen.has(path)) {
        budget.seen.add(path);
        try {
          const rest = css
            .generate(node.prelude!)
            .slice(css.generate(first).length)
            .trim();
          // Media queries are supported. Layer/supports imports need a different wrapper.
          if (/\b(?:layer|supports)\b/i.test(rest))
            throw Error("Layered stylesheet import is unsupported.");
          replacement = await rewriteCss(
            await read(path),
            path,
            resolve,
            read,
            resource,
            warnings,
            budget,
            depth + 1,
          );
          if (rest) replacement = `@media ${rest}{${replacement}}`;
        } finally {
          budget.seen.delete(path);
        }
      }
    } catch {
      warnings.push(
        "A publisher stylesheet import could not be loaded safely.",
      );
    }
    if (replacement) {
      const parsed = css.parse(replacement);
      if (parsed.type === "StyleSheet") list.insertList(parsed.children, item);
    }
    list.remove(item);
  }
  for (const node of urls) {
    const ref = node.value;
    if (/^data:(?:image|font)\//i.test(ref) || ref.startsWith("#")) continue;
    try {
      node.value = await resource(resolve(base, ref));
    } catch {
      node.value = "";
      warnings.push("A publisher style resource could not be loaded safely.");
    }
  }
  return css.generate(tree);
}
