# @playloop/runtime

The PlayLoop game contract and the deterministic runtime every code game runs on,
in the browser and in the server replay alike.

```js
playloop.game({
  meta: { title: "Desert Dash", hint: "Tap to jump", maxSeconds: 60, lives: 3,
          imageSlots: [{ id: "logo", label: "Your logo", shape: "circle" }] },
  init(ctx) { return { y: 520, vy: 0 }; },          // plain JSON state
  update(s, input, ctx) {                          // 60× per second, dt = 1/60
    if (input.taps.length) s.vy = -760;
    if (ctx.random() < 0.02) ctx.score(10);         // seeded; never Math.random
  },
  render(s, g, ctx) { g.image("slot:logo", 40, s.y, 48, 48); }  // browser only
});
```

See `examples/` for two complete games and `src/contract.ts` for the full API.

## Why replay matches the live game

- Fixed 60 Hz ticks on a logical 360×640 screen; input coordinates quantized to ¼ px before the game sees them.
- `ctx.random()` is seeded by the server per play session.
- `Math.sin/cos/exp/log/pow/...` are replaced by pure-JS versions (`src/detmath.ts`), because the spec lets engines approximate them differently.
- `Date`, timers, `performance`, `Math.random`, `eval` and network APIs throw a message the game lab can hand back to the AI.
- `render()` gets a read-only context: it can't score or draw from the seeded random stream.

## The prelude

`src/prelude.ts` is bundled into `src/generated/prelude.ts` (a string) and evaluated before game code everywhere. After changing anything in `src/`:

```
pnpm --filter @playloop/runtime build
```

`test/prelude.test.ts` fails if the generated file is stale.
