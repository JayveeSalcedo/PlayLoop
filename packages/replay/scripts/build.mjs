// Builds dist/ for Node consumers that load this package natively rather than
// through a bundler (Next.js marks it as a server external package): the TS
// entry is bundled with @playloop/runtime inlined, quickjs-emscripten stays an
// external import, and the worker script is copied next to it so
// `new URL("./sandbox-worker.mjs", import.meta.url)` resolves at runtime.
import { buildSync } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(resolve(root, "dist"), { recursive: true });

buildSync({
  entryPoints: [resolve(root, "src/index.ts")],
  outfile: resolve(root, "dist/index.mjs"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  external: ["quickjs-emscripten", "./sandbox-worker.mjs"],
  legalComments: "none",
});
copyFileSync(resolve(root, "src/sandbox-worker.mjs"), resolve(root, "dist/sandbox-worker.mjs"));
console.log("@playloop/replay -> dist/index.mjs + dist/sandbox-worker.mjs");
