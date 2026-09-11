/**
 * "Catch" game template — drag/arrow-key a cup to catch falling items,
 * dodge the spiky ones. Ported from the prototype's GT.catch and drawItem
 * (reference/playloop-prototype.html, lines 1434-1481).
 */
import { INK, THEMES, type ItemKind, type ThemeName } from "@playloop/ui";
import { SPEED_BY_DIFFICULTY } from "../engine";
import type { Difficulty, GameApi, GameDefinition } from "../types";

export interface CatchConfig {
  difficulty: Difficulty;
  theme: ThemeName;
  item: ItemKind;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clampNum = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

type FallKind = "g" | "au" | "bad";

interface FallingItem {
  x: number;
  y: number;
  vy: number;
  k: FallKind;
  rot: number;
  vr: number;
}

function drawItem(ctx: CanvasRenderingContext2D, item: ItemKind, x: number, y: number, rot: number, kind: FallKind) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(255,255,255,.13)";
  ctx.beginPath();
  ctx.arc(0, 0, 24, 0, 7);
  ctx.fill();
  ctx.scale(1.3, 1.3);
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = INK;
  ctx.lineJoin = "round";

  if (kind === "bad") {
    ctx.fillStyle = "#FF5FA2";
    ctx.beginPath();
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2 + rot * 0.3;
      const r = i % 2 ? 9 : 15;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-6, -4);
    ctx.lineTo(-2, 0);
    ctx.moveTo(-2, -4);
    ctx.lineTo(-6, 0);
    ctx.moveTo(2, -4);
    ctx.lineTo(6, 0);
    ctx.moveTo(6, -4);
    ctx.lineTo(2, 0);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const gold = kind === "au";
  if (gold) {
    ctx.fillStyle = "rgba(255,221,60,.28)";
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, 7);
    ctx.fill();
  }
  ctx.rotate(rot);
  if (item === "star") {
    ctx.fillStyle = gold ? "#FFF3A0" : "#FFDD3C";
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 6.5 : 15;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (item === "gem") {
    ctx.fillStyle = gold ? "#FFDD3C" : "#3FC8FF";
    ctx.beginPath();
    ctx.moveTo(-13, -4);
    ctx.lineTo(-6, -12);
    ctx.lineTo(6, -12);
    ctx.lineTo(13, -4);
    ctx.lineTo(0, 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-13, -4);
    ctx.lineTo(13, -4);
    ctx.stroke();
  } else if (item === "orb") {
    ctx.fillStyle = gold ? "#FFDD3C" : "#22D39B";
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.beginPath();
    ctx.arc(-4.5, -4.5, 3.5, 0, 7);
    ctx.fill();
  } else {
    ctx.fillStyle = gold ? "#FFDD3C" : "#B8652F";
    ctx.beginPath();
    ctx.ellipse(0, 0, 10.5, 14, 0, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = gold ? INK : "#FFB27A";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-2, -12);
    ctx.bezierCurveTo(5, -4, -5, 4, 2, 12);
    ctx.stroke();
  }
  ctx.restore();
}

export const catchGame: GameDefinition<CatchConfig> = {
  duration: () => 25,
  hint: "Drag or use arrow keys to move the cup",
  start(stage: HTMLElement, config: CatchConfig, api: GameApi) {
    const c = document.createElement("canvas");
    c.className = "gcv";
    stage.appendChild(c);
    const ctx = c.getContext("2d")!;
    let W = 0;
    let H = 0;

    const fit = () => {
      const r = stage.getBoundingClientRect();
      const d = Math.min(2, window.devicePixelRatio || 1);
      W = r.width;
      H = r.height;
      c.width = W * d;
      c.height = H * d;
      c.style.width = W + "px";
      c.style.height = H + "px";
      ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);

    const sp = SPEED_BY_DIFFICULTY[config.difficulty] ?? 1;
    const acc = (THEMES[config.theme] || THEMES.ember!)[1];
    const item = config.item || "bean";

    let cx = W / 2;
    let tx = W / 2;
    let items: FallingItem[] = [];
    let spawnT = 0.2;
    const t0 = performance.now();
    let last = t0;
    let raf = 0;
    const keys: Record<string, boolean> = {};
    let wob = 0;

    const pos = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      tx = clampNum(e.clientX - r.left, 34, W - 34);
    };
    c.addEventListener("pointermove", pos);
    c.addEventListener("pointerdown", (e) => {
      pos(e);
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    });
    const kd = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        keys[e.key] = e.type === "keydown";
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", kd);

    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const el = (now - t0) / 1000;
      if (keys.ArrowLeft) tx = clampNum(tx - 440 * dt, 34, W - 34);
      if (keys.ArrowRight) tx = clampNum(tx + 440 * dt, 34, W - 34);
      spawnT -= dt;
      if (spawnT <= 0) {
        const r = Math.random();
        items.push({
          x: rand(24, W - 24),
          y: -24,
          vy: rand(150, 220) * sp * (1 + el / 28),
          k: r < 0.72 ? "g" : r < 0.85 ? "au" : "bad",
          rot: rand(0, 6),
          vr: rand(-3, 3),
        });
        spawnT = Math.max(0.24, 0.58 - el * 0.012) / sp;
      }
      cx += (tx - cx) * Math.min(1, dt * 16);
      wob = Math.max(0, wob - dt);
      const cupY = H - 62;

      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i]!;
        it.y += it.vy * dt;
        it.rot += it.vr * dt;
        if (it.y > cupY - 26 && it.y < cupY + 6 && Math.abs(it.x - cx) < 42) {
          const v = it.k === "g" ? 10 : it.k === "au" ? 30 : -15;
          api.add(v, it.x, cupY - 34);
          if (v < 0) wob = 0.35;
          items.splice(i, 1);
          continue;
        }
        if (it.y > H + 30) items.splice(i, 1);
      }

      ctx.clearRect(0, 0, W, H);
      for (const it of items) drawItem(ctx, item, it.x, it.y, it.rot, it.k === "g" ? "g" : it.k);

      const sx = cx + (wob ? Math.sin(wob * 60) * 5 : 0);
      ctx.save();
      ctx.translate(sx, cupY);
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.lineJoin = "round";
      ctx.fillStyle = "rgba(0,0,0,.25)";
      ctx.beginPath();
      ctx.ellipse(0, 44, 34, 6, 0, 0, 7);
      ctx.fill();
      ctx.shadowColor = "rgba(255,221,60,.55)";
      ctx.shadowBlur = 22;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(-36, -18);
      ctx.lineTo(36, -18);
      ctx.lineTo(28, 38);
      ctx.lineTo(-28, 38);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = acc;
      ctx.beginPath();
      ctx.moveTo(-33, 0);
      ctx.lineTo(33, 0);
      ctx.lineTo(31, 16);
      ctx.lineTo(-31, 16);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.fillRect(-39, -25, 78, 9);
      ctx.strokeRect(-39, -25, 78, 9);
      ctx.restore();

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", kd);
      items = [];
    };
  },
};
