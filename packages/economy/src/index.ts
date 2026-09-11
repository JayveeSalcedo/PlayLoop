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
