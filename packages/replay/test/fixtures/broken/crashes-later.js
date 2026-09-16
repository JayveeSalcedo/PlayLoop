// BROKEN ON PURPOSE: reads a property of something that stops existing after 3 seconds.
playloop.game({
  meta: { title: "Crashes Later", hint: "Tap the dots", maxSeconds: 20 },
  init() {
    return { dots: [{ x: 180, y: 320 }] };
  },
  update(s, input, ctx) {
    if (ctx.time > 3) s.dots = undefined;
    for (const tap of input.taps) if (Math.hypot(tap.x - s.dots[0].x, tap.y - s.dots[0].y) < 60) ctx.score(10);
    if (!input.taps.length) void s.dots[0].x;
  },
  render(s, g) {
    g.clear("#3fc8ff");
  },
});
