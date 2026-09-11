/**
 * "Memory" game template — flip cards to match six pairs before the clock
 * runs out; finishing early earns a time bonus. Ported from the prototype's
 * GT.memory (reference/playloop-prototype.html, lines 1501-1514).
 */
import { MEMORY_BACK, MEMORY_SHAPES } from "@playloop/ui";
import { GAME_DURATION_SECONDS } from "../rules";
import type { Difficulty, GameApi, GameDefinition } from "../types";
import { escapeHtml } from "../util";

export interface MemoryConfig {
  difficulty: Difficulty;
  /** Optional custom pair images (data/https URLs), index-aligned with the 6 pairs; empty slots use the shape pack. */
  images?: (string | null)[];
}

const PAIRS = 6;

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export const memoryGame: GameDefinition<MemoryConfig> = {
  duration: () => GAME_DURATION_SECONDS.memory,
  hint: "Flip two cards to find a pair",
  start(stage: HTMLElement, config: MemoryConfig, api: GameApi) {
    const faces = MEMORY_SHAPES.slice(0, PAIRS).map((shape, i) => {
      const img = config.images?.[i];
      return img ? `<img src="${escapeHtml(img)}" alt="">` : shape;
    });
    const deck = shuffle([...Array(PAIRS).keys(), ...Array(PAIRS).keys()]);

    stage.insertAdjacentHTML(
      "beforeend",
      `<div class="mm">${deck
        .map(
          (f) =>
            `<button class="mc" data-f="${f}" type="button" aria-label="Card"><div class="mc-in"><div class="mc-f">${MEMORY_BACK}</div><div class="mc-b">${faces[f]}</div></div></button>`,
        )
        .join("")}</div>`,
    );

    let open: HTMLElement[] = [];
    let lock = false;
    let matched = 0;
    let dead = false;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    stage.querySelector<HTMLElement>(".mm")!.addEventListener("click", (e) => {
      const c = (e.target as HTMLElement).closest<HTMLElement>(".mc");
      if (!c || lock || dead || c.classList.contains("flip") || c.classList.contains("done")) return;
      c.classList.add("flip");
      open.push(c);
      if (open.length !== 2) return;

      lock = true;
      const [a, b] = open as [HTMLElement, HTMLElement];
      if (a.dataset.f === b.dataset.f) {
        timeouts.push(
          setTimeout(() => {
            a.classList.add("done");
            b.classList.add("done");
            const r = b.getBoundingClientRect();
            const sr = stage.getBoundingClientRect();
            api.add(50, r.left - sr.left + r.width / 2, r.top - sr.top + r.height / 2);
            open = [];
            lock = false;
            matched++;
            if (matched === PAIRS) {
              const bonus = Math.round(api.left() * 5);
              if (bonus > 0) api.add(bonus, sr.width / 2, sr.height / 2, `Time bonus +${bonus}`);
              timeouts.push(setTimeout(() => api.end(), 900));
            }
          }, 330),
        );
      } else {
        timeouts.push(
          setTimeout(() => {
            a.classList.remove("flip");
            b.classList.remove("flip");
            open = [];
            lock = false;
          }, 760),
        );
      }
    });

    return () => {
      dead = true;
      timeouts.forEach(clearTimeout);
    };
  },
};
