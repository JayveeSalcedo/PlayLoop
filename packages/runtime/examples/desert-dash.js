// Desert Dash: a lane-free runner. Tap (or press space) to jump over
// sandstorms, grab dates in the air. 3 lives, 60 seconds.
// Deliberately exercises what replay has to get exactly right: gravity,
// trigonometry, lives, and the game ending itself before the time cap.
playloop.game({
  meta: {
    title: "Desert Dash",
    hint: "Tap to jump the sandstorms, grab the dates",
    maxSeconds: 60,
    lives: 3,
    imageSlots: [{ id: "logo", label: "Your logo on the bonus coin", shape: "circle" }],
  },

  init(ctx) {
    return {
      camel: { y: 520, vy: 0, grounded: true },
      things: [],
      nextStorm: 1.2,
      nextDate: 0.6,
      speed: 210,
      hurt: 0,
      streak: 0,
    };
  },

  update(s, input, ctx) {
    const dt = ctx.dt;
    const ground = 520;

    if ((input.taps.length > 0 || input.pressed.action || input.pressed.up) && s.camel.grounded) {
      s.camel.vy = -760;
      s.camel.grounded = false;
      ctx.sound("jump");
    }
    s.camel.vy += 2100 * dt;
    s.camel.y += s.camel.vy * dt;
    if (s.camel.y >= ground) {
      s.camel.y = ground;
      s.camel.vy = 0;
      s.camel.grounded = true;
    }

    s.speed = 210 + ctx.time * 4;
    s.hurt = Math.max(0, s.hurt - dt);

    s.nextStorm -= dt;
    if (s.nextStorm <= 0) {
      s.things.push({ kind: "storm", x: ctx.width + 30, y: ground + 8, phase: ctx.random() * Math.PI * 2 });
      s.nextStorm = 0.9 + ctx.random() * 1.3;
    }
    s.nextDate -= dt;
    if (s.nextDate <= 0) {
      const golden = ctx.random() < 0.12;
      s.things.push({ kind: golden ? "coin" : "date", x: ctx.width + 20, y: 330 + ctx.randomInt(0, 160), phase: 0 });
      s.nextDate = 0.5 + ctx.random() * 0.9;
    }

    for (let i = s.things.length - 1; i >= 0; i--) {
      const t = s.things[i];
      t.x -= s.speed * dt;
      if (t.kind === "storm") t.phase += dt * 6;
      const bob = t.kind === "storm" ? Math.sin(t.phase) * 6 : 0;
      const dx = t.x - 80;
      const dy = t.y + bob - s.camel.y;
      const hit = Math.hypot(dx, dy) < (t.kind === "storm" ? 38 : 34);

      if (hit && t.kind === "storm" && s.hurt === 0) {
        s.hurt = 1;
        s.streak = 0;
        ctx.loseLife();
        ctx.sound("bonk");
        s.things.splice(i, 1);
      } else if (hit && t.kind !== "storm") {
        s.streak += 1;
        const combo = Math.min(3, 1 + Math.floor(s.streak / 5));
        ctx.score((t.kind === "coin" ? 30 : 10) * combo);
        ctx.sound("pop");
        s.things.splice(i, 1);
      } else if (t.x < -40) {
        s.things.splice(i, 1);
      }
    }
  },

  render(s, g, ctx) {
    g.clear("#ffdd3c");
    g.rect(0, 548, ctx.width, 92, { fill: "#ff7a1a" });
    for (const t of s.things) {
      if (t.kind === "storm") {
        g.circle(t.x, t.y + Math.sin(t.phase) * 6, 26, { fill: "#5e5885", stroke: "#18123f", lineWidth: 3 });
      } else if (t.kind === "coin") {
        g.circle(t.x, t.y, 20, { fill: "#fff3a0", stroke: "#18123f", lineWidth: 3 });
        g.image("slot:logo", t.x - 16, t.y - 16, 32, 32);
      } else {
        g.ellipse(t.x, t.y, 10, 15, { fill: "#b8652f", stroke: "#18123f", lineWidth: 3 });
      }
    }
    if (!(s.hurt > 0 && Math.floor(ctx.time * 12) % 2 === 0)) {
      g.rect(56, s.camel.y - 36, 48, 44, { fill: "#ffffff", stroke: "#18123f", lineWidth: 3, radius: 10 });
    }
    g.text(`${ctx.currentScore}`, 20, 44, { size: 30 });
    g.text("♥".repeat(ctx.lives), ctx.width - 20, 44, { size: 26, align: "right", fill: "#ff5fa2" });
  },
});
