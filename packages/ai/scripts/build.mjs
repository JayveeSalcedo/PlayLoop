// Builds dist/ for Node consumers that load this package directly rather than
// through a bundler (the lab marks it as a server external). SDKs and the
// replay package stay external imports.
import { buildSync } from "esbuild";
import { mkdirSync } from "node:fs";
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
  external: ["@playloop/replay", "groq-sdk", "@anthropic-ai/sdk"],
  legalComments: "none",
});
console.log("@playloop/ai -> dist/index.mjs");
