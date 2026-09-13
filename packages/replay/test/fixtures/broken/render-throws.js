// BROKEN ON PURPOSE: render() reads a field that doesn't exist.
playloop.game({
  meta: { title: "Broken Paint", hint: "Tap the circle", maxSeconds: 15 },
  init() {
    return { x: 180, y: 320 };
  },
  update(s, input, ctx) {
    for (const t of input.taps) if (Math.hypot(t.x - s.x, t.y - s.y) < 80) ctx.score(10);
  },
  render(s, g) {
    g.circle(s.player.x, s.player.y, 40);
  },
});
