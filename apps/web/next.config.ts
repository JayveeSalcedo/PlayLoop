import path from "node:path";
import { config } from "dotenv";
import type { NextConfig } from "next";

// Load the monorepo root .env (not apps/web/.env) so one file configures
// both this app and packages/db's CLI scripts. See .env.example.
config({ path: path.resolve(__dirname, "../../.env"), override: true });

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
   *
   * Each pnpm-store package is listed by its own real directory rather than a
   * single broad "quickjs-emscripten" wildcard — that wider glob also swept up
   * the symlinks pnpm creates inside a package's own nested node_modules
   * (e.g. .pnpm/quickjs-emscripten@X/node_modules/quickjs-emscripten-core,
   * and the four @jitl/quickjs-wasmfile-* variants under .pnpm/quickjs-
   * emscripten@X/node_modules/@jitl/), which Vercel's deploy packager refuses
   * ("produced an invalid deployment package ... files in symlinked
   * directories"). Listing each package's own leaf directory only reaches
   * real files — verified against the actual node_modules/.pnpm layout.
   */
  outputFileTracingIncludes: {
    "/api/**": [
      "../../packages/replay/dist/**",
      "../../node_modules/.pnpm/quickjs-emscripten@*/node_modules/quickjs-emscripten/**",
      "../../node_modules/.pnpm/quickjs-emscripten-core@*/node_modules/quickjs-emscripten-core/**",
      "../../node_modules/.pnpm/@jitl+quickjs-ffi-types@*/node_modules/@jitl/quickjs-ffi-types/**",
      "../../node_modules/.pnpm/@jitl+quickjs-wasmfile-release-sync@*/node_modules/@jitl/quickjs-wasmfile-release-sync/**",
      "../../node_modules/.pnpm/@jitl+quickjs-wasmfile-release-asyncify@*/node_modules/@jitl/quickjs-wasmfile-release-asyncify/**",
      "../../node_modules/.pnpm/@jitl+quickjs-wasmfile-debug-sync@*/node_modules/@jitl/quickjs-wasmfile-debug-sync/**",
      "../../node_modules/.pnpm/@jitl+quickjs-wasmfile-debug-asyncify@*/node_modules/@jitl/quickjs-wasmfile-debug-asyncify/**",
    ],
  },
  webpack(config, { isServer }) {
    if (isServer) {
      // serverExternalPackages skips pnpm workspace packages (symlinked outside
      // node_modules), so @playloop/replay needs this to stay external too.
      //
      // ESM packages (@playloop/replay, @playloop/ai) must use `module` type,
      // not `commonjs` — require() of an .mjs file throws on Vercel's runtime.
      const CJS_EXTERNALS = ["quickjs-emscripten", "groq-sdk", "@anthropic-ai/sdk"];
      const ESM_EXTERNALS = ["@playloop/replay", "@playloop/ai"];
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : [config.externals]),
        ...CJS_EXTERNALS.map((name) => ({ [name]: `commonjs ${name}` })),
        ...ESM_EXTERNALS.map((name) => ({ [name]: `module ${name}` })),
      ];
    }
    return config;
  },
};

export default nextConfig;
