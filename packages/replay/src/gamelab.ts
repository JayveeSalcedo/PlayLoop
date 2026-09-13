/**
 * The game lab: automatic checks every game draft goes through before a
 * person sees it. Bots play it in the QuickJS sandbox, their plays are
 * replayed in fresh sandboxes, and the result is a plain-English report —
 * plus, when something fails, a message the AI can use to fix the game.
 *
 * Checks, in report order:
 *   size · code scan · contract · crashes · render · determinism ·
 *   replay cost · responds to input · length
 */
import { fnv1a, TICKS_PER_SECOND, type GameMeta } from "@playloop/runtime";
import { BOT_KINDS, BOT_SCRIPT, type BotKind, type BotRunResult, type BotRunSuccess } from "./bots";
import { byteLength, MAX_CODE_BYTES, runSandboxed } from "./sandbox";
import { scanGameCode } from "./scan";
import { inspectGame, verifyPlay } from "./verify";

export type CheckId =
  | "size"
  | "code-scan"
  | "contract"
  | "crashes"
  | "render"
  | "determinism"
  | "replay-cost"
  | "responds-to-input"
  | "length";

export type CheckStatus = "pass" | "fail" | "warn" | "skip";

export interface LabCheck {
  id: CheckId;
  title: string;
  status: CheckStatus;
  summary: string;
  details: string[];
}

export interface LabRun {
  bot: BotKind;
  seed: string;
  ok: boolean;
  score?: number;
  ticks?: number;
  endReason?: string;
  error?: string;
  tick?: number;
}

export interface LabReport {
  version: 1;
  codeHash: string;
  checkedAt: string;
  verdict: "pass" | "fail";
  meta: GameMeta | null;
  checks: LabCheck[];
  runs: LabRun[];
  replayCost: { estimatedFullLengthMs: number; budgetMs: number } | null;
  durationMs: number;
  /** When the verdict is "fail": what to tell the AI so it can fix the game. */
  fixPrompt: string | null;
}

export interface CheckOptions {
  /** Session seeds per bot. Default 3. */
  seeds?: number;
  /** Most a full-length replay may take in submitPlay. Default 2000 ms. */
  replayBudgetMs?: number;
  /** Parallel sandbox workers. Default 3. */
  concurrency?: number;
}

const TITLES: Record<CheckId, string> = {
  size: "Code size",
  "code-scan": "Code scan",
  contract: "Game contract",
  crashes: "Crash test",
  render: "render() only draws",
  determinism: "Replays identically",
  "replay-cost": "Fast enough to verify",
  "responds-to-input": "Score responds to input",
  length: "Lasts long enough",
};

const MIN_REASONABLE_SECONDS = 5;
/** Replay-cost estimates scaled up from shorter plays than this are reported as warnings, not failures. */
const ROUGH_ESTIMATE_BELOW_SECONDS = 10;
/** Longest a calibration play may take before the game counts as too heavy to test at all. */
const CALIBRATION_TIME_LIMIT_MS = 15_000;
const RENDER_EVERY_TICKS = 10;

export async function checkGame(code: string, options: CheckOptions = {}): Promise<LabReport> {
  const started = Date.now();
  const seedCount = options.seeds ?? 3;
  const budgetMs = options.replayBudgetMs ?? 2_000;
  const concurrency = options.concurrency ?? 3;

  const checks = new Map<CheckId, LabCheck>();
  const set = (id: CheckId, status: CheckStatus, summary: string, details: string[] = []) =>
    checks.set(id, { id, title: TITLES[id], status, summary, details });
  const skipRest = (reason: string) => {
    for (const id of Object.keys(TITLES) as CheckId[]) if (!checks.has(id)) set(id, "skip", reason);
  };

  const runs: LabRun[] = [];
  let meta: GameMeta | null = null;
  let replayCost: LabReport["replayCost"] = null;

  const finish = (): LabReport => {
    const ordered = (Object.keys(TITLES) as CheckId[]).map((id) => checks.get(id)!);
    const verdict = ordered.some((c) => c.status === "fail") ? "fail" : "pass";
    return {
      version: 1,
      codeHash: fnv1a(code),
      checkedAt: new Date().toISOString(),
      verdict,
      meta,
      checks: ordered,
      runs,
      replayCost,
      durationMs: Date.now() - started,
      fixPrompt: verdict === "fail" ? buildFixPrompt(ordered) : null,
    };
  };

  // ---- size ----
  const bytes = byteLength(code);
  if (bytes > MAX_CODE_BYTES) {
    set("size", "fail", `The game is ${(bytes / 1000).toFixed(1)} KB; the limit is ${MAX_CODE_BYTES / 1000} KB.`, [
      "Shorten the code: remove unused functions and repeated data.",
    ]);
    skipRest("Skipped: the game is too large to load.");
    return finish();
  }
  set("size", "pass", `${(bytes / 1000).toFixed(1)} KB of ${MAX_CODE_BYTES / 1000} KB.`);

  // ---- code scan ----
  const findings = scanGameCode(code);
  const errors = findings.filter((f) => f.severity === "error");
  const describeFinding = (f: (typeof findings)[number]) => `Line ${f.lines.join(", ")}: ${f.message} ${f.fix}`;
  if (errors.length > 0) set("code-scan", "fail", `${errors.length} forbidden API${errors.length > 1 ? "s" : ""} used.`, findings.map(describeFinding));
  else if (findings.length > 0) set("code-scan", "warn", "Nothing forbidden, but worth a look.", findings.map(describeFinding));
  else set("code-scan", "pass", "No forbidden APIs.");

  // ---- contract ----
  const inspected = await inspectGame(code);
  if (!inspected.ok) {
    const summary =
      inspected.reason === "compile_error"
        ? "The code has a syntax error."
        : inspected.reason === "contract_error"
          ? "The game doesn't follow the PlayLoop contract."
          : inspected.reason === "timeout"
            ? "Loading the game never finished."
            : "The game threw an error while loading.";
    set("contract", "fail", summary, [inspected.detail]);
    skipRest("Skipped: the game has to load first.");
    return finish();
  }
  meta = inspected.meta;
  const maxTicks = meta.maxSeconds * TICKS_PER_SECOND;
  set("contract", "pass", `“${meta.title}”, up to ${meta.maxSeconds} s${meta.lives ? `, ${meta.lives} lives` : ""}.`);

  const seeds = Array.from({ length: seedCount }, (_, i) => `lab-seed-${i + 1}`);
  const botSeed = (seed: string, bot: BotKind) => parseInt(fnv1a(`${seed}:${bot}`), 16);

  const playBot = async (seed: string, bot: BotKind, timeLimitMs: number): Promise<BotRunResult | { ok: false; stage: "sandbox"; message: string; reason: string; tick: number }> => {
    try {
      const run = await runSandboxed({
        code,
        hostScripts: [BOT_SCRIPT],
        expression: `__plBot.run(${JSON.stringify(seed)}, ${JSON.stringify(bot)}, ${botSeed(seed, bot)}, ${RENDER_EVERY_TICKS})`,
        timeLimitMs,
      });
      if (!run.ok) return { ok: false, stage: "sandbox", message: run.detail, reason: run.reason, tick: 0 };
      return JSON.parse(String(run.value)) as BotRunResult;
    } catch (e) {
      // A host script failing means the game broke built-ins the runtime relies on.
      return {
        ok: false,
        stage: "sandbox",
        reason: "runtime_error",
        message: `The game changed built-in JavaScript objects the PlayLoop runtime needs (${e instanceof Error ? e.message : String(e)}).`,
        tick: 0,
      };
    }
  };

  const record = (seed: string, bot: BotKind, result: Awaited<ReturnType<typeof playBot>>) => {
    runs.push(
      result.ok
        ? { bot, seed, ok: true, score: result.score, ticks: result.ticks, endReason: result.endReason }
        : { bot, seed, ok: false, error: result.message, tick: result.tick },
    );
  };

  // ---- calibration: one explorer play, then its replay's cost ----
  const calibration = await playBot(seeds[0]!, "explorer", CALIBRATION_TIME_LIMIT_MS);
  record(seeds[0]!, "explorer", calibration);
  if (!calibration.ok && "reason" in calibration && calibration.reason === "timeout") {
    set("replay-cost", "fail", `A single play didn't finish within ${CALIBRATION_TIME_LIMIT_MS / 1000} s of server time.`, [
      "update() does far too much work per tick. Use fewer objects, avoid nested loops over all objects, and don't rebuild large arrays every tick.",
    ]);
    skipRest("Skipped: the game is too slow to test.");
    return finish();
  }

  const successes: { seed: string; bot: BotKind; run: BotRunSuccess }[] = [];
  if (calibration.ok) successes.push({ seed: seeds[0]!, bot: "explorer", run: calibration });

  /** Replay timings. The longest sample gives the most honest full-length estimate. */
  const costSamples: { replayMs: number; ticks: number }[] = [];
  const costAdvice =
    "Make update() cheaper: fewer objects on screen, no nested loops over every object, remove objects once they leave the screen, and reuse state instead of rebuilding it each tick.";
  const estimateFrom = (sample: { replayMs: number; ticks: number }) => Math.round(sample.replayMs * (maxTicks / Math.max(1, sample.ticks)));

  let perRunLimit = 5_000;
  const replays = new Map<string, Awaited<ReturnType<typeof verifyPlay>>>();
  if (calibration.ok) {
    const replayed = await verifyPlay({ code, seed: seeds[0]!, log: calibration.log, timeLimitMs: CALIBRATION_TIME_LIMIT_MS });
    replays.set(`${seeds[0]}:explorer`, replayed);
    if (replayed.ok) {
      costSamples.push({ replayMs: replayed.replayMs, ticks: calibration.ticks });
      const estimate = estimateFrom(costSamples[0]!);
      perRunLimit = Math.max(5_000, estimate * 3 + 2_000);
      // Fail early only when the game is clearly far over budget; short samples overestimate.
      if (estimate > budgetMs * 3 && calibration.ticks >= MIN_REASONABLE_SECONDS * TICKS_PER_SECOND) {
        replayCost = { estimatedFullLengthMs: estimate, budgetMs };
        set("replay-cost", "fail", `Verifying a full game would take about ${(estimate / 1000).toFixed(1)} s; the limit is ${budgetMs / 1000} s.`, [
          `${replayed.replayMs} ms for ${(calibration.ticks / TICKS_PER_SECOND).toFixed(1)} s of play, so about ${estimate} ms for the full ${meta.maxSeconds} s.`,
          costAdvice,
        ]);
        skipRest("Skipped: the game is too slow to verify.");
        await finalizeRunChecks();
        return finish();
      }
    }
  }

  // ---- the remaining bot plays ----
  const plan = seeds.flatMap((seed) => BOT_KINDS.map((bot) => ({ seed, bot }))).filter((p) => !(p.seed === seeds[0] && p.bot === "explorer"));
  const results = await mapLimit(plan, concurrency, async ({ seed, bot }) => ({ seed, bot, result: await playBot(seed, bot, perRunLimit) }));
  for (const { seed, bot, result } of results) {
    record(seed, bot, result);
    if (result.ok) successes.push({ seed, bot, run: result });
  }

  await finalizeRunChecks();
  return finish();

  /** crashes · render · determinism · replay cost · responds-to-input · length, from the plays so far. */
  async function finalizeRunChecks() {
    // crashes
    const failed = runs.filter((r) => !r.ok);
    if (failed.length === 0) {
      set("crashes", "pass", `${runs.length} bot plays, no errors.`);
    } else {
      const unique = new Map<string, LabRun>();
      for (const r of failed) if (!unique.has(r.error!)) unique.set(r.error!, r);
      set(
        "crashes",
        "fail",
        `${failed.length} of ${runs.length} bot plays crashed.`,
        [...unique.values()].map((r) => `${r.error}${r.tick ? ` (tick ${r.tick}, ${(r.tick / TICKS_PER_SECOND).toFixed(1)} s in, ${r.bot} bot)` : ` (${r.bot} bot)`}`),
      );
    }
    const crashed = failed.length > 0;

    // render
    const renderError = successes.find((s) => s.run.renderError);
    const renderMutated = successes.find((s) => s.run.renderMutated);
    if (successes.length === 0) {
      if (!checks.has("render")) set("render", "skip", "Skipped: no play got far enough.");
    } else if (renderError || renderMutated) {
      const details: string[] = [];
      if (renderError) details.push(`render() threw “${renderError.run.renderError!.message}” at tick ${renderError.run.renderError!.tick}.`);
      if (renderMutated) {
        details.push(
          `render() changed the game state at tick ${renderMutated.run.renderMutated!.tick}. render() runs only on the player's device and never on the server, so any change it makes breaks score verification. Move that logic into update().`,
        );
      }
      set("render", "fail", renderMutated ? "render() changes the game state." : "render() throws an error.", details);
    } else {
      set("render", "pass", "render() ran without errors and left the state untouched.");
    }

    // determinism (its replays also provide replay-cost samples)
    if (!checks.has("determinism")) {
      const samples = BOT_KINDS.map((bot) => successes.find((s) => s.bot === bot)).filter((s): s is NonNullable<typeof s> => Boolean(s));
      if (samples.length === 0) {
        set("determinism", "skip", "Skipped: no play finished.");
      } else {
        const problems: string[] = [];
        for (const s of samples) {
          const key = `${s.seed}:${s.bot}`;
          const cached = replays.get(key);
          const replayed = cached ?? (await verifyPlay({ code, seed: s.seed, log: s.run.log, timeLimitMs: perRunLimit }));
          if (!cached && replayed.ok) costSamples.push({ replayMs: replayed.replayMs, ticks: s.run.ticks });
          if (!replayed.ok) problems.push(`${s.bot} bot: replaying its inputs failed (${replayed.reason}: ${replayed.detail}).`);
          else if (replayed.score !== s.run.score) problems.push(`${s.bot} bot: scored ${s.run.score} while playing but ${replayed.score} when its inputs were replayed.`);
          else if (replayed.hash !== s.run.hash) problems.push(`${s.bot} bot: same score (${s.run.score}), but the game state ended up different when its inputs were replayed.`);
        }
        if (problems.length === 0) set("determinism", "pass", `${samples.length} plays replayed to identical scores and state.`);
        else {
          if (renderMutated) problems.push("Likely cause: render() changes the game state (see “render() only draws”).");
          else problems.push("Everything update() uses must come from its state, input and ctx. Don't keep game data in variables outside the state object.");
          set("determinism", "fail", "The same inputs don't always give the same result.", problems);
        }
      }
    }

    // replay cost
    if (!checks.has("replay-cost")) {
      const longest = [...costSamples].sort((a, b) => b.ticks - a.ticks)[0];
      if (!longest) {
        set("replay-cost", "skip", "Couldn't measure: no play could be replayed (see the checks above).");
      } else {
        const estimate = estimateFrom(longest);
        replayCost = { estimatedFullLengthMs: estimate, budgetMs };
        const basis = `${longest.replayMs} ms for the longest play (${(longest.ticks / TICKS_PER_SECOND).toFixed(1)} s), so about ${estimate} ms for the full ${meta!.maxSeconds} s.`;
        const roughSample = longest.ticks < ROUGH_ESTIMATE_BELOW_SECONDS * TICKS_PER_SECOND;
        if (estimate > budgetMs && roughSample) {
          set("replay-cost", "warn", `Possibly too slow to verify: about ${(estimate / 1000).toFixed(1)} s estimated for a full game (limit ${budgetMs / 1000} s).`, [
            basis,
            `Rough estimate: no bot play lasted ${ROUGH_ESTIMATE_BELOW_SECONDS} s, so a short sample was scaled up.`,
            costAdvice,
          ]);
        } else if (estimate > budgetMs) set("replay-cost", "fail", `Verifying a full game would take about ${(estimate / 1000).toFixed(1)} s; the limit is ${budgetMs / 1000} s.`, [basis, costAdvice]);
        else if (estimate > budgetMs / 2) set("replay-cost", "warn", `About ${estimate} ms to verify a full game; the limit is ${budgetMs} ms.`, [basis]);
        else set("replay-cost", "pass", `About ${estimate} ms to verify a full game (limit ${budgetMs} ms).`, [basis]);
      }
    }

    // responds to input · length
    const bySeed = new Map<string, Partial<Record<BotKind, BotRunSuccess>>>();
    for (const s of successes) bySeed.set(s.seed, { ...bySeed.get(s.seed), [s.bot]: s.run });

    if (!checks.has("responds-to-input") && crashed) {
      set("responds-to-input", "skip", "Skipped until the crashes are fixed: plays that crash can't show how scoring works.");
    }
    if (!checks.has("length") && crashed) {
      set("length", "skip", "Skipped until the crashes are fixed.");
    }

    if (!checks.has("responds-to-input")) {
      const comparable = [...bySeed.values()].filter((b) => b.idle && (b.explorer || b.masher));
      if (comparable.length === 0) {
        set("responds-to-input", "skip", "Skipped: needs finished plays from the idle bot and an active bot.");
      } else {
        const allScores = successes.map((s) => s.run.score);
        const responsive = comparable.filter((b) => [b.explorer, b.masher].some((r) => r && r.score !== b.idle!.score));
        if (allScores.every((score) => score === 0)) {
          set("responds-to-input", "fail", `No bot scored a single point in ${successes.length} plays.`, [
            "Make sure ctx.score(points) is called when the player does something right, and that reachable targets appear early in the game.",
          ]);
        } else if (responsive.length === 0) {
          set("responds-to-input", "fail", "Players who do nothing score the same as players who play.", [
            `Idle bot scores: ${comparable.map((b) => b.idle!.score).join(", ")}. Active bot scores: ${comparable.flatMap((b) => [b.explorer?.score, b.masher?.score].filter((x) => x !== undefined)).join(", ")}.`,
            "Points must depend on what the player does (taps, drags, keys), not only on time passing.",
          ]);
        } else {
          set("responds-to-input", "pass", `Score changed with player input on ${responsive.length} of ${comparable.length} seeds.`);
        }
      }
    }

    if (!checks.has("length")) {
      if (successes.length === 0) set("length", "skip", "Skipped: no play finished.");
      else {
        const longest = Math.max(...successes.map((s) => s.run.ticks));
        if (longest < MIN_REASONABLE_SECONDS * TICKS_PER_SECOND) {
          set("length", "fail", `Every play ended within ${MIN_REASONABLE_SECONDS} s (longest ${(longest / TICKS_PER_SECOND).toFixed(1)} s).`, [
            "Don't call ctx.end() so early, give the player more lives or time, and ease the start of the game.",
          ]);
        } else {
          set("length", "pass", `Longest play ${(longest / TICKS_PER_SECOND).toFixed(1)} s of ${meta!.maxSeconds} s.`);
        }
      }
    }
  }
}

function buildFixPrompt(checks: LabCheck[]): string {
  const failures = checks.filter((c) => c.status === "fail");
  const warnings = checks.filter((c) => c.status === "warn");
  const lines = [
    "The PlayLoop game lab tested this game with bots and found problems. Fix every problem below and return the complete corrected game.",
    "",
    ...failures.flatMap((c) => [`- ${c.title}: ${c.summary}`, ...c.details.map((d) => `    ${d}`)]),
  ];
  if (warnings.length > 0) {
    lines.push("", "Also worth fixing:", ...warnings.flatMap((c) => [`- ${c.title}: ${c.summary}`, ...c.details.map((d) => `    ${d}`)]));
  }
  return lines.join("\n");
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
