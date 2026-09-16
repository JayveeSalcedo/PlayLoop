import path from "node:path";
import type { NextConfig } from "next";

/** Server-only packages Node must load directly instead of webpack bundling them. */
const NODE_LOADED = ["@playloop/replay", "@playloop/ai", "quickjs-emscripten", "groq-sdk", "@anthropic-ai/sdk"];

const nextConfig: NextConfig = {
  // The monorepo root. Set explicitly because a git worktree nests this repo inside another checkout.
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  transpilePackages: ["@playloop/ui", "@playloop/runtime"],
  serverExternalPackages: NODE_LOADED,
  webpack(config, { isServer }) {
    if (isServer) {
      // serverExternalPackages skips pnpm workspace packages (symlinked outside
      // node_modules), and bundling @playloop/replay breaks it: it spawns a
      // worker from a file beside its own module and loads QuickJS's WASM from disk.
      config.externals = [...(Array.isArray(config.externals) ? config.externals : [config.externals]), ...NODE_LOADED.map((name) => ({ [name]: `commonjs ${name}` }))];
    }
    return config;
  },
  // Phones on the local network load the dev server by IP.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.16.*.*"],
};

export default nextConfig;
