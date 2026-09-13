/**
 * Browser host: the second script in the game iframe, after the prelude and
 * before the game's own code. Bundled to HOST_SOURCE.
 *
 * Owns everything the replay doesn't need: the frame loop, canvas scaling,
 * turning DOM pointer/key events into quantized input events, recording them,
 * and talking to the parent page over postMessage.
 *
 * Nothing it sends is trusted by the parent or the server. The game's code
 * runs in this same realm and could forge any message; the server replays the
 * recorded inputs and pays only on its own result.
 */
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, TICKS_PER_SECOND, type GameMeta, type Key } from "./contract";
import { createCanvasDraw } from "./draw";
import type { InputEvent } from "./input";
import type { Session } from "./session";

interface HostApi {
  meta(): string;
  createSession(seed: string): Session;
  game(): { render?: (state: unknown, g: unknown, ctx: unknown) => void } | null;
  createRecorder(): { record(tick: number, e: InputEvent): void; toLog(ticks: number): unknown };
  quantize(v: number, axis: "x" | "y"): number;
  caps: { now: (() => number) | null; requestFrame: ((cb: (t: number) => void) => number) | null; cancelFrame: ((id: number) => void) | null };
}

/** Messages this host posts to the parent. */
export type HostMessage =
  | { type: "ready"; meta: GameMeta }
  | { type: "error"; stage: "load" | "start" | "update" | "render"; message: string; tick?: number }
  | { type: "hud"; score: number; lives: number; timeLeft: number }
  | { type: "end"; score: number; ticks: number; hash: string; endReason: string; log: unknown };

/** Messages the parent posts to this host. */
export type ParentMessage =
  | { type: "hello" }
  | { type: "start"; seed: string; images?: Record<string, string> }
  | { type: "quit" };

const TICK_MS = 1000 / TICKS_PER_SECOND;
const MAX_STEPS_PER_FRAME = 8;
const MAX_POINTERS = 16;
const HUD_EVERY_TICKS = 6;

const KEY_MAP: Record<string, Key> = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  Space: "action",
  Enter: "action",
};
const KEY_INDEX: Record<Key, number> = { left: 0, right: 1, up: 2, down: 3, action: 4 };

(function startHost() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  const pl = g.__pl as HostApi;
  const { now, requestFrame, cancelFrame } = pl.caps;
  const post = (msg: HostMessage) => g.parent.postMessage(msg, "*");

  let started = false;
  let stopped = false;

  g.addEventListener("error", (e: ErrorEvent) => {
    if (stopped) return;
    post({ type: "error", stage: started ? "update" : "load", message: e.message || "Script error" });
  });

  // The frame can finish loading before the parent page is listening (e.g. a
  // server-rendered iframe loads before hydration), so the load result is kept
  // and re-sent whenever the parent says hello.
  let loadMessage: HostMessage | null = null;
  g.addEventListener("load", () => {
    const result = JSON.parse(pl.meta()) as { ok: true; meta: GameMeta } | { ok: false; detail: string };
    loadMessage = result.ok ? { type: "ready", meta: result.meta } : { type: "error", stage: "load", message: result.detail };
    post(loadMessage);
  });

  g.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== g.parent) return;
    const msg = event.data as ParentMessage;
    if (msg?.type === "hello") {
      if (loadMessage && !started) post(loadMessage);
    } else if (msg?.type === "start" && !started) {
      started = true;
      void begin(String(msg.seed), msg.images ?? {});
    } else if (msg?.type === "quit") {
      stopped = true;
    }
  });

  async function loadImages(images: Record<string, string>) {
    const out = new Map<string, HTMLImageElement>();
    await Promise.all(
      Object.entries(images).map(
        ([slot, src]) =>
          new Promise<void>((resolve) => {
            if (typeof src !== "string" || !src.startsWith("data:image/")) return resolve();
            const img = new g.Image() as HTMLImageElement;
            img.onload = () => {
              out.set(`slot:${slot}`, img);
              resolve();
            };
            img.onerror = () => resolve();
            img.src = src;
          }),
      ),
    );
    return out;
  }

  async function begin(seed: string, images: Record<string, string>) {
    if (!now || !requestFrame) {
      post({ type: "error", stage: "start", message: "This browser can't run PlayLoop games." });
      return;
    }
    const canvas = g.document.getElementById("c") as HTMLCanvasElement;
    const ctx2d = canvas.getContext("2d")!;
    const loaded = await loadImages(images);

    let session: Session;
    try {
      session = pl.createSession(seed);
    } catch (e) {
      post({ type: "error", stage: "start", message: e instanceof Error ? e.message : String(e) });
      return;
    }
    const game = pl.game();
    const recorder = pl.createRecorder();

    // ---- canvas fit: letterbox the 360×640 logical screen into the frame ----
    let scale = 1;
    let offX = 0;
    let offY = 0;
    let dpr = 1;
    const fit = () => {
      const w = g.innerWidth as number;
      const h = g.innerHeight as number;
      dpr = Math.min(2, g.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      scale = Math.min(w / LOGICAL_WIDTH, h / LOGICAL_HEIGHT);
      offX = (w - LOGICAL_WIDTH * scale) / 2;
      offY = (h - LOGICAL_HEIGHT * scale) / 2;
    };
    fit();
    g.addEventListener("resize", fit);
    const base = () => new g.DOMMatrix([dpr * scale, 0, 0, dpr * scale, dpr * offX, dpr * offY]) as DOMMatrix;
    const draw = createCanvasDraw(ctx2d, (ref) => loaded.get(ref) ?? null, base);

    // ---- input: DOM events → quantized events, recorded at the tick they apply to ----
    const emit = (e: InputEvent) => {
      if (session.ended) return;
      recorder.record(session.tick, e);
      session.push(e);
    };
    const toLogical = (clientX: number, clientY: number) => ({
      x4: pl.quantize((clientX - offX) / scale, "x"),
      y4: pl.quantize((clientY - offY) / scale, "y"),
    });

    const pointerIds = new Map<number, number>();
    const pendingMoves = new Map<number, InputEvent>();
    const allocate = (browserId: number) => {
      for (let id = 0; id < MAX_POINTERS; id++) {
        if (![...pointerIds.values()].includes(id)) {
          pointerIds.set(browserId, id);
          return id;
        }
      }
      return -1;
    };

    canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (pointerIds.has(e.pointerId)) return;
      const id = allocate(e.pointerId);
      if (id < 0) return;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* capture is best-effort */
      }
      emit({ type: 0, id, ...toLogical(e.clientX, e.clientY) });
    });
    canvas.addEventListener("pointermove", (e) => {
      const id = pointerIds.get(e.pointerId);
      if (id === undefined) return;
      // Coalesced to one move per pointer per tick; flushed right before the step.
      pendingMoves.set(id, { type: 1, id, ...toLogical(e.clientX, e.clientY) });
    });
    const release = (e: PointerEvent) => {
      const id = pointerIds.get(e.pointerId);
      if (id === undefined) return;
      const move = pendingMoves.get(id);
      if (move) {
        emit(move);
        pendingMoves.delete(id);
      }
      pointerIds.delete(e.pointerId);
      emit({ type: 2, id, ...toLogical(e.clientX, e.clientY) });
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    const heldKeys = new Set<Key>();
    g.addEventListener("keydown", (e: KeyboardEvent) => {
      const k = KEY_MAP[e.code];
      if (!k) return;
      e.preventDefault();
      if (e.repeat || heldKeys.has(k)) return;
      heldKeys.add(k);
      emit({ type: 3, key: KEY_INDEX[k] });
    });
    g.addEventListener("keyup", (e: KeyboardEvent) => {
      const k = KEY_MAP[e.code];
      if (!k || !heldKeys.has(k)) return;
      heldKeys.delete(k);
      emit({ type: 4, key: KEY_INDEX[k] });
    });
    g.addEventListener("blur", () => {
      for (const k of heldKeys) emit({ type: 4, key: KEY_INDEX[k] });
      heldKeys.clear();
    });

    // ---- frame loop: fixed ticks from real time, render every frame ----
    let last = now();
    let acc = 0;
    let frameId = 0;

    const renderFrame = () => {
      ctx2d.setTransform(1, 0, 0, 1, 0, 0);
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);
      if (!game?.render) return;
      ctx2d.save();
      ctx2d.setTransform(base());
      ctx2d.beginPath();
      ctx2d.rect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      ctx2d.clip();
      try {
        game.render(session.state, draw, session.renderContext);
      } catch (e) {
        stop();
        post({ type: "error", stage: "render", message: e instanceof Error ? e.message : String(e), tick: session.tick });
      }
      ctx2d.restore();
    };

    const stop = () => {
      stopped = true;
      if (frameId && cancelFrame) cancelFrame(frameId);
    };

    const frame = () => {
      if (stopped) return;
      const t = now();
      // A backgrounded tab stops animation frames; capping dt pauses game time instead of fast-forwarding it.
      acc += Math.min(250, t - last);
      last = t;
      let steps = 0;
      while (acc >= TICK_MS && steps < MAX_STEPS_PER_FRAME && !session.ended) {
        for (const move of pendingMoves.values()) emit(move);
        pendingMoves.clear();
        try {
          session.step();
        } catch (e) {
          stop();
          post({ type: "error", stage: "update", message: e instanceof Error ? e.message : String(e), tick: session.tick });
          return;
        }
        session.drainSounds();
        acc -= TICK_MS;
        steps += 1;
        if (session.tick % HUD_EVERY_TICKS === 0) {
          post({ type: "hud", score: session.score, lives: session.lives, timeLeft: session.context.timeLeft });
        }
      }
      if (steps === MAX_STEPS_PER_FRAME) acc = 0;
      renderFrame();

      if (session.ended) {
        stop();
        post({ type: "hud", score: session.score, lives: session.lives, timeLeft: session.context.timeLeft });
        post({
          type: "end",
          score: session.score,
          ticks: session.tick,
          hash: session.hash(),
          endReason: String(session.endReason),
          log: recorder.toLog(session.tick),
        });
        return;
      }
      frameId = requestFrame(frame);
    };
    frameId = requestFrame(frame);
  }
})();
