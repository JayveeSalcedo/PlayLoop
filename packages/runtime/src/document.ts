/**
 * Builds the HTML for a game iframe's `srcdoc`: prelude → host → game code,
 * behind a CSP that allows inline scripts and data: images and nothing else
 * (no network, no external fonts, no frames).
 *
 * The iframe must be rendered with sandbox="allow-scripts" and WITHOUT
 * allow-same-origin, which gives it an opaque origin: no cookies, storage or
 * access to the parent page.
 */
import { RUNTIME_VERSION } from "./contract";
import { HOST_SOURCE } from "./generated/host";
import { preludeFor } from "./preludes";

export const GAME_FRAME_SANDBOX = "allow-scripts";

const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:";

/** `</script` inside a script body would end the tag early; `<\/script` means the same to JS. */
const inlineScript = (source: string) => `<script>${source.replace(/<\/script/gi, "<\\/script")}</script>`;

/**
 * `runtimeVersion` must be the version the game was made under, the same one
 * the server will replay it with. The browser play and the server replay have
 * to run the identical simulation: if a game made under version 1 were played
 * here under a later prelude, its recorded inputs could produce a different
 * score on the server, and an honest play would be rejected as tampering.
 * Omit it only for a game being created or checked right now.
 */
export function buildGameDocument(gameCode: string, runtimeVersion: number = RUNTIME_VERSION): string {
  const prelude = preludeFor(runtimeVersion);
  if (prelude === null) {
    throw new Error(`This build can't run runtime version ${runtimeVersion}; it has ${RUNTIME_VERSION}.`);
  }
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">',
    "<style>html,body{margin:0;height:100%;overflow:hidden;background:transparent;touch-action:none;-webkit-user-select:none;user-select:none}canvas{display:block;width:100%;height:100%;touch-action:none}</style>",
    '</head><body><canvas id="c"></canvas>',
    inlineScript(prelude),
    inlineScript(HOST_SOURCE),
    inlineScript(gameCode),
    "</body></html>",
  ].join("");
}
