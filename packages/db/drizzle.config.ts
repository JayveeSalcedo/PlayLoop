import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load the monorepo root .env regardless of CWD (see apps/web/next.config.ts for the same pattern).
config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env") });

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  // Supabase projects have several other schemas (auth, storage, realtime, ...)
  // with constraint formats drizzle-kit's introspector can crash on. Our own
  // tables all live in `public`, so there's no reason to introspect the rest.
  schemaFilter: ["public"],
});
