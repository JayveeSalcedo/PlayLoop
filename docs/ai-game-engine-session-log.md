# AI Game Engine — Production Integration Session Log

**Dates:** 2026-09-16 to 2026-09-17
**Branch:** `main` (23 commits, `b83b12c`..`c1fbe8b`)
**Starting point:** [`PlayLoop_AI_Game_Engine_Implementation_Prompt.md`](../PlayLoop_AI_Game_Engine_Implementation_Prompt.md) — a request to audit and evolve PlayLoop from fixed game templates to open-ended AI-generated games.

## The premise correction that shaped everything

The prompt asked for an audit assuming the AI engine needed to be built. The audit found it already existed, essentially complete, on branch `feature/game-engine` (6 commits, `c86d04f`..`d4646df`) — a full pipeline: AI generation with a check-and-fix loop, a deterministic sandboxed runtime, QuickJS server-side replay verification, and a file-backed prototype app (`apps/lab`) to develop and test it in isolation from production.

So this wasn't "build the engine." It was **phases 3–8 of the plan**: move the prototype's file-backed storage into production Postgres, wire the sandboxed runtime and replay verification into the real play path, run AI generation jobs safely on a serverless host, and turn the creator flow from template-only into open-ended — without breaking anything that already worked.

Full plan: `C:\Users\ACER\.claude\plans\delegated-watching-donut.md` (not in the repo; local to the planning session).

## Phase 0 — Merge and prove the risky part

- Merged `feature/game-engine` into `main` (`b83b12c`). Purely additive — added `packages/{ai,runtime,replay}` and `apps/lab`; touched nothing in `apps/web`, `packages/db`, or `packages/games`.
- The one real unknown: does QuickJS's WebAssembly + a `worker_threads` worker actually survive a real Next.js **production build**, not just the lab's dev server? Wired `@playloop/replay` into `apps/web`, built three frozen fixtures (real recorded bot plays with their exact scores), and proved all three replay to the identical score in a production build (`e77e785`).
- Result: replay cost is a non-issue for normal games — a full 25 s play verifies in ~45 ms standalone, ~500 ms per submit including WASM cold-compile, against a 2 s budget.

## Phase 1 — Runtime versioning (`6138311`)

Nothing recorded *which simulation* scored a play. The first change to the RNG or deterministic math would have silently re-scored every play already in the database — and since verification compares replay against claim, the symptom would be **honest players rejected as cheats**.

- Added `RUNTIME_VERSION`, frozen per-version preludes (`scripts/freeze-prelude.mjs` writes once, refuses to overwrite), and a registry the verifier selects from.
- A version whose runtime isn't available fails explicitly as `runtime_mismatch` — never silently replayed under a different runtime.
- Guard test (`prelude.test.ts`) fails if the runtime drifts from its frozen prelude without a version bump. Confirmed it fires by deliberately perturbing the RNG.
- Also split the sandbox worker's wall-clock budget: engine start-up (generous, cold-start-safe) vs. the game's own time limit (tight, the actual containment guarantee) — one shared deadline was forcing a choice between killing slow cold starts and giving hostile code slack.

## Phase 2 — Database schema (`e44e289`)

- `games.game_kind` (`template` | `code`) discriminates the two engines, with `games.type` made nullable and a CHECK constraint — **not** a fifth `game_type` enum value (Postgres won't let a new enum value be used in the transaction that adds it).
- `game_versions`: immutable once played — code, runtime version, content hash, lab report, validation verdict, score target.
- `games.current_version_id` is `DEFERRABLE INITIALLY DEFERRED` to resolve the circular FK with `game_versions`.
- `play_sessions` gains the version pin, server seed, and verification result columns; `play_input_logs` keeps the recorded play off the hot table.
- Migrations are hand-written SQL (drizzle-kit push crashes on this Supabase project), run via a throwaway `_migrate_*_tmp.ts` script + a verification script, then deleted. **Applied and verified against the real database.**

## Phase 3 — Economy calibration (`2d1af34`)

`codeScoreTarget()` derives a payout target for a code game from its own bot runs (the best active-bot score, biased down) — kept **strictly separate** from technical validation. A game's payout calibration never decides whether it's publishable.

## Phase 4 — Production play and replay (`d3847ae`, plus `4282842`, `b37f85a`)

- `startPlay` now pins a code game's version and a server-chosen seed onto the session; refuses if the game moved on since the page loaded.
- New `POST /api/play/[sessionId]/submit`: claims the session, runs cheap checks, then replays outside any transaction (a replay can take a second — too long to hold a Postgres connection open). **The replayed score is the only score ever paid**, never the client's claim.
- Payout logic (ledger, XP, challenges, referral bonus) extracted into `lib/creditPlay.ts`, shared by both engines — moved verbatim, not rewritten.
- **Verified against the real database and a running production build** (`scripts/e2e-code-play.mts`, 26 checks): honest plays paid the replay score; inflated scores, forged seeds, and time-fabricated logs all rejected; a session started on one version stays pinned to it even after a newer version is published; an unknown runtime version fails explicitly.

## Phase 5 — Serverless-durable generation jobs (`ed52617`, `9ec1fe3`, `d24f370`)

The prototype ran a generation as an in-memory `globalThis` job — impossible on serverless, and a whole generation (up to 3 model calls + bot checks) doesn't fit in one Hobby-tier invocation anyway.

- `packages/ai`'s pipeline can now run **one round per invocation** (`advance()`/`finish()`), with a deadline so it won't start a wait it can't finish before the function's time limit.
- `generation_jobs` table is the job. A step claims it with a conditional UPDATE, refreshes a heartbeat while running, and a stale heartbeat fails the job at the next read — no cron, no queue service.
- Needed somewhere to keep a game nobody has submitted: `game_status` gained `draft` (`0d9bc01`, `6e4f45b` — migrations applied and verified).
- **Live-tested** with a real Groq key loaded into one process only: a rhythm game (not one of the four templates) went from idea to a passing, checked draft in 15.8 s across two rounds (`c169d3e`).

## Phase 6 — Creator studio (`310c1e4`, `52eaaca`)

- Version list, test-play (replay-verified, never credited — `play_sessions.is_test`), change/fix requests, revert, submit for review.
- Submitting a version requires it passed its checks **and** has a verified test play — a reviewer should never be the first to find a game broken.
- **Verified against a real build and database** (`scripts/e2e-studio.mts`, 30 checks).
- *Later corrected in this same session* — see "The `/create` redesign" below.

## Phase 7 — Moderation for code games (`94bd2b5`)

- Admin queue branches on `game_kind`: shows the full request history, the AI's notes, every lab-report check (with the code scanner's findings, explicitly framed as informational — **the sandbox is the security boundary, not the scanner**), and an embedded sandboxed play of the exact version. A reviewer judges content by playing it, not by reading 60 KB of JavaScript.
- Fixed a real gap found while building this: approving/rejecting a code game wasn't mirroring the outcome onto the version's own status — it would have stayed `pending_review` forever.
- **Verified** (`scripts/e2e-moderation.mts`, 25 checks): a real code game was published for the first time in this database, then deliberately reverted to `rejected` afterward.

## Phase 8 — Marketplace and fraud (partial)

- Confirmed campaigns, sponsorship, and challenges already worked for code games at the data level (no template-specific dependency anywhere in those paths).
- Found and fixed the actual gap: the sponsor toggle and share-link UI existed but were unreachable from the studio. Wired them in (`9dd8c1a`).
- Fraud queue now links into the exact recorded input log behind a rejected code-game session — seed, runtime version, claimed vs. replayed score (`42ab168`).
- **Deferred, by design:** `game_assets` (image slots) — a new table, upload/crop UI, and prompt wiring. The plan explicitly allows shipping with slots off; nothing today requires them. Held at the user's request pending further testing.

## Two bugs found and fixed outside the phase plan

- **`pnpm dev` crashing with `EBUSY`** (`358d98c`): `apps/web` and `apps/lab` each rebuild a shared package before their dev server starts; running both together (what `pnpm dev` from the repo root does) fired both builds at the same instant, and two concurrent file copies collided on Windows. Fixed the copy to be safe under concurrent invocation — verified with 30 concurrent builds and a real `pnpm dev` run.
- **The AI studio was admin-gated** (`ec7565b`): rolled out that way deliberately in Phase 6, then opened to every signed-in creator on the user's explicit call. Verified with a genuinely non-admin test profile reaching both the UI and the job API.

## The `/create` redesign (`c1fbe8b`)

Phase 6 had split game creation into two separate destinations: a prompt-only `/create` for the (then-admin-only) studio, and `/create/template` for the classic wizard. The user pointed out this was wrong — and was right: the original prototype (`apps/lab/app/studio/StudioStart.tsx`) already had the correct design, built before this production work even started: the AI box and the template picker on **one screen**, with describing an idea and picking a template as two ways into the same flow, not two destinations.

Ported that design into `CreatorWizard.tsx` directly. `/create` is now one page for everyone: the AI generate box on top, "or start from a template" beneath it, then the same four template cards. `/create/template` and the redundant studio-start screen are deleted.

**Verified live in a real browser** with the user's own Groq key: the full loop ran for real — a generated game failed its first check, the AI fixed it, the fixed version passed, was test-played, and the replay verified it — and a template card still correctly proceeds through the classic Customise/Test/Publish steps.

## What's verified vs. what isn't

**Verified**, against a real production build and the real database, across four independent end-to-end scripts (106 HTTP-level checks) plus 223 unit/integration tests:
generate → check → fix → publish → moderate → play → replay → pay, for both engines, including the full tamper suite (inflated scores, forged seeds, fabricated timing, runtime mismatches, double-submission).

**Not yet verified:**
- An actual Vercel deployment. Everything above was proven with local production builds (`next start`); the plan's Phase 0 gate (a real preview deploy) was never run because there's no Vercel CLI or project link in this environment.
- The formal "critical acceptance test" as its own deliberate pass — though its substance (a non-template game, AI-generated, human-reviewed, played, and paid via server replay) has already happened for real in this session's live testing.

**Deferred by design, not oversight:**
- Image-slot assets (`game_assets`, upload/crop UI).
- Anthropic provider timing (only Groq has been measured; the pipeline is provider-neutral, but a slower model's round time against Vercel's function limit hasn't been checked).

## Database state left behind

Every test artifact from this session's E2E scripts is inert: draft or rejected games under isolated test profiles (`e2e-code-play@playloop.invalid`, `e2e-code-play-2@playloop.invalid`), never published, never in the feed. The one exception — a code game briefly published during the moderation E2E test — was deliberately reverted to `rejected` immediately after. The live UI test in the final session also left one real draft ("Beat Tap Rhythm," under the same test profile) generated with the user's actual Groq key — a genuine, harmless draft, never submitted.

All four legacy templates (Quiz, Catch, Memory, Reflex) are untouched and were re-verified working at every phase.
