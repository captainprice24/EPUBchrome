import { describe, expect, it } from "vitest";
import { rewriteCss } from "../../src/publisher-css";
import type { RenderIssue } from "../../src/render-issues";

const resolve = (base: string, ref: string) => {
  if (/^[a-z]+:|^\/\//i.test(ref)) throw Error("external");
  return base.split("/").slice(0, -1).concat(ref).join("/");
};
function run(
  source: string,
  files: Record<string, string> = {},
  issues: RenderIssue[] = [],
) {
  const requested: string[] = [];
  return rewriteCss(
    source,
    "styles/main.css",
    resolve,
    async (path) => {
      if (!(path in files)) throw Error("missing");
      return files[path]!;
    },
    async (path) => {
      requested.push(path);
      return `blob:local/${path}`;
    },
    [],
    undefined,
    0,
    issues,
  ).then((css) => ({ css, requested }));
}

describe("rewriteCss", () => {
  it("retargets html, body and :root to the publisher's own wrappers", async () => {
    const { css } = await run(
      "html{margin:0}body.night p{color:red}:root{--a:1}",
    );
    expect(css).toContain("[data-folio-html]{margin:0}");
    expect(css).toContain("[data-folio-body].night p{color:red}");
    expect(css).toContain("[data-folio-html]{--a:1}");
    expect(css).not.toMatch(/(^|[^-\w])(html|body)\b/);
  });
  it("replaces local resource URLs and keeps data URLs and fragments", async () => {
    const { css, requested } = await run(
      'p{background:url("../img/a.png")}i{background:url(data:image/png;base64,AA)}u{fill:url(#g)}',
    );
    expect(requested).toEqual(["styles/../img/a.png"]);
    expect(css).toContain("blob:local/styles/../img/a.png");
    expect(css).toContain("data:image/png;base64,AA");
    expect(css).toContain("#g");
  });
  it("empties external URLs and records a degraded formatting issue", async () => {
    const issues: RenderIssue[] = [];
    const { css, requested } = await run(
      "p{background:url(https://example.invalid/track.png)}",
      {},
      issues,
    );
    expect(requested).toEqual([]);
    expect(css).not.toContain("example.invalid");
    expect(issues.map((issue) => issue.level)).toEqual(["degraded"]);
  });
  it("inlines local imports, wraps media conditions and survives import cycles", async () => {
    const { css } = await run('@import "base.css" screen;p{margin:0}', {
      "styles/base.css": '@import "main.css";.indent{text-indent:1em}',
      "styles/main.css": "em{color:blue}",
    });
    expect(css).toMatch(/@media screen\{.*\.indent\{text-indent:1em\}/);
    expect(css).toContain("p{margin:0}");
    expect(css).not.toContain("@import");
  });
  it("drops online imports as an informational issue", async () => {
    const issues: RenderIssue[] = [];
    const { css } = await run(
      '@import url("https://fonts.example.invalid/a.css");p{margin:0}',
      {},
      issues,
    );
    expect(css).toBe("p{margin:0}");
    expect(issues.map((issue) => issue.level)).toEqual(["info"]);
  });
  it("removes legacy script-bearing declarations", async () => {
    const { css } = await run(
      "p{behavior:url(x.htc);width:expression(alert(1));color:red}",
    );
    expect(css).toBe("p{color:red}");
  });
  it("stops at the stylesheet safety budget", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 40; i++)
      files[`styles/s${i}.css`] = `@import "s${i + 1}.css";`;
    const issues: RenderIssue[] = [];
    const { css } = await run('@import "s0.css";b{top:0}', files, issues);
    expect(css).toContain("b{top:0}");
    expect(issues.some((issue) => issue.level === "degraded")).toBe(true);
  });
});
