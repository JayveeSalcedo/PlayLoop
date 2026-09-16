# @playloop/replay

Server-side score verification for code games. `verifyPlay()` re-runs a game's
exact source with the session seed and the player's recorded inputs inside
QuickJS (WebAssembly), and returns the score the game actually produced.
**Only that score may be paid.**

```ts
const result = await verifyPlay({ code, seed, log, claimedScore });
if (result.ok) pay(result.score);
else reject(result.reason); // score_mismatch, tick_mismatch, timeout, runtime_error, ...
```

## Isolation

| Layer | Stops |
|---|---|
| QuickJS (no Node, fs or network APIs) | host access |
| Memory limit (32 MB default) | allocation bombs |
| Deadline interrupt (2 s default) | JS loops |
| Worker thread killed at deadline + 1.5 s | native operations that never check the deadline (e.g. `new Array(1e5).fill()` near the memory limit ran 17 s with one interrupt check) |

`isolate: "inline"` skips the worker for trusted, known-good code (tests). Anything a player submits goes through the worker.

## Measured cost (phase 1, Windows dev machine, Node 22)

| Game | Ticks | Verify time |
|---|---|---|
| `catch.js`, 25 s | 1,500 | ~400 ms incl. worker start |
| Stress: 300 moving bodies + distance checks, 90 s | 5,400 | ~7 s |

QuickJS is an interpreter: roughly **4 µs per body per tick** for simple physics. Typical arcade games fit the 2 s budget easily; heavy simulations don't. Before the merge phase this needs one of:

1. **Game lab replay-cost gate** (phase 3): a draft whose full-length bot replay exceeds the budget goes back to the AI with a "too heavy, simplify" report. Cheapest, and also keeps games smooth on low-end phones.
2. **Asynchronous verification**: `submitPlay` records the play as pending and credits points when verification finishes, which removes the per-request time limit.
3. **A faster sandboxed engine** (e.g. a V8 isolate) if 1 and 2 aren't enough, re-checking determinism against the browser.

Plan: do 1 in phase 3 (done, see below), decide on 2 at merge time based on real game sizes.

## Game lab: `checkGame(code)`

Runs before anyone sees a game draft. Returns a `LabReport` with a pass/fail verdict, one entry per check, the bot plays, and, when it fails, a `fixPrompt` to send back to the AI.

| Check | Fails when |
|---|---|
| Code size | over 60 KB |
| Code scan | network, `eval`/`Function`, `Math.random`, clocks or timers appear in the code (DOM globals and locale formatting are warnings) |
| Game contract | the game doesn't load or `meta`/`init`/`update` are invalid |
| Crash test | any of 9 bot plays (idle, explorer, masher × 3 seeds) throws |
| render() only draws | `render()` throws or changes the state (it runs with a no-op drawing API every 10 ticks) |
| Replays identically | replaying a bot's inputs in a fresh sandbox gives a different score or state |
| Fast enough to verify | the estimated full-length replay exceeds 2 s (estimated from the longest play; plays under 10 s only warn) |
| Score responds to input | the idle bot scores the same as the active bots on every seed, or nobody scores |
| Lasts long enough | every play ends within 5 s |

Checks that depend on earlier ones skip with a reason, e.g. scoring checks wait until crashes are fixed, so the AI isn't sent misleading problems.

`test/fixtures/broken/` has 8 deliberately broken games, one per failure mode; `test/gamelab.test.ts` asserts each is caught with a readable reason and that the example games pass. A full check takes about 4–8 s, or ~16 s for a game too heavy to finish a play.
