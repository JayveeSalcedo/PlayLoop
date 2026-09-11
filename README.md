# playloop

A game network where players play 30-second games for real rewards, creators build games from templates, and brands fund the prizes.

This repo is the production build, growing out of the single-file prototype at `reference/playloop-prototype.html`. See:
- `docs/tech-stack-plan.md` — the tech-stack plan and phased build order.
- `docs/feature-brief.md` — the feature/flow spec (from the project brief), reconciled with the PWA-first, email+OTP decisions below. `docs/play-loop-brief-source.docx` is the original file.

**Status (this commit): the core loop works end to end, with a server-verified play session** — email login → onboarding → feed → play (Catch, Quiz, Memory or Reflex) → points/XP awarded server-side, only for a session the server itself issued and validated. Rewards/vouchers/wallet, challenges, the creator studio, and the brand console are later phases (see `docs/tech-stack-plan.md`).

## Stack

TypeScript everywhere · Turborepo + pnpm · Next.js 15 (App Router) · Tailwind v4 · Supabase Postgres (via Drizzle ORM) · email-OTP auth (Nodemailer/SMTP, no SMS cost) · free tiers of everything.

## Repo layout

```
apps/
  web/            The player app (Next.js): login, onboarding, feed, game player.
packages/
  games/          Framework-agnostic game engine + all 4 templates (Catch/Quiz/Memory/Reflex), ported from the prototype. Also the play-session timing/score rules (rules.ts) used to validate a submission server-side.
  economy/        Points/XP/leveling rules — single source of truth, unit tested.
  ui/             Design tokens (Tailwind v4 theme) + procedural art/icon helpers, ported from the prototype.
  db/             Drizzle schema, client, and a seed script for the starter games.
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

4. **Push the schema and seed the four starter games**
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
pnpm test        # packages/economy (points/XP/leveling/payout) + packages/games (session timing/score rules)
pnpm typecheck    # across all packages/apps
```

## Notes on this phase

- **Play sessions are server-issued and validated, not just server-scored.** `startPlay` opens a session before the client runs the game engine; `submitPlay` only credits points if the claimed session is still open (single-use — see `packages/db/src/schema.ts`'s `play_sessions` comment), the elapsed wall-clock time fits the template's real duration, and the score is within an analytic ceiling for that template/difficulty (`packages/games/src/rules.ts`). Rejected attempts are recorded with a reason, not silently dropped, for a future admin fraud-review queue.
- **Still deferred, on purpose:** signed per-event telemetry / server-side replay of actual gameplay, and Upstash rate limiting. A single live session per player plus the min/max-duration check already bounds how fast points can be earned; add the rest once there's a real abuse signal.
- **No background jobs yet** (Inngest deferred — see the plan). Fine for a closed MVP; add once there's real scheduled work.
- **Visual polish is minimal for now** — plain Tailwind utility styling using the ported color tokens, not yet the prototype's full hand-drawn shadow/border treatment. The game screens themselves (art, animations, scoring feel) are faithfully ported.
