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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const gameTypeEnum = pgEnum("game_type", [
  "quiz",
  "catch",
  "memory",
  "reflex",
]);
export const difficultyEnum = pgEnum("difficulty", ["Easy", "Medium", "Hard"]);
export const playSessionStatusEnum = pgEnum("play_session_status", [
  "started",
  "completed",
  "rejected",
  "abandoned",
]);
export const rewardCategoryEnum = pgEnum("reward_category", [
  "Food and drink",
  "Fun",
  "Shopping",
]);
export const challengeStatusEnum = pgEnum("challenge_status", [
  "pending",
  "completed",
]);
/**
 * 'draft' is a creator's game that hasn't been submitted: an AI generation in
 * progress, or versions they're still changing. Only its creator sees it; it is
 * not in the moderation queue and doesn't count toward PENDING_LIMIT, both of
 * which read 'pending_review' — which keeps meaning "submitted, waiting on a
 * reviewer". Template games never use it: the template wizard submits in one go.
 */
export const gameStatusEnum = pgEnum("game_status", [
  "draft",
  "pending_review",
  "published",
  "rejected",
]);
export const moderationOutcomeEnum = pgEnum("moderation_outcome", [
  "pending",
  "approved",
  "rejected",
]);

/**
 * Which engine plays a game.
 *
 * 'template' is the original four DOM templates: `type` says which one and
 * `config` carries its content. 'code' is an AI-written (or hand-written) game
 * whose actual JavaScript lives in gameVersions, played in a sandboxed iframe
 * and scored by replaying it on the server.
 *
 * A separate column rather than a fifth game_type value, for two reasons.
 * Postgres won't let a newly added enum value be used in the transaction that
 * adds it, which would split the migration in two; and more importantly `type`
 * means "which of the four templates", so adding to it would quietly make every
 * switch over PlayableType in @playloop/games and @playloop/economy
 * non-exhaustive at runtime while still type-checking. games_kind_type_ck
 * enforces the pairing: `type` is set for a template game and null for a code
 * game.
 */
export const gameKindEnum = pgEnum("game_kind", ["template", "code"]);

/** How a game version came to exist. */
export const versionViaEnum = pgEnum("version_via", [
  "template",
  "ai-create",
  "ai-change",
  "ai-fix",
  /** Pasted or seeded code, e.g. one of the runtime's example games. */
  "manual",
]);

/**
 * Whether the game lab's checks passed for a version: contract, crashes,
 * determinism, render purity, replay cost, input responsiveness. Purely
 * technical — it says nothing about whether the game is any *good*, and
 * nothing about its economy calibration (see gameVersions.scoreTarget).
 */
export const versionValidationEnum = pgEnum("version_validation", [
  "pending",
  "pass",
  "fail",
]);

export const generationJobKindEnum = pgEnum("generation_job_kind", [
  "create",
  "change",
  "fix",
]);
export const generationJobStatusEnum = pgEnum("generation_job_status", [
  "queued",
  "running",
  "done",
  "failed",
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
  /**
   * Set once, at profile-creation time in login/verify/actions.ts, if this
   * profile's first-ever signup happened via a /c/<code> challenge link —
   * never updated afterward (a profile can only ever have one referrer).
   * Read later by submitPlay to decide whether this profile's first
   * *completed* play should credit the referrer's REFERRAL_JOIN_BONUS.
   */
  referredByChallengeId: uuid("referred_by_challenge_id").references(
    (): AnyPgColumn => challenges.id,
  ),
  /**
   * Set by an admin from the fraud queue; null means active. A timestamp
   * rather than a boolean so it records *when*, matching fundedAt/cancelledAt/
   * reversedAt elsewhere here.
   *
   * Enforced by requireActiveProfile() in apps/web/lib/profile.ts, which gates
   * the actions that move value (starting a play, redeeming a reward) — not
   * requireProfile() itself, so a suspended player can still read their own
   * wallet and the vouchers they already paid for.
   */
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  suspendedReason: text("suspended_reason"),
  /**
   * Set on a profile created silently at "Play now" time for a friend who
   * opened a challenge link before logging in (see startGuestChallengePlay in
   * apps/web/app/c/[code]/actions.ts) — email is a synthetic placeholder
   * until then, never shown or sent to. requireActiveProfile() refuses a
   * guest for everything except finishing that one challenged play, so
   * points can be earned and a challenge resolved for real, but not
   * redeemed or spent until the account is claimed.
   *
   * Claimed (flipped to false) in login/verify/actions.ts once they attach a
   * real, OTP-verified email — in place, keeping the same profile id, so
   * every point/XP/challenge-win already earned carries over. If that email
   * already belongs to a different real account, the guest's earnings are
   * merged onto it instead and this row is left suspended and orphaned.
   */
  isGuest: boolean("is_guest").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
  /**
   * Which engine plays this game. Defaults to 'template' so every row that
   * existed before code games did is correct without a backfill.
   */
  gameKind: gameKindEnum("game_kind").notNull().default("template"),
  /**
   * Which of the four DOM templates — set for a template game, null for a code
   * game, enforced by games_kind_type_ck. Read as PlayableType by
   * @playloop/games and @playloop/economy, so only ever narrow it after
   * checking gameKind.
   */
  type: gameTypeEnum("type"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  theme: text("theme").notNull().default("neon"),
  difficulty: difficultyEnum("difficulty").notNull().default("Medium"),
  maxPoints: integer("max_points").notNull().default(200),
  /** Template-specific content: quiz questions, catch item/theme, etc. Unused ({}) for a code game. */
  config: jsonb("config")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  /**
   * For a code game: the version players get right now. Null until a version
   * passes its checks and is published; always null for a template game.
   *
   * The FK is DEFERRABLE INITIALLY DEFERRED in the migration, because this and
   * gameVersions.gameId point at each other: creating version 1 inserts the
   * game, then the version, then sets this, and publishing goes the other way.
   * Deferred checking means neither ordering trips.
   *
   * Only ever read when *starting* a play — startPlay copies it onto the
   * session. Nothing resolves it at submit time, which is what lets a creator
   * publish a new version without disturbing plays already in progress.
   */
  currentVersionId: uuid("current_version_id").references(
    (): AnyPgColumn => gameVersions.id,
  ),
  creatorId: uuid("creator_id").references(() => profiles.id),
  brandOriginal: boolean("brand_original").notNull().default(false),
  status: gameStatusEnum("status").notNull().default("pending_review"),
  /** Creator opt-in: lists the game for brand sponsorship in the (Phase 5) brand console. */
  sponsorReady: boolean("sponsor_ready").notNull().default(false),
  /** League this game was published to (null = public, visible to everyone). */
  leagueId: uuid("league_id").references((): AnyPgColumn => leagues.id),
  playCount: integer("play_count").notNull().default(0),
  coverImage: text("cover_image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * One immutable version of a code game's actual JavaScript.
 *
 * This is the unit a play is scored against. A creator's change request never
 * edits a version — it creates the next one — because a version's code and the
 * runtime it was written for are half of what makes an old play reproducible:
 *
 *     code + runtimeVersion + playSessions.seed + playInputLogs.log
 *
 * Once any session references a row here, its `code` and `runtimeVersion` must
 * never change. Rewriting them would silently re-score plays that have already
 * paid out.
 *
 * `code` is a plain text column rather than object storage: it is at most 60 KB
 * (MAX_CODE_BYTES), Postgres TOASTs and compresses it anyway, and both startPlay
 * and the verifier need the exact bytes the session began on — a join can't 404
 * the way a fetch can.
 */
export const gameVersions = pgTable(
  "game_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id),
    /** 1, 2, 3… within a game. Unique per game; see the index below. */
    versionNumber: integer("version_number").notNull(),
    via: versionViaEnum("via").notNull(),
    /** The idea or change instruction that produced this version, in the creator's words. */
    request: text("request").notNull().default(""),
    code: text("code").notNull(),
    /** fnv1a of `code` — the same hash the game lab reports, so a report can be matched to its code. */
    contentHash: text("content_hash").notNull(),
    /** GameMeta as the sandbox reported it: title, hint, maxSeconds, lives, imageSlots. */
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull(),
    /**
     * Which simulation this version was written and scored against. Verification
     * replays under exactly this runtime, never the currently deployed one — see
     * RUNTIME_VERSION and preludeFor() in @playloop/runtime. A version whose
     * runtime this build no longer has fails as runtime_mismatch rather than
     * being replayed under a different one.
     */
    runtimeVersion: integer("runtime_version").notNull(),
    /** PROMPT_VERSION at generation time; null for hand-written or template-forked code. */
    promptVersion: text("prompt_version"),
    provider: text("provider"),
    model: text("model"),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    notes: text("notes").notNull().default(""),
    /** Technical validity only — the gate on publishing. Never about content or economy. */
    validation: versionValidationEnum("validation")
      .notNull()
      .default("pending"),
    /** The whole LabReport: per-check results, bot runs, replay cost, fix prompt. */
    report: jsonb("report").$type<Record<string, unknown>>(),
    /**
     * Score that earns the full maxPoints payout, derived from this version's bot
     * runs (codeScoreTarget in @playloop/economy). Purely economy calibration:
     * it is pinned per version so a change that alters scoring re-derives its
     * own, and it must never decide whether a version is valid. Null means the
     * bots never scored, so plays fall back to the flat payout floor.
     */
    scoreTarget: integer("score_target"),
    /**
     * Per-version moderation outcome, so reverting to a version a reviewer
     * already approved can go live without a second review.
     */
    status: gameStatusEnum("status").notNull().default("pending_review"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("game_versions_game_id_idx").on(table.gameId, table.versionNumber),
  ],
);

/**
 * Who did what in /admin. Every admin action writes one row here.
 *
 * The individual outcomes were already recorded — games.status,
 * campaigns.fundedAt, profiles.suspendedAt, rewards.poolTotal — but none of
 * them recorded *who*, so "who funded this campaign" and "who added 500 units
 * to that pool" had no answer at all. This is that answer.
 *
 * Append-only: never updated or deleted, the same rule as ledgerEntries. The
 * actor is a plain reference rather than a snapshot of their name, since admins
 * are staff whose profiles aren't going anywhere.
 *
 * `details` is deliberately loose — each action records what's meaningful for
 * it (units added, the rejection note, the previous cost) without needing a
 * column per action type.
 */
export const adminActions = pgTable(
  "admin_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorProfileId: uuid("actor_profile_id")
      .notNull()
      .references(() => profiles.id),
    /** e.g. 'game.approve', 'campaign.fund', 'profile.suspend', 'reward.top_up'. */
    action: text("action").notNull(),
    /** e.g. 'game', 'campaign', 'profile', 'reward' — kept as text, not an FK, so a row survives its target. */
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id"),
    /** Human-readable summary, shown in the activity list. */
    summary: text("summary").notNull().default(""),
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("admin_actions_created_at_idx").on(table.createdAt)],
);

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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
export const playSessions = pgTable(
  "play_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id),
    /**
     * For a code game: the exact version this session is being played on,
     * copied from games.currentVersionId at startPlay and never resolved again.
     *
     * That pin is the whole reason a creator can publish while people are
     * playing: a session that began on version 2 is replayed, scored and paid
     * under version 2 even after version 3 goes live. Null for template games
     * and for every session that predates code games.
     */
    gameVersionId: uuid("game_version_id").references(() => gameVersions.id),
    /**
     * A creator testing their own unpublished version from the studio. Played,
     * recorded and replay-verified exactly like a real play — that verified run
     * is what submitting a version for review requires — but never credited:
     * no points, no XP, no challenge, no play count.
     */
    isTest: boolean("is_test").notNull().default(false),
    /**
     * The seed the *server* chose for this session, which the game's randomness
     * derives from. Handed to the client at startPlay and re-read from this row
     * at verification time — never accepted back from the client, since a player
     * who picked their own seed could hunt for a favourable game.
     */
    seed: text("seed"),
    status: playSessionStatusEnum("status").notNull().default("started"),
    /**
     * What the client claimed, recorded on 'completed' AND 'rejected' rows —
     * a rejected score is the most useful thing a fraud reviewer can see
     * ("claimed 9,400 where the ceiling is 750"), and throwing it away made
     * the reject reason unreadable on its own. It is payoutPoints/xpAwarded
     * staying null that encodes "this earned nothing", not score.
     */
    score: integer("score"),
    /**
     * For a code game: the score the server's replay produced — the only score
     * ever paid. `score` above stays the client's claim, so a divergence is
     * legible to a reviewer rather than overwritten by it.
     */
    verifiedScore: integer("verified_score"),
    /**
     * Why verification refused: a VerifyFailureReason (score_mismatch,
     * bad_log, tick_mismatch, timeout, runtime_mismatch, …).
     *
     * Kept separate from rejectReason, which holds the template engine's
     * analytic verdicts, because the two anti-cheat systems now coexist and a
     * fraud reviewer needs to know which one fired: "implausible for this
     * template" and "the replay produced a different score" are very different
     * claims.
     */
    verifyReason: text("verify_reason"),
    /** How long verification took, and what the replay saw. Cost and abuse signal. */
    verifyMs: integer("verify_ms"),
    replayTicks: integer("replay_ticks"),
    replayEndReason: text("replay_end_reason"),
    /**
     * Set when the submit handler claims this session for verification. Lets the
     * claim stay atomic without adding a 'verifying' value to
     * play_session_status — a new enum value can't be used in the transaction
     * that adds it, which would split the migration in two.
     */
    verifyingAt: timestamp("verifying_at", { withTimezone: true }),
    payoutPoints: integer("payout_points"),
    xpAwarded: integer("xp_awarded"),
    rejectReason: text("reject_reason"),
    challengeId: uuid("challenge_id").references(
      (): AnyPgColumn => challenges.id,
    ),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  // The fraud queue filters by profile, and by status over a date window; this
  // is also the largest table by row count.
  (table) => [
    index("play_sessions_profile_id_idx").on(table.profileId),
    index("play_sessions_status_started_at_idx").on(
      table.status,
      table.startedAt,
    ),
  ],
);

/**
 * The recorded inputs of one code-game play: every pointer and key event, with
 * the tick it happened on, quarter-pixel quantized.
 *
 * Together with the session's seed and its version's code and runtime, this is
 * what reproduces a play exactly. Kept because the whole authority model rests
 * on being able to re-run what someone actually did — a fraud reviewer looking
 * at a rejected session needs the play, not just a number.
 *
 * A side table rather than a column on playSessions, which is the largest table
 * here by row count and is scanned by the fraud queue over (status, startedAt):
 * a column up to MAX_LOG_BYTES would drag TOAST lookups through queries that
 * never want the log.
 *
 * Every log is retained for now. Real logs are a few KB of packed integers, not
 * the 200 KB ceiling, and sampling or expiry before we've measured actual volume
 * would be guessing — so measure first, then decide.
 */
export const playInputLogs = pgTable("play_input_logs", {
  playSessionId: uuid("play_session_id")
    .primaryKey()
    .references(() => playSessions.id),
  /** An InputLog: { v, ticks, events }. Stored as text — it is written and read whole, never queried into. */
  log: text("log").notNull(),
  logBytes: integer("log_bytes").notNull(),
  /** What the client claimed alongside this log, kept even when the replay disagreed. */
  claimedScore: integer("claimed_score"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * One AI generation run: create a game from an idea, change an existing
 * version, or fix what the checks found.
 *
 * In the database rather than in memory because a generation takes minutes —
 * a model call plus the game lab's bot checks, up to two fix rounds — and a
 * serverless invocation can be frozen or killed at any point in that. An
 * in-process job map would lose the run and leave the creator watching a
 * spinner forever.
 *
 * `heartbeatAt` is what makes that recoverable: the request doing the work
 * refreshes it as it goes, and a read finding a 'running' row that has gone
 * quiet marks it failed. No cron, no queue — the same derive-at-read-time
 * approach as voucher expiry and campaign status.
 *
 * This table is also the rate limiter: today's SUM(tokens) is the daily budget,
 * and a creator's open rows are their concurrency limit.
 */
export const generationJobs = pgTable(
  "generation_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id),
    /** Null for a 'create' that hasn't produced a game row yet. */
    gameId: uuid("game_id").references(() => games.id),
    /** The version being changed or fixed; null for 'create'. */
    baseVersionId: uuid("base_version_id").references(() => gameVersions.id),
    kind: generationJobKindEnum("kind").notNull(),
    status: generationJobStatusEnum("status").notNull().default("queued"),
    /** The creator's idea or change instruction. */
    request: text("request").notNull(),
    /**
     * The pipeline's saved PipelineState between rounds. Vercel's Hobby limits
     * don't leave room for a whole generation in one invocation, so each request
     * loads this, runs one round, and writes it back. Cleared once the job ends.
     */
    state: jsonb("state").$type<Record<string, unknown>>(),
    /** ProgressEvent[] from the pipeline — what the studio renders while it waits. */
    events: jsonb("events").$type<unknown[]>().notNull().default([]),
    resultVersionId: uuid("result_version_id").references(
      (): AnyPgColumn => gameVersions.id,
    ),
    /** Why it failed, in words a creator can act on. */
    problem: text("problem"),
    calls: integer("calls").notNull().default(0),
    tokens: integer("tokens").notNull().default(0),
    provider: text("provider"),
    model: text("model"),
    promptVersion: text("prompt_version"),
    /** Refreshed by the running job; stale means the invocation died. */
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("generation_jobs_profile_created_idx").on(
      table.profileId,
      table.createdAt,
    ),
    // The stale sweeper's query: running rows that have gone quiet.
    index("generation_jobs_status_heartbeat_idx").on(
      table.status,
      table.heartbeatAt,
    ),
  ],
);

/**
 * Immutable append-only ledger. A profile's balance is always
 * SUM(delta) for that profile — never edit or delete a row here.
 */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    refType: text("ref_type"),
    refId: uuid("ref_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ledger_entries_profile_id_idx").on(table.profileId),
    index("ledger_entries_profile_created_idx").on(table.profileId, table.createdAt),
  ],
);

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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    recipientPlaySessionId: uuid("recipient_play_session_id").references(
      () => playSessions.id,
    ),
    status: challengeStatusEnum("status").notNull().default("pending"),
    winnerId: uuid("winner_id").references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("challenges_sender_id_idx").on(table.senderId),
    index("challenges_recipient_id_idx").on(table.recipientId),
  ],
);

/**
 * A mutual friendship between two profiles. Created automatically when a
 * challenge is completed between them. Symmetric: profileAId < profileBId
 * by convention so (A,B) and (B,A) can't both exist.
 *
 * No "pending/accepted" state — friendships are silently created from
 * shared gameplay, matching the prototype's model where the friend list
 * is "people you've played with."
 */
export const friendships = pgTable(
  "friendships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    profileAId: uuid("profile_a_id")
      .notNull()
      .references(() => profiles.id),
    profileBId: uuid("profile_b_id")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("friendships_profile_a_id_idx").on(table.profileAId),
    index("friendships_profile_b_id_idx").on(table.profileBId),
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
    redeemedAt: timestamp("redeemed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reversedByProfileId: uuid("reversed_by_profile_id").references(
      () => profiles.id,
    ),
  },
  (table) => [
    index("voucher_redemptions_store_id_idx").on(table.storeId),
    index("voucher_redemptions_voucher_id_idx").on(table.voucherId),
  ],
);

/**
 * A community league or tournament group (School, Company, Mall, Family).
 * Players join using a unique code (e.g. HORIZON-8B, OASIS-MALL).
 */
export const leagues = pgTable("leagues", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // 'school' | 'company' | 'mall' | 'family' | 'community'
  code: text("code").notNull().unique(),
  description: text("description"),
  icon: text("icon").notNull().default("trophy"),
  color: text("color").notNull().default("#3FC8FF"),
  creatorId: uuid("creator_id").references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * A profile's membership in a league. Includes optional team/sub-team name
 * (e.g. "Grade 8B", "Engineering", "The Novas") and role ('admin' | 'member').
 */
export const leagueMembers = pgTable(
  "league_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    teamName: text("team_name"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("league_members_league_profile_idx").on(
      table.leagueId,
      table.profileId,
    ),
    index("league_members_league_id_idx").on(table.leagueId),
    index("league_members_profile_id_idx").on(table.profileId),
  ],
);

/**
 * A live venue activation event for LED walls and arena gameplay.
 * Created by brand managers or system presets.
 */
export const venueEvents = pgTable(
  "venue_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brandId: uuid("brand_id").references(() => brands.id),
    code: text("code").notNull().unique(),
    title: text("title").notNull(),
    arabicTitle: text("arabic_title"),
    venueName: text("venue_name").notNull(),
    location: text("location").notNull(),
    sponsorName: text("sponsor_name").notNull(),
    sponsorTagline: text("sponsor_tagline").notNull(),
    accentColor: text("accent_color").notNull().default("#FFDD3C"),
    prizePoolPoints: integer("prize_pool_points").notNull().default(5000),
    status: text("status").notNull().default("live"),
    rounds: jsonb("rounds")
      .$type<
        Array<{
          number: number;
          title: string;
          arabicTitle: string;
          gameType: "tap" | "reflex" | "catch";
          durationSeconds: number;
          targetScore: number;
          maxPoints: number;
        }>
      >()
      .notNull(),
    creatorId: uuid("creator_id").references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("venue_events_brand_id_idx").on(table.brandId),
    index("venue_events_code_idx").on(table.code),
  ],
);

// ---------------------------------------------------------------------------
// Live Arena — real multiplayer sessions
// ---------------------------------------------------------------------------

export const arenaSessionStateEnum = pgEnum("arena_session_state", [
  "lobby",
  "countdown",
  "playing",
  "results",
]);

/**
 * A live arena session: the host picks a published game, gets a join code,
 * waits for players in the lobby, then starts the game on all phones.
 */
export const arenaSessions = pgTable(
  "arena_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** 6-char uppercase join code, shown on QR. */
    code: text("code").notNull().unique(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id),
    hostProfileId: uuid("host_profile_id")
      .notNull()
      .references(() => profiles.id),
    state: arenaSessionStateEnum("state").notNull().default("lobby"),
    /** When the host pressed "Start Game" and the countdown began. */
    startedAt: timestamp("started_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("arena_sessions_code_idx").on(table.code),
    index("arena_sessions_host_idx").on(table.hostProfileId),
  ],
);

/**
 * A player who scanned the QR and joined an arena session's lobby.
 * Score is updated when the player finishes playing the game.
 */
export const arenaPlayers = pgTable(
  "arena_players",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => arenaSessions.id),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id),
    /** Snapshot of name at join time. */
    name: text("name").notNull(),
    avatarIndex: integer("avatar_index").notNull().default(0),
    score: integer("score").notNull().default(0),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("arena_players_session_id_idx").on(table.sessionId),
    uniqueIndex("arena_players_session_profile_idx").on(
      table.sessionId,
      table.profileId,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Communities — group chat, gaming, and social discovery
// ---------------------------------------------------------------------------

/**
 * A message's payload shape. This is a closed discriminant that rendering
 * and Realtime-reconciliation code exhaustively switches over — unlike
 * community_members.role (a plain two-value flag, kept as text below), so
 * it gets a real enum, same reasoning as arenaSessionStateEnum.
 */
export const communityMessageTypeEnum = pgEnum("community_message_type", [
  "text",
  "image",
  "game_share",
  "challenge",
]);

/**
 * A group. Private groups are invite-code-only (possession of the code is
 * the invitation, always instant-join). Public groups are discoverable by
 * search; requiresApproval decides whether tapping to join is instant or
 * lands in community_join_requests for an admin to approve — set once by
 * the creator, only meaningful when isPublic is true.
 */
export const communities = pgTable(
  "communities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    isPublic: boolean("is_public").notNull().default(false),
    requiresApproval: boolean("requires_approval").notNull().default(false),
    /** 6-char uppercase code, same shape/generator as arenaSessions.code. */
    inviteCode: text("invite_code").notNull().unique(),
    creatorId: uuid("creator_id").references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("communities_is_public_idx").on(table.isPublic)],
);

/**
 * A profile's membership in a community. role is plain text ('admin' |
 * 'member'), matching leagueMembers.role — a two-value flag, not a state
 * machine. The unique index backs onConflictDoNothing joins and the
 * 50-member cap check.
 */
export const communityMembers = pgTable(
  "community_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Null until the member's first visit to the chat. Compared against
     *  other members' community_messages.createdAt to decide the unread
     *  ("new message") dot in the tab bar and group list. */
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("community_members_community_profile_idx").on(
      table.communityId,
      table.profileId,
    ),
    index("community_members_community_id_idx").on(table.communityId),
    index("community_members_profile_id_idx").on(table.profileId),
  ],
);

/**
 * A pending request to join a public, approval-required community. A
 * rejected request is re-usable — requesting again flips the same row back
 * to 'pending' rather than inserting a new one (the unique index makes this
 * an upsert target).
 */
export const communityJoinRequests = pgTable(
  "community_join_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: uuid("decided_by").references(() => profiles.id),
  },
  (table) => [
    uniqueIndex("community_join_requests_community_profile_idx").on(
      table.communityId,
      table.profileId,
    ),
  ],
);

/**
 * A chat message. metadata carries type-specific, *snapshotted* data —
 * { imageUrl } for 'image', { gameId, slug, title, coverImage } for
 * 'game_share', { code, gameTitle, senderScore } for 'challenge' —
 * snapshotted rather than a live join so a game's title/cover changing
 * later doesn't rewrite an old chat bubble's history.
 *
 * Enabled for Supabase Realtime (see seed.ts) so INSERTs push to subscribed
 * clients; append-only, same shape as ledgerEntries — never updated/deleted.
 */
export const communityMessages = pgTable(
  "community_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => profiles.id),
    content: text("content").notNull().default(""),
    messageType: communityMessageTypeEnum("message_type")
      .notNull()
      .default("text"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Chat pagination: latest page per community, DESC.
    index("community_messages_community_created_idx").on(
      table.communityId,
      table.createdAt,
    ),
  ],
);

/**
 * A tap-to-react emoji on a message. One row per (message, profile, emoji)
 * — re-tapping the same emoji removes it (toggle); a different emoji from
 * the same person adds a second row.
 */
export const communityReactions = pgTable(
  "community_reactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => communityMessages.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("community_reactions_message_profile_emoji_idx").on(
      table.messageId,
      table.profileId,
      table.emoji,
    ),
  ],
);

