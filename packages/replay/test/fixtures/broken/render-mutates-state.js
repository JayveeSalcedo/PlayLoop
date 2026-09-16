// BROKEN ON PURPOSE: game logic inside render(), which never runs on the server.
playloop.game({
  meta: { title: "Sneaky Render", hint: "Tap anywhere", maxSeconds: 15 },
  init() {
    return { taps: 0, bonus: 0 };
  },
  update(s, input, ctx) {
    s.taps += input.taps.length;
    if (input.taps.length) ctx.score(5 + s.bonus);
  },
  render(s, g) {
    s.bonus += 1; // looks harmless, breaks replay
    g.clear("#ffdd3c");
  },
});
