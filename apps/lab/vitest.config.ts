import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    include: ["test/**/*.test.ts"],
    // @playloop/replay spawns worker threads from its own files; keep it out of Vite's transform.
    server: { deps: { external: ["@playloop/replay", "quickjs-emscripten"] } },
  },
});
