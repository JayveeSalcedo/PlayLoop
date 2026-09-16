// BROKEN ON PURPOSE: unseeded randomness the server can't replay.
playloop.game({
  meta: { title: "Random Spawner", hint: "Tap the targets", maxSeconds: 20 },
  init() {
    return { x: 180, y: 320 };
  },
  update(s, input, ctx) {
    for (const tap of input.taps) {
      if (Math.hypot(tap.x - s.x, tap.y - s.y) < 50) {
        ctx.score(10);
        s.x = Math.random() * 360;
        s.y = Math.random() * 640;
      }
    }
  },
});
