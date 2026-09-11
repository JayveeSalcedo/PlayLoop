/**
 * "Tap Reflex" game template — tap the smiling orbs as they pop up, avoid
 * the spiky ones, chain hits for a combo multiplier. Ported from the
 * prototype's GT.reflex (reference/playloop-prototype.html, lines 1482-1500).
 */
import { BAD_FACE, GOOD_FACE } from "@playloop/ui";
import { GAME_DURATION_SECONDS, SPEED_BY_DIFFICULTY } from "../rules";
import type { Difficulty, GameApi, GameDefinition } from "../types";

export type ReflexTarget = "mint" | "sky" | "lemon";

export interface ReflexConfig {
  difficulty: Difficulty;
  /** Colour of the good targets. */
  target: ReflexTarget;
}

export const reflexGame: GameDefinition<ReflexConfig> = {
  duration: () => GAME_DURATION_SECONDS.reflex,
  hint: "Tap the smiling orbs. Avoid the spiky ones.",
  start(stage: HTMLElement, config: ReflexConfig, api: GameApi) {
    stage.insertAdjacentHTML(
      "beforeend",
      `<div class="rx">${'<div class="rx-h"></div>'.repeat(9)}</div><div class="rx-combo"></div>`,
    );
    const holes = [...stage.querySelectorAll<HTMLElement>(".rx-h")];
    const comboEl = stage.querySelector<HTMLElement>(".rx-combo")!;
    const sp = SPEED_BY_DIFFICULTY[config.difficulty] ?? 1;
    const col = config.target || "mint";

    let combo = 0;
    const t0 = performance.now();
    let dead = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const later = (fn: () => void, ms: number) => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
      return id;
    };

    const setCombo = (n: number) => {
      combo = n;
      comboEl.textContent = n >= 3 ? `Combo x${n}` : "";
      comboEl.classList.toggle("on", n >= 3);
    };

    function spawn() {
      if (dead) return;
      const el = (performance.now() - t0) / 1000;
      const free = holes.filter((h) => !h.firstChild);
      if (free.length) {
        const hole = free[Math.floor(Math.random() * free.length)]!;
        const bad = Math.random() < 0.22;
        const t = document.createElement("button");
        t.type = "button";
        t.className = "rx-t " + (bad ? "bad" : "c-" + col);
        t.setAttribute("aria-label", bad ? "Avoid" : "Tap");
        t.innerHTML = bad ? BAD_FACE : GOOD_FACE;
        hole.appendChild(t);

        const kill = later(
          () => {
            if (t.parentNode && !t.classList.contains("hit")) {
              t.classList.add("gone");
              later(() => t.remove(), 180);
              if (!bad) setCombo(0);
            }
          },
          Math.max(560, 1050 - el * 24) / sp,
        );

        t.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          if (dead || t.classList.contains("hit") || t.classList.contains("gone")) return;
          clearTimeout(kill);
          timers.delete(kill);
          t.classList.add("hit");
          const r = t.getBoundingClientRect();
          const sr = stage.getBoundingClientRect();
          const x = r.left - sr.left + r.width / 2;
          const y = r.top - sr.top;
          if (bad) {
            api.add(-20, x, y);
            setCombo(0);
            stage.classList.add("shake");
            later(() => stage.classList.remove("shake"), 350);
          } else {
            setCombo(combo + 1);
            api.add(10 + Math.min(combo, 10) * 2, x, y);
          }
          later(() => t.remove(), 230);
        });
      }
      later(spawn, Math.max(260, 620 - el * 18) / sp);
    }
    later(spawn, 150);

    return () => {
      dead = true;
      timers.forEach(clearTimeout);
      timers.clear();
    };
  },
};
