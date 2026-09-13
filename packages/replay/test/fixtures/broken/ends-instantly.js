// BROKEN ON PURPOSE: the game ends after half a second.
playloop.game({
  meta: { title: "Blink", hint: "Tap fast", maxSeconds: 30 },
  init() {
    return {};
  },
  update(s, input, ctx) {
    ctx.score(input.taps.length * 10);
    if (ctx.time >= 0.5) ctx.end();
  },
});
