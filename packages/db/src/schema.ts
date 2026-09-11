/**
 * Phase-1 core-loop schema: auth (email OTP) -> play -> earn -> feed.
 * Deliberately scoped to what the trimmed Phase 1 needs — see
 * "Core data model" in the plan for the fuller model (challenges, rewards,
 * vouchers, brands, campaigns, ...) to be added as those phases start.
 */
import { boolean, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const gameTypeEnum = pgEnum("game_type", ["quiz", "catch", "memory", "reflex"]);
export const difficultyEnum = pgEnum("difficulty", ["Easy", "Medium", "Hard"]);
export const playSessionStatusEnum = pgEnum("play_session_status", [
  "started",
  "completed",
  "rejected",
  "abandoned",
]);

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
  published: boolean("published").notNull().default(true),
  playCount: integer("play_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
