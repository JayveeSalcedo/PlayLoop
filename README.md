# playloop

A game network where players play 30-second games for real rewards, creators build games from templates, and brands fund the prizes.

This repo is the production build, growing out of the single-file prototype at `reference/playloop-prototype.html`. See:
- `docs/tech-stack-plan.md` — the tech-stack plan and phased build order.
- `docs/feature-brief.md` — the feature/flow spec (from the project brief), reconciled with the PWA-first, email+OTP decisions below. `docs/play-loop-brief-source.docx` is the original file.

**Status (this commit): earn-and-spend loop plus challenges work end to end, with a server-verified play session** — email login → onboarding → feed → play (Catch, Quiz, Memory or Reflex, server-issued and server-validated) → points/XP → spend points in Rewards on a real, scannable-QR voucher → see it all in Wallet, and challenge a friend to a shareable `/c/<code>` link that doubles as a referral join (new visitors sign up, then land straight on the game). The creator studio and the brand console are later phases (see `docs/tech-stack-plan.md`).

## Stack

TypeScript everywhere · Turborepo + pnpm · Next.js 15 (App Router) · Tailwind v4 · Supabase Postgres (via Drizzle ORM) · email-OTP auth (Nodemailer/SMTP, no SMS cost) · free tiers of everything.

## Repo layout

```
apps/
  web/            The player app (Next.js): login, onboarding, feed, game player, wallet, rewards.
    app/(app)/      Route group sharing the bottom tabbar (Home/Wallet/Rewards) — a Next.js route
                    group, so it doesn't affect the URLs. /play/[slug] and /onboarding stay outside
                    it (fullscreen/setup flows, no tabbar).
    lib/qr.ts, lib/voucherCode.ts   Server-only voucher helpers (kept out of @playloop/ui so the
                    `qrcode` package never ships to the client bundle).
packages/
  games/          Framework-agnostic game engine + all 4 templates (Catch/Quiz/Memory/Reflex), ported from the prototype. Also the play-session timing/score rules (rules.ts) used to validate a submission server-side.
  economy/        Points/XP/leveling/voucher rules — single source of truth, unit tested.
  ui/             Design tokens (Tailwind v4 theme) + procedural art/icon helpers, ported from the prototype.
  db/             Drizzle schema, client, and a seed script for the starter games and rewards.
  config/         Shared tsconfig.
reference/
  playloop-prototype.html   The original clickable pitch prototype (kept for reference/diffing).
```

## Setup

1. **Install dependencies**
   ```
   pnpm install
   ```

2. **Database.** Create a free Supabase project (or point at any local Postgres) and grab its connection string.

3. **Environment.** Copy `.env.example` to `.env` at the repo root and fill in:
   - `DATABASE_URL` — your Postgres connection string.
   - `SESSION_SECRET`, `OTP_PEPPER` — any random strings (`openssl rand -hex 32`).
   - `SMTP_*` — optional in development. If `SMTP_USER`/`SMTP_PASS` are blank, login codes are logged to the console instead of emailed, so you can test the flow with no email provider set up (the default `SMTP_HOST` alone isn't enough to trigger real sending — see the comment in `apps/web/lib/mailer.ts`). For real sending, Brevo's free tier (300 emails/day) works well.

4. **Push the schema and seed the four starter games and four starter rewards**
   ```
   pnpm db:push
   pnpm db:seed
   ```
   **Known issue:** `drizzle-kit push` (0.28–0.31, both tried) currently crashes mid-introspection against this Supabase project with `TypeError: Cannot read properties of undefined (reading 'replace')` — a bug in its check-constraint introspection query, unrelated to our schema (verified: `public` has zero check constraints). If you hit this, apply the pending schema change by hand instead: compare `packages/db/src/schema.ts` against the live DB and write the equivalent `ALTER`/`CREATE TYPE` statements, run them via a one-off script using `getDb()`/`postgres` directly (see git history for `packages/db/src/_migrate_tmp.ts`-style examples), and verify column-by-column afterward. `db:generate` (which only diffs local files, no DB introspection) may still work if you'd rather adopt migration files going forward.

5. **Run it**
   ```
   pnpm dev
   ```
   Open http://localhost:3000, enter any email, and grab the code from the terminal log (or your inbox if SMTP is configured).

## Testing

```
pnpm test        # packages/economy (points/XP/leveling/payout/voucher status) + packages/games (session timing/score rules)
pnpm typecheck    # across all packages/apps
```

## Notes on this phase

- **Play sessions are server-issued and validated, not just server-scored.** `startPlay` opens a session before the client runs the game engine; `submitPlay` only credits points if the claimed session is still open (single-use — see `packages/db/src/schema.ts`'s `play_sessions` comment), the elapsed wall-clock time fits the template's real duration, and the score is within an analytic ceiling for that template/difficulty (`packages/games/src/rules.ts`). Rejected attempts are recorded with a reason, not silently dropped, for a future admin fraud-review queue. The elapsed-seconds figure is computed entirely DB-side (`now() - started_at`, in the same query that claims the session) rather than `Date.now() - startedAt` in app code — a real app-server/DB clock skew (hit during this phase's own testing: the dev machine's clock was ~3 minutes behind Supabase's) would otherwise make every legitimate play look impossibly fast and get rejected.
- **Challenges have no addressed recipient until someone plays them.** A challenge is a shareable `/c/<code>` link born from a completed play (`sender_id`/`sender_score` set at creation); `recipient_id`/`winner_id` stay null until whoever opens the link finishes their own play through it, at which point `submitPlay` resolves the outcome in the same transaction as the payout (win bonus to whichever profile actually won — which may not be the caller). There's no friends/contacts system in this phase, so a challenge is addressed to "whoever has the link," not a specific person. A new visitor who arrives via a challenge link signs up (email+OTP, same trust boundary as everyone else) before playing — the challenge code is threaded through login → verify → onboarding as a query param/hidden field, not a separate anonymous-session system — and their profile records `referred_by_challenge_id`, which pays the sender a one-time referral bonus the first time that new profile ever completes a play (idempotent via `count(completed plays) === 1`, no extra flag column).
- **Redemption is safe under real concurrency, not just "trust the client."** Unlike play scores (client-reported), a reward's cost is always a server-read DB value — the actual risk is two requests racing the same pool's last unit or the same balance. `redeemReward` (`apps/web/app/(app)/rewards/actions.ts`) uses conditional `UPDATE ... WHERE poolRemaining > 0` / `WHERE pointsBalance >= cost` writes, evaluated by Postgres against the row at write time, not a value read earlier — verified with a real concurrent-request test (two simultaneous redemptions for the last pool unit: exactly one succeeds, pool never goes negative).
- **No brands/campaigns tables yet** (that's the brand-console phase) — a reward just carries a brand name as text; pool-funded rewards carry their own `poolTotal`/`poolRemaining`. Voucher expiry is checked at read time (`voucherStatus()` in `@playloop/economy`), no background job, same pattern as `otp_codes`.
- **Still deferred, on purpose:** signed per-event telemetry / server-side replay of actual gameplay, and Upstash rate limiting. A single live session per player plus the min/max-duration check already bounds how fast points can be earned; add the rest once there's a real abuse signal. A streak feature is also deferred — see the comment in the Wallet page for how to derive one later with no schema change.
- **No background jobs yet** (Inngest deferred — see the plan). Fine for a closed MVP; add once there's real scheduled work.
- **Visual polish is minimal for now** — plain Tailwind utility styling using the ported color tokens, not yet the prototype's full hand-drawn shadow/border treatment. The game screens themselves (art, animations, scoring feel) are faithfully ported.
