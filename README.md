# playloop

A game network where players play 30-second games for real rewards, creators build games from templates, and brands fund the prizes.

This repo is the production build, growing out of the single-file prototype at `reference/playloop-prototype.html`. See `docs/tech-stack-plan.md` for the full tech-stack plan and phased build order.

**Phase 1 status (this commit): the core loop works end to end** — email login → onboarding → feed → play (Catch or Quiz) → points/XP awarded server-side. Challenges, rewards/vouchers, the creator studio, and the brand console are later phases.

## Stack

TypeScript everywhere · Turborepo + pnpm · Next.js 15 (App Router) · Tailwind v4 · Supabase Postgres (via Drizzle ORM) · email-OTP auth (Nodemailer/SMTP, no SMS cost) · free tiers of everything.

## Repo layout

```
apps/
  web/            The player app (Next.js): login, onboarding, feed, game player.
packages/
  games/          Framework-agnostic game engine + Catch/Quiz templates, ported from the prototype.
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
   - `SMTP_*` — optional in development. If `SMTP_HOST` is unset, login codes are logged to the console instead of emailed, so you can test the flow with no email provider set up. For real sending, Brevo's free tier (300 emails/day) works well.

4. **Push the schema and seed two starter games**
   ```
   pnpm db:push
   pnpm db:seed
   ```

5. **Run it**
   ```
   pnpm dev
   ```
   Open http://localhost:3000, enter any email, and grab the code from the terminal log (or your inbox if SMTP is configured).

## Testing

```
pnpm test        # packages/economy unit tests (points/XP/leveling/payout)
pnpm typecheck    # across all packages/apps
```

## Notes on this phase

- **No rate limiting or background jobs yet** (Upstash/Inngest deferred — see the plan). Fine for a closed MVP with a handful of testers; add them once there's real abuse risk or real scheduled work.
- **Score is client-reported.** The server re-derives the points payout from the score via `@playloop/economy`, but doesn't yet validate play-session timing server-side. Full anti-cheat is a documented follow-up (see `packages/db/src/schema.ts` comment on `play_sessions`).
- **Visual polish is minimal for now** — plain Tailwind utility styling using the ported color tokens, not yet the prototype's full hand-drawn shadow/border treatment. The game screens themselves (art, animations, scoring feel) are faithfully ported.
