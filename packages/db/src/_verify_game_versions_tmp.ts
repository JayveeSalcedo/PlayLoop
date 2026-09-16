/**
 * THROWAWAY VERIFICATION — run right after _migrate_game_versions_tmp.ts, then
 * delete both files.
 *
 *   cd packages/db && npx tsx src/_verify_game_versions_tmp.ts
 *
 * Checks the database actually looks the way the migration claims, rather than
 * trusting that it committed: every expected column with the right nullability,
 * the enums and their values, the CHECK and deferred FK constraints, and that
 * no existing game was left in an invalid state.
 *
 * Read-only apart from one deferred-FK probe, which is rolled back.
 *
 * Exits non-zero and lists what's wrong if anything doesn't match.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. See .env.example.");
const sql = postgres(url, { prepare: false });

const problems: string[] = [];
const ok = (what: string) => console.log(`  ok   ${what}`);
const bad = (what: string) => {
  problems.push(what);
  console.log(`  FAIL ${what}`);
};

/** table -> column -> expected is_nullable */
const EXPECTED: Record<string, Record<string, "YES" | "NO">> = {
  games: {
    game_kind: "NO",
    type: "YES", // loosened: null for code games
    current_version_id: "YES",
  },
  game_versions: {
    id: "NO",
    game_id: "NO",
    version_number: "NO",
    via: "NO",
    request: "NO",
    code: "NO",
    content_hash: "NO",
    meta: "NO",
    runtime_version: "NO",
    prompt_version: "YES",
    provider: "YES",
    model: "YES",
    title: "NO",
    summary: "NO",
    notes: "NO",
    validation: "NO",
    report: "YES",
    score_target: "YES",
    status: "NO",
    created_at: "NO",
  },
  play_sessions: {
    game_version_id: "YES",
    seed: "YES",
    verified_score: "YES",
    verify_reason: "YES",
    verify_ms: "YES",
    replay_ticks: "YES",
    replay_end_reason: "YES",
    verifying_at: "YES",
  },
  play_input_logs: {
    play_session_id: "NO",
    log: "NO",
    log_bytes: "NO",
    claimed_score: "YES",
    created_at: "NO",
  },
  generation_jobs: {
    id: "NO",
    profile_id: "NO",
    game_id: "YES",
    base_version_id: "YES",
    kind: "NO",
    status: "NO",
    request: "NO",
    events: "NO",
    result_version_id: "YES",
    problem: "YES",
    calls: "NO",
    tokens: "NO",
    provider: "YES",
    model: "YES",
    prompt_version: "YES",
    heartbeat_at: "YES",
    created_at: "NO",
    finished_at: "YES",
  },
};

const EXPECTED_ENUMS: Record<string, string[]> = {
  game_kind: ["template", "code"],
  version_via: ["template", "ai-create", "ai-change", "ai-fix", "manual"],
  version_validation: ["pending", "pass", "fail"],
  generation_job_kind: ["create", "change", "fix"],
  generation_job_status: ["queued", "running", "done", "failed"],
};

async function main() {
  console.log("\ncolumns");
  const rows = await sql<{ table_name: string; column_name: string; is_nullable: string }[]>`
    SELECT table_name, column_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN ${sql(Object.keys(EXPECTED))}
  `;
  const found = new Map(rows.map((r) => [`${r.table_name}.${r.column_name}`, r.is_nullable]));
  for (const [table, columns] of Object.entries(EXPECTED)) {
    for (const [column, nullable] of Object.entries(columns)) {
      const actual = found.get(`${table}.${column}`);
      if (actual === undefined) bad(`${table}.${column} is missing`);
      else if (actual !== nullable) bad(`${table}.${column} is_nullable=${actual}, expected ${nullable}`);
      else ok(`${table}.${column}`);
    }
  }

  console.log("\nenums");
  const enumRows = await sql<{ typname: string; enumlabel: string }[]>`
    SELECT t.typname, e.enumlabel
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname IN ${sql(Object.keys(EXPECTED_ENUMS))}
    ORDER BY t.typname, e.enumsortorder
  `;
  for (const [name, labels] of Object.entries(EXPECTED_ENUMS)) {
    const actual = enumRows.filter((r) => r.typname === name).map((r) => r.enumlabel);
    if (actual.length === 0) bad(`enum ${name} is missing`);
    else if (actual.join(",") !== labels.join(",")) bad(`enum ${name} is [${actual}], expected [${labels}]`);
    else ok(`enum ${name}`);
  }

  console.log("\nconstraints");
  const constraints = await sql<{ conname: string; def: string; condeferrable: boolean }[]>`
    SELECT conname, pg_get_constraintdef(oid) AS def, condeferrable
    FROM pg_constraint
    WHERE conrelid IN ('games'::regclass, 'game_versions'::regclass, 'play_sessions'::regclass)
  `;
  const check = constraints.find((c) => c.conname === "games_kind_type_ck");
  if (!check) bad("games_kind_type_ck is missing");
  else ok(`games_kind_type_ck: ${check.def}`);

  const deferred = constraints.find((c) => c.def.includes("current_version_id") && c.condeferrable);
  if (!deferred) bad("games.current_version_id FK is missing or not DEFERRABLE");
  else ok("games.current_version_id FK is deferrable");

  const unique = constraints.find((c) => c.def.startsWith("UNIQUE") && c.def.includes("version_number"));
  if (!unique) bad("game_versions (game_id, version_number) UNIQUE is missing");
  else ok("game_versions (game_id, version_number) is unique");

  console.log("\nexisting data");
  const [invalid] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM games
    WHERE (game_kind = 'template' AND type IS NULL) OR (game_kind = 'code' AND type IS NOT NULL)
  `;
  if ((invalid?.n ?? 0) > 0) bad(`${invalid!.n} games violate the kind/type pairing`);
  else ok("every existing game has a valid kind/type pairing");

  const [templates] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM games WHERE game_kind = 'template'`;
  ok(`${templates?.n ?? 0} existing games are templates (unchanged)`);

  // The circular FK in practice: insert a game and its version and point the
  // game at it, in one transaction. Without DEFERRABLE this fails. Rolled back.
  console.log("\ndeferred FK probe (rolled back)");
  try {
    await sql.begin(async (tx) => {
      const [game] = await tx<{ id: string }[]>`
        INSERT INTO games (slug, game_kind, type, title, max_points)
        VALUES (${`_probe-${Date.now()}`}, 'code', NULL, 'Deferred FK probe', 200)
        RETURNING id
      `;
      const [version] = await tx<{ id: string }[]>`
        INSERT INTO game_versions (game_id, version_number, via, code, content_hash, meta, runtime_version, title)
        VALUES (${game!.id}, 1, 'manual', 'playloop.game({});', 'probe', '{}'::jsonb, 1, 'Probe')
        RETURNING id
      `;
      await tx`UPDATE games SET current_version_id = ${version!.id} WHERE id = ${game!.id}`;
      ok("a game and its first version can be created in one transaction");
      throw new Error("__rollback__");
    });
  } catch (e) {
    if (!(e instanceof Error) || e.message !== "__rollback__") {
      bad(`deferred FK probe failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(
    problems.length === 0
      ? "\nAll checks passed. Delete _migrate_game_versions_tmp.ts and _verify_game_versions_tmp.ts.\n"
      : `\n${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join("\n")}\n`,
  );
  await sql.end();
  process.exit(problems.length === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
