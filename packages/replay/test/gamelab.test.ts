import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkGame, type CheckId, type LabReport } from "../src/gamelab";

const broken = (name: string) => readFileSync(resolve(__dirname, "fixtures/broken", name), "utf8");
const example = (name: string) => readFileSync(resolve(__dirname, "../../runtime/examples", name), "utf8");

const TAP_THE_DOT = `playloop.game({
  meta: { title: "Tap the Dot", hint: "Tap the dot before it moves", maxSeconds: 20 },
  init(ctx) { return { x: 180, y: 320, r: 34 }; },
  update(s, input, ctx) {
    for (const tap of input.taps) {
      if (Math.hypot(tap.x - s.x, tap.y - s.y) < s.r) { ctx.score(10); s.x = ctx.randomInt(40, 320); s.y = ctx.randomInt(80, 580); s.r = Math.max(16, s.r - 1); }
    }
  },
  render(s, g, ctx) { g.clear("#3fc8ff"); g.circle(s.x, s.y, s.r, { fill: "#ffdd3c" }); },
});`;

const failing = (report: LabReport) => report.checks.filter((c) => c.status === "fail").map((c) => c.id);

function explain(report: LabReport) {
  return report.checks.map((c) => `${c.status.padEnd(4)} ${c.title}: ${c.summary}${c.details.length ? "\n       " + c.details.join("\n       ") : ""}`).join("\n");
}

describe("the game lab catches broken games with a readable reason", () => {
  const cases: [file: string, mustFail: CheckId[]][] = [
    ["bad-contract.js", ["contract"]],
    ["uses-math-random.js", ["code-scan"]],
    ["crashes-later.js", ["crashes"]],
    ["render-throws.js", ["render"]],
    ["render-mutates-state.js", ["render", "determinism"]],
    ["ignores-input.js", ["responds-to-input"]],
    ["ends-instantly.js", ["length"]],
    ["too-heavy.js", ["replay-cost"]],
  ];

  for (const [file, mustFail] of cases) {
    it(`${file} → fails ${mustFail.join(" + ")}`, async () => {
      const report = await checkGame(broken(file));
      console.log(`\n── ${file} (${report.durationMs} ms) ──\n${explain(report)}`);
      expect(report.verdict).toBe("fail");
      expect(failing(report)).toEqual(expect.arrayContaining(mustFail));
      for (const id of mustFail) {
        const check = report.checks.find((c) => c.id === id)!;
        expect(check.summary.length, `${id} summary`).toBeGreaterThan(10);
      }
      expect(report.fixPrompt).toContain("Fix every problem");
      for (const id of mustFail) expect(report.fixPrompt).toContain(report.checks.find((c) => c.id === id)!.title);
    }, 120_000);
  }

  it("uses-math-random.js also explains the runtime crash with the fix", async () => {
    const report = await checkGame(broken("uses-math-random.js"));
    const scan = report.checks.find((c) => c.id === "code-scan")!;
    expect(scan.details.join(" ")).toMatch(/Line 11, 12: .*ctx\.random/);
    // Crashes make scoring checks meaningless, so they wait instead of adding misleading failures.
    expect(report.checks.find((c) => c.id === "responds-to-input")!.status).toBe("skip");
  }, 120_000);

  it("a game that ends instantly isn't also blamed for replay cost", async () => {
    const report = await checkGame(broken("ends-instantly.js"));
    expect(report.checks.find((c) => c.id === "replay-cost")!.status).not.toBe("fail");
  }, 120_000);
});

describe("well-formed games pass", () => {
  const good: [string, string][] = [
    ["catch.js", example("catch.js")],
    ["desert-dash.js", example("desert-dash.js")],
    ["tap-the-dot (lab starter)", TAP_THE_DOT],
  ];

  for (const [name, code] of good) {
    it(name, async () => {
      const report = await checkGame(code);
      console.log(`\n── ${name} (${report.durationMs} ms) ──\n${explain(report)}`);
      expect(failing(report)).toEqual([]);
      expect(report.verdict).toBe("pass");
      expect(report.fixPrompt).toBeNull();
      expect(report.runs).toHaveLength(9);
      expect(report.replayCost!.estimatedFullLengthMs).toBeLessThan(2000);
    }, 120_000);
  }
});
