# playloop — Feature Brief

Source: `Play Loop Brief.docx` (the project brief), reconciled here with the stack decisions in [`tech-stack-plan.md`](./tech-stack-plan.md) — **PWA-first, not native**, and **email+OTP auth, not phone/SMS**. See the reconciliation notes below before reading "mobile" as "native app."

## PWA reconciliation notes

The brief was written with a native mobile app in mind. We build one responsive PWA instead — everything below still applies, but read these translations first:

| Brief says (native-mobile framing) | What it means for the PWA build |
|---|---|
| "Account: phone/OTP or social sign-in" | **Email + OTP** (not phone/SMS) — see the auth decision in the tech plan. Same UX shape, different channel, no Twilio cost. |
| "push notifications (challenge received, streak at risk...)" | **Web Push**, not native push. Works on Android/desktop Chrome normally; on iOS it only works once the user has installed the PWA to their home screen (iOS 16.4+ requirement) — worth calling out to anyone reading this brief who expects native-push reliability. |
| "Store staff [I]" as a separate app | Just another route (`/staff`) in the same PWA, not a separate build. |
| "Quick create [I]: Quiz template on mobile" vs. the full web studio | Same codebase, same creator studio — needs to work at phone width, not a second implementation. |
| Native app-store distribution implied throughout | Deferred. Capacitor wrap comes later per the plan, only if/when app-store presence is actually needed — the PWA itself needs no install to be used. |

Everything else below — feed, gameplay, challenges, wallet, rewards, creator studio, brand console, admin, and all ten user flows — is UX/feature spec and needs no translation.

**Build status vs. this brief:** the core loop (auth → onboarding → feed → play → points/XP) is built (see the README). Challenges, rewards/vouchers, the full creator studio, brand console, and admin panel described below are the later phases — not yet started.

---

## 1. Platform split at a glance

| Role | Mobile (PWA at phone width) | Web (PWA at desktop width) |
|---|---|---|
| **Player** | Primary: everything | Secondary: challenge links open a web player; marketing site |
| **Creator** | Quick create (quiz), publish, stats | Primary: full studio, image uploads, analytics, payouts |
| **Brand** | Optional: view campaign results | Primary: campaign builder, dashboard, billing |
| **Store staff** [I] | Voucher scanner | Optional: redemption log |
| **Admin** [I] | None | Primary: moderation, rewards, fraud, finance |
| **Visitor / prospect** | Mobile landing page | Marketing site (How it works, Flywheel) |

`[P]` = specified in the brief · `[I]` = implied, needed for a real product but not explicitly spelled out

---

## 2. Mobile (phone-width) features

### Player (the core experience)
- **Onboarding [P]:** welcome screen, gamer name, pick one of 6 avatars, interest chips, welcome gift (+300).
- **Account [I]:** email+OTP sign-in (see reconciliation above) or social sign-in, profile editing, consent settings.
- **Home feed [P]:**
  - Header shows the avatar with a level ring, the points balance and an XP bar.
  - A sponsored spotlight card shows the reward pool bar ("742 left").
  - A "For you" grid shows each game's points, difficulty, play count, creator, and "Sponsored" or "New" badges.
- **Game intro [P]:** difficulty, length, "win up to" points, a banner when the game comes from a challenge, the description, and the sponsor's reward block.
- **Gameplay [P]:**
  - 4 game types: Catch, Tap Reflex, Memory, Quiz.
  - Every game has a 3‑2‑1 countdown, a timer, a live score, floating +/− points and a quit button.
- **Results [P]:**
  - Score, 1–3 stars, "New personal best", points and XP earned, level progress.
  - Win/loss against the challenger.
  - A nudge toward the next reward ("N points from a free flat white").
  - Buttons: Challenge a friend, Play again, Home.
- **Level-up [P]:** overlay showing the new tier and the perk it unlocks.
- **Challenges [P]:**
  - Send: a challenge card, multi-select friends, share by Message, Story or Copy link.
  - A live timeline follows the challenge: opened → joined (+250) → playing → won (+50) or lost → rematch.
  - A Challenges tab holds incoming challenges (Accept), history of challenges you sent, and the weekly friends leaderboard.
- **Wallet [P]:** balance, level, stats (games played, challenges won, friends invited), 7-day streak, transaction history.
- **Rewards [P]:**
  - Category filter, reward cards showing "Redeem" or "Need N more", and a redeem bottom sheet.
  - Redeeming produces a voucher with a QR code and code, valid for 7 days.
- **Implied [I]:** push notifications (challenge received or opened, streak at risk, new sponsored drop — see Web Push caveat above), contact import to invite friends, "My vouchers" list, settings, Arabic/RTL support.
- **Create button [P]:** the "+" tab opens the creator studio.

### Creator (lightweight, phone width)
- **Quick create [I]:** the Quiz template: title, questions, cover colour, publish.
- **Stats [I]:** plays, challenges and earnings per game.
- **Sponsorship [P]:** a toggle for "Open to brand sponsors".
- **Share [P]:** share the game link `playloop.app/g/<id>` to your own audience.

### Brand (optional, phone width)
- **Read-only campaign view [I]:** live KPIs, pool remaining, and alerts such as "Pool 80% claimed".

### Store staff [I]
- Scan a voucher QR code or enter the code, see whether it's valid, expired or already used, and confirm the redemption, which marks it used.
- See today's redemptions for their store.

---

## 3. Web (desktop width) features

### Visitor / prospect (marketing site) [P]
- Hero with clickable game cards and calls to action for the player app, the studio and the console.
- "How it works" story in 6 animated steps, the loop chain, and three role cards showing what each side gives and gets.
- Flywheel simulation: 24 months, counters, milestones, start/pause/reset.
- **Implied [I]:** sign-up forms for creators and brands, contact sales, pricing, legal pages.

### Player (web)
- **Challenge landing page [I]:** a link such as `playloop.app/c/xxxxx` opens a web game with no download. After playing, the friend is prompted to sign up. This is the key to the viral loop.
- **Web game player [I]:** plays any game at `playloop.app/g/<id>`.

### Creator studio (primary on web) [P]
- **4-step wizard:** Template → Customise → Test → Publish, with a progress stepper and Back/Next.
- **Templates:** Quiz Blitz, Memory Match, Catch and Collect, Tap Reflex, each labelled with what it's "Best for".
- **Customise:**
  - Title, cover theme (6 options), difficulty, max points slider (100–400).
  - Quiz editor: 2–8 questions, 4 answers each, correct answer marked, add and delete.
  - Memory: upload up to 6 images.
  - Catch: choose the falling item.
  - Reflex: choose the target colour.
- **Live preview:** the feed card updates as you edit. Validation errors appear inline.
- **Test play:** plays in a modal, then shows the test score and the points a player would earn.
- **Publish:** automated checks run, then you get a public link and live stats (plays, challenges, AED earned). You can toggle sponsor-ready, jump to the game in the feed, or make another game.
- **Earnings explainer:** AED 0.02 per play plus 30% of sponsorship.
- **Implied [I]:** "My games" list (edit, unpublish, archive), per-game analytics, payout setup (bank details, KYC), payout history, sponsorship offers inbox, versioning and drafts.

### Brand console (primary on web) [P]
- **Brand profile:** logo, description, number of stores.
- **Campaign builder:**
  - Reward pool: 1,000 free coffees, or an AED 5,000 pool.
  - Game: a brand original, a creator game, or a sponsor-ready creator game, each shown with its play count.
  - Cities: at least one required.
  - Duration: 7, 14 or 30 days.
- **Forecast:** plays, new players, minutes of play, cost per play. Launch or relaunch from here.
- **Live dashboard:**
  - Live/Complete status and "Day X of N".
  - 6 KPIs, a plays-per-day chart, a pool or budget bar, the funnel, and a live activity feed.
  - Insight card, with a final ROI summary (minutes of play, new players, store visits, cost per play, cost per visit).
  - Replay, or adjust and relaunch.
- **Implied [I]:**
  - Brand sign-up and team members.
  - Multiple campaigns and campaign history.
  - Reward catalog management: items, point prices, stock.
  - Store list management.
  - Payment and top-up, invoices.
  - CSV export, audience insights by interest and city.
  - Commissioning creators directly.

### Admin panel (web only) [I]
- Game moderation queue: approve or reject, report handling.
- Feed ranking and featured slots.
- Users: player and creator accounts, bans.
- Fraud: score anomalies, fake referrals, multiple accounts.
- Brands and campaigns: approval, pool balances.
- Reward catalog and partner onboarding.
- Finance: brand deposits, creator payouts, platform revenue.
- Platform analytics: DAU, retention, K-factor (how many new players each player brings in), redemptions.

---

## 4. User flows by role

### A. Player: first-time user [P]
1. Open the app, or tap a shared link → Welcome → "Get started".
2. Make your player: enter a name, pick an avatar and interests → Continue.
3. Welcome gift: tap the box → +300 points → "Start playing".
4. Home feed: tap a game card or the sponsored spotlight.
5. Game intro: review difficulty, length, reward and sponsor → "Play now".
6. Game: countdown, then 20–45 s of play.
7. Result: score, stars, points and XP; a level-up overlay appears if a level threshold is crossed.
8. Next step, any of: Challenge a friend (flow C) · Play again · Home · Tap the reward nudge → Rewards (flow D)

### B. Player: returning daily [P + I]
1. A push notification brings them back: streak at risk, or a challenge received [I].
2. Home: check points, level and the sponsored drop.
3. Challenges tab: accept an incoming challenge → Game intro with the "beat X" banner → play → Result shows win (+50) or loss → rematch.
4. Wallet: check the streak and history.
5. Rewards: redeem once they have enough points.

### C. Player: sending a challenge [P]
1. Result → "Challenge a friend".
2. Challenge screen: a card with your score; select friends (ones who aren't on playloop yet are marked "+250 if they join").
3. Choose Send challenge, or share by Message, Story or Copy link.
4. Live timeline: sent → opened → joined (+250 referral) → playing → result, with +50 on a win.
5. Rematch, go to All challenges, or go Home.

### D. Player: redeeming a reward [P]
1. Rewards tab: optionally filter by category.
2. Tap a reward → bottom sheet showing the cost, your balance and your balance afterward.
3. Two outcomes: **Enough points** → "Redeem" → points deducted → voucher with QR and code → "Done". **Not enough** → "Play to earn N more" → back to Home.
4. In store: show the voucher at the counter → staff scan it (flow H) [I].

### E. Invited friend: new user from a challenge [I, strongly implied]
1. Receives a challenge link through a message or story.
2. The web challenge page opens: "@nova challenges you: Beat my 1,240 on Bean Catcher".
3. Plays immediately in the browser, with no download.
4. Result against the challenger → prompt: "Save your points, join playloop."
5. Quick sign-up → onboarding (with the welcome gift) → the sender gets +250 → both land in the feed.

### F. Creator [P]
1. Enter from the player app's "+" button or from the web studio.
2. Template: choose Quiz, Memory, Catch or Reflex.
3. Customise: title, cover, difficulty, max points, plus template content (questions, images, falling item or target colour). The preview card updates live, and validation must pass before moving on.
4. Test: play the game in the preview modal → see the score and projected payout → "Play again" or "Looks good".
5. Publish: automated checks (content, difficulty tuning, challenge link, feed listing) → the game is live.
6. Post-publish: copy and share the game link · watch plays, challenges and earnings update · toggle Open to brand sponsors, which lists the game in the brand console · see it in the player feed · make another game.
7. [I] Later: manage games, review analytics, accept sponsorships, withdraw earnings.

### G. Brand [P]
1. [I] Sign up or log in → set up the brand profile, stores and billing.
2. Campaign builder: reward pool → game to sponsor (a brand original, or a sponsor-ready creator game) → cities → duration.
3. Review the forecast: plays, new players, minutes of play, cost per play.
4. [I] Fund the pool (payment) → campaign approval.
5. Launch → live dashboard: KPIs, chart, pool usage, funnel, activity feed.
6. Campaign complete: ROI summary → Adjust and relaunch, or Replay.
7. [I] Export reports and top up the pool.

### H. Store staff [I]
1. Log in to the staff app for their store.
2. Scan the player's voucher QR code, or type in the code.
3. The code is validated: valid, expired, or already used.
4. Confirm → the voucher is marked as redeemed → the brand dashboard's "claimed" and "store visits" counts update.

### I. Admin [I]
1. Review the moderation queue for newly published games → approve or reject.
2. Monitor fraud alerts: suspicious scores and referral farming.
3. Approve brand campaigns and confirm their funding.
4. Manage the reward catalog and pool inventory.
5. Run creator payouts and reconcile brand deposits.
6. Track platform KPIs.
