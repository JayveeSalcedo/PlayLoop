/**
 * The PlayLoop game contract: the shape every AI-written (or hand-written)
 * game must follow so it can be replayed on the server.
 *
 * The rules that make replay possible:
 *  - All game logic lives in `update`, called exactly TICKS_PER_SECOND times
 *    per second of game time, with inputs already quantized.
 *  - Randomness only through ctx.random() (seeded by the server per session).
 *  - State is plain JSON data.
 *  - `render` only draws; it runs in the browser and never on the server.
 */
import type { DrawApi } from "./draw";

/**
 * Which simulation this game was written and scored against.
 *
 * A play is only reproducible from its code, seed and input log if it is
 * replayed by the *same* simulation that produced it. So every game version
 * records the runtime version it was made under, every play inherits it, and
 * verification replays against that exact prelude — never whatever happens to
 * be deployed today. See src/preludes.ts.
 *
 * **Bump this** when a change could make an existing recorded play score
 * differently: anything in prelude.ts, session.ts, replay.ts, input.ts,
 * rng.ts, detmath.ts, or the simulation-facing parts of this file. Then add
 * the new frozen prelude in src/generated/ and register it in preludes.ts;
 * the old one stays forever so old plays keep replaying.
 *
 * **Don't bump** for draw.ts, host.ts or document.ts — render never runs on
 * the server, so drawing cannot change a score.
 *
 * test/prelude.test.ts enforces this: if the runtime changes without a bump,
 * the frozen prelude for this version stops matching and the build fails.
 */
export const RUNTIME_VERSION = 1;

export const LOGICAL_WIDTH = 360;
export const LOGICAL_HEIGHT = 640;
export const TICKS_PER_SECOND = 60;
export const MIN_GAME_SECONDS = 5;
export const MAX_GAME_SECONDS = 90;
export const MAX_LIVES = 9;
export const MAX_IMAGE_SLOTS = 6;
export const TITLE_MAX = 40;
export const HINT_MAX = 120;

export type ImageShape = "circle" | "square" | "portrait" | "wide";
export const IMAGE_SHAPES: readonly ImageShape[] = ["circle", "square", "portrait", "wide"];

/**
 * What an uploaded image becomes for each slot shape: the crop frame's aspect
 * ratio and the exact pixel size it's exported at. Shared by the cropper (so
 * the frame matches) and the server (so uploads are checked against it).
 */
export const IMAGE_SLOT_SPECS: Record<ImageShape, { aspect: number; width: number; height: number; round: boolean; usedFor: string }> = {
  circle: { aspect: 1, width: 256, height: 256, round: true, usedFor: "coins, targets, avatars" },
  square: { aspect: 1, width: 256, height: 256, round: false, usedFor: "cards, tiles, sprites" },
  portrait: { aspect: 9 / 16, width: 720, height: 1280, round: false, usedFor: "a full-screen background" },
  wide: { aspect: 16 / 9, width: 1200, height: 675, round: false, usedFor: "banners and covers" },
};

/** Largest uploaded slot image, in bytes. */
export const MAX_IMAGE_BYTES = 300_000;

export interface ImageSlot {
  /** Referenced from render as g.image("slot:<id>"). */
  id: string;
  /** What the creator is asked to upload, e.g. "Your logo on the bonus coin". */
  label: string;
  /** The crop frame the uploader is locked to. */
  shape: ImageShape;
}

export interface GameMeta {
  title: string;
  hint: string;
  /** Hard cap on game length; the session ends with "time_up" when reached. */
  maxSeconds: number;
  /** 0 (default) = no lives. Otherwise the game ends when ctx.loseLife() brings it to 0. */
  lives?: number;
  imageSlots?: ImageSlot[];
}

export type Key = "left" | "right" | "up" | "down" | "action";
export const KEYS: readonly Key[] = ["left", "right", "up", "down", "action"];

export type SwipeDirection = "left" | "right" | "up" | "down";

export interface Point {
  x: number;
  y: number;
}

export interface InputFrame {
  /** Pointers currently held down, in logical coordinates. */
  pointers: (Point & { id: number })[];
  /** Last known position of the most recent pointer, and whether any pointer is down. */
  pointer: Point & { down: boolean };
  /** Presses that started this tick. */
  taps: Point[];
  /** Pointers lifted this tick. */
  releases: Point[];
  /** Quick flicks completed this tick. */
  swipes: SwipeDirection[];
  /** Keys held (arrow keys / WASD, action = space or enter). */
  keys: Record<Key, boolean>;
  /** Keys that went down this tick. */
  pressed: Record<Key, boolean>;
}

export interface GameContext {
  readonly width: number;
  readonly height: number;
  /** Updates completed before this one (0 on the first update). */
  readonly tick: number;
  /** Seconds of game time elapsed: tick / 60. */
  readonly time: number;
  /** Always 1/60. */
  readonly dt: number;
  /** Seconds left before the maxSeconds cap. */
  readonly timeLeft: number;
  /** Seeded float in [0, 1). The only randomness allowed. */
  random(): number;
  /** Seeded integer in [min, max], inclusive. */
  randomInt(min: number, max: number): number;
  /** Seeded pick from a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** Adds (or with a negative number, removes) points. Score never drops below 0. */
  score(points: number): void;
  readonly currentScore: number;
  readonly lives: number;
  loseLife(): void;
  /** Ends the game now (win, loss, or finished). */
  end(): void;
  /** Plays a sound from the built-in pack. Ignored during replay. */
  sound(name: string): void;
}

/** `any` state: games are plain JS, and the runtime only requires JSON-safe data. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface GameDefinition<S = any> {
  meta: GameMeta;
  init(ctx: GameContext): S;
  /** Mutate `state` in place, or return a replacement. */
  update(state: S, input: InputFrame, ctx: GameContext): S | void;
  render?(state: S, g: DrawApi, ctx: GameContext): void;
}

const SLOT_ID = /^[a-z0-9-]{1,24}$/;

const isPlainString = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;

/** Every reason a game definition breaks the contract. Empty = valid. */
export function contractIssues(def: unknown): string[] {
  const issues: string[] = [];
  if (!def || typeof def !== "object") return ["playloop.game() needs an object: { meta, init, update, render }."];
  const d = def as Partial<GameDefinition>;
  if (typeof d.init !== "function") issues.push("init(ctx) must be a function that returns the starting state.");
  if (typeof d.update !== "function") issues.push("update(state, input, ctx) must be a function.");
  if (d.render !== undefined && typeof d.render !== "function") issues.push("render(state, g, ctx) must be a function.");

  const meta = d.meta as Partial<GameMeta> | undefined;
  if (!meta || typeof meta !== "object") {
    issues.push("meta is required: { title, hint, maxSeconds }.");
    return issues;
  }
  if (!isPlainString(meta.title, TITLE_MAX)) issues.push(`meta.title must be 1-${TITLE_MAX} characters.`);
  if (!isPlainString(meta.hint, HINT_MAX)) issues.push(`meta.hint must be 1-${HINT_MAX} characters.`);
  if (
    typeof meta.maxSeconds !== "number" ||
    !Number.isInteger(meta.maxSeconds) ||
    meta.maxSeconds < MIN_GAME_SECONDS ||
    meta.maxSeconds > MAX_GAME_SECONDS
  ) {
    issues.push(`meta.maxSeconds must be a whole number from ${MIN_GAME_SECONDS} to ${MAX_GAME_SECONDS}.`);
  }
  if (
    meta.lives !== undefined &&
    (typeof meta.lives !== "number" || !Number.isInteger(meta.lives) || meta.lives < 0 || meta.lives > MAX_LIVES)
  ) {
    issues.push(`meta.lives must be a whole number from 0 to ${MAX_LIVES}.`);
  }
  if (meta.imageSlots !== undefined) {
    if (!Array.isArray(meta.imageSlots) || meta.imageSlots.length > MAX_IMAGE_SLOTS) {
      issues.push(`meta.imageSlots must be a list of at most ${MAX_IMAGE_SLOTS} slots.`);
    } else {
      const seen = new Set<string>();
      meta.imageSlots.forEach((slot, i) => {
        const s = slot as Partial<ImageSlot>;
        if (typeof s?.id !== "string" || !SLOT_ID.test(s.id)) {
          issues.push(`meta.imageSlots[${i}].id must be lowercase letters, digits or dashes (max 24).`);
        } else if (seen.has(s.id)) {
          issues.push(`meta.imageSlots[${i}].id "${s.id}" is used twice.`);
        } else {
          seen.add(s.id);
        }
        if (!isPlainString(s?.label, 60)) issues.push(`meta.imageSlots[${i}].label must be 1-60 characters.`);
        if (!IMAGE_SHAPES.includes(s?.shape as ImageShape)) {
          issues.push(`meta.imageSlots[${i}].shape must be one of: ${IMAGE_SHAPES.join(", ")}.`);
        }
      });
    }
  }
  return issues;
}
