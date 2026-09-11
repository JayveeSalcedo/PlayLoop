/**
 * "Quiz" game template — four-answer multiple choice, per-question timer,
 * speed bonus for a fast correct answer. Ported from the prototype's
 * GT.quiz (reference/playloop-prototype.html, lines 1515-1531).
 *
 * Self-terminating: duration() returns 0 (no shared clock), the template
 * calls api.end() itself after the last question.
 */
import { QUIZ_SECONDS_PER_QUESTION } from "../rules";
import type { Difficulty, GameApi, GameDefinition, QuizQuestion } from "../types";
import { escapeHtml } from "../util";

export interface QuizConfig {
  difficulty: Difficulty;
  questions: QuizQuestion[];
}

const SECONDS_PER_QUESTION = QUIZ_SECONDS_PER_QUESTION;
const LETTERS = ["A", "B", "C", "D"];

export const quizGame: GameDefinition<QuizConfig> = {
  duration: () => 0,
  start(stage: HTMLElement, config: QuizConfig, api: GameApi) {
    const qs = config.questions || [];
    const per = SECONDS_PER_QUESTION[config.difficulty] ?? 10;
    let i = 0;
    let dead = false;
    let tick: ReturnType<typeof setInterval> | null = null;
    let tid: ReturnType<typeof setTimeout> | null = null;

    stage.insertAdjacentHTML("beforeend", '<div class="qz"></div>');
    const box = stage.querySelector<HTMLElement>(".qz")!;

    function show() {
      if (dead) return;
      if (i >= qs.length) {
        api.end();
        return;
      }
      const q = qs[i]!;
      let left = per;
      let answered = false;

      box.innerHTML = `<div class="qz-prog">${qs
        .map((_, k) => `<i class="${k < i ? "d" : k === i ? "c" : ""}"></i>`)
        .join(
          "",
        )}</div><div class="qz-n">Question ${i + 1} of ${qs.length}</div><div class="qz-q">${escapeHtml(q.q)}</div><div class="qz-a">${q.a
        .map(
          (t, k) =>
            `<button data-k="${k}" type="button" style="animation-delay:${k * 60}ms"><span>${LETTERS[k]}</span>${escapeHtml(t)}</button>`,
        )
        .join("")}</div>`;

      api.timer(per, per);
      const t0 = performance.now();
      tick = setInterval(() => {
        left = per - (performance.now() - t0) / 1000;
        api.timer(Math.max(0, left), per);
        if (left <= 0) {
          if (tick) clearInterval(tick);
          if (!answered) {
            answered = true;
            reveal(-1, null, 0);
          }
        }
      }, 100);

      box.querySelector<HTMLElement>(".qz-a")!.onclick = (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
        if (!b || answered) return;
        answered = true;
        if (tick) clearInterval(tick);
        reveal(Number(b.dataset.k), b, left);
      };

      function reveal(k: number, b: HTMLButtonElement | null, lft: number) {
        const btns = [...box.querySelectorAll<HTMLButtonElement>(".qz-a button")];
        btns.forEach((x) => (x.disabled = true));
        btns[q.c]?.classList.add("ok");
        if (k === q.c && b) {
          const pts = 100 + Math.round((Math.max(0, lft) / per) * 50);
          const r = b.getBoundingClientRect();
          const sr = stage.getBoundingClientRect();
          api.add(pts, r.left - sr.left + r.width * 0.72, r.top - sr.top + 6);
        } else if (b) {
          b.classList.add("no");
        }
        tid = setTimeout(() => {
          i++;
          show();
        }, 1050);
      }
    }
    show();

    return () => {
      dead = true;
      if (tick) clearInterval(tick);
      if (tid) clearTimeout(tid);
    };
  },
};
