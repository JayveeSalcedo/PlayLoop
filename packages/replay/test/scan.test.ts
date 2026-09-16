import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { scanGameCode, stripCommentsAndStrings } from "../src/scan";

const examples = resolve(__dirname, "../../runtime/examples");

describe("scanGameCode", () => {
  it("finds nothing in the example games", () => {
    for (const name of ["catch.js", "desert-dash.js"]) {
      expect(scanGameCode(readFileSync(resolve(examples, name), "utf8")), name).toEqual([]);
    }
  });

  it("reports forbidden APIs with line numbers and a fix", () => {
    const code = ["const a = 1;", "const r = Math.random();", "fetch('/x');", "const t = Date.now();", "setTimeout(() => {}, 10);"].join("\n");
    const findings = scanGameCode(code);
    expect(findings.map((f) => [f.rule, f.severity, f.lines])).toEqual([
      ["network", "error", [3]],
      ["unseeded-random", "error", [2]],
      ["clock", "error", [4, 5]],
    ]);
    expect(findings[1]!.fix).toMatch(/ctx\.random/);
  });

  it("ignores comments, strings and property names", () => {
    const code = [
      "// Math.random() is not allowed, use ctx.random",
      "/* fetch(url) */",
      'const label = "Date: today, fetch the eval window";',
      "const s = { fetch: 1, window: 2 }; s.document = s.fetch + s.window;",
      "const lastUpdate = 0; const myDate = 1;",
    ].join("\n");
    expect(scanGameCode(code)).toEqual([]);
  });

  it("warns (not errors) on browser globals and locale formatting", () => {
    const findings = scanGameCode("document.title = 'x';\nconst s = (1234).toLocaleString();");
    expect(findings.map((f) => [f.rule, f.severity])).toEqual([
      ["browser-globals", "warning"],
      ["locale", "warning"],
    ]);
  });

  it("keeps line numbers aligned after stripping", () => {
    const code = "const a = `multi\nline\n`;\n/* x\ny */ eval('1');";
    expect(stripCommentsAndStrings(code).split("\n")).toHaveLength(code.split("\n").length);
    expect(scanGameCode(code)[0]).toMatchObject({ rule: "dynamic-code", lines: [5] });
  });
});
