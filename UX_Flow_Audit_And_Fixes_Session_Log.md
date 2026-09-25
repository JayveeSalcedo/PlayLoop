# UX Flow Audit & Fixes — Session Log

**Date:** 2026-09-25
**Branch:** `main`

## The ask

Review the app's user-facing flows end to end (signup → onboarding → guest play → challenge links → arena → wallet/rewards → game creation) for gaps or anything that disrupts the experience, and suggest improvements. Two of the findings were then fixed in the same session.

## What the audit found

Traced the actual page and server-action code for each flow rather than skimming. Findings, ranked by impact:

1. **Deep links lost their destination through login (systemic)** — `requireSession()` always did a bare `redirect("/login")`; the OTP path never carried a `redirect` param even though the guest-mode form had half-built support for one. Any logged-out deep link (a shared community post, a game page, an arena QR-code join) landed on the generic feed after login instead of back where the visitor was headed. Worst case: `/events/join?code=XXXX` — a logged-out scan at a live event dropped the join code entirely. **Fixed this session.**
2. **A guest who hit the daily points cap (or an anti-cheat rejection) lost the whole play with no way forward** — the failure was caught and the player was bounced to the intro screen with a plain error string, a "Play now" button that would just fail again, no save/login CTA, and no view of the score they'd just earned. **Fixed this session.**
3. **No `error.tsx` or `not-found.tsx` anywhere in the app** — any unexpected thrown error or `notFound()` falls through to Next's default unstyled page, breaking out of the custom design system. Not fixed yet.
4. **"Friends invited" stat hardcoded to `0` on Wallet** (`app/(app)/wallet/page.tsx`) — the referral system is real and working; the stat just never reads it. Not fixed yet.
5. **Guest sign-out warning undersells the real stakes** — `SignOut.tsx`'s confirm copy ("You'll need a fresh code to sign back in") is written for a real account; for a guest, signing out is permanent, unrecoverable loss of everything earned, and the component isn't guest-aware. Not fixed yet.
6. **Guests can create and publish games with no warning of orphan risk** — `/create` only requires a profile to exist, not an active (non-guest) one, so an unclaimed guest can publish a real game under a throwaway identity they can never log back into if they don't claim it. Not fixed yet.
7. Minor: `/login/verify` has no resend-code or edit-email affordance.
8. Minor: onboarding's gift step has no way back to fix the name/avatar chosen on the previous step.

## Fix 1 — deep-link redirect preservation

**Commit:** `5ed3d28`

- **`middleware.ts`** — the actual gatekeeper for most protected routes. Now also protects `/community` and `/events` (previously guarded only by an inconsistent page-level check), and appends `?redirect=<page they wanted>` onto the `/login` bounce instead of dropping it.
- **`apps/web/lib/redirectPath.ts`** (new) — validates a redirect value is a genuine same-site path before it's ever used in a `redirect()` call, blocking `//evil.com`-style open-redirect tricks. Also closed a small pre-existing hole in the guest-mode redirect that only checked `startsWith("/")`.
- **`apps/web/app/login/{page,actions}.tsx`**, **`apps/web/app/login/verify/{page,actions}.tsx`**, **`apps/web/app/onboarding/{page,OnboardingFlow,actions}.tsx`** — `redirect` is now threaded through every hop exactly like `challenge` already was: `/login` → `/login/verify` → (onboarding, if the account is new) → final destination. Priority order: onboarding first if needed → challenge link (still wins, since that's what they clicked) → the preserved `redirect` → generic default landing.

Result: scanning an arena QR code while logged out now round-trips through login (guest button or email code) and lands back in the arena lobby with the join code intact, instead of dropping the visitor on the feed with no code.

## Fix 2 — a rejected/capped play shows its score and a real next step

**Commit:** `ad38f87`

- **`apps/web/lib/creditPlay.ts`** — the guest daily-cap outcome is now tagged `reason: "guest_cap"` instead of being identified only by its error string.
- **`apps/web/app/play/[slug]/actions.ts`** — `submitPlay` no longer throws for the two *recoverable* outcomes (guest cap, anti-cheat rejection); it returns `{ ok: false, reason, error, score }` so the UI can react specifically. Every other failure (duplicate/expired session, deleted game, suspended account) still throws into the existing generic catch-and-retry handling — those aren't states with a specific recovery action.
- **`apps/web/app/api/play/[sessionId]/submit/route.ts`** (code-game replay path) — real (non-test) rejections now get the same stable `reason: "rejected"` tag the template engine uses, plus the score, instead of `reason: undefined`.
- **`apps/web/app/play/[slug]/PlayNotCreditedScreen.tsx`** (new) — shown instead of bouncing to the intro screen: displays the score with a "Not counted" badge, then either a "Save progress with OnePass" primary CTA (guest cap) or plain "Try again" (rejection). Wired into both `GamePlayer.tsx` (template games) and `CodeGamePlayer.tsx` (code games), which share this screen the same way they already share `PlayResultScreen`.

Result: a guest who hits their daily cap mid-play now sees the score they got and a direct way to save it, instead of a dead-end error above a button that would just fail again.

## Verified

- `pnpm typecheck`, `pnpm --filter @playloop/web lint`, and `pnpm --filter @playloop/web test` (67 tests) all clean after both fixes.
- Both commits pushed to `origin/main`.

## Not done yet

Findings 3–8 above are still open — none were blocking, and none were asked for beyond the two fixed here.
