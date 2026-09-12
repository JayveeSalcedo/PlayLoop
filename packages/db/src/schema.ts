/**
 * Core schema: auth (email OTP) -> play -> earn -> spend (rewards/vouchers).
 * Deliberately scoped to what's been built so far — see "Core data model"
 * in the plan for the fuller model (challenges, brands, campaigns, ...) to
 * be added as those phases start.
 */
import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const gameTypeEnum = pgEnum("game_type", ["quiz", "catch", "memory", "reflex"]);
export const difficultyEnum = pgEnum("difficulty", ["Easy", "Medium", "Hard"]);
export const playSessionStatusEnum = pgEnum("play_session_status", [
  "started",
  "completed",
  "rejected",
  "abandoned",
]);
export const rewardCategoryEnum = pgEnum("reward_category", ["Food and drink", "Fun", "Shopping"]);
export const challengeStatusEnum = pgEnum("challenge_status", ["pending", "completed"]);
export const gameStatusEnum = pgEnum("game_status", ["pending_review", "published", "rejected"]);
export const moderationOutcomeEnum = pgEnum("moderation_outcome", ["pending", "approved", "rejected"]);

export const profiles = pgTable("profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  avatarIndex: integer("avatar_index").notNull().default(0),
  interests: jsonb("interests").$type<string[]>().notNull().default([]),
  level: integer("level").notNull().default(1),
  xp: integer("xp").notNull().default(0),
  /**
   * Cached balance, kept equal to SUM(ledger_entries.delta) for this profile.
   * Always update this in the same transaction as the ledger insert that
   * changes it — never write it independently.
   */
  pointsBalance: integer("points_balance").notNull().default(0),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  /**
   * Set once, at profile-creation time in login/verify/actions.ts, if this
   * profile's first-ever signup happened via a /c/<code> challenge link —
   * never updated afterward (a profile can only ever have one referrer).
   * Read later by submitPlay to decide whether this profile's first
   * *completed* play should credit the referrer's REFERRAL_JOIN_BONUS.
   */
  referredByChallengeId: uuid("referred_by_challenge_id").references((): AnyPgColumn => challenges.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Email login codes, sent via Nodemailer (see apps/web/lib/mailer.ts).
 * codeHash is a salted hash, never the plaintext code — see lib/otp.ts.
 */
export const otpCodes = pgTable("otp_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A playable game. Seeded brand originals (creatorId null, brandOriginal true)
 * and creator-published games share this table; status is what gates the feed.
 * A creator-published game starts at 'pending_review' — visible to its creator
 * but not in anyone's feed and not playable for points — until the Phase 6
 * admin queue approves it. See moderationReviews.
 */
export const games = pgTable("games", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  type: gameTypeEnum("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  theme: text("theme").notNull().default("neon"),
  difficulty: difficultyEnum("difficulty").notNull().default("Medium"),
  maxPoints: integer("max_points").notNull().default(200),
  /** Template-specific content: quiz questions, catch item/theme, etc. */
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  creatorId: uuid("creator_id").references(() => profiles.id),
  brandOriginal: boolean("brand_original").notNull().default(false),
  status: gameStatusEnum("status").notNull().default("pending_review"),
  /** Creator opt-in: lists the game for brand sponsorship in the (Phase 5) brand console. */
  sponsorReady: boolean("sponsor_ready").notNull().default(false),
  playCount: integer("play_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Audit log of publish submissions — one row per time a creator submits a game
 * for review. games.status is the game's current state; this is the history of
 * how it got there, and the queue the Phase 6 admin panel drains.
 * reviewerId/decidedAt stay null while outcome is 'pending'.
 */
export const moderationReviews = pgTable(
  "moderation_reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id),
    outcome: moderationOutcomeEnum("outcome").notNull().default("pending"),
    reviewerId: uuid("reviewer_id").references(() => profiles.id),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (table) => [index("moderation_reviews_game_id_idx").on(table.gameId)],
);

/**
 * A play attempt. The server issues a row here (status 'started', via
 * startPlay) before the client runs the game, so a submission always has a
 * server-known start time to check elapsed time against. submitPlay then
 * validates the claimed score/duration against @playloop/games' playRules
 * before crediting anything, and flips status to 'completed' or 'rejected'
 * accordingly — see apps/web/app/play/[slug]/actions.ts. A session can only
 * be submitted once ('started' is consumed atomically); starting a new game
 * abandons any of the same profile's still-open sessions.
 *
 * Rejected rows are kept, not deleted, so they can feed a future admin
 * fraud-review queue. score/payoutPoints/xpAwarded stay null until
 * 'completed' (a rejected or abandoned session earns nothing).
 *
 * Still deferred: signed per-event telemetry / server-side replay, and
 * Upstash rate limiting. A single live session per player plus the
 * min/max-duration check already bounds how fast points can be earned.
 *
 * challengeId is set when this session fulfills a challenge (via
 * startChallengedPlay) — nullable 1:1, since a session either fulfills one
 * challenge or none; no join table needed.
 */
export const playSessions = pgTable("play_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => profiles.id),
  gameId: uuid("game_id")
    .notNull()
    .references(() => games.id),
  status: playSessionStatusEnum("status").notNull().default("started"),
  score: integer("score"),
  payoutPoints: integer("payout_points"),
  xpAwarded: integer("xp_awarded"),
  rejectReason: text("reject_reason"),
  challengeId: uuid("challenge_id").references((): AnyPgColumn => challenges.id),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

/**
 * Immutable append-only ledger. A profile's balance is always
 * SUM(delta) for that profile — never edit or delete a row here.
 */
export const ledgerEntries = pgTable("ledger_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => profiles.id),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  refType: text("ref_type"),
  refId: uuid("ref_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A sponsor: whoever funds the reward pools and runs campaigns. Rewards and
 * stores both point here, so "is this voucher redeemable at this counter" is an
 * id comparison rather than a name-string match.
 */
export const brands = pgTable("brands", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  theme: text("theme").notNull().default("neon"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Who can act for a brand in the console. profileId is unique — one person,
 * one brand — so there's no brand picker, the same shape and reasoning as
 * storeStaff. Membership is a row rather than an env allowlist because brand
 * members are a customer's people, not ours.
 */
export const brandMembers = pgTable("brand_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id),
  profileId: uuid("profile_id")
    .notNull()
    .unique()
    .references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A brand funding a reward pool on one game for a date range.
 *
 * budgetFils is money in minor units (AED x 100) as an integer — never a float,
 * since a budget that drifts by a rounding error is worse than no budget. It's
 * the only money in the schema; everything else called "cost" is points.
 *
 * There's no status column: the state is derived at read time from
 * fundedAt/cancelledAt/startsOn/endsOn by campaignStatus() in @playloop/economy,
 * the same way voucherStatus() derives a voucher's state from its timestamps.
 * That's what keeps a campaign from needing a background job to notice it has
 * finished. fundedAt is set by an admin confirming payment arrived — there's no
 * Stripe integration, deliberately (see the plan).
 */
export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id),
    rewardId: uuid("reward_id")
      .notNull()
      .references(() => rewards.id),
    budgetFils: integer("budget_fils").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    fundedAt: timestamp("funded_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("campaigns_brand_id_idx").on(table.brandId)],
);

/**
 * Redeemable catalog items. Pool-funded rewards (a finite, brand-sponsored
 * stock, e.g. "1,000 free coffees") carry poolTotal/poolRemaining; both null
 * means an uncapped reward. theme/icon reuse @playloop/ui's THEMES/icon() keys,
 * same convention as games.theme.
 */
export const rewards = pgTable("rewards", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  category: rewardCategoryEnum("category").notNull(),
  costPoints: integer("cost_points").notNull(),
  theme: text("theme").notNull().default("neon"),
  icon: text("icon").notNull().default("gift"),
  poolTotal: integer("pool_total"),
  poolRemaining: integer("pool_remaining"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A redeemed reward. Unlike play_sessions (client-reported score), there's
 * no analogous trust gap here — costPoints is always read from the rewards
 * row server-side, never client-supplied. The only hazard is concurrency
 * (two redemptions racing a pool's last unit, or a redemption racing a play
 * credit), handled with conditional/SQL-side updates in the redeemReward
 * action, not by validating client input.
 *
 * No status column and no Inngest job to expire vouchers — same pattern as
 * otp_codes: expiresAt is just checked at read/redeem time. redeemedAt is set
 * by the staff scanner (apps/web/app/staff) and is the single source of "is
 * this used" that @playloop/economy's voucherStatus() reads; who took it, and
 * where, lives in voucher_redemptions rather than in columns here, so that an
 * undo can null this back out without erasing the record.
 */
export const vouchers = pgTable(
  "vouchers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id),
    rewardId: uuid("reward_id")
      .notNull()
      .references(() => rewards.id),
    code: text("code").notNull().unique(),
    costPoints: integer("cost_points").notNull(), // snapshot at redemption time
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("vouchers_profile_id_idx").on(table.profileId)],
);

/**
 * A shareable challenge link (/c/<code>). No recipient is bound at
 * creation — a challenge is an open link, not an addressed invite to a
 * picked friend (there's no friends/contacts system). Whoever opens it
 * and completes a play becomes the recipient, recorded here on
 * completion. Further opens by other people still show the card
 * (read-only once completed) but don't create a second attempt — one
 * link resolves once, first-completer-wins the recipient slot.
 *
 * senderScore/gameId are snapshotted here rather than re-derived from
 * senderPlaySessionId on every read, so the "score to beat" never drifts
 * if the game's config changes later (same reasoning as vouchers.costPoints).
 * winnerId is null for a tie — no bonus paid to either side on a tie.
 */
export const challenges = pgTable(
  "challenges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull().unique(),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => profiles.id),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id),
    senderPlaySessionId: uuid("sender_play_session_id")
      .notNull()
      .references(() => playSessions.id),
    senderScore: integer("sender_score").notNull(),
    recipientId: uuid("recipient_id").references(() => profiles.id),
    recipientPlaySessionId: uuid("recipient_play_session_id").references(() => playSessions.id),
    status: challengeStatusEnum("status").notNull().default("pending"),
    winnerId: uuid("winner_id").references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("challenges_sender_id_idx").on(table.senderId),
    index("challenges_recipient_id_idx").on(table.recipientId),
  ],
);

/**
 * A physical location where a voucher can be handed over. brandId is what the
 * staff scanner checks a voucher against — it was a brand-name string match
 * until the brands table landed, which meant "Beanhouse" and "Bean House"
 * read as different brands.
 */
export const stores = pgTable("stores", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id),
  name: text("name").notNull(),
  city: text("city").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Which store a profile works at. profileId is unique: one person, one store.
 * That's what lets the scanner know which store it's acting for without asking
 * — there's no store picker, because there's no ambiguity. Someone working two
 * stores is a real change to make later, not a shape to guess at now.
 *
 * There's no env allowlist here (unlike ADMIN_EMAILS): store staff are a
 * customer's employees, not us, so membership belongs in data.
 */
export const storeStaff = pgTable("store_staff", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => stores.id),
  profileId: uuid("profile_id")
    .notNull()
    .unique()
    .references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The audit trail for a voucher being accepted at a counter — who took it,
 * where, when, and whether it was later reversed.
 *
 * This exists instead of redeemed_store_id/redeemed_by columns on vouchers
 * because a staff undo has to null vouchers.redeemedAt to make the voucher
 * usable again, and columns there would be erased along with it. A row here
 * survives the reversal (reversedAt is stamped, the row is never deleted), so
 * "this was redeemed at Marina at 14:02 and undone two minutes later" stays
 * answerable. It's also what the brand console's store-visit numbers will
 * count: reversed rows are excluded by `reversed_at IS NULL`.
 */
export const voucherRedemptions = pgTable(
  "voucher_redemptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    voucherId: uuid("voucher_id")
      .notNull()
      .references(() => vouchers.id),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    staffProfileId: uuid("staff_profile_id")
      .notNull()
      .references(() => profiles.id),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull().defaultNow(),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reversedByProfileId: uuid("reversed_by_profile_id").references(() => profiles.id),
  },
  (table) => [
    index("voucher_redemptions_store_id_idx").on(table.storeId),
    index("voucher_redemptions_voucher_id_idx").on(table.voucherId),
  ],
);
