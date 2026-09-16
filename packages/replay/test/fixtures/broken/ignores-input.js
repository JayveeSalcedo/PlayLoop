// BROKEN ON PURPOSE: points just tick up; nothing the player does matters.
playloop.game({
  meta: { title: "Free Points", hint: "Watch the number go up", maxSeconds: 10 },
  init() {
    return {};
  },
  update(s, input, ctx) {
    if (ctx.tick % 30 === 0) ctx.score(10);
  },
});
