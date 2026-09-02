# Gear Game

A browser strategy game built with TypeScript + Phaser 3 + Vite. Place interconnected gears to generate power and resources, spawn combat units, and destroy the enemy base before they destroy yours.

## Quick Start

```bash
npm install
npm run dev        # dev server at http://localhost:8080
npm run build      # production build to dist/
npm run typecheck  # TypeScript check
```

## How to Play

**Goal:** Reduce the AI base HP to 0 before the AI does the same to yours.

### World Layout

The world is 2800×520px with a scrollable camera (zoom 0.4–1.5×):
- **Player zone**: x < 960 — place your gears here
- **Lane band**: y 160–360 — where units march and interact with gears
- **AI zone**: x > 1840 — AI's gear territory
- **Bases**: Player at x=20, AI at x=2780

### Placing Gears

1. Open the **GEARS** tab in the sliding bottom panel
2. Pick a gear type and adjust its **teeth count** (5–60; determines size, power, and cost)
3. Drag onto your zone — gears snap to mesh with nearby gears automatically
4. Use the **REMOVE** tab or press **ESC** to cancel placement

### Gear Types

| Type | Description |
|------|-------------|
| **Motor** | Drives rotation; generates power per full revolution |
| **Amplifier** | ×1.4 power multiplier on downstream chain |
| **Converter** | Changes unit output type of the chain |
| **Capacitor** | Accumulates rotations, releases a 2.5× burst every 8 rotations |
| **Overclock** | +50% torque/omega to neighbours for 10s, then burns out |
| **Spiked** | Damages units on contact; damage scales with omega × teeth |
| **Armored** | Blocks unit movement; high HP (3× base), must be destroyed to pass |
| **Iron/Crystal/Aether Miner** | Generates the matching resource per rotation (tech-unlocked) |
| **Spawner gears** | Spawn a unit type per rotation (infantry/artillery/cavalry/elite variants) |

Gear cost, HP, output, and damage all scale with **teeth count** (quadratic for cost and HP, linear for output).

### Gear Physics

- Two gears mesh when `distance(A, B) ≈ radiusA + radiusB` (±4px tolerance)
- `radius = teeth × 2.5` (px)
- `ω_B = -(ω_A × teeth_A / teeth_B)` — direction reverses each hop
- Torque propagates via BFS; conflicting directions cause a **jam** (stress damage)

### Jam & HP System

All gears have HP (armored gets 3×). When two meshed gears require opposite directions, a **jam** occurs:
- Jammed gears take stress-based damage over time
- Visual feedback: cracks (0–4 levels), pulsing jam ring, colour-coded HP bar
- Destroyed gears split the mesh chain

### Economy

| Resource | Source | Spent on |
|----------|--------|---------|
| **Power** | Motor rotations | Gear placement |
| **Gold** | Baseline +2/s | Tech research |
| **Iron** | Iron Miner rotations | Iron Guard units |
| **Crystal** | Crystal Miner rotations | Crystal Sentinel units |
| **Aether** | Aether Miner rotations | Aether Phantom units |

### Units

Units spawn **only** from spawner gears — one unit per full rotation of the spawner. There is no wave button and no timed wave: unit production is entirely a function of how fast your gear chain turns.

**Standard:** Infantry, Artillery, Cavalry, Mixed, Elite variants
**Resource:** Iron Guard (iron), Crystal Sentinel (crystal), Aether Phantom (aether)
**Support:** Wrench unit — attaches to gears and adds friction

Counter system: Infantry → Artillery → Cavalry → Infantry (2× damage)

### Tech Tree (TECH tab)

48 nodes across 3 tiers. Unlock new gear types, unit upgrades, income bonuses, and special abilities. Costs gold; research takes real time.

### Abilities (ACTIONS tab)

| Ability | Effect |
|---------|--------|
| Power Surge | Instant power injection |
| Counter Intel | Reveals AI next action |
| Overclock (No Burnout) | Overclock gears skip burnout for one cycle |

---

## Architecture

```
src/
├── main.ts / config.ts          # Phaser boot, canvas 1400×740
├── types/                       # TypeScript interfaces (gear, unit, tech, events…)
├── constants/                   # Balance values and gear/unit definitions
├── world/
│   ├── World.ts                 # Pixel-based gear storage + collision queries
│   ├── GearMeshGraph.ts         # Adjacency graph for meshed gears
│   └── WorldRenderer.ts         # Draws lane, zone shading, base walls, ghost
├── systems/
│   ├── EventBus.ts              # Typed event system (GameEventMap)
│   ├── GearSystem.ts            # Free pixel placement + magnetic snap
│   ├── RotationPhysicsSystem.ts # Torque BFS, omega, jam detection, burnout
│   ├── EconomySystem.ts         # Power/gold/resource management
│   ├── UnitSystem.ts            # Continuous-position unit spawning + marching
│   ├── GearUnitInteractionSystem.ts  # Spiked damage, armored block, wrench
│   ├── CombatSystem.ts          # Unit vs unit combat resolution
│   ├── TechSystem.ts            # Research queue + node effects
│   ├── AbilitySystem.ts         # Ability unlock/cooldown/activate
│   ├── WinConditionSystem.ts    # Base HP + game-over detection
│   └── LayoutManager.ts         # Responsive layout helpers
├── entities/
│   ├── Gear.ts                  # Gear Phaser GameObject (cracks, HP bar, jam ring)
│   └── Unit.ts                  # Unit Phaser GameObject
├── scenes/
│   ├── BootScene.ts
│   ├── MenuScene.ts
│   ├── LobbyScene.ts
│   ├── GameScene.ts             # Orchestrator — wires systems, camera zoom/pan
│   ├── UIScene.ts               # Parallel HUD scene
│   ├── AboutScene.ts
│   └── SettingsScene.ts
├── ai/
│   ├── AIController.ts          # Decision timer + auto-research
│   ├── AIEvaluator.ts           # Counter-pick logic
│   ├── AIPlanner.ts             # Pixel placement scoring heuristic
│   └── AIStrategies.ts          # Aggressive / Balanced / Economic profiles
└── ui/
    ├── SlidingPanel.ts          # Bottom panel (54→440px tween, tabs)
    ├── GearGridSection.ts       # GEARS tab — tile grid, teeth picker, drag-to-place
    ├── RadialTechSection.ts     # TECH tab — spanning-tree layout, zoom/pan
    ├── ActionsSection.ts        # ACTIONS tab — ability buttons, unit availability
    ├── Minimap.ts               # Floating minimap, zoom-aware viewport rect
    ├── ResourceBar.ts           # Top HUD resource display
    ├── AbilityBar.ts            # Legacy ability HUD (off-screen when panel active)
    ├── TechTreePanel.ts         # Legacy tech panel (off-screen when panel active)
    └── NeonUI.ts / HudToolbar.ts / TooltipManager.ts
```

**EventBus pattern**: all cross-system communication goes through the typed `EventBus` wrapping Phaser's EventEmitter. `GameEventMap` in `types/events.types.ts` enforces all event names and payloads at compile time.

### Key Events

| Event | Payload | Purpose |
|-------|---------|---------|
| `gear:full_rotation` | `{ gearId, owner }` | Drives resource income |
| `gear:jammed` / `gear:jam_cleared` | `{ gearId }` | Jam state changes |
| `gear:damaged` / `gear:destroyed` | `{ gearId, source/cause }` | HP system |
| `power:capacitor_burst` | `{ gearId, owner, powerReleased }` | Capacitor economy |
| `gear:unit_attached/detached` | wrench events | Friction system |
| `ability:unlocked/activated/cooldown_ready` | ability events | Ability HUD |
| `ui:panel_height_changed` | `{ topY }` | Input gating for camera |

## License

MIT
