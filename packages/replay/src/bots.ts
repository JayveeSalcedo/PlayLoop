/**
 * Game-lab bots: a trusted script evaluated in the QuickJS realm after the
 * game. Each bot plays a whole session through the same __pl session API the
 * browser host uses, recording its inputs exactly like a real player, so its
 * log can then be replayed in a fresh sandbox to check determinism.
 *
 * Plain JS in a string: it runs inside QuickJS, where Math.random is disabled,
 * so it carries its own xorshift generator.
 */

export type BotKind = "idle" | "explorer" | "masher";
export const BOT_KINDS: readonly BotKind[] = ["idle", "explorer", "masher"];

export interface BotRunSuccess {
  ok: true;
  score: number;
  ticks: number;
  endReason: string;
  hash: string;
  log: { v: 1; ticks: number; events: number[] };
  /** First exception thrown by render(), which ran every few ticks with a no-op drawing API. */
  renderError: { message: string; tick: number } | null;
  /** True if state changed while render() ran — render must only draw. */
  renderMutated: { tick: number } | null;
}

export interface BotRunFailure {
  ok: false;
  stage: "init" | "update";
  message: string;
  tick: number;
}

export type BotRunResult = BotRunSuccess | BotRunFailure;

export const BOT_SCRIPT = String.raw`
(function () {
  "use strict";
  var NOOP = { clear() {}, rect() {}, circle() {}, ellipse() {}, line() {}, poly() {}, text() {}, image() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, alpha() {} };
  var DOWN = 0, MOVE = 1, UP = 2, KEY_DOWN = 3, KEY_UP = 4;

  function rng(seed) {
    var r = seed >>> 0 || 1;
    return function () { r ^= r << 13; r >>>= 0; r ^= r >>> 17; r ^= r << 5; r >>>= 0; return r / 4294967296; };
  }
  function px(v, axis) { return __pl.quantize(v, axis); }

  // Each bot is a function (tick) -> events for that tick.
  var BOTS = {
    idle: function () { return function () { return []; }; },

    // Wanders: presses, drags around, releases; holds arrow keys for a while.
    explorer: function (rand) {
      var down = false, x = 180, y = 320, heldKey = -1, keyUntil = 0;
      return function (t) {
        var out = [];
        if (!down && rand() < 0.05) { down = true; x = rand() * 360; y = 80 + rand() * 540; out.push({ type: DOWN, id: 0, x4: px(x, "x"), y4: px(y, "y") }); }
        else if (down && rand() < 0.5) { x += (rand() - 0.5) * 70; y += (rand() - 0.5) * 50; out.push({ type: MOVE, id: 0, x4: px(x, "x"), y4: px(y, "y") }); }
        if (down && rand() < 0.03) { down = false; out.push({ type: UP, id: 0, x4: px(x, "x"), y4: px(y, "y") }); }
        if (t >= keyUntil) {
          if (heldKey >= 0) out.push({ type: KEY_UP, key: heldKey });
          heldKey = rand() < 0.5 ? -1 : Math.floor(rand() * 5);
          if (heldKey >= 0) out.push({ type: KEY_DOWN, key: heldKey });
          keyUntil = t + 20 + Math.floor(rand() * 60);
        }
        return out;
      };
    },

    // Hammers everything: quick taps all over, swipes in every direction, action presses.
    masher: function (rand) {
      var scheduled = {};
      function at(t, e) { (scheduled[t] = scheduled[t] || []).push(e); }
      var next = 0;
      return function (t) {
        if (t >= next) {
          var x = 20 + rand() * 320, y = 60 + rand() * 560, roll = rand();
          if (roll < 0.55) { at(t, { type: DOWN, id: 1, x4: px(x, "x"), y4: px(y, "y") }); at(t + 2, { type: UP, id: 1, x4: px(x, "x"), y4: px(y, "y") }); }
          else if (roll < 0.8) {
            var dx = rand() < 0.5 ? (rand() < 0.5 ? -90 : 90) : 0, dy = dx === 0 ? (rand() < 0.5 ? -90 : 90) : 0;
            at(t, { type: DOWN, id: 2, x4: px(x, "x"), y4: px(y, "y") });
            at(t + 2, { type: MOVE, id: 2, x4: px(x + dx / 2, "x"), y4: px(y + dy / 2, "y") });
            at(t + 4, { type: UP, id: 2, x4: px(x + dx, "x"), y4: px(y + dy, "y") });
          } else { var k = Math.floor(rand() * 5); at(t, { type: KEY_DOWN, key: k }); at(t + 3, { type: KEY_UP, key: k }); }
          next = t + 6 + Math.floor(rand() * 8);
        }
        var events = scheduled[t] || [];
        delete scheduled[t];
        return events;
      };
    },
  };

  function run(seed, kind, botSeed, renderEvery) {
    var session;
    try { session = __pl.createSession(seed); }
    catch (e) { return JSON.stringify({ ok: false, stage: "init", message: String((e && e.message) || e), tick: 0 }); }
    var recorder = __pl.createRecorder();
    var game = __pl.game();
    var bot = BOTS[kind](rng(botSeed));
    var renderError = null, renderMutated = null;

    try {
      while (!session.ended) {
        var t = session.tick;
        var events = bot(t);
        for (var i = 0; i < events.length; i++) { session.push(events[i]); recorder.record(t, events[i]); }
        session.step();
        if (renderEvery > 0 && game.render && session.tick % renderEvery === 0 && !renderError) {
          var before = renderMutated ? null : session.hash();
          try { game.render(session.state, NOOP, session.renderContext); }
          catch (e) { renderError = { message: String((e && e.message) || e), tick: session.tick }; }
          if (before !== null && session.hash() !== before) renderMutated = { tick: session.tick };
        }
      }
    } catch (e) {
      return JSON.stringify({ ok: false, stage: "update", message: String((e && e.message) || e), tick: session.tick });
    }
    return JSON.stringify({
      ok: true, score: session.score, ticks: session.tick, endReason: session.endReason, hash: session.hash(),
      log: recorder.toLog(session.tick), renderError: renderError, renderMutated: renderMutated,
    });
  }

  Object.defineProperty(globalThis, "__plBot", { value: Object.freeze({ run: run }), writable: false, configurable: false });
})();
`;
