# CLAUDE.md

## Source of truth

**[docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) is the source of truth for what this game is and why.** Consult it before changing any mechanic, balance value, or piece of content, and update it in the same change.

- Design **intent** is defined there. Numeric **values** are defined in `src/constants/` and mirrored into the docs by `npm run docs:gen` — after touching any constant, run it, or CI (`npm run docs:check`) will fail.
- Tables between `<!-- BEGIN GENERATED -->` markers are machine-written. Never hand-edit them.
- The document records **divergences**: known gaps between stated intent and actual behaviour. If you fix one, delete its marker and its row in the register in the same commit. If you find a new one, add it.

## Working Style

When I ask for implementation, start coding immediately. Do not spend more than 1-2 messages planning unless I explicitly ask for a plan. If you need clarification, ask briefly then proceed with your best interpretation.

When I give exact numeric values or specifications (e.g. "a 10 tooth gear should have 10 teeth"), use them literally. Do not apply scaling formulas or approximations unless asked.

## Project Architecture

TypeScript + Phaser 3 gear-based strategy game, built with Vite.

Core mechanics, always respect these:

- Units spawn **only** via dedicated spawner gears — one unit per full rotation. There is no wave-based or grid-based spawning. The game was once a wave-driven tower defence; that model is gone and must not creep back in.
- Gears use physics-based free placement with meshing. Not a grid.
- Gear tooth count is exact. Never scale it by a formula.

## UI Development

When implementing UI changes in Phaser 3:

- Check for existing HUD overlays that may obscure new elements.
- Verify hit areas on nested containers — never nest interactive Containers inside other Containers.
- Test responsive sizing against the viewport.
- Remove old UI artifacts rather than leaving them behind.
- Run a visual sanity check afterwards: `npm run shot -- --game` renders a real match to a PNG (the editor preview pane cannot render this game).

See `docs/UI_GUIDELINES.md` for the component library and layout system.

## Build & Validation

After making changes, run `npm run typecheck` before reporting completion, and fix any type errors first. This covers `src/` **and** `tests/`/`tools/` (two tsconfig projects) — plain `npx tsc --noEmit` alone only checks `src/`.

Also run `npm test` (196 unit tests). For anything touching scenes or UI, run `npm run test:e2e`.
