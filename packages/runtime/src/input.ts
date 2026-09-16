/**
 * Input events, their compact log format, and the tracker that turns a tick's
 * events into the InputFrame a game's update() sees.
 *
 * Coordinates are quantized to quarter logical pixels *before* the live game
 * sees them, and the live game consumes events through the same tracker the
 * replay uses — so the browser and the server feed update() identical inputs.
 */
import { KEYS, LOGICAL_HEIGHT, LOGICAL_WIDTH, type InputFrame, type Key, type SwipeDirection } from "./contract";

export const EV_POINTER_DOWN = 0;
export const EV_POINTER_MOVE = 1;
export const EV_POINTER_UP = 2;
export const EV_KEY_DOWN = 3;
export const EV_KEY_UP = 4;

/** Pointer events carry id, x·4, y·4. Key events carry a KEYS index. */
export type InputEvent =
  | { type: typeof EV_POINTER_DOWN | typeof EV_POINTER_MOVE | typeof EV_POINTER_UP; id: number; x4: number; y4: number }
  | { type: typeof EV_KEY_DOWN | typeof EV_KEY_UP; key: number };

export type PointerInputEvent = Extract<InputEvent, { id: number }>;
export type KeyInputEvent = Extract<InputEvent, { key: number }>;

export const isKeyEvent = (event: InputEvent): event is KeyInputEvent => event.type === EV_KEY_DOWN || event.type === EV_KEY_UP;

export const MAX_POINTER_ID = 15;
const X4_MAX = LOGICAL_WIDTH * 4;
const Y4_MAX = LOGICAL_HEIGHT * 4;

/** A tick's worth of motion that counts as a swipe: ≥ 40 logical px within 45 ticks (0.75 s). */
const SWIPE_MIN_DISTANCE = 40;
const SWIPE_MAX_TICKS = 45;

/**
 * The recorded input for one play.
 * `events` is a flat integer list: for each event, [tickDelta, type, ...args]
 * where args are (id, x4, y4) for pointer events and (keyIndex) for key events.
 * `ticks` is how many updates the client ran before the game ended.
 */
export interface InputLog {
  v: 1;
  ticks: number;
  events: number[];
}

/** Logical coordinate → quantized integer (quarter pixels), clamped to the screen. */
export function quantize(value: number, axis: "x" | "y"): number {
  const max = axis === "x" ? X4_MAX : Y4_MAX;
  const q = Math.round(value * 4);
  return q < 0 ? 0 : q > max ? max : q;
}

/** Collects events against the tick they apply to and produces an InputLog. */
export function createInputRecorder() {
  const events: number[] = [];
  let lastTick = 0;
  return {
    record(tick: number, event: InputEvent) {
      const delta = tick - lastTick;
      if (delta < 0) throw new Error("Input events must be recorded in tick order.");
      lastTick = tick;
      if (isKeyEvent(event)) events.push(delta, event.type, event.key);
      else events.push(delta, event.type, event.id, event.x4, event.y4);
    },
    toLog(ticks: number): InputLog {
      return { v: 1, ticks, events: events.slice() };
    },
  };
}

export type DecodedEvent = { tick: number; event: InputEvent };

/** Parses and validates a log. Throws a readable Error on anything malformed. */
export function decodeInputLog(log: unknown): { ticks: number; events: DecodedEvent[] } {
  const l = log as Partial<InputLog>;
  if (!l || typeof l !== "object" || l.v !== 1) throw new Error("Input log version must be 1.");
  if (typeof l.ticks !== "number" || !Number.isInteger(l.ticks) || l.ticks < 1) throw new Error("Input log ticks must be a positive integer.");
  if (!Array.isArray(l.events)) throw new Error("Input log events must be an array.");
  const raw = l.events;
  const out: DecodedEvent[] = [];
  let tick = 0;
  let i = 0;
  const int = (at: number, min: number, max: number) => {
    const v = raw[at];
    if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
      throw new Error(`Input log value at position ${at} is out of range.`);
    }
    return v;
  };
  while (i < raw.length) {
    tick += int(i, 0, 1_000_000);
    const type = int(i + 1, 0, 4);
    if (type === EV_KEY_DOWN || type === EV_KEY_UP) {
      out.push({ tick, event: { type, key: int(i + 2, 0, KEYS.length - 1) } });
      i += 3;
    } else {
      out.push({
        tick,
        event: {
          type: type as typeof EV_POINTER_DOWN,
          id: int(i + 2, 0, MAX_POINTER_ID),
          x4: int(i + 3, 0, X4_MAX),
          y4: int(i + 4, 0, Y4_MAX),
        },
      });
      i += 5;
    }
  }
  return { ticks: l.ticks, events: out };
}

const noKeys = (): Record<Key, boolean> => ({ left: false, right: false, up: false, down: false, action: false });

/** Folds each tick's events into an InputFrame. One tracker per session. */
export function createInputTracker() {
  const held = new Map<number, { x: number; y: number; startX: number; startY: number; startTick: number }>();
  const keys = noKeys();
  let last = { x: LOGICAL_WIDTH / 2, y: LOGICAL_HEIGHT / 2 };

  return {
    frame(tick: number, events: readonly InputEvent[]): InputFrame {
      const taps: { x: number; y: number }[] = [];
      const releases: { x: number; y: number }[] = [];
      const swipes: SwipeDirection[] = [];
      const pressed = noKeys();

      for (const e of events) {
        if (isKeyEvent(e)) {
          const k = KEYS[e.key]!;
          if (e.type === EV_KEY_DOWN) {
            if (!keys[k]) pressed[k] = true;
            keys[k] = true;
          } else {
            keys[k] = false;
          }
          continue;
        }
        const x = e.x4 / 4;
        const y = e.y4 / 4;
        last = { x, y };
        if (e.type === EV_POINTER_DOWN) {
          held.set(e.id, { x, y, startX: x, startY: y, startTick: tick });
          taps.push({ x, y });
        } else if (e.type === EV_POINTER_MOVE) {
          const p = held.get(e.id);
          if (p) {
            p.x = x;
            p.y = y;
          }
        } else {
          const p = held.get(e.id);
          held.delete(e.id);
          releases.push({ x, y });
          if (p && tick - p.startTick <= SWIPE_MAX_TICKS) {
            const dx = x - p.startX;
            const dy = y - p.startY;
            const ax = dx < 0 ? -dx : dx;
            const ay = dy < 0 ? -dy : dy;
            if (ax >= SWIPE_MIN_DISTANCE || ay >= SWIPE_MIN_DISTANCE) {
              swipes.push(ax >= ay ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
            }
          }
        }
      }

      const pointers = [...held.entries()].sort((a, b) => a[0] - b[0]).map(([id, p]) => ({ id, x: p.x, y: p.y }));
      return {
        pointers,
        pointer: { x: last.x, y: last.y, down: held.size > 0 },
        taps,
        releases,
        swipes,
        keys: { ...keys },
        pressed,
      };
    },
  };
}
