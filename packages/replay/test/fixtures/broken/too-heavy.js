// BROKEN ON PURPOSE: hundreds of objects compared against each other every tick.
playloop.game({
  meta: { title: "Particle Storm", hint: "Drag through the storm", maxSeconds: 60 },
  init(ctx) {
    const p = [];
    for (let i = 0; i < 400; i++) p.push({ x: ctx.random() * 360, y: ctx.random() * 640, vx: ctx.random() - 0.5, vy: ctx.random() - 0.5 });
    return { p };
  },
  update(s, input, ctx) {
    for (const a of s.p) {
      a.x += a.vx;
      a.y += a.vy;
      for (const b of s.p) if (a !== b && Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2) a.vx = -a.vx;
      if (input.pointer.down && Math.hypot(a.x - input.pointer.x, a.y - input.pointer.y) < 30) ctx.score(1);
    }
  },
});
