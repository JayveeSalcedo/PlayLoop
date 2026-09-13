// Catch and Collect, rewritten against the PlayLoop game contract.
// Mirrors packages/games/src/templates/catch.ts: drag the cup, catch stars
// (10) and golden stars (30), dodge spiky balls (-15). 25 seconds.
playloop.game({
  meta: {
    title: "Catch and Collect",
    hint: "Drag or use arrow keys to move the cup",
    maxSeconds: 25,
    imageSlots: [{ id: "star", label: "What falls from the sky", shape: "circle" }],
  },

  init(ctx) {
    return { cupX: ctx.width / 2, targetX: ctx.width / 2, items: [], spawnIn: 0.2, wobble: 0 };
  },

  update(s, input, ctx) {
    const dt = ctx.dt;
    if (input.pointer.down) s.targetX = input.pointer.x;
    if (input.keys.left) s.targetX -= 440 * dt;
    if (input.keys.right) s.targetX += 440 * dt;
    s.targetX = Math.max(34, Math.min(ctx.width - 34, s.targetX));
    s.cupX += (s.targetX - s.cupX) * Math.min(1, dt * 16);
    s.wobble = Math.max(0, s.wobble - dt);

    s.spawnIn -= dt;
    if (s.spawnIn <= 0) {
      const r = ctx.random();
      s.items.push({
        x: 24 + ctx.random() * (ctx.width - 48),
        y: -24,
        vy: (150 + ctx.random() * 70) * (1 + ctx.time / 28),
        kind: r < 0.72 ? "good" : r < 0.85 ? "gold" : "bad",
        rot: ctx.random() * 6,
        spin: -3 + ctx.random() * 6,
      });
      s.spawnIn = Math.max(0.24, 0.58 - ctx.time * 0.012);
    }

    const cupY = ctx.height - 62;
    for (let i = s.items.length - 1; i >= 0; i--) {
      const it = s.items[i];
      it.y += it.vy * dt;
      it.rot += it.spin * dt;
      if (it.y > cupY - 26 && it.y < cupY + 6 && Math.abs(it.x - s.cupX) < 42) {
        if (it.kind === "bad") {
          ctx.score(-15);
          s.wobble = 0.35;
          ctx.sound("bonk");
        } else {
          ctx.score(it.kind === "gold" ? 30 : 10);
          ctx.sound(it.kind === "gold" ? "chime" : "pop");
        }
        s.items.splice(i, 1);
      } else if (it.y > ctx.height + 30) {
        s.items.splice(i, 1);
      }
    }
  },

  render(s, g, ctx) {
    g.clear("#3fc8ff");
    for (const it of s.items) {
      g.save();
      g.translate(it.x, it.y);
      g.rotate(it.rot);
      if (it.kind === "bad") {
        const pts = [];
        for (let i = 0; i < 20; i++) {
          const a = (i / 20) * Math.PI * 2;
          const r = i % 2 ? 12 : 19;
          pts.push(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.poly(pts, { fill: "#ff5fa2", stroke: "#18123f", lineWidth: 3 });
      } else {
        g.circle(0, 0, it.kind === "gold" ? 22 : 18, { fill: it.kind === "gold" ? "#fff3a0" : "#ffdd3c", stroke: "#18123f", lineWidth: 3 });
        g.image("slot:star", -16, -16, 32, 32);
      }
      g.restore();
    }
    const shake = s.wobble ? Math.sin(s.wobble * 60) * 5 : 0;
    const cupY = ctx.height - 62;
    g.rect(s.cupX - 36 + shake, cupY - 18, 72, 56, { fill: "#ffffff", stroke: "#18123f", lineWidth: 3, radius: 8 });
  },
});
