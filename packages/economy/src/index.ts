/**
 * The points/XP/leveling economy, ported from the prototype
 * (reference/playloop-prototype.html, roughly lines 1051-1054 and 1197-1404).
 *
 * This is the single source of truth for these rules — the player app,
 * the creator test-mode preview, and any server-side payout calculation
 * must all import from here rather than re-deriving the formulas.
 */

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** XP required to go from level `l` to `l + 1`. */
export function xpNeed(level: number): number {
  return 200 + (level - 1) * 150;
}

export const TIERS = [
  "Rookie",
  "Contender",
  "Challenger",
  "Challenger",
  "Pro",
  "Pro",
  "Legend",
  "Legend",
] as const;

export type Tier = (typeof TIERS)[number];

export function tier(level: number): Tier {
  return TIERS[Math.min(level - 1, TIERS.length - 1)] as Tier;
}

/** Perk unlocked at each level, index-aligned with TIERS. Level 1 = index 0. */
export const PERKS: string[] = [
  "",
  "",
  "Streak shield: miss a day, keep your streak",
  "Double points on your next challenge",
  "Early access to sponsored drops",
  "Creator badge on your profile",
  "Pro frame for your avatar",
  "Legend-only rewards",
];

export function perkForLevel(level: number): string {
  return PERKS[Math.min(level, PERKS.length - 1)] || "New rewards";
}

export interface XpState {
  xp: number;
  level: number;
}

export interface XpResult extends XpState {
  levelsGained: number;
}

/**
 * Apply an XP gain to a player's current xp/level, rolling over into
 * level-ups as needed (mirrors the prototype's addXP, playloop-prototype.html:1197).
 */
export function addXp(state: XpState, gain: number): XpResult {
  let xp = state.xp + gain;
  let level = state.level;
  let levelsGained = 0;
  while (xp >= xpNeed(level)) {
    xp -= xpNeed(level);
    level += 1;
    levelsGained += 1;
  }
  return { xp, level, levelsGained };
}

/**
 * Points payout for a completed game session.
 * Mirrors the prototype's payout() (playloop-prototype.html:1404):
 * score / target of maxPoints, clamped to a 15..maxPoints floor/ceiling.
 */
export function payout(maxPoints: number, score: number, target: number): number {
  if (target <= 0) return 15;
  return clamp(Math.round((maxPoints * score) / target), 15, maxPoints);
}

/** Bonus XP added on top of points earned when a game result is shown. */
export const RESULT_XP_BONUS = 40;

/** Points awarded to the sender when an invited friend joins and plays. */
export const REFERRAL_JOIN_BONUS = 250;

/** Points awarded for winning a challenge against a friend. */
export const CHALLENGE_WIN_BONUS = 50;

/** Points granted on first onboarding, as a welcome gift. */
export const WELCOME_GIFT_BONUS = 300;

/** Maximum points a guest (unverified) account can earn per calendar day. */
export const GUEST_DAILY_CAP = 2_000;

export type GameType = "quiz" | "catch" | "memory" | "reflex";

/** Score needed to earn the full maxPoints payout, per game type. */
export function scoreTarget(type: GameType, questionCount?: number): number {
  switch (type) {
    case "catch":
      return 420;
    case "reflex":
      return 560;
    case "memory":
      return 420;
    case "quiz":
      return Math.max(1, questionCount ?? 1) * 120;
  }
}

/**
 * Fraction of the best bot score a player must reach to earn the full payout.
 *
 * The bots are not good players — they idle, wander and mash — so a competent
 * human clears their best score comfortably. Biasing below it is deliberate:
 * a target set too high makes a game feel unrewarding and quietly kills it,
 * while one set too low costs nothing, because payout() clamps at maxPoints
 * either way. Better to be generous than to punish.
 *
 * There is no data behind 0.7 yet. Recalibrate from the real distribution of
 * play_sessions.verified_score once code games have meaningful volume.
 */
export const BOT_TARGET_FACTOR = 0.7;

/** One bot play from a version's LabReport: which bot, and what it scored. */
export interface BotRunScore {
  bot: string;
  ok: boolean;
  score?: number;
}

/**
 * Score needed to earn the full maxPoints payout on a code game, derived from
 * how its own bots did when it was checked.
 *
 * Template games get a hand-tuned scoreTarget per type, which an open-ended
 * generated game can't have — nobody knows what "a good score" means for a game
 * that didn't exist an hour ago. The bot runs are the one measurement we always
 * have: the game lab plays every version with an idle bot, an explorer and a
 * masher across several seeds before it can pass.
 *
 * Idle runs are excluded because they measure what the game pays for doing
 * nothing, not what a player can achieve. That the active bots beat the idle one
 * is already guaranteed by the lab's responds-to-input check, so the best active
 * score is a real floor on achievable scoring.
 *
 * This is **economy calibration only**. It has no say in whether a version is
 * valid or publishable — that is the lab's verdict, decided separately. Null
 * here means "the bots never scored, so we can't calibrate", which makes plays
 * fall back to payout()'s flat floor; it does not mean the game is broken.
 */
export function codeScoreTarget(runs: readonly BotRunScore[]): number | null {
  const active = runs
    .filter((r) => r.ok && r.bot !== "idle" && typeof r.score === "number")
    .map((r) => r.score!);
  if (active.length === 0) return null;

  const best = Math.max(...active);
  if (best <= 0) return null;

  return Math.max(1, Math.round(BOT_TARGET_FACTOR * best));
}

/**
 * Days a redeemed voucher stays valid before it's treated as expired.
 * Checked at read/redeem time by voucherStatus() below — no background job,
 * same pattern as otp_codes' expiresAt.
 */
export const VOUCHER_EXPIRY_DAYS = 7;

export type VoucherStatus = "active" | "redeemed" | "expired";

/** Derives a voucher's display status from its timestamps. Redeemed wins even if also past expiry. */
export function voucherStatus(v: { redeemedAt: Date | null; expiresAt: Date }, now: Date = new Date()): VoucherStatus {
  if (v.redeemedAt) return "redeemed";
  if (now > v.expiresAt) return "expired";
  return "active";
}

export type ChallengeOutcome = "sender" | "recipient" | "tie";

/** Determines a challenge's winner from both sides' scores. A tie favors neither — no bonus paid to either side. */
export function challengeOutcome(senderScore: number, recipientScore: number): ChallengeOutcome {
  if (senderScore === recipientScore) return "tie";
  return senderScore > recipientScore ? "sender" : "recipient";
}

export type CampaignStatus = "draft" | "scheduled" | "live" | "complete" | "cancelled";

export interface CampaignTiming {
  /** Set when an admin confirms the brand's payment arrived. Null = not funded. */
  fundedAt: Date | null;
  cancelledAt: Date | null;
  /** Inclusive date-only bounds, as stored ('YYYY-MM-DD'). */
  startsOn: string;
  endsOn: string;
}

/** 'YYYY-MM-DD' for a Date, in the same calendar terms the date columns use. */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Derives a campaign's state from its timestamps and date window, so nothing
 * has to run on a schedule to notice a campaign started or finished — the same
 * reasoning that keeps voucher expiry job-free.
 *
 * Order matters: cancelling beats everything, and an unfunded campaign is a
 * draft no matter what its dates say. A campaign whose window has opened but
 * which nobody funded must never read as "live", or a brand would see a
 * dashboard for something it hasn't paid for.
 *
 * Both bounds are inclusive: a one-day campaign with startsOn == endsOn is live
 * for that whole day.
 */
export function campaignStatus(c: CampaignTiming, now: Date = new Date()): CampaignStatus {
  if (c.cancelledAt) return "cancelled";
  if (!c.fundedAt) return "draft";
  const today = isoDay(now);
  if (today < c.startsOn) return "scheduled";
  if (today > c.endsOn) return "complete";
  return "live";
}

/**
 * Formats money held as integer fils (AED x 100).
 *
 * Money is stored in minor units so it can't drift by a rounding error, which
 * means every display goes through here rather than doing its own division.
 */
export function formatAed(fils: number): string {
  const sign = fils < 0 ? "-" : "";
  const abs = Math.abs(Math.round(fils));
  const dirhams = Math.floor(abs / 100);
  const minor = abs % 100;
  return `${sign}AED ${dirhams.toLocaleString("en-US")}.${String(minor).padStart(2, "0")}`;
}

/**
 * Budget divided by a count, in fils, for "cost per play" style figures.
 * Returns null for a zero denominator — a campaign with no plays yet has no
 * cost per play, and showing "AED 0.00" there would read as free rather than
 * unknown.
 */
export function costPer(budgetFils: number, count: number): number | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return Math.round(budgetFils / count);
}
