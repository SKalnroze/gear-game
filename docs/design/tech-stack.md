# Tech stack

[← Game Design Document](../GAME_DESIGN.md)

What the game is built with, and why.

---

## Choices

| Layer | Choice | Reasoning |
|---|---|---|
| Engine | **Phaser 3** | 2D, canvas/WebGL, scene-graph based. The game is entirely procedural vector drawing, so the engine is used for its scene, input and tween systems rather than its asset pipeline. |
| Physics | **Matter.js** (standalone, not the Phaser plugin) | Real rigidbody mass/inertia for gears and units -- see [Gears](gears.md#meshing) and [Units](units.md#movement-and-the-lane). Used directly rather than through `this.matter.*` so systems stay Phaser-free and testable headless in Vitest, matching the rest of the simulation layer. |
| Language | **TypeScript**, strict | The simulation is a web of systems exchanging typed events; strict mode is doing real work here. |
| Build | **Vite** | Fast dev server, minimal config. Phaser is split into its own chunk. |
| UI widgets | **phaser3-rex-plugins** | Buttons, dropdowns and sliders inside a canvas are not worth writing twice. Wrapped by the project's own `Neon*` component layer. |
| Music | **Tone.js** | Scheduling and synthesis for the procedural score. |
| Unit tests | **Vitest** | Native TypeScript, no separate transpile step. |
| E2E | **Playwright** | The only way to exercise a canvas game — the scenes are driven through the real engine. |

No art assets, no audio assets, no fonts. The repository is all code.

## Architecture

```
main.ts ──► config.ts ──► Phaser.Game
                             │
                    scenes/ (Boot, Menu, Lobby, Game ║ UI, GameOver, Settings, About)
                             │
        ┌────────────────────┼────────────────────┐
     world/               systems/               ui/
   World                RotationPhysics        Neon* component library
   GearMeshGraph        Unit, Combat, Economy   SlidingPanel, Minimap, HUD
   WorldRenderer        Tech, Ability, Turret
                        GameClock, EventBus
                             │
                           ai/  (AIController, AIChainPlanner, …)
```

Three conventions hold the simulation together:

- **A typed event bus.** Systems do not call each other; they emit and subscribe against a compile-time-checked event map. `gear:full_rotation` is the spine of the game.
- **One game clock.** `GameClock` provides monotonic in-game time that stops on pause and scales with game speed. Simulation code must never read the wall clock — doing so is how research once completed instantly after a pause.
- **Owner is not side.** `'player'` / `'ai'` says whose a thing is; which half of the map it occupies is separate and derived. Conflating them breaks the flipped lobby.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Dev server on port 8080 |
| `npm run build` | Typecheck then bundle |
| `npm run typecheck` | Two projects — `src/`, then `tests/` + `tools/` + configs |
| `npm test` | Unit and UI tests |
| `npm run test:e2e` | Playwright, including screenshot snapshots |
| `npm run shot -- --game` | Render a real match to a PNG |
| `npm run docs:gen` | Regenerate the tables in these design documents |
| `npm run docs:check` | Fail if any generated table is stale |

### `npm run shot`

The editor's preview pane cannot render this game — its WebGL context fails and the engine dies at the boot splash. `tools/shot.mjs` drives Playwright's Chromium instead, starting scenes **by key** through the `window.game` handle exposed in dev builds rather than guessing where a button is on the canvas. It takes `--scene`, `--launch`, `--data`, `--click` and a `--game` preset, and exits non-zero if the page logged an uncaught error, so it doubles as a smoke test.

This is the only way to visually verify a change. Use it.

### `npm run docs:gen`

Regenerates every table between `<!-- BEGIN GENERATED -->` markers in this documentation from the game's constants. It bundles the TypeScript constants with the esbuild binary already present inside Vite, so it needs no additional dependency. Run it after changing anything in `src/constants/`; CI runs `docs:check` and fails if you did not.

## Testing

| Layer | Location | Covers |
|---|---|---|
| Unit | `tests/unit/` | Pure logic — physics, meshing, unit maths, tech timing, orientation |
| UI | `tests/ui/` | Neon components against a Phaser mock |
| E2E | `tests/e2e/` | Scene navigation, a real match, spectate, flipped lobby, restart cycles, screenshot baselines |

Systems are written to be testable without a running engine: `RotationPhysicsSystem`, `UnitSystem` and `TechSystem` take an event bus and a clock and touch no Phaser API, so they are exercised directly with a stub bus.

Two standing rules, both learned the hard way:

- **A new test must be checked against the bug it guards.** Revert the fix and confirm the test fails. Several tests in this repository passed both with and without the fix before this was enforced.
- **Screenshot baselines must be verified to show the scene they claim.** Four of the original six showed the wrong screen entirely.

## CI

Two jobs on every push to `master` and every pull request:

1. **check** (Linux) — typecheck, unit tests, `docs:check`.
2. **e2e** (Windows) — Playwright. Windows is required because the committed screenshot baselines are platform-suffixed; on Linux every screenshot test would fail for want of a matching baseline rather than for a real regression.

## Versions

<!-- BEGIN GENERATED: stack.versions -->
| Package | Version | Role |
|---|---|---|
| `phaser` | ^3.90.0 | Game engine (runtime) |
| `phaser3-rex-plugins` | ^1.80.19 | In-canvas UI widgets (runtime) |
| `tone` | ^15.1.22 | Procedural music synthesis (runtime) |
| `typescript` | ~5.7.2 | Language |
| `vite` | ^6.0.0 | Dev server and bundler |
| `vitest` | ^4.0.18 | Unit test runner |
| `@vitest/coverage-v8` | ^4.0.18 | Coverage |
| `@playwright/test` | ^1.58.2 | End-to-end tests and the screenshot tool |
| `happy-dom` | ^20.8.3 | DOM environment for UI tests |
<!-- END GENERATED: stack.versions -->
