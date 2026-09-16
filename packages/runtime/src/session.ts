/**
 * One play of one game: a fixed-tick simulation with no clock and no DOM.
 * The browser drives it from requestAnimationFrame; the server replay drives
 * it from a recorded InputLog. Same code, same seed, same inputs → same state.
 */
import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  TICKS_PER_SECOND,
  type GameContext,
  type GameDefinition,
  type InputFrame,
} from "./contract";
import { fnv1a } from "./hash";
import { createInputTracker, type InputEvent } from "./input";
import { createRng } from "./rng";

export type EndReason = "game_end" | "time_up" | "lives_out";

export interface Session {
  readonly tick: number;
  readonly score: number;
  readonly lives: number;
  readonly ended: boolean;
  readonly endReason: EndReason | null;
  readonly maxTicks: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly state: any;
  readonly context: GameContext;
  /** Read-only context for render(): cosmetic randomness, no score/lives/end. */
  readonly renderContext: GameContext;
  /** Queues an event for the next update. */
  push(event: InputEvent): void;
  /** Runs one update. Returns the frame it used, or null if the game had already ended. */
  step(): InputFrame | null;
  /** Fingerprint of tick, score, lives and state. */
  hash(): string;
  /** Sounds requested since the last drain (browser only). */
  drainSounds(): string[];
}

export function createSession(def: GameDefinition, seed: string): Session {
  const random = createRng(seed);
  const tracker = createInputTracker();
  const maxTicks = def.meta.maxSeconds * TICKS_PER_SECOND;
  const startLives = def.meta.lives ?? 0;

  let tick = 0;
  let score = 0;
  let lives = startLives;
  let ended = false;
  let endReason: EndReason | null = null;
  let pending: InputEvent[] = [];
  let sounds: string[] = [];

  const finish = (reason: EndReason) => {
    if (ended) return;
    ended = true;
    endReason = reason;
  };

  const context: GameContext = {
    width: LOGICAL_WIDTH,
    height: LOGICAL_HEIGHT,
    get tick() {
      return tick;
    },
    get time() {
      return tick / TICKS_PER_SECOND;
    },
    dt: 1 / TICKS_PER_SECOND,
    get timeLeft() {
      return (maxTicks - tick) / TICKS_PER_SECOND;
    },
    random,
    randomInt(min, max) {
      if (!Number.isFinite(min) || !Number.isFinite(max)) throw new Error("ctx.randomInt(min, max) needs two numbers.");
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      return lo + Math.floor(random() * (hi - lo + 1));
    },
    pick(items) {
      if (!Array.isArray(items) || items.length === 0) throw new Error("ctx.pick(items) needs a non-empty array.");
      return items[Math.floor(random() * items.length)];
    },
    score(points) {
      if (typeof points !== "number" || !Number.isFinite(points)) throw new Error("ctx.score(points) needs a finite number.");
      if (ended) return;
      score = Math.max(0, score + Math.round(points));
    },
    get currentScore() {
      return score;
    },
    get lives() {
      return lives;
    },
    loseLife() {
      if (ended || startLives === 0) return;
      lives -= 1;
      if (lives <= 0) {
        lives = 0;
        finish("lives_out");
      }
    },
    end() {
      finish("game_end");
    },
    sound(name) {
      if (typeof name === "string" && sounds.length < 32) sounds.push(name);
    },
  };

  /**
   * What render() gets. Reads mirror `context`, but anything that would change
   * the simulation is blocked: render runs only in the browser, so a score or
   * a seeded random draw from it would make the browser diverge from replay.
   * Its random() is a separate cosmetic stream for sparkles and shakes.
   */
  const cosmeticRandom = createRng(`${seed}:render`);
  const blocked = (name: string) => () => {
    throw new Error(`ctx.${name}() can't be used in render(); do it in update().`);
  };
  const renderContext: GameContext = Object.freeze({
    width: LOGICAL_WIDTH,
    height: LOGICAL_HEIGHT,
    get tick() {
      return tick;
    },
    get time() {
      return tick / TICKS_PER_SECOND;
    },
    dt: 1 / TICKS_PER_SECOND,
    get timeLeft() {
      return (maxTicks - tick) / TICKS_PER_SECOND;
    },
    random: cosmeticRandom,
    randomInt: (min: number, max: number) => Math.floor(min + cosmeticRandom() * (max - min + 1)),
    pick: <T,>(items: readonly T[]) => items[Math.floor(cosmeticRandom() * items.length)] as T,
    score: blocked("score"),
    get currentScore() {
      return score;
    },
    get lives() {
      return lives;
    },
    loseLife: blocked("loseLife"),
    end: blocked("end"),
    sound: context.sound,
  });

  let state = def.init(context);
  assertJsonSafe(state, "init");

  return {
    get tick() {
      return tick;
    },
    get score() {
      return score;
    },
    get lives() {
      return lives;
    },
    get ended() {
      return ended;
    },
    get endReason() {
      return endReason;
    },
    maxTicks,
    get state() {
      return state;
    },
    context,
    renderContext,
    push(event) {
      if (!ended) pending.push(event);
    },
    step() {
      if (ended) return null;
      const frame = tracker.frame(tick, pending);
      pending = [];
      const next = def.update(state, frame, context);
      if (next !== undefined) state = next;
      tick += 1;
      if (!ended && tick >= maxTicks) finish("time_up");
      return frame;
    },
    hash() {
      return fnv1a(`${tick}|${score}|${lives}|${JSON.stringify(state)}`);
    },
    drainSounds() {
      const out = sounds;
      sounds = [];
      return out;
    },
  };
}

function assertJsonSafe(value: unknown, where: string) {
  if (value === undefined) throw new Error(`${where} must return the game state (got undefined).`);
  try {
    JSON.stringify(value);
  } catch {
    throw new Error(`${where} returned state that isn't plain JSON data (no cycles, BigInts or class instances).`);
  }
}
