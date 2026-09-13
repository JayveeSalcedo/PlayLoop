# PlayLoop Lab

An isolated test app for code games. **It doesn't touch `apps/web`, the database, or anyone's points.**

- Play games in a sandboxed iframe with PlayLoop's HUD.
- When a game ends, the server replays your recorded inputs in QuickJS and decides the score.
- Try the built-in tamper tests to watch forged plays get rejected.
- Paste your own game code (the AI writes it from phase 4).

## Run it

```bash
pnpm install
pnpm --filter @playloop/lab dev     # builds @playloop/replay, then serves http://localhost:3100
```

### On your phone

The dev server listens on all interfaces. With the phone on the same Wi-Fi:

1. Find your PC's IP: `ipconfig` → IPv4 Address (e.g. `192.168.1.23`).
2. Open `http://192.168.1.23:3100` on the phone.
3. If it doesn't load, allow Node.js through Windows Defender Firewall for private networks.

## How a play works

```
Start ─▶ POST /api/sessions            server picks the seed
       ─▶ iframe runs prelude + host + game, records inputs
end   ─▶ POST /api/sessions/:id/submit { score, log }
       ─▶ real-time check (log can't cover more seconds than have passed)
       ─▶ verifyPlay(): QuickJS replay in a killable worker
       ─▶ verdict: replay score (the only one that counts) or a rejection reason
```

Sessions are single-use and kept in memory (restarting the dev server clears them). Play history and pasted games are saved under `apps/lab/.data/` (git-ignored).

## What's intentionally not here yet

| Missing | Arrives in |
|---|---|
| Automatic game checks (bots, replay-cost gate) | Phase 3 |
| AI generation (Groq) | Phase 4 |
| Image upload + cropping (slots render empty) | Phase 5 |
| Studio UI | Phase 6 |
| Real points, database, auth | Phase 7 (merge) |

## Verified so far

- Real Chrome plays (mouse drags, keys, taps) of both example games verified by server replay: Catch 1,500 ticks in 631 ms, Desert Dash lives-out at 428 ticks in 531 ms.
- All four tamper tests rejected in the UI.
- Game frame is opaque-origin: the page can't reach its document (`SecurityError`), and the game can't reach the page.
- `pnpm --filter @playloop/lab test`: session flow, single-use, real-time check, tamper tests, pasted-game validation.
