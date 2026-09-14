// Brand Pop: tap the falling products, grab the logo coins, don't tap the
// spiky ones. Uses all four image slot shapes, so it doubles as the test game
// for the cropper. Every image draws over a fallback shape, so the game still
// looks right with no uploads.
playloop.game({
  meta: {
    title: "Brand Pop",
    hint: "Tap the products, grab the coins, skip the spikes",
    maxSeconds: 30,
    imageSlots: [
      { id: "background", label: "Background photo", shape: "portrait" },
      { id: "banner", label: "Banner across the top", shape: "wide" },
      { id: "product", label: "Your product", shape: "square" },
      { id: "logo", label: "Your logo on the bonus coin", shape: "circle" },
    ],
  },

  init() {
    return { things: [], nextSpawn: 0.3, combo: 0, flash: [] };
  },

  update(s, input, ctx) {
    const dt = ctx.dt;

    s.nextSpawn -= dt;
    if (s.nextSpawn <= 0) {
      const roll = ctx.random();
      const kind = roll < 0.62 ? "product" : roll < 0.8 ? "coin" : "spike";
      s.things.push({ kind, x: 40 + ctx.random() * 280, y: 150, vy: 70 + ctx.random() * 50 + ctx.time * 3, size: kind === "coin" ? 26 : 34 });
      s.nextSpawn = Math.max(0.35, 0.9 - ctx.time * 0.015);
    }

    for (const tap of input.taps) {
      for (let i = s.things.length - 1; i >= 0; i--) {
        const t = s.things[i];
        if (Math.abs(tap.x - t.x) <= t.size + 6 && Math.abs(tap.y - t.y) <= t.size + 6) {
          if (t.kind === "spike") {
            ctx.score(-20);
            s.combo = 0;
            ctx.sound("bonk");
          } else {
            s.combo = Math.min(5, s.combo + 1);
            ctx.score((t.kind === "coin" ? 30 : 10) * Math.max(1, Math.floor(s.combo / 2)));
            ctx.sound(t.kind === "coin" ? "chime" : "pop");
          }
          s.flash.push({ x: t.x, y: t.y, life: 0.3 });
          s.things.splice(i, 1);
          break;
        }
      }
    }

    for (let i = s.things.length - 1; i >= 0; i--) {
      const t = s.things[i];
      t.y += t.vy * dt;
      if (t.y > 680) {
        if (t.kind === "product") s.combo = 0;
        s.things.splice(i, 1);
      }
    }
    for (let i = s.flash.length - 1; i >= 0; i--) {
      s.flash[i].life -= dt;
      if (s.flash[i].life <= 0) s.flash.splice(i, 1);
    }
  },

  render(s, g, ctx) {
    g.clear("#3fc8ff");
    g.image("slot:background", 0, 0, 360, 640);

    g.rect(0, 0, 360, 128, { fill: "#5b3bff" });
    g.text("Your banner here", 180, 72, { size: 22, align: "center", fill: "#ffffff" });
    g.image("slot:banner", 0, 0, 360, 128);
    g.rect(0, 126, 360, 4, { fill: "#18123f" });

    for (const t of s.things) {
      if (t.kind === "product") {
        g.rect(t.x - t.size, t.y - t.size, t.size * 2, t.size * 2, { fill: "#ffffff", stroke: "#18123f", lineWidth: 3, radius: 10 });
        g.image("slot:product", t.x - t.size + 3, t.y - t.size + 3, t.size * 2 - 6, t.size * 2 - 6);
      } else if (t.kind === "coin") {
        g.circle(t.x, t.y, t.size, { fill: "#ffdd3c", stroke: "#18123f", lineWidth: 3 });
        g.image("slot:logo", t.x - t.size + 3, t.y - t.size + 3, t.size * 2 - 6, t.size * 2 - 6);
      } else {
        const pts = [];
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const r = i % 2 ? t.size * 0.55 : t.size;
          pts.push(t.x + Math.cos(a) * r, t.y + Math.sin(a) * r);
        }
        g.poly(pts, { fill: "#ff5fa2", stroke: "#18123f", lineWidth: 3 });
      }
    }
    for (const f of s.flash) g.circle(f.x, f.y, 40 * (1 - f.life / 0.3) + 10, { stroke: "#ffffff", lineWidth: 4 });

    g.rect(12, 590, 150, 38, { fill: "#ffffff", stroke: "#18123f", lineWidth: 3, radius: 12 });
    g.text(`${ctx.currentScore}`, 26, 617, { size: 22 });
    if (s.combo >= 2) g.text(`x${Math.floor(s.combo / 2)}`, 140, 617, { size: 18, align: "right", fill: "#ff7a1a" });
  },
});
