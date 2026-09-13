# @playloop/ai

Turns an idea into a verified PlayLoop game. Provider-neutral: Groq today (development), Claude when you're ready, switched by configuration.

```ts
const result = await createGame("A camel dodging sandstorms", { provider: getProvider(), onProgress });
// result.ok        passed every game-lab check
// result.game      { title, summary, code, notes, report }
// result.attempts  each AI call: task, model, tokens, lab report
```

## The loop

1. **create** (or **change**): the AI writes the complete game against the contract in `src/prompts.ts`.
2. The game lab (`@playloop/replay` `checkGame`) plays it with bots.
3. If it fails, the lab's `fixPrompt` (failures, bot evidence, how to fix) goes back as a **fix** request. Up to 2 rounds.

Rate limits are waited out using the provider's `retry-after`, with `waiting` progress events. Auth, refusal and oversized requests stop immediately.

## Configuration

| Variable | Default | |
|---|---|---|
| `AI_PROVIDER` | `groq` | `groq` or `anthropic` |
| `GROQ_API_KEY` | | server only |
| `ANTHROPIC_API_KEY` | | server only |
| `AI_MODEL_CREATE` / `AI_MODEL_FIX` / `AI_MODEL_CHANGE` | `openai/gpt-oss-120b` · `claude-opus-5` | per-task override |
| `GROQ_TOKENS_PER_MINUTE` | `8000` | raise on a paid Groq plan |

The lab reads these from `apps/lab/.env.local`.

| | Groq (now) | Anthropic (ready) |
|---|---|---|
| Model | `openai/gpt-oss-120b` | `claude-opus-5` |
| Output | strict `json_schema` | `output_config.format` JSON schema, streamed, adaptive thinking |
| Effort | `reasoning_effort: low` | `output_config.effort: medium` |
| Refusals | n/a | `stop_reason: "refusal"` handled; server-side `fallbacks: "default"` on |
| Limits | 8K tokens/min, 200K/day, whole account | paid; caps should become cost-based |

## Scripts

```bash
pnpm --filter @playloop/ai smoke                 # does the key work? (prints no secrets)
pnpm --filter @playloop/ai smoke -- anthropic
pnpm --filter @playloop/ai run eval:games -- --provider groq --limit 5 [--offset 5]
node packages/ai/scripts/inspect-eval.mjs        # attempts, checks and code of the latest eval
```

Eval results go to `packages/ai/.eval-results/` (git-ignored). 30 fixed ideas live in `src/evalIdeas.ts`, including three the contract can't do (multiplayer, camera, 3D) to see how the AI handles them.

### Results so far

| Date | Provider | Ideas | Passed all checks | First try | Avg calls | Avg time | Tokens / game |
|---|---|---|---|---|---|---|---|
| 2026-09-13 | Groq gpt-oss-120b | 1-2 | 1/2 | 0 | 2.5 | 48 s | ~10K |
| 2026-09-13 | Groq gpt-oss-120b, richer fix messages | 1-4 | 4/4 | 2 | 1.5 | 30 s | ~5.7K |

Small samples; AI output varies run to run. Run the full 30 on both providers before choosing.

## Switching to Claude

1. Add `ANTHROPIC_API_KEY` to `apps/lab/.env.local` (and Vercel later).
2. `pnpm --filter @playloop/ai smoke -- anthropic`
3. `pnpm --filter @playloop/ai run eval:games -- --provider anthropic --limit 30` and the same for `groq`; compare pass rate, calls per game and cost per passing game.
4. Set `AI_PROVIDER=anthropic` and try a few ideas in the lab.
5. Replace the daily token budget with a cost-based cap per player.
