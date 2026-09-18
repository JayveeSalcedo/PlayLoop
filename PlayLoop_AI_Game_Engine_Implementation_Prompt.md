# PlayLoop AI Game Generation Engine — Implementation Prompt

## Objective

We are evolving the existing PlayLoop AI Game Generation Engine into an open-ended, AI-native game creation system.

**Core product requirement:**

PlayLoop must NOT be limited to predefined game templates.

Creators should be able to describe essentially any **30-second mini-game** they can imagine, and the AI should generate the actual playable game.

The AI must generate **REAL executable game code**, not merely select/configure a predefined template.

Examples:

- "Create a game where a dragon flies through a storm, dodges lightning and collects coins."
- "Create a game where I stack falling blocks as high as possible in 30 seconds."
- "Create a game where the player drives through traffic, changes lanes, collects fuel and avoids crashes."
- "Create a game where enemies chase the player and the player can dash by double tapping."
- "Create a game with a completely unusual mechanic that doesn't correspond to one of our existing templates."

Existing templates may remain as starter/inspiration games, but they must **NOT define the technical capabilities of the platform**.

---

# 1. Current Engine — Preserve the Strong Parts

The current Lab engine already implements:

1. Creator idea submission
2. Background generation jobs
3. Provider-swappable AI architecture
4. Versioned system prompts
5. Structured AI output:
   `{ title, summary, code, notes }`
6. AI-generated REAL JavaScript
7. `playloop.game({ meta, init, update, render })`
8. Runtime contract validation
9. Sandbox execution
10. Automated check-and-fix loop
11. Sandboxed iframe player runtime
12. Server-issued deterministic seeds
13. Client input recording
14. Server-side replay verification using QuickJS
15. AI-assisted game modification
16. Error classification and retry handling

**Do not replace these systems simply because the architecture is changing.**

First inspect the actual codebase and identify the exact implementation of all of the above.

---

# 2. Existing AI Generation Flow

The current flow is:

```text
Creator submits idea
        ↓
apps/lab/app/api/create/route.ts
        ↓
startCreateJob(idea)
        ↓
packages/ai/src/pipeline.ts
        ↓
Provider/model selection
        ↓
System prompt
        ↓
Structured JSON output
        ↓
parseGameOutput()
        ↓
contract/runtime validation
        ↓
sandbox execution
        ↓
AI fix loop
        ↓
.data/games/*.js
        ↓
Sandboxed iframe player
        ↓
Input log + server seed
        ↓
Score submission
        ↓
QuickJS server replay
        ↓
Verified score
```

Editing currently follows the same generation/check/fix architecture using:

```text
apps/lab/app/api/games/[id]/change/route.ts
```

The prototype currently stores generated games as flat `.js` artifacts and does not yet connect this system to the production Postgres game model.

---

# 3. Core Architectural Principle

The key distinction is:

## Creative freedom should be extremely broad

The AI should be able to determine:

- Game mechanics
- Player behavior
- Enemy behavior
- Objects
- World
- Visual style
- UI
- Animations
- Difficulty
- Scoring
- Win/lose conditions
- Controls
- Physics behavior
- Game rules
- Game structure

## Execution constraints should remain strict

PlayLoop should control:

- Safe execution
- Sandboxing
- Deterministic execution
- Server-controlled seed
- Recorded inputs
- Replayability
- Fixed simulation/tick contract
- Maximum game duration
- Runtime API boundaries
- No network access
- No arbitrary browser APIs
- Resource limits

**Do not confuse runtime constraints with creative constraints.**

The platform should constrain *how generated code executes*, not *what game the creator is allowed to imagine*.

---

# 4. Full Customization Requirement

The generated game must NOT depend on a fixed schema such as:

```text
Player:
  speed
  color
  size

Enemy:
  speed
  color
  size
```

Instead, the AI should be able to define its own game objects and mechanics through generated code.

For example, one generated game may contain:

```text
dragon
lightning
clouds
coins
shield powerups
```

while another contains:

```text
spaceship
asteroids
fuel
missiles
portals
```

and another can have completely different objects and mechanics.

The runtime provides safe capabilities.

The generated game determines how those capabilities are composed.

---

# 5. Audit Before Modifying Anything

Before making changes, inspect:

- `packages/ai`
- `packages/runtime`
- `packages/replay`
- `apps/lab`
- existing production game implementation
- relevant database schema
- existing game templates

Trace the complete flow:

```text
creator prompt
→ generation job
→ AI provider
→ system prompt
→ structured output
→ code parsing
→ validation
→ sandbox execution
→ fix loop
→ storage
→ player runtime
→ input recording
→ score submission
→ server replay
→ verification
```

Identify every place where the implementation assumes:

- a fixed game type
- a fixed template
- template-specific configuration
- predefined mechanics
- predefined visual elements
- fixed player/enemy/object schemas

Do not assume these exist. Verify them from the actual code.

---

# 6. Target Architecture

The target should conceptually become:

```text
Creator
   ↓
Creator Studio
   ↓
Natural-language game idea
   ↓
AI Game Generator
   ↓
Real executable game code
   ↓
Validation
   ├── output/code validation
   ├── runtime validation
   ├── contract validation
   ├── safety validation
   ├── resource validation
   └── 30-second validation
   ↓
GameVersion
   ↓
PlayLoop Runtime
   ↓
Sandbox
   ↓
Playable Game
   ↓
Input Log + Server Seed
   ↓
Server Replay
   ↓
Verified Result
```

The runtime should provide general capabilities rather than predefined game templates.

Inspect whether the current runtime can safely support or should expose primitives for:

- rendering
- shapes
- sprites/assets
- text
- animation
- input
- timing
- deterministic randomness
- collision detection
- physics
- particles/effects
- audio where appropriate
- game state
- spawning
- camera behavior
- UI
- score
- lives/health
- game events

Do NOT automatically implement every possible primitive.

Determine which capabilities are actually needed based on the existing engine and architecture.

---

# 7. 30-Second Mini-Game Contract

The platform is intended for short mini-games.

Do not rely only on the AI prompt saying that a game should be 30 seconds.

The platform should validate/enforce the maximum allowed game duration.

Investigate how the existing `meta.maxSeconds` contract should evolve.

Validation should be able to detect at minimum:

- valid PlayLoop game contract
- successful initialization
- successful update loop
- successful rendering
- valid metadata
- acceptable duration
- deterministic behavior
- sandbox compatibility
- resource limits

---

# 8. Runtime Contract

The existing:

```js
playloop.game({
  meta,
  init,
  update,
  render
})
```

contract should be preserved where possible.

The AI should be free to compose different mechanics while operating inside a predictable runtime.

Potential runtime capabilities include:

```text
Rendering
Input
Timing
Deterministic RNG
Collision
Physics
Game state
Spawning
Particles/effects
Animation
UI
Audio where appropriate
```

The runtime is the execution environment, not the game designer.

---

# 9. Deterministic Replay Must Remain a First-Class Requirement

The existing replay architecture is one of the strongest parts of the prototype.

Do NOT weaken or remove it.

The authoritative result should remain:

```text
GameVersion
+
server-issued seed
+
recorded input timeline
+
runtime version/config
        ↓
Server loads exact GameVersion
        ↓
Replays exact inputs
        ↓
Produces authoritative score
```

The client score must NEVER become the authoritative score.

The system must preserve enough information to reproduce exactly what a player played.

---

# 10. Production Game Versioning

The current prototype stores generated code as flat files and editing creates another artifact.

Production should introduce explicit versioning.

Conceptually:

```text
Game
 ├── GameVersion 1
 ├── GameVersion 2
 ├── GameVersion 3
 └── currentVersion
```

Investigate the minimum schema needed for:

## Game

```text
id
creatorId
title
description
status
visibility
currentVersionId
sponsorReady
```

## GameVersion

Potentially:

```text
id
gameId
versionNumber
code
metadata
manifest
seedConfig
runtimeVersion
prompt
promptVersion
contentHash
validationStatus
assetReferences
createdAt
```

Do NOT add database fields blindly.

Inspect the existing schema first and propose the minimum required changes.

A player session must reference the exact `GameVersion` that was played.

---

# 11. Asset Customization

"Fully customizable" includes visual/audio assets where supported.

Inspect the current asset architecture.

Design the GameVersion/manifest system so generated games can eventually support:

- sprites
- backgrounds
- icons
- sounds
- effects
- creator-uploaded assets
- other approved game assets

Do NOT allow generated code to arbitrarily fetch assets from the network.

If asset support is not ready, create a clean architecture for adding it later without coupling generated games to external URLs.

Do not build an unnecessarily complex asset system unless required.

---

# 12. AI Editing

The existing change pipeline should evolve into versioned editing.

Creator:

> "Make the player faster."

Flow:

```text
Current GameVersion
        +
Creator change request
        ↓
AI modification
        ↓
Validation
        ↓
Fix loop if required
        ↓
New GameVersion
```

Never overwrite the previous version.

The architecture should eventually support:

- modify
- test
- compare
- revert
- publish a selected version

Do not necessarily build the complete UI yet. Make the backend architecture support this cleanly.

---

# 13. Templates

Do NOT delete the existing templates.

Change their role.

They should become:

```text
STARTER GAMES / INSPIRATION
```

rather than:

```text
SUPPORTED GAME TYPES
```

Future Creator Studio can show:

```text
What do you want to create?

[ Describe your game... ]

Need inspiration?

[ Quiz ] [ Reflex ] [ Catch ] [ Memory ]
```

Selecting one may provide a starting prompt or example.

But a creator must be able to create something completely unrelated.

There must be no architectural dependency saying:

```text
Every game must be one of these four types.
```

---

# 14. Production Integration

The existing production app already contains game management, creators, publishing, brands, campaigns, rewards, economy, moderation, challenges and related functionality.

Do NOT rebuild these systems unnecessarily.

The AI engine should become a game creation/execution layer inside PlayLoop.

Target business flow:

```text
Creator
  ↓
AI Game
  ↓
GameVersion
  ↓
Validation
  ↓
Moderation
  ↓
Publish
  ↓
Sponsorable Game
  ↓
Brand sponsorship
  ↓
Player
  ↓
Verified Play
  ↓
Reward
```

The current production systems should be extended where possible rather than replaced.

---

# 15. Current → Target Classification

For every relevant component, classify it as one of:

## KEEP
Already works and fits the new architecture.

## EXTEND
Works but needs additional capability.

## MIGRATE
Already exists in the Lab/prototype and needs to move into production.

## REPLACE / EVOLVE
The existing implementation fundamentally conflicts with open-ended AI games.

## NEW
Does not currently exist and is required.

Expected categories will likely include:

```text
KEEP
- Auth
- Economy ledger
- Rewards
- Vouchers
- Brand system
- Campaigns
- Moderation
- Challenges
- Admin

EXTEND
- Games
- Play sessions
- Discovery
- Analytics
- Creator earnings
- Sponsorship

MIGRATE
- AI generation
- AI editing
- Runtime
- Replay verification

REPLACE / EVOLVE
- Fixed gameType architecture
- Template-first creation UX
- Client-authoritative score assumptions

NEW
- GameVersion persistence
- Guest play
- Reward eligibility flow
- Creator payout infrastructure
- Platform fee handling
- Brand payment processing
```

These are hypotheses only. Verify against the actual repository before making the classification final.

---

# 16. AI Provider Architecture

Preserve provider-swappability.

Current provider selection includes:

- Groq for development
- Anthropic as production-intended
- per-task model overrides

Do not hard-code a specific provider into the game-generation domain.

Use an abstraction similar to:

```text
AI Game Service
      ↓
Provider Adapter
      ├── Provider A
      ├── Provider B
      └── Provider C
```

Potential operations:

```text
createGame()
modifyGame()
repairGame()
validateGame()
```

Do not change providers/models unless required by the implementation.

---

# 17. Security Requirements

Generated code must remain untrusted code.

Preserve the existing sandbox model:

- iframe sandbox
- strict CSP
- no network access
- no arbitrary browser APIs
- no filesystem
- no Node APIs
- no `eval`
- no `Function`
- no imports/requires
- deterministic randomness
- resource limits
- execution timeout
- memory limits
- untrusted `postMessage` handling

Inspect the existing implementation before changing these restrictions.

---

# 18. Tests

Add/extend tests with radically different generated-game concepts.

At minimum test:

1. Reflex game
2. Platform/avoidance game
3. Collection game
4. Physics-based game
5. Enemy/chase game
6. A game that does NOT resemble any existing template

For each test verify:

- AI output is valid
- game initializes
- game runs
- game renders
- inputs work
- game completes within allowed duration
- generated game remains sandbox-safe
- seed makes randomness deterministic
- replay reproduces the result
- server score matches replay
- modification creates a new version
- previous version remains reproducible

Also ensure existing starter/template games continue working.

---

# 19. Non-Goals

Do NOT:

- replace real generated code with a declarative template system
- create a giant fixed schema for every possible game object
- make the runtime responsible for game design
- remove sandboxing
- trust client scores
- remove deterministic seeds
- remove replay verification
- delete existing starter templates
- rebuild the existing reward/brand/economy systems
- redesign unrelated production systems
- introduce speculative abstractions
- redesign the entire frontend before the engine architecture is stable

---

# 20. Implementation Strategy

Do not rewrite the entire engine.

Use incremental vertical slices.

Recommended order:

## Phase 1 — Audit and architecture

Understand the current repository and produce the before/after mapping.

## Phase 2 — Generalize the game/runtime architecture

Make arbitrary game mechanics possible without breaking existing games.

## Phase 3 — Production GameVersion

Move generated code from prototype file storage toward explicit production versioning.

## Phase 4 — Production AI service

Integrate the existing AI generation/change/fix pipeline into the production architecture.

## Phase 5 — Production runtime

Integrate the sandboxed runtime.

## Phase 6 — Production replay verification

Integrate deterministic server-side replay.

## Phase 7 — Creator Studio

Transform the creator UX from template-first to:

```text
"What do you want to create?"
```

while retaining starter templates as inspiration.

## Phase 8 — Marketplace/business integration

Connect published games to sponsorship, player rewards and creator economics.

Do not attempt to implement all phases in one change.

---

# 21. REQUIRED OUTPUT — BEFORE CODE CHANGES

Before modifying any files, produce the following.

## A. CURRENT ARCHITECTURE

Show the exact current flow with real file paths.

## B. TEMPLATE DEPENDENCIES

List every verified place where the current implementation depends on:

- fixed game types
- templates
- template-specific configuration
- fixed mechanics
- fixed visual elements

## C. TARGET ARCHITECTURE

Show how arbitrary AI-generated games will work.

## D. FILE-BY-FILE CHANGE PLAN

For every file/package that needs modification:

- Current purpose
- Proposed change
- Why
- Dependencies
- Risk
- Whether KEEP / EXTEND / MIGRATE / REPLACE / NEW

## E. DATABASE PLAN

Show the minimum required schema changes.

Do not invent fields without checking the current schema.

## F. RUNTIME PLAN

Clearly separate:

```text
What remains fixed
```

from:

```text
What becomes customizable
```

## G. REPLAY PLAN

Explain exactly how:

```text
GameVersion
+
seed
+
input log
+
runtime version
```

will reproduce a player's game.

## H. AI PIPELINE PLAN

Explain:

```text
create
modify
repair
validate
```

and how provider/model abstraction remains intact.

## I. MIGRATION PLAN

Explain how existing games/templates continue working during migration.

## J. TEST PLAN

Explain how the implementation will prove that games outside the existing templates work.

## K. RISK LIST

Identify architectural risks, especially:

- nondeterministic generated code
- runtime incompatibility
- replay incompatibility
- version drift
- unsafe generated code
- asset handling
- resource exhaustion
- migration issues

---

# 22. IMPORTANT: STOP BEFORE IMPLEMENTATION

After producing the audit, before/after architecture, file-by-file plan, database plan, runtime plan, migration plan and tests:

**STOP.**

Do not modify code yet.

The implementation plan must be reviewed before code changes begin.

The purpose of this first pass is to ensure we evolve the existing PlayLoop system rather than accidentally rebuilding or breaking working functionality.

---

# Final Architectural Principle

The intended PlayLoop architecture is:

> **The creator defines the game. The AI implements the game. The PlayLoop runtime provides the safe, deterministic environment in which the generated game runs. PlayLoop's verification system determines the authoritative result.**

Templates are examples, not limitations.

The platform should maximize **creative freedom** while strictly controlling **execution, security, determinism, verification and rewards**.
