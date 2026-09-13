/**
 * Static scan of game source: catches what the sandbox would also stop, but
 * earlier and with line numbers and a fix, so the report (and the AI fixing
 * the game) gets an actionable reason instead of a runtime crash.
 *
 * Not a security boundary: code can always hide an identifier. The sandbox
 * is what actually blocks these; this is for readable feedback.
 */

export type ScanSeverity = "error" | "warning";

export interface ScanFinding {
  rule: string;
  severity: ScanSeverity;
  message: string;
  fix: string;
  /** 1-based line numbers of the first few matches. */
  lines: number[];
}

interface Rule {
  rule: string;
  severity: ScanSeverity;
  pattern: RegExp;
  message: string;
  fix: string;
}

/**
 * An identifier used as a global: not a property access (`.x`), not part of a
 * longer name, and not an object key (`{ x: 1 }`).
 */
const global = (names: string) => new RegExp(`(?<![.\\w$])(?:${names})\\b(?!\\s*:(?!:))`, "g");

const RULES: Rule[] = [
  {
    rule: "network",
    severity: "error",
    pattern: global("fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|require"),
    message: "Tries to use the network or load other code.",
    fix: "Games can't load anything. Put all content in the game file; use image slots for pictures.",
  },
  {
    rule: "dynamic-import",
    severity: "error",
    pattern: /(?<![.\w$])import\s*\(|^\s*import\s[^(]/gm,
    message: "Uses import.",
    fix: "Games are a single file with no imports.",
  },
  {
    rule: "dynamic-code",
    severity: "error",
    pattern: global("eval|Function"),
    message: "Builds code at runtime with eval or Function.",
    fix: "Write the code directly.",
  },
  {
    rule: "unseeded-random",
    severity: "error",
    pattern: /(?<![.\w$])Math\s*\.\s*random\b/g,
    message: "Uses Math.random(), which the server can't replay.",
    fix: "Use ctx.random(), ctx.randomInt(min, max) or ctx.pick(list).",
  },
  {
    rule: "clock",
    severity: "error",
    pattern: global("Date|performance|setTimeout|setInterval|requestAnimationFrame|queueMicrotask|requestIdleCallback"),
    message: "Uses clocks or timers, which differ between the player's phone and the server.",
    fix: "Drive all timing from update(): count ticks, or use ctx.tick, ctx.time and ctx.timeLeft.",
  },
  {
    rule: "browser-globals",
    severity: "warning",
    pattern: global("document|window|localStorage|sessionStorage|indexedDB|navigator|alert|confirm|prompt|postMessage|opener"),
    message: "Mentions browser globals that don't exist on the server.",
    fix: "Draw only through render(state, g, ctx) and keep all state in the object update() returns. Ignore this if it's your own variable name.",
  },
  {
    rule: "locale",
    severity: "warning",
    pattern: /\.\s*(?:toLocaleString|toLocaleDateString|toLocaleTimeString|localeCompare)\b|(?<![.\w$])Intl\b/g,
    message: "Uses locale formatting, which can differ between the phone and the server.",
    fix: "Fine inside render(). In update(), compare and format with plain code instead.",
  },
];

/**
 * Replaces comments and string contents with spaces (keeping newlines), so
 * rules only match code. Template literal ${...} expressions are blanked too:
 * a rough pass, but games rarely hide logic there.
 */
export function stripCommentsAndStrings(code: string): string {
  let out = "";
  let i = 0;
  const blank = (s: string) => s.replace(/[^\n]/g, " ");
  while (i < code.length) {
    const c = code[i]!;
    const n = code[i + 1];
    if (c === "/" && n === "/") {
      const end = code.indexOf("\n", i);
      const stop = end === -1 ? code.length : end;
      out += blank(code.slice(i, stop));
      i = stop;
    } else if (c === "/" && n === "*") {
      const end = code.indexOf("*/", i + 2);
      const stop = end === -1 ? code.length : end + 2;
      out += blank(code.slice(i, stop));
      i = stop;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < code.length && code[j] !== c) {
        if (code[j] === "\\") j += 1;
        else if (c !== "`" && code[j] === "\n") break;
        j += 1;
      }
      const stop = Math.min(code.length, j + 1);
      out += c + blank(code.slice(i + 1, stop - 1)) + (stop - 1 > i ? code[stop - 1] : "");
      i = stop;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

export function scanGameCode(code: string): ScanFinding[] {
  const stripped = stripCommentsAndStrings(code);
  const lineAt = (index: number) => stripped.slice(0, index).split("\n").length;
  const findings: ScanFinding[] = [];
  for (const rule of RULES) {
    const lines = new Set<number>();
    for (const match of stripped.matchAll(rule.pattern)) {
      lines.add(lineAt(match.index ?? 0));
      if (lines.size >= 5) break;
    }
    if (lines.size > 0) {
      findings.push({ rule: rule.rule, severity: rule.severity, message: rule.message, fix: rule.fix, lines: [...lines] });
    }
  }
  return findings;
}
