# Guest Challenge Play — Session Log

**Date:** 2026-09-19
**Branch:** `main`

## The ask

A friend who gets challenged currently has to log in (email OTP) before they can play. The ask: let them play first, and only ask them to log in afterward, to claim what they earned — with an encouraging message.

## Why this wasn't a small change

Every play in this app — even a challenge play — already required a real logged-in profile: `play_sessions.profile_id` is `NOT NULL`, and `startPlay`/`submitPlay`/`creditVerifiedPlay` all run against it. Two designs were considered:

1. **Defer everything until login** — play client-side, stash the score, replay it through the pipeline after login. Rejected: the app's anti-cheat model computes elapsed time DB-side from `play_sessions.started_at` (a past fix — see `docs/` — for exactly this kind of clock-skew bug), and there's no session to start until after login. An honest play could look suspiciously fast or slow once you factor in the OTP email round-trip.
2. **Silent guest profile (chosen)** — the instant someone hits "Play now" with no session, transparently create a real `profiles` row (a synthetic placeholder email, `isGuest: true`) and a session cookie, and run them through the *exact* existing verified pipeline unchanged. Points and the challenge outcome are earned for real, immediately, with correct timing. Logging in just attaches a real email to that same profile.

## What changed

- **`packages/db/src/schema.ts`** — added `profiles.is_guest` (migration applied by hand; `drizzle-kit push` crashes on this Supabase project, so this went through the manual-SQL workaround, verified column-by-column, throwaway script deleted).
- **`apps/web/app/c/[code]/page.tsx`** — no longer redirects an anonymous visitor to `/login`. Renders the challenge card either way; "Play now" is a real link when logged in, or a form posting to a new guest-start action when not. Also handles an anonymous visitor landing on an already-completed link (no session to compare a winner against).
- **`apps/web/app/c/[code]/actions.ts`** (new) — `startGuestChallengePlay`: validates the challenge, mints the guest profile + welcome gift + session, redirects into the normal `/play/[slug]?challenge=...` flow.
- **`apps/web/lib/profile.ts`** — `requireActiveProfile()` now refuses a guest profile by default (same style as the existing suspended-account check), with an `{ allowGuest: true }` opt-in used only by `startChallengedPlay`. Every other value-moving action (redeeming rewards, starting a different play, etc.) stays closed to a guest.
- **`apps/web/lib/creditPlay.ts`** — extracted `maybeAwardReferralBonus`; `creditVerifiedPlay` now skips it while the profile is still a guest, so nobody can farm the sender's referral bonus by spamming challenge links without ever verifying an email. Added `isGuest` to `PlayResult`.
- **`apps/web/app/login/verify/actions.ts`** — on OTP success, if the arriving session was a guest profile: upgrade it in place (same id, keep every point/XP/challenge win, no second welcome gift), then award the referral bonus now that it's actually claimed. If the entered email already belongs to a different real account (rare), merge the guest's earnings onto it instead of losing them.
- **`apps/web/lib/newProfile.ts`**, **`apps/web/lib/claimGuest.ts`** (new) — shared profile-creation and guest-merge helpers.
- **`apps/web/app/play/[slug]/PlayResultScreen.tsx`** — when `result.isGuest`, shows an encouraging "🔥 Nice run — don't lose this! Log in to lock in your N points" card and a claim CTA instead of the normal share/home actions.
- **`apps/web/app/login/page.tsx`** — encouraging copy ("Almost there — log in to claim the points you just earned") when arriving via a challenge claim link.

## Verified

Smoke-tested end to end in a browser against the real dev database (two full challenge cycles):
- Anonymous visit → guest profile silently created → played a real game live → correct payout, XP, and challenge outcome for both a **win** (+50 bonus, "You beat their 150!") and a **loss** ("They still lead with 150").
- The guest-claim CTA showed the correct total (payout + challenge bonus).
- Logging in via OTP upgraded the same profile in place — no duplicate account, all points carried over.
- **Caught and fixed a real bug during testing:** the referral bonus wasn't firing on the common claim path (only the rare merge path called it) — confirmed by checking the sender's ledger before and after the fix.

All test data and throwaway scripts created during testing were cleaned up from the database afterward. `pnpm typecheck` and `pnpm --filter @playloop/web lint` are clean.
