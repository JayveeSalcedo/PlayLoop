/**
 * The game host/runner, ported from the prototype's runGame + hostHTML
 * (reference/playloop-prototype.html, lines 1404-1428).
 *
 * Mounts a countdown -> timed (or self-terminating) session -> cleanup
 * lifecycle into a host element, driving whichever GameDefinition template
 * is passed in. Framework-agnostic: works the same whether `host` came from
 * a React ref, a plain DOM query, or a test harness.
 */
import { icon } from "@playloop/ui";
import type { GameApi, GameDefinition, RunGameResult } from "./types";

const num = (n: number) => Math.round(n).toLocaleString("en-US");

function bump(el: HTMLElement | null) {
  if (!el) return;
  el.classList.remove("gl-bump");
  void el.offsetWidth;
  el.classList.add("gl-bump");
}

function hostHTML(): string {
  return `<div class="ghud"><button class="gx" aria-label="Quit game" type="button">${icon("close")}</button><div class="gtimer"><svg viewBox="0 0 54 54"><circle class="tb" cx="27" cy="27" r="22" fill="none" stroke-width="5"/><circle class="tf" cx="27" cy="27" r="22" fill="none" stroke-width="5" stroke-linecap="round" stroke-dasharray="138.2" stroke-dashoffset="0"/></svg><b class="gt">0</b></div><div class="gscore"><small>Score</small><b class="gs">0</b></div></div><div class="gstage"></div><div class="gcount"></div><div class="ghint"></div>`;
}

export interface RunGameHandle {
  abort(): void;
}

/**
 * Runs one game session inside `host`. Calls `onEnd` with the final score
 * once the game finishes (naturally or via api.end()); calls `onQuit` if the
 * player taps the quit button mid-session (onEnd is NOT called in that case).
 */
export function runGame<TConfig>(
  def: GameDefinition<TConfig>,
  config: TConfig,
  host: HTMLElement,
  onEnd: (result: RunGameResult) => void,
  onQuit?: () => void,
): RunGameHandle {
  host.innerHTML = hostHTML();
  const stage = host.querySelector<HTMLElement>(".gstage")!;
  const sEl = host.querySelector<HTMLElement>(".gs")!;
  const tEl = host.querySelector<HTMLElement>(".gt")!;
  const tf = host.querySelector<HTMLElement>(".tf")!;
  const tw = host.querySelector<HTMLElement>(".gtimer")!;
  const cnt = host.querySelector<HTMLElement>(".gcount")!;
  const hint = host.querySelector<HTMLElement>(".ghint")!;

  const total = def.duration(config);
  let score = 0;
  let ended = false;
  let cleanup: (() => void) | null = null;
  let iv: ReturnType<typeof setInterval> | null = null;
  let left = total;
  const timeouts: ReturnType<typeof setTimeout>[] = [];

  const setTimer = (l: number, tot: number) => {
    tEl.textContent = String(Math.ceil(l));
    tf.style.strokeDashoffset = (138.2 * (1 - l / tot)).toFixed(1);
    tw.classList.toggle("low", l <= 5);
  };

  const api: GameApi = {
    add(n, x, y, label) {
      if (ended) return;
      score = Math.max(0, score + n);
      sEl.textContent = num(score);
      bump(sEl);
      if (x != null && y != null) {
        const f = document.createElement("div");
        f.className = "ftxt " + (n >= 0 ? "pos" : "neg");
        f.textContent = label || (n > 0 ? "+" : "") + n;
        f.style.left = x + "px";
        f.style.top = y + "px";
        stage.appendChild(f);
        setTimeout(() => f.remove(), 850);
      }
    },
    end: () => finish(),
    timer: setTimer,
    left: () => left,
  };

  function finish() {
    if (ended) return;
    ended = true;
    if (iv) clearInterval(iv);
    cleanup?.();
    cleanup = null;
    setTimeout(() => onEnd({ score }), 450);
  }

  function abort() {
    ended = true;
    if (iv) clearInterval(iv);
    timeouts.forEach(clearTimeout);
    cleanup?.();
    cleanup = null;
  }

  host.querySelector<HTMLButtonElement>(".gx")!.onclick = () => {
    abort();
    onQuit?.();
  };

  if (total) setTimer(total, total);
  else {
    tEl.textContent = "";
    tf.style.strokeDashoffset = "0";
  }

  cnt.classList.add("on");
  ["3", "2", "1", "Go"].forEach((s, i) => {
    timeouts.push(
      setTimeout(() => {
        cnt.innerHTML = `<span>${s}</span>`;
      }, i * 620),
    );
  });

  timeouts.push(
    setTimeout(() => {
      cnt.classList.remove("on");
      if (ended) return;
      cleanup = def.start(stage, config, api);
      if (def.hint) {
        hint.textContent = def.hint;
        hint.classList.add("on");
        timeouts.push(setTimeout(() => hint.classList.remove("on"), 2400));
      }
      if (total) {
        const t0 = performance.now();
        iv = setInterval(() => {
          left = Math.max(0, total - (performance.now() - t0) / 1000);
          setTimer(left, total);
          if (left <= 0) finish();
        }, 100);
      }
    }, 4 * 620),
  );

  return { abort };
}
