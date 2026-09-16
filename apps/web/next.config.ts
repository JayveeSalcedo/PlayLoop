import path from "node:path";
import { config } from "dotenv";
import type { NextConfig } from "next";

// Load the monorepo root .env (not apps/web/.env) so one file configures
// both this app and packages/db's CLI scripts. See .env.example.
config({ path: path.resolve(__dirname, "../../.env") });

/**
 * Server-only packages Node must load directly instead of webpack bundling
 * them. @playloop/replay spawns a worker from a file sitting beside its own
 * module and loads QuickJS's WebAssembly from disk, so bundling it breaks
 * both. Ported from apps/lab/next.config.ts, where this was worked out.
 */
const NODE_LOADED = ["@playloop/replay", "@playloop/ai", "quickjs-emscripten", "groq-sdk", "@anthropic-ai/sdk"];

const nextConfig: NextConfig = {
  // The monorepo root, so output-file tracing reaches packages/ outside apps/web.
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  transpilePackages: ["@playloop/ui", "@playloop/games", "@playloop/economy", "@playloop/db", "@playloop/runtime"],
  serverExternalPackages: NODE_LOADED,
  /**
   * The worker script and the QuickJS .wasm are loaded at runtime by path, so
   * nothing statically imports them and tracing would otherwise drop them from
   * the serverless bundle.
   */
  outputFileTracingIncludes: {
    "/api/**": ["../../packages/replay/dist/**", "../../node_modules/.pnpm/quickjs-emscripten*/**"],
  },
  webpack(config, { isServer }) {
    if (isServer) {
      // serverExternalPackages skips pnpm workspace packages (symlinked outside
      // node_modules), so @playloop/replay needs this to stay external too.
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : [config.externals]),
        ...NODE_LOADED.map((name) => ({ [name]: `commonjs ${name}` })),
      ];
    }
    return config;
  },
};

export default nextConfig;
