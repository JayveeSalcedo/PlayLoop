# playloop — Tech Stack Plan

## Context
`playloop.html` (1,836 lines, single-file vanilla JS prototype) demonstrates a three-sided platform: **players** (mobile), **creators** and **brands** (web dashboards), plus implied **store staff** and **admin**. Everything is mocked in memory. We need a production tech stack to build the MVP.

Decisions already made with the user:
- **Player app: PWA first**, native later (Capacitor wrap) — matches the prototype's "no download" promise; challenge links open straight into a playable game.
- **TypeScript everywhere.**
- **Managed / serverless hosting** (Vercel + Supabase) — minimal DevOps, fastest MVP.
- **Free plans first** on every third-party service; upgrade only the pieces that hit a limit.
- **Login codes by email via Nodemailer**, not SMS/Twilio — no per-message cost, no UAE sender-ID registration.

## Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Monorepo | **Turborepo + pnpm** | Share game engine, UI, types across apps |
| Web framework | **Next.js 15 (App Router) + React 19** | SSR for challenge/OG pages, PWA, dashboards in one framework |
| Styling / UI | **Tailwind CSS v4 + shadcn/ui**, tokens ported from prototype `:root` (playloop.html:11-18), Bricolage Grotesque font | Keeps the neo-brutalist look; RTL via Tailwind logical props |
| PWA | **Serwist** (service worker), Web App Manifest, Web Push (VAPID) | Installable, offline shell, push (iOS 16.4+ needs installed PWA) |
| Native later | **Capacitor** wrapping the player app | Store presence + native push without rewrite |
| Game engine | **Framework-agnostic TS package** (`packages/games`), Canvas 2D for Catch, DOM for Quiz/Memory/Reflex | Port prototype `GT` (playloop.html:1447), `runGame` (:1406), `payout` (:1404), art helpers `artSVG` (:1012), `avatar` (:988), `itemShape` (:995); reused in player + creator test mode |
| Client state / data | **TanStack Query** (server state), **Zustand** (game/session state), **React Hook Form + Zod** | Standard, typed |
| Hosting | **Vercel Hobby** (apps) — ⚠️ see note below | Free, zero-config Next.js deploys |
| Backend | **Supabase Free tier**: Postgres, Auth, Storage, Realtime, Row Level Security | Managed DB+auth; Realtime powers brand live dashboard + challenge timeline |
| Business logic | **Next.js Route Handlers / Server Actions** + **Drizzle ORM**; Postgres functions for atomic ledger ops | Server-authoritative points, scoring, redemptions |
| Background jobs | ⏸ **Deferred.** Add Inngest (free tier) once there's a real need — voucher expiry, campaign end, streak resets, payout batches | Not needed until vouchers/campaigns/streaks exist; a cron-less MVP can compute these on read (e.g. check `expires_at` at request time) |
| Rate limiting / cache | ⏸ **Deferred.** Add Upstash Redis (free tier) once real users could abuse the system | A closed MVP with a handful of testers doesn't need bot/abuse protection yet; a simple per-request DB check is enough to start |
| Auth | Supabase Auth, **email + 6-digit OTP code** (custom, sent via Nodemailer) for players, creators and brands; Google/Apple sign-in as an optional fast path | Free, no SMS cost; skips UAE SMS sender-ID registration. Trade-off: less frictionless than the prototype's instant phone sign-up |
| Sharing / virality | Web Share API, deep links `/c/:code`, `/g/:id`; **@vercel/og** dynamic challenge-card images | Rich previews in WhatsApp/Instagram drive the growth loop |
| Vouchers | `qrcode` (generate, signed short codes), `@zxing/browser` (staff scanner) | Replaces prototype's fake `qrSVG` (:1394) |
| Payments | ⏸ **Deferred.** Stub campaign funding as an admin-confirmed "payment received" checkbox until a real brand is ready to pay; add Stripe test mode then | No real money moving yet in the MVP — building Stripe integration early is wasted effort until there's a paying brand |
| Charts | **Recharts** | Free, open-source; Brand + creator dashboards |
| Product analytics | **PostHog free tier** (1M events/mo) | Platform KPIs; brand metrics come from our own tables |
| Brand metrics | `play_events` table + Postgres materialized views; move to Tinybird/ClickHouse at scale | Auditable numbers brands pay against |
| i18n | **next-intl**, English + Arabic (RTL) | UAE market |
| Email | **Nodemailer** + a free SMTP provider (Brevo free tier: 300/day, or Gmail SMTP for dev) | Login codes, receipts, notifications — no per-email SaaS cost at low volume |
| Monitoring | **Sentry** (free developer tier) | Errors + performance |
| Testing | **Vitest** (engine, economy, ledger), **Playwright** (flows, mobile viewport), Supabase CLI local DB + RLS tests | |
| CI/CD | **GitHub Actions** + Vercel preview deploys + Supabase migrations | |

**Data residency note:** Supabase has no UAE region (use nearest, e.g. Mumbai/Frankfurt). If UAE PDPL or brand contracts require in-country data, plan a later move of Postgres to AWS `me-central-1`; Drizzle + plain Postgres keeps that migration cheap.

**⚠️ Free-tier caveats to know going in:**
- **Vercel Hobby's terms restrict it to non-commercial use.** Fine for building and demoing to brand prospects; move to a paid Vercel plan (or Cloudflare Pages/Netlify free tiers as an alternative) before taking real brand money or launching publicly.
- **Supabase Free pauses a project after 7 days of no API activity** — a problem for a demo brands might visit sporadically; a scheduled ping (a free cron, e.g. GitHub Actions) keeps it awake. Free tier is also capped at 500MB DB / 1GB storage / 2GB bandwidth.
- **Brevo/SMTP free tier (300 emails/day)** is plenty for MVP login-code volume but will need upgrading once daily active users exceed roughly that.
- **Upstash and Inngest free tiers** cap request/step volume — fine at MVP traffic, watch usage as it grows.

## Repository layout
```
playloop/
  apps/
    web/        playloop.app  — marketing site, player PWA, challenge landing (/c/:code), web player (/g/:id)
    console/    console.playloop.app — creator studio, brand console, admin, store-staff scanner (/staff), role-gated
  packages/
    games/      TS game engine + 4 templates + scoring/payout (ported from playloop.html)
    economy/    xpNeed, tiers, perks, payout rules, referral/challenge bonuses (single source of truth)
    ui/         Tailwind preset, shadcn components, brand tokens, avatar/art SVG helpers
    db/         Drizzle schema, migrations, RLS policies, seed data (Beanhouse, 4 seed games, 6 rewards)
    config/     tsconfig, eslint, prettier
```

## Core data model (Postgres)
`profiles` (name, avatar, interests, level, xp, role flags) · `games` (type, config JSON, theme, difficulty, max_points, creator_id, brand_original, sponsor_ready, status) · `play_sessions` (issued token, started_at, ended_at, score, validated) · `ledger_entries` (immutable, +/− points, reason, ref) · `challenges` + `challenge_recipients` (code, score, status, referral) · `rewards` (brand, cost, category, stock/pool_id) · `vouchers` (code, expires_at, redeemed_at) + `voucher_redemptions` (voucher, store, staff, reversed_at — an audit row rather than a `redeemed_store_id` column, so a staff undo can hand the voucher back without erasing the record) · `brands`, `brand_members`, `stores`, `store_staff` · `campaigns` (brand, game, pool, cities, dates, budget) · `play_events` (analytics) · `creator_earnings`, `payouts` · `moderation_reviews`.

Balance = `SUM(ledger_entries)` (cached column updated in same transaction). Redemption = one Postgres function: check balance → debit → decrement pool → create voucher.

## Roles & security
- Roles: player (everyone), creator (any player who publishes), brand_member, store_staff, admin — enforced with **RLS** + server checks.
- **Anti-cheat:** server issues a play session on "Play now"; score accepted only if duration and score are within template bounds (`target`, max duration); payout computed server-side via `packages/economy`. Rate-limit sessions per user/device.
- **Referral rules:** +250 only after invitee verifies their email (OTP code) and completes first game; one bonus per unique email.

## Build phases (maps to MVP from earlier analysis)
Trimmed to the **core loop first**: prove auth → play → earn → see it in the feed works end-to-end before adding growth/monetization surface area.

1. ✅ **Foundation + core loop:** monorepo, Supabase project, email-OTP auth, UI tokens, port Quiz + Catch into `packages/games`; onboarding, feed, game intro/play/result, ledger. Also pulled forward from later: all 4 game templates (Memory/Reflex ported too), and play sessions are server-issued + server-validated (timing/score bounds), not just server-scored.
2. ✅ **Rewards + vouchers + Wallet:** reward catalog, redemption flow with real scannable QR vouchers (still no real payment — a seeded reward pool stands in for brand funding), Wallet (balance, level, voucher list, history), and a shared bottom tabbar.
3. ✅ **Challenges (the growth loop):** shareable `/c/<code>` challenge links born from a completed play, a web challenge landing page (sign-up-first for new visitors, challenge context threaded through login/verify/onboarding), win/loss bonus resolved atomically with the recipient's payout, and a one-time referral bonus on a referred profile's first completed play. (OG cards deferred — no image-generation infra yet; the landing page itself carries the "beat this score" framing.)
4. ✅ **Creator studio:** a 4-step wizard (Template → Customise → Test → Publish) at `/create`, reached from a "+" tab in the player tabbar. Scope grew beyond the planned Quiz-only: **all four templates are authorable** (quiz question editor, catch item picker, reflex target colour, memory image upload). Test mode replays the real engine with no play session and no payout. Publishing writes a `pending_review` game plus a `moderation_reviews` row — the game stays out of the feed and unplayable for points until approved, though its creator can see and preview it. (No admin approve/reject UI yet — that's phase 6; this phase only fills the queue honestly.)
5. **Store staff scanner + brand console MVP** — split in two, since they're separate products and bundling them made one change too big to verify honestly.
   - ✅ **5a, staff scanner:** `/staff` validates a typed voucher code (unknown / expired / already used / wrong brand / valid), marks it redeemed against the staff member's store, and allows an undo inside a 10-minute DB-side window. New `stores`, `store_staff` and `voucher_redemptions` tables; staff membership is a row, not an env allowlist. Camera capture (`@zxing/browser`) deferred — the QR encodes the bare code, so it's a thin layer over this rather than a rewrite.
   - **5b, brand console:** campaign builder, Realtime KPI dashboard; campaign "funding" is an admin-confirmed checkbox, not live Stripe. Needs brands/campaigns tables, a chart library, and a city/geo concept that doesn't exist on any table yet.
6. **Admin:** moderation ✅ (pulled forward ahead of phase 5, since nothing could drain the queue phase 4 started filling — `/admin`, gated by an `ADMIN_EMAILS` allowlist rather than a database role; approve, or reject with a reason the creator sees). Still to do: rewards/pools management and fraud review.
7. **Phase 2 — add back the deferred infrastructure as real need appears:** Upstash rate limiting (once there are real users to abuse it), Inngest background jobs (voucher expiry, payout batches, streak resets), Stripe live payments (once a brand is ready to pay), plus Memory/Reflex templates, image uploads, levels/streaks/perks, leaderboards, forecasting, push notifications, Arabic, Capacitor app-store builds.

## Rough running cost at MVP scale
**$0/month** while building and demoing: Vercel Hobby, Supabase Free, Brevo/SMTP Free, PostHog Free, Sentry Free. Upstash, Inngest and Stripe aren't even wired up yet in this phase (see deferrals above), so they cost nothing and add no setup time until they're actually needed. The only real cost is a domain name (~$10-15/yr). Budget to start paying once any free-tier cap is hit or the product goes commercial (Vercel plan, Supabase Pro ~$25/mo being the first likely upgrades).

## Verification (validating the stack before full build)
1. **Spike:** scaffold monorepo, port Catch + Quiz to `packages/games`, render in `apps/web` PWA; test on real iOS/Android — 60fps canvas, touch drag, installability (Lighthouse PWA audit).
2. **Challenge link test:** generate `/c/:code` with @vercel/og image; paste into WhatsApp/Instagram and confirm preview + one-tap play without login.
3. **Ledger test:** Vitest + concurrent redemption test against local Supabase — no negative balances, pool never oversold.
4. **RLS test:** automated tests that a brand member cannot read another brand's campaigns; a player cannot write ledger entries directly.
5. **Realtime test:** simulate play events and confirm brand dashboard updates live.
6. **Playwright E2E:** onboarding → play → challenge → redeem → staff validates voucher → brand dashboard count increments.
