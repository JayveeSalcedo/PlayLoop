# playloop

A game network where players play 30-second games for real rewards, creators build games from templates, and brands fund the prizes.

This repo is the production build, growing out of the single-file prototype at `reference/playloop-prototype.html`. See:
- `docs/tech-stack-plan.md` — the tech-stack plan and phased build order.
- `docs/feature-brief.md` — the feature/flow spec (from the project brief), reconciled with the PWA-first, email+OTP decisions below. `docs/play-loop-brief-source.docx` is the original file.

**Status (this commit): players can now make the games too** — email login → onboarding → feed → play (Catch, Quiz, Memory or Reflex, server-issued and server-validated) → points/XP → spend points in Rewards on a real, scannable-QR voucher → see it all in Wallet, challenge a friend to a shareable `/c/<code>` link that doubles as a referral join, and build your own game in the creator studio at `/create` (pick a template, customise it, test-play it, publish it into the moderation queue). The brand console and the admin/moderation panel are later phases (see `docs/tech-stack-plan.md`).

## Stack

TypeScript everywhere · Turborepo + pnpm · Next.js 15 (App Router) · Tailwind v4 · Supabase Postgres (via Drizzle ORM) · email-OTP auth (Nodemailer/SMTP, no SMS cost) · free tiers of everything.

## Repo layout

```
apps/
  web/            The player app (Next.js): login, onboarding, feed, game player, wallet, rewards.
    app/(app)/      Route group sharing the bottom tabbar (Home/Rewards/Create/Challenges/Wallet) —
                    a Next.js route group, so it doesn't affect the URLs. /play/[slug] and
                    /onboarding stay outside it (fullscreen/setup flows, no tabbar).
    app/(app)/create/   The creator studio: the wizard, test mode, "My games", and per-game pages.
    lib/qr.ts, lib/voucherCode.ts   Server-only voucher helpers (kept out of @playloop/ui so the
                    `qrcode` package never ships to the client bundle).
packages/
  games/          Framework-agnostic game engine + all 4 templates (Catch/Quiz/Memory/Reflex), ported from the prototype. Also the play-session timing/score rules (rules.ts) used to validate a submission server-side, the authoring rules (authoring.ts) shared by the creator wizard and the publish action, and run.ts, the single mount path both the player and the studio's test mode go through.
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

- **The wizard and the server share one rulebook.** `packages/games/src/authoring.ts` holds every authoring rule (title length, 2-8 quiz questions with four answers each, max-points range/step, valid item/target/theme). The wizard imports it to gate its Next button and place inline errors; `publishGame` imports the same functions as the authoritative check. A rule only has to be written once, and the form can't drift out of sync with what the server will accept.
- **Nothing is written until you publish.** The wizard's draft lives entirely in client state — no autosave, no draft rows, no `status: 'draft'`. The first DB write is the publish itself. Test mode (`TestPlay.tsx`) runs the real engine through the same `runGameFromConfig` the player page uses, but with no play session and no `submitPlay`, so a creator can play their own game repeatedly without earning anything; the projected payout shown afterward is computed locally from the same `@playloop/economy` rules the server would apply.
- **`games.published` (boolean) became `games.status` (enum).** Three states were needed — `pending_review`, `published`, `rejected` — and a boolean can't carry them. The feed filters on `status = 'published'`; a creator-published game starts at `pending_review`, which means it is out of the feed, but its creator can still open `/play/<slug>` to preview it (everyone else gets a 404). `startPlay` refuses any non-published game, so previewing can't be turned into point-farming on an unreviewed game — the disabled Play button is the courtesy, the server check is the rule.
- **`moderation_reviews` is the audit log, `games.status` is the current state.** Publishing inserts one `pending` row per submission, in the same transaction as the game. Nothing drains that queue yet (the admin panel is phase 6), so approving a game today means an `UPDATE` by hand — deliberately, rather than faking an auto-approval that would make the trust boundary look real when it isn't.
- **Memory images are data URLs inside `games.config`**, shrunk client-side to a 220px square JPEG before they're sent (`create/shrink.ts`, ported from the prototype). There's no Supabase Storage bucket yet and six ~10KB images per game doesn't justify one. Because `memory.ts` interpolates those strings into an `<img src>` in an HTML string, `normalizeConfig` only accepts values matching a strict `data:image/(jpeg|png|webp);base64,…` pattern — a looser check would make the image slot an XSS vector. Per-image and whole-config size caps keep a row bounded.
- **Creator earnings are derived, not stored.** The AED figure on a creator's game page is `playCount * 0.02` computed at read time; there's no `creator_earnings` table until real payouts exist, same reasoning as voucher expiry being checked on read.
- **Anti-spam without new infrastructure:** a creator may have at most 3 games awaiting review, checked with one `count` query before the insert. Upstash is still deferred; this is the cheapest honest backpressure until there's a real abuse signal.
- **Play sessions are server-issued and validated, not just server-scored.** `startPlay` opens a session before the client runs the game engine; `submitPlay` only credits points if the claimed session is still open (single-use — see `packages/db/src/schema.ts`'s `play_sessions` comment), the elapsed wall-clock time fits the template's real duration, and the score is within an analytic ceiling for that template/difficulty (`packages/games/src/rules.ts`). Rejected attempts are recorded with a reason, not silently dropped, for a future admin fraud-review queue. The elapsed-seconds figure is computed entirely DB-side (`now() - started_at`, in the same query that claims the session) rather than `Date.now() - startedAt` in app code — a real app-server/DB clock skew (hit during this phase's own testing: the dev machine's clock was ~3 minutes behind Supabase's) would otherwise make every legitimate play look impossibly fast and get rejected.
- **Challenges have no addressed recipient until someone plays them.** A challenge is a shareable `/c/<code>` link born from a completed play (`sender_id`/`sender_score` set at creation); `recipient_id`/`winner_id` stay null until whoever opens the link finishes their own play through it, at which point `submitPlay` resolves the outcome in the same transaction as the payout (win bonus to whichever profile actually won — which may not be the caller). There's no friends/contacts system in this phase, so a challenge is addressed to "whoever has the link," not a specific person. A new visitor who arrives via a challenge link signs up (email+OTP, same trust boundary as everyone else) before playing — the challenge code is threaded through login → verify → onboarding as a query param/hidden field, not a separate anonymous-session system — and their profile records `referred_by_challenge_id`, which pays the sender a one-time referral bonus the first time that new profile ever completes a play (idempotent via `count(completed plays) === 1`, no extra flag column).
- **Redemption is safe under real concurrency, not just "trust the client."** Unlike play scores (client-reported), a reward's cost is always a server-read DB value — the actual risk is two requests racing the same pool's last unit or the same balance. `redeemReward` (`apps/web/app/(app)/rewards/actions.ts`) uses conditional `UPDATE ... WHERE poolRemaining > 0` / `WHERE pointsBalance >= cost` writes, evaluated by Postgres against the row at write time, not a value read earlier — verified with a real concurrent-request test (two simultaneous redemptions for the last pool unit: exactly one succeeds, pool never goes negative).
- **No brands/campaigns tables yet** (that's the brand-console phase) — a reward just carries a brand name as text; pool-funded rewards carry their own `poolTotal`/`poolRemaining`. Voucher expiry is checked at read time (`voucherStatus()` in `@playloop/economy`), no background job, same pattern as `otp_codes`.
- **Still deferred, on purpose:** signed per-event telemetry / server-side replay of actual gameplay, and Upstash rate limiting. A single live session per player plus the min/max-duration check already bounds how fast points can be earned; add the rest once there's a real abuse signal. A streak feature is also deferred — see the comment in the Wallet page for how to derive one later with no schema change.
- **No background jobs yet** (Inngest deferred — see the plan). Fine for a closed MVP; add once there's real scheduled work.
- **Visual polish is minimal for now** — plain Tailwind utility styling using the ported color tokens, not yet the prototype's full hand-drawn shadow/border treatment. The game screens themselves (art, animations, scoring feel) are faithfully ported.
