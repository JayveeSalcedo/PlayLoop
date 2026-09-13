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

Plan: do 1 in phase 3, decide on 2 at merge time based on real game sizes.
