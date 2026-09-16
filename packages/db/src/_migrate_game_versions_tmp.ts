/**
 * THROWAWAY MIGRATION — run once, verify, then delete this file and its
 * companion _verify_game_versions_tmp.ts.
 *
 *   cd packages/db && npx tsx src/_migrate_game_versions_tmp.ts
 *
 * Adds everything code games need: a kind discriminator on games, the
 * game_versions table that holds their actual JavaScript, the version pin and
 * verification columns on play_sessions, the recorded input logs, and the
 * generation job queue.
 *
 * drizzle-kit push crashes partway through introspecting this Supabase project,
 * so schema changes here are hand-written SQL run inside one transaction, then
 * checked column by column against information_schema. See README.md.
 *
 * Purely additive and safe to run against live data:
 *   - every new column is nullable or defaulted, so existing rows stay valid;
 *   - games.game_kind defaults to 'template', which is what every existing row
 *     already is — no backfill;
 *   - games.type only loosens (NOT NULL dropped), which no existing row or
 *     query notices;
 *   - no enum ALTER anywhere, so the whole thing commits atomically. (Postgres
 *     won't let a newly added enum value be *used* in the transaction that adds
 *     it, which would force this into two scripts.)
 *
 * If any statement fails, the transaction rolls back and the database is
 * untouched.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import postgres from "postgres";

// Load the monorepo root .env regardless of CWD (same pattern as seed.ts).
config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. See .env.example.");
const sql = postgres(url, { prepare: false });

async function main() {
  await sql.begin(async (tx) => {
    // ---- enums ----
    await tx`CREATE TYPE game_kind AS ENUM ('template', 'code')`;
    await tx`CREATE TYPE version_via AS ENUM ('template', 'ai-create', 'ai-change', 'ai-fix', 'manual')`;
    await tx`CREATE TYPE version_validation AS ENUM ('pending', 'pass', 'fail')`;
    await tx`CREATE TYPE generation_job_kind AS ENUM ('create', 'change', 'fix')`;
    await tx`CREATE TYPE generation_job_status AS ENUM ('queued', 'running', 'done', 'failed')`;

    // ---- games: which engine plays this ----
    await tx`ALTER TABLE games ADD COLUMN game_kind game_kind NOT NULL DEFAULT 'template'`;
    await tx`ALTER TABLE games ALTER COLUMN type DROP NOT NULL`;
    // Keeps PlayableType honest: a template game always has a template, a code
    // game never does. Without this, a bug could leave a code game with a stale
    // type and it would be scored by the wrong engine.
    await tx`
      ALTER TABLE games ADD CONSTRAINT games_kind_type_ck CHECK (
        (game_kind = 'template' AND type IS NOT NULL) OR
        (game_kind = 'code' AND type IS NULL)
      )
    `;

    // ---- game_versions: the immutable unit a play is scored against ----
    await tx`
      CREATE TABLE game_versions (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        game_id          uuid NOT NULL REFERENCES games(id),
        version_number   integer NOT NULL,
        via              version_via NOT NULL,
        request          text NOT NULL DEFAULT '',
        code             text NOT NULL CHECK (octet_length(code) > 0 AND octet_length(code) <= 60000),
        content_hash     text NOT NULL,
        meta             jsonb NOT NULL,
        runtime_version  integer NOT NULL,
        prompt_version   text,
        provider         text,
        model            text,
        title            text NOT NULL,
        summary          text NOT NULL DEFAULT '',
        notes            text NOT NULL DEFAULT '',
        validation       version_validation NOT NULL DEFAULT 'pending',
        report           jsonb,
        score_target     integer CHECK (score_target IS NULL OR score_target > 0),
        status           game_status NOT NULL DEFAULT 'pending_review',
        created_at       timestamptz NOT NULL DEFAULT now(),
        UNIQUE (game_id, version_number)
      )
    `;
    await tx`CREATE INDEX game_versions_game_id_idx ON game_versions (game_id, version_number)`;

    // Deferred because this and game_versions.game_id point at each other:
    // creating version 1 inserts the game, then the version, then sets this;
    // publishing goes the other way. Deferred checking means neither trips.
    await tx`
      ALTER TABLE games ADD COLUMN current_version_id uuid
        REFERENCES game_versions(id) DEFERRABLE INITIALLY DEFERRED
    `;

    // ---- play_sessions: pin the version, keep the server's seed and verdict ----
    await tx`ALTER TABLE play_sessions ADD COLUMN game_version_id uuid REFERENCES game_versions(id)`;
    await tx`ALTER TABLE play_sessions ADD COLUMN seed text`;
    await tx`ALTER TABLE play_sessions ADD COLUMN verified_score integer`;
    await tx`ALTER TABLE play_sessions ADD COLUMN verify_reason text`;
    await tx`ALTER TABLE play_sessions ADD COLUMN verify_ms integer`;
    await tx`ALTER TABLE play_sessions ADD COLUMN replay_ticks integer`;
    await tx`ALTER TABLE play_sessions ADD COLUMN replay_end_reason text`;
    await tx`ALTER TABLE play_sessions ADD COLUMN verifying_at timestamptz`;

    // ---- play_input_logs: the recorded play, kept off the hot table ----
    await tx`
      CREATE TABLE play_input_logs (
        play_session_id uuid PRIMARY KEY REFERENCES play_sessions(id),
        log             text NOT NULL,
        log_bytes       integer NOT NULL CHECK (log_bytes > 0 AND log_bytes <= 200000),
        claimed_score   integer,
        created_at      timestamptz NOT NULL DEFAULT now()
      )
    `;

    // ---- generation_jobs: AI runs that must survive a dead invocation ----
    await tx`
      CREATE TABLE generation_jobs (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        profile_id        uuid NOT NULL REFERENCES profiles(id),
        game_id           uuid REFERENCES games(id),
        base_version_id   uuid REFERENCES game_versions(id),
        kind              generation_job_kind NOT NULL,
        status            generation_job_status NOT NULL DEFAULT 'queued',
        request           text NOT NULL,
        events            jsonb NOT NULL DEFAULT '[]'::jsonb,
        result_version_id uuid REFERENCES game_versions(id),
        problem           text,
        calls             integer NOT NULL DEFAULT 0,
        tokens            integer NOT NULL DEFAULT 0,
        provider          text,
        model             text,
        prompt_version    text,
        heartbeat_at      timestamptz,
        created_at        timestamptz NOT NULL DEFAULT now(),
        finished_at       timestamptz
      )
    `;
    await tx`CREATE INDEX generation_jobs_profile_created_idx ON generation_jobs (profile_id, created_at)`;
    await tx`CREATE INDEX generation_jobs_status_heartbeat_idx ON generation_jobs (status, heartbeat_at)`;
  });

  console.log("Migration committed. Now run: npx tsx src/_verify_game_versions_tmp.ts");
  await sql.end();
}

main().catch(async (e) => {
  console.error("Migration failed and rolled back — the database is unchanged.");
  console.error(e);
  await sql.end();
  process.exit(1);
});
