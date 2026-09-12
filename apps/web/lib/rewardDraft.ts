import { THEMES } from "@playloop/ui";

/**
 * Validation for the admin reward catalogue, shared by the form and the server
 * action — the same split the creator studio uses (packages/games' authoring.ts
 * is imported by both the wizard and publishGame), so a rule can't end up
 * enforced in one and not the other.
 */

export const REWARD_CATEGORIES = ["Food and drink", "Fun", "Shopping"] as const;
export type RewardCategory = (typeof REWARD_CATEGORIES)[number];

/** Icons offered for a reward. Keys of @playloop/ui's icon(); kept short on purpose. */
export const REWARD_ICONS = ["gift", "cup", "star", "bolt", "book", "spark"] as const;

export const NAME_MAX = 40;
export const DESCRIPTION_MAX = 120;
export const COST_MIN = 1;
export const COST_MAX = 100_000;
export const POOL_MAX = 1_000_000;

export interface RewardDraft {
  name: string;
  description: string;
  brandId: string;
  category: string;
  costPoints: number;
  theme: string;
  icon: string;
  /** null = uncapped. A number caps the stock. */
  poolTotal: number | null;
  /** Only meaningful on an edit; must never exceed poolTotal. */
  poolRemaining?: number | null;
}

export interface DraftIssue {
  field: string;
  message: string;
}

const isPositiveInt = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0;

export function validateRewardDraft(draft: RewardDraft): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const name = String(draft?.name ?? "").trim();

  if (!name || name.length > NAME_MAX) {
    issues.push({ field: "name", message: `Give the reward a name, up to ${NAME_MAX} characters.` });
  }
  if (String(draft?.description ?? "").length > DESCRIPTION_MAX) {
    issues.push({ field: "description", message: `Keep the description under ${DESCRIPTION_MAX} characters.` });
  }
  if (!draft?.brandId) {
    issues.push({ field: "brandId", message: "Pick the brand this reward belongs to." });
  }
  if (!REWARD_CATEGORIES.includes(draft?.category as RewardCategory)) {
    issues.push({ field: "category", message: "Pick a category." });
  }
  if (!isPositiveInt(draft?.costPoints) || draft.costPoints < COST_MIN || draft.costPoints > COST_MAX) {
    issues.push({ field: "costPoints", message: `Cost must be a whole number between ${COST_MIN} and ${COST_MAX}.` });
  }
  if (!Object.hasOwn(THEMES, String(draft?.theme))) {
    issues.push({ field: "theme", message: "Pick a colour." });
  }
  if (!REWARD_ICONS.includes(draft?.icon as (typeof REWARD_ICONS)[number])) {
    issues.push({ field: "icon", message: "Pick an icon." });
  }

  const { poolTotal, poolRemaining } = draft ?? {};
  if (poolTotal != null) {
    if (!isPositiveInt(poolTotal) || poolTotal > POOL_MAX) {
      issues.push({ field: "poolTotal", message: `A pool must be a whole number up to ${POOL_MAX}, or left empty for uncapped.` });
    } else if (poolRemaining != null && (!Number.isInteger(poolRemaining) || poolRemaining < 0 || poolRemaining > poolTotal)) {
      // Remaining above total would make the pool bar read over 100% and let
      // more be claimed than was ever funded.
      issues.push({ field: "poolRemaining", message: "Remaining can't be more than the pool total." });
    }
  } else if (poolRemaining != null) {
    issues.push({ field: "poolRemaining", message: "An uncapped reward has no remaining count." });
  }

  return issues;
}
