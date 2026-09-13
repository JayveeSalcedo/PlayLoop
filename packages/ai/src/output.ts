/**
 * The one response shape every provider must return for every task.
 * Strict-mode friendly for both Groq and Anthropic: every property required,
 * no additional properties.
 */
import { AiError } from "./types";

export const GAME_OUTPUT_SCHEMA_NAME = "playloop_game";

export const GAME_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "code", "notes"],
  properties: {
    title: { type: "string", description: "The game's title, at most 40 characters." },
    summary: { type: "string", description: "One sentence a player would read: what you do and how you score." },
    code: { type: "string", description: "The complete game file: a single playloop.game({...}) call, no imports, no markdown fences." },
    notes: { type: "string", description: "Short note on what was built or changed, and anything from the request that couldn't be done." },
  },
} as const;

export interface GameOutput {
  title: string;
  summary: string;
  code: string;
  notes: string;
}

const FENCE = /^\s*```(?:js|javascript)?\s*\n([\s\S]*?)\n?```\s*$/;

/** Validates a provider's JSON against the schema and tidies the code (some models still wrap it in fences). */
export function parseGameOutput(json: unknown): GameOutput {
  const o = json as Partial<Record<keyof GameOutput, unknown>> | null;
  if (!o || typeof o !== "object") throw new AiError("bad_output", "The AI didn't return a JSON object.");
  for (const key of ["title", "summary", "code", "notes"] as const) {
    if (typeof o[key] !== "string") throw new AiError("bad_output", `The AI response is missing "${key}".`);
  }
  let code = (o.code as string).trim();
  const fenced = FENCE.exec(code);
  if (fenced) code = fenced[1]!.trim();
  if (!code.includes("playloop.game")) throw new AiError("bad_output", "The AI response doesn't contain a playloop.game({...}) call.");
  return { title: (o.title as string).trim(), summary: (o.summary as string).trim(), code, notes: (o.notes as string).trim() };
}
