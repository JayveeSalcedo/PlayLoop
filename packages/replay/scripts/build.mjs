// Builds dist/ for Node consumers that load this package natively rather than
// through a bundler (Next.js marks it as a server external package): the TS
// entry is bundled with @playloop/runtime inlined, quickjs-emscripten stays an
// external import, and the worker script is copied next to it so
// `new URL("./sandbox-worker.mjs", import.meta.url)` resolves at runtime.
//
// Two apps (web and lab) each have their own predev/prebuild hook that
// rebuilds this package independently, so `pnpm dev` from the repo root can
// launch two of these scripts at almost the same instant. copyFileSync's
// open-write-close sequence isn't safe against that on Windows: a second
// process trying to open the same destination while the first still holds it
// fails with EBUSY. Writing to a per-process temp file and renaming it into
// place keeps the window where the destination path is touched as short as
// possible; the retry loop covers what's left, since the other side's hold is
// always momentary.
import { buildSync } from "esbuild";
import { copyFileSync, mkdirSync, renameSync, rmSync } from "node:fs";
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

function copyAtomicWithRetry(src, dest, attempts = 10) {
  const tmp = `${dest}.${process.pid}.tmp`;
  for (let i = 1; ; i++) {
    try {
      copyFileSync(src, tmp);
      renameSync(tmp, dest);
      return;
    } catch (e) {
      try {
        rmSync(tmp, { force: true });
      } catch {}
      if (i >= attempts || !["EBUSY", "EPERM", "EACCES"].includes(e.code)) throw e;
      // A concurrent build of this same package holds the file momentarily;
      // wait for it to finish rather than fail the whole dev startup over it.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * i);
    }
  }
}

copyAtomicWithRetry(resolve(root, "src/sandbox-worker.mjs"), resolve(root, "dist/sandbox-worker.mjs"));
console.log("@playloop/replay -> dist/index.mjs + dist/sandbox-worker.mjs");
