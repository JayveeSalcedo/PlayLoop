# Handoff — start here

Written 2026-09-12, right after Phase 4 (Creator studio) landed.
If you're a new Claude session picking this project up cold, read this first —
it'll save you from re-discovering things the hard way.

## What this is

playloop: players play 30-second games for points, spend points on real
rewards, creators build games, brands fund the prizes. Growing out of a
single-file HTML prototype (`reference/playloop-prototype.html`) into a
production TypeScript monorepo. Full context:
- `docs/tech-stack-plan.md` — stack decisions + phased build order (**read the
  "Build phases" section to see what's done vs. next**)
- `docs/feature-brief.md` — feature/flow spec
- `README.md` — status line, setup, and a "Notes on this phase" section that
  accumulates one paragraph per completed phase (read it, it's short)

## Current status

Phases 1-4 are done, verified against the real Supabase DB, and committed:
1. **Foundation + core loop** — email-OTP auth, onboarding, feed, all 4 game
   templates (Catch/Quiz/Memory/Reflex), server-issued + server-validated play
   sessions.
2. **Rewards + Wallet** — reward catalog, redemption with real scannable QR
   vouchers, Wallet page, shared bottom tabbar.
3. **Challenges** — shareable `/c/<code>` links born from a completed play,
   sign-up-first flow for new visitors, win/loss bonus, one-time referral
   bonus. See the commit message on `237a4e2` for the full design rationale.

4. **Creator studio** — a 4-step wizard at `/create` (Template → Customise →
   Test → Publish) behind a "+" tab, covering all four templates, not just
   Quiz. Test mode reuses the real engine with no session and no payout.
   Publishing writes a `pending_review` game plus a `moderation_reviews` row.

**Next up: Phase 5, store staff scanner + brand console MVP** — campaign
builder, Realtime KPI dashboard, with campaign "funding" as an admin-confirmed
checkbox rather than live Stripe. Phase 6 is the admin panel, which is what
finally drains the moderation queue Phase 4 started filling. See
`docs/tech-stack-plan.md`'s Build phases section for the full remaining
roadmap (then the deferred infra — Upstash/Inngest/Stripe/i18n/Capacitor —
once there's real need).

Working tree is clean; nothing in progress.

## Gotchas that will burn you if you don't know them

- **`drizzle-kit push` is broken against this Supabase project.** Crashes
  mid-introspection with an unrelated-looking `TypeError`. Don't debug it —
  apply schema changes by hand instead: write a throwaway script under
  `packages/db/src/_migrate_*_tmp.ts` that runs the `ALTER`/`CREATE TYPE`
  statements inside `sql.begin(...)`, run it with `npx tsx` from
  `packages/db`, verify column-by-column against `information_schema.columns`
  with a second throwaway script, then **delete both scripts** — this repo's
  established discipline is "no `_tmp.ts` files survive past verification."
  Full writeup: `README.md`'s setup step 4.
- **Any elapsed-wall-clock-time check must be computed DB-side**, never as
  `Date.now() - <a timestamp read from the DB>` in app code. Hit this for real
  in Phase 3: the dev machine's clock was ~3 minutes behind the Supabase
  server's, which made every legitimate play look impossibly fast and get
  silently rejected. Fixed in `submitPlay` by computing elapsed seconds with
  `extract(epoch from (now() - started_at))` inside the same claiming query.
  If you see a mystery "too fast"/"expired" rejection while testing, check
  `SELECT now()` (DB) against `new Date()` (local) before assuming the
  validation logic is wrong.
- **The Supabase DB is in Seoul (ap-northeast-2).** Expect an ~85-95ms
  round-trip floor on every query from a non-Seoul dev machine — this is not
  a bug, it's documented in `packages/db/src/client.ts`. Each route under
  `apps/web/app/(app)/` has a `loading.tsx` for perceived responsiveness;
  don't go chasing this latency as if it were fixable in code.
- **Cookie writes only work in Server Actions / Route Handlers, not plain
  Server Component renders.** Next.js will throw if you try. If you need to
  react to "session cookie points at a profile that no longer exists," use
  `requireProfile()` (`apps/web/lib/profile.ts`), not an ad-hoc
  `clearSession()` call from a page component.
- **There is no admin UI, so the moderation queue can't be drained from the
  app.** A creator-published game sits at `status = 'pending_review'` forever
  until someone runs an `UPDATE games SET status = 'published'` by hand. If
  you publish a test game and then wonder why it's missing from the feed,
  that's why — it's working as designed, not broken. Phase 6 builds the
  approve/reject screen.
- **Authoring rules live in `packages/games/src/authoring.ts`, not in the
  form.** If you add a field to the creator wizard, add its validation there
  too — the wizard and `publishGame` both call `validateGameDraft`/
  `normalizeConfig`, and a rule added only to the component is a rule the
  server won't enforce. `normalizeConfig` is also what strips unknown keys
  out of client-supplied config, so a new config key that isn't listed there
  will be silently dropped on publish.
- **`noUncheckedIndexedAccess: true`** is on in the shared tsconfig. Any array
  index or destructure is `T | undefined` — handle it explicitly
  (`rows[0]?.n ?? 0`, not `rows[0].n`).
- **Browser extensions inject DOM attributes** that cause hydration-mismatch
  warnings unrelated to real bugs. If you see one, check for extension
  fingerprints before assuming it's app code; `suppressHydrationWarning` on
  the specific element is the fix once confirmed (see commit `e67ac75`).
- **Testing "Challenge a friend" / anything using `navigator.share()`
  through Claude-in-Chrome browser automation**: it opens a native OS share
  sheet that blocks the page's JS (the awaited promise never resolves) and
  is invisible to CDP screenshots — the button just looks stuck on a spinner.
  Press `Escape` to dismiss it; this is expected automation behavior, not a
  bug to fix.

## Architecture patterns worth knowing before touching server actions

- **Server actions with side effects return an `{ok}` discriminated result and
  only throw after the transaction commits** — never throw mid-transaction if
  a partial write (e.g. marking something `rejected`) must survive even when
  the overall op "fails." Pre-transaction validation (nothing written yet) can
  throw plainly. See `submitPlay` in `apps/web/app/play/[slug]/actions.ts` for
  the canonical example of both styles in one function.
- **All balance mutations use SQL-side arithmetic** (`sql\`${col} + ${n}\``)
  inside a single conditional `UPDATE`, never read-then-write in JS — this is
  what makes concurrent redemptions/plays/challenge-bonuses race-safe, even
  when the credited profile isn't the calling user (e.g. challenge win bonus
  going to the sender).
- **`Tx` type** (`packages/db/src/client.ts`) is the actual type of a
  transaction callback's `tx` param — it is *not* the same type as `Db`.
  Use `Tx` for any helper function called from inside `db.transaction(...)`.
- **Three levels of auth-gating** in `apps/web/lib/session.ts` /
  `apps/web/lib/profile.ts`: `getSession()` (need a custom branch for
  logged-out visitors, e.g. the `/c/[code]` landing page), `requireSession()`
  (hard redirect if logged out), `requireProfile()` (also guarantees the
  profile row still exists).
- **Route Groups**: `apps/web/app/(app)/` shares the bottom tabbar layout
  without affecting URLs. Fullscreen/setup flows (`/play/[slug]`,
  `/onboarding`, `/c/[code]`) deliberately live outside it.

## How to verify a change here (the established workflow)

Every phase in this project has followed the same loop — do this, don't skip
steps:
1. Build the feature.
2. `pnpm typecheck` and `pnpm test` (26 tests as of Phase 3, in
   `packages/economy` and `packages/games`) across the whole monorepo.
3. `rm -rf apps/web/.next && pnpm build` (from `apps/web`) — a clean
   production build, not just dev-mode compiling.
4. **Verify against the real Supabase database and a real browser**, not just
   the build passing. Start `pnpm dev`, use Claude-in-Chrome to drive actual
   signup/play/whatever-the-feature-is flows, and confirm DB state with a
   throwaway `npx tsx` script (query the actual tables, don't just trust the
   UI). Delete the throwaway script(s) afterward and clean up any test
   profiles/rows they created.
5. Update `README.md`'s status line + "Notes on this phase" section, and mark
   the phase done (✅) in `docs/tech-stack-plan.md`'s Build phases list.
6. Commit with a descriptive message ending in the repo's attribution lines
   (see recent commits for the exact format — it includes a
   `Co-Authored-By` and `Claude-Session` line).

## Local setup reminder

Copy `.env.example` to `.env` at repo root, fill in `DATABASE_URL` (a
Supabase Postgres string), `SESSION_SECRET`/`OTP_PEPPER` (random hex), leave
`SMTP_USER`/`SMTP_PASS` blank in dev — OTP codes log to the console instead
(`[dev-mail] OTP for <email>: <code>`). `pnpm install`, `pnpm dev`, open
`http://localhost:3000` (or whatever port it picks if 3000's taken).
