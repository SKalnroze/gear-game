# Gear Game — Game Design Document

**This document is the source of truth for what Gear Game is and why.**
Consult it before changing mechanics, balance, or content; update it in the same change.

| | |
|---|---|
| Status | Living document — last reviewed 2026-09-03 |
| Covers | Design intent, player-facing systems, balance reasoning, presentation, stack |
| Authority | **Intent** is defined here. **Values** are defined in `src/constants/` and mirrored into this document by `npm run docs:gen`. |

---

## How to use this document

It is written **top down**. The first three sections are the whole game in a page; everything after them is progressively more specific. Read only as deep as your question requires.

Every entry for a thing the player can touch — a gear, a unit, a tech node, a screen — leads with its **intent**: what it is for, and what decision it puts in front of the player. That is the part that cannot be recovered by reading the code, and the reason this document exists.

Three conventions:

- **Generated tables.** Anything between `<!-- BEGIN GENERATED -->` markers is written from the constants by `tools/gen-design-docs.mjs`. Do not hand-edit it; change the constant and run `npm run docs:gen`. CI fails if a table is stale.
- **Divergence markers.** Where the code does not match the intent described, a `⚠ DIVERGENCE` note says so with a file reference. They are collected in the [divergence register](#divergence-register). The intent stated in the prose is the target; the divergence is the gap to close.
- **Design pillars are a filter.** New ideas get tested against the pillars below. An idea that serves none of them is probably a different game.

---

## Vision

Gear Game is a strategy game where **you do not command an army — you build the machine that produces one.** Two players face each other across an arena, each with a build zone and a base. You place interlocking gears; meshed gears form a chain; a chain driven by a motor turns; and every full rotation of a gear is an event — a unit spawned, ore mined, research advanced, a turret reloaded. Victory comes from having engineered a better machine, not from out-clicking your opponent.

The fantasy is the satisfaction of a contraption you designed running without you: watching a chain you laid out an hour ago still turning, still throwing units down the lane.

## Design pillars

Four commitments. Every feature should serve at least one; a feature serving none is suspect.

### 1. The machine is the strategy

The army is a *by-product*. A player wins by arranging gears well, not by issuing orders. There is deliberately no unit selection, no move command, no rally point. If a proposed feature lets the player act on units directly rather than on the machine that makes them, it fights this pillar.

### 2. Rotation is the only clock

Nothing meaningful happens on a timer. It happens **per full rotation**. Spawning, mining, research, converting, healing, turret reloading — every one hangs off the same `gear:full_rotation` event. That makes rotation speed the universal currency: a design question about "how fast" is always a question about torque, teeth and inertia.

The consequence a designer must hold onto: **making a chain bigger makes it slower.** Every gear added contributes the same reflected inertia regardless of its size, so a four-gear chain turns at three-quarters the speed of a three-gear chain. Growth is not free, and that tension is the core of the build.

### 3. Space is a constraint, not decoration

Gears interact only if they physically touch. Meshing is a geometric fact — centre distance within tolerance of the sum of the radii — not an abstract adjacency. That makes layout a real decision: where a gear goes determines what it can drive, whether it jams, whether enemy units can reach it, and what the chain costs to extend.

### 4. Build it, then live with it

Low actions-per-minute by design. Decisions are made in the build, and their consequences unfold over the following minute without further input. A player who walks away for thirty seconds should return to a changed board, not a paused one.

## Core loop

```
      ┌─────────────────────────────────────────────────────────┐
      │                                                         │
      ▼                                                         │
  place gears ──► they mesh into a chain ──► a motor turns it   │
                                                    │           │
                                                    ▼           │
                                        every full rotation:    │
                                        spawn / mine / research │
                                                    │           │
                                                    ▼           │
                                    units march down the lane   │
                                                    │           │
                                                    ▼           │
                                  damage the enemy base ────────┘
                                  (income funds the next gear)
```

A match ends when one base reaches 0 HP. There is no timer and no alternative victory condition.

## The match at a glance

- **Arena.** 2800 × 1575 px. A build zone on the left, a build zone on the right, an 880 px no-man's-land between them, and a horizontal **lane band** through the middle where units walk and where gears can be reached by the enemy.
- **Sides.** Either side may be a human or an AI, chosen per slot in the lobby. Both AI is *spectate*; both human is *practice*.
- **Openings.** Both sides start with 30 gold, +2 gold/sec, and three unlocked gears: motor, infantry spawner, researcher. Everything else is behind research.
- **Ending.** Bases start at 100 HP. Only a unit that walks into a base damages it.

<!-- BEGIN GENERATED: world.constants -->
| Constant | Value | Meaning |
|---|---|---|
| `WORLD_WIDTH` | 2800 | arena width, px |
| `WORLD_HEIGHT` | 1575 | arena height, px |
| `PLAYER_ZONE_MAX_X` | 960 | right edge of the left build zone |
| `AI_ZONE_MIN_X` | 1840 | left edge of the right build zone |
| `LANE_Y_MIN` | 525 | top of the lane band |
| `LANE_Y_MAX` | 1050 | bottom of the lane band |
| `PLAYER_BASE_X` | 20 | left base centre |
| `AI_BASE_X` | 2780 | right base centre |
| `SNAP_THRESHOLD` | 40 | mesh snap grab distance, px |
<!-- END GENERATED: world.constants -->

---

## Vocabulary

These words are used precisely throughout the design and the code. Where the code uses a different name, it is given.

| Term | Meaning |
|---|---|
| **Teeth** | A gear's size, 5–60. The single number every other property scales from. Always literal — a 10-tooth gear has 10 teeth drawn on it and is never approximated. |
| **Mesh** | Two gears touch and transmit rotation. True when the distance between centres is within tolerance of the sum of their radii. |
| **Chain** | A connected group of meshed gears. The unit of physics: torque, inertia and output are computed per chain, not per gear. |
| **Omega (ω)** | Angular velocity, radians/sec. Negative is counter-clockwise. Reverses at every mesh hop. |
| **Torque** | Rotational force a motor contributes. Attenuates by the tooth ratio at each hop. |
| **Rotation** | One full 2π turn of a gear. The atomic unit of game time — every production event fires on one. |
| **Jam** | Two meshed gears required to turn in opposing directions, which happens when a chain contains an odd cycle. Both stop and take stress damage until one breaks. |
| **Burnout** | An overclock gear's enforced downtime after its boost window. Distinct from destruction — it recovers. |
| **Lane band** | The horizontal strip units traverse. Gears outside it cannot be hit by marching units. |
| **Zone** | The region a side may build in. Distinct from *side*: which half of the map a player occupies. |
| **Spawner** | A gear that produces one unit per rotation, paid for in that unit's resource. The **only** way units enter the game. |
| **Owner vs side** | *Owner* (`'player'` / `'ai'`) says whose a thing is. *Side* says which half of the map they hold. The lobby can seat a human on either side, so these are independent — code that conflates them is a bug. |
| **Chain phase** | The AI's read of how complete a chain is: bootstrap → spawn → amplify → support → expand → full. |
| **Threat level** | The AI's read of the match: critical, danger, normal, winning. Derived from base HP percentages. |
| **Divergence** | A recorded mismatch between this document's stated intent and what the code does. |

---

## Chapters

| Chapter | Contents |
|---|---|
| [Views & flow](design/views.md) | Every screen, the navigation graph, the in-match HUD, controls, settings |
| [Gears](design/gears.md) | The gear wiki — intent and numbers for all 22 types |
| [Units](design/units.md) | The unit wiki, behaviours, the counter matrix |
| [Tech tree](design/tech-tree.md) | All 48 nodes by column, and what each effect actually does |
| [Balance](design/balance.md) | Economy, the physics maths, worked examples, tuning levers |
| [Presentation](design/presentation.md) | Visual language, audio design, inspirations |
| [Tech stack](design/tech-stack.md) | Engine, build, test, CI, tooling |

---

## Divergence register

Places where the implementation does not match the design intent stated in this document. Each is verified against the code, and each is a decision waiting to be made: **fix the code, or change the intent.**

| # | Divergence | Where | Chapter |
|---|---|---|---|
| 1 | **Power is not a resource.** The HUD and the gear descriptions treat power as a currency, but nothing stores it — the tracked resources are gold, iron, crystal, aether. Chain output exists only as a number attached to a capacitor burst effect. | `types/economy.types.ts:1`, `EconomySystem.ts:32` | [Balance](design/balance.md#power-is-not-a-currency) |
| 2 | **Gold Surge does nothing.** The ACTIONS button emits `ability:activated` directly on the event bus, bypassing `AbilitySystem`, whose `activate()` has no callers. No gold is granted, no cooldown recorded, and the unlock is not checked. Its three labels disagree: "+50 power" (button), "30 gold" (definition), "50 power" (tech node). | `ActionsSection.ts:201`, `AbilitySystem.ts:59` | [Tech tree](design/tech-tree.md#abilities) |
| 3 | **Five unit types are unreachable.** `mixed`, all three elites and `wrench` have no spawner gear, so no match can produce them. They are fully implemented and tested but unplayable. | `UnitSystem.ts:1091` | [Units](design/units.md) |
| 4 | **The counter triangle applies to under half the roster.** `CombatSystem` excludes cavalry, artillery, sentinel and phantom (and their elites) from combat resolution, so the RPS multipliers never apply to them. | `CombatSystem.ts:36` | [Units](design/units.md#the-counter-matrix) |
| 5 | **Two unit abilities are text only.** Iron Guard's "reduces incoming damage by 30%" and Crystal Sentinel's "shields nearby allies" have no implementation. | `unit.constants.ts:81`, `:93` | [Units](design/units.md) |
| 6 | **Amplifiers only matter beside a capacitor.** The chain multiplier is applied in `computeChainOutput`, which is consumed solely by the capacitor burst. A chain with amplifiers and no capacitor gains nothing. | `RotationPhysicsSystem.ts:444` | [Gears](design/gears.md#amplifier) |
| 7 | **Capacitor bursts are cosmetic.** `power:capacitor_burst` carries a `powerReleased` figure that nothing banks; its only subscribers are camera shake, particles, sound and floating text. | `RotationPhysicsSystem.ts:433` | [Gears](design/gears.md#capacitor) |
| 8 | **Combo Chain Bonus does nothing.** `chain_combo_bonus` is an empty case in the effect switch, so a 110-gold node has no effect. | `TechSystem.ts:240` | [Tech tree](design/tech-tree.md#gears-column) |
| 9 | **Declared gear synergies are not read.** `GearDefinition.synergies` has no consumer. The motor↔amplifier adjacency bonus never applies; the capacitor↔overclock one works only because it is hard-coded elsewhere. | `gear.constants.ts:103` | [Gears](design/gears.md#synergies) |
| 10 | **Power cost is inert.** Every gear carries a `basePowerCost` and there is a `gearPowerCost()` formula, but placement is charged in gold only. | `GearSystem.ts:178` | [Balance](design/balance.md#gear-placement) |
| 15 | **Capacitor tech overwrites rather than composes.** `capacitor_burst_multiplier` sets an absolute value from a hard-coded `2.5` instead of building on the current multiplier. | `TechSystem.ts:220` | [Tech tree](design/tech-tree.md#what-the-effects-do) |
| 17 | **Node text contradicts node effect.** Super Amplifier says "2× multiplier" but grants +33% power; Overclock Mastery says "duration doubled" but adds a flat 15 s. | `tech.constants.ts:93`, `:113` | [Tech tree](design/tech-tree.md) |
| 18 | **`getChainUnitType()` is never called.** A chain-composition-determines-unit-type rule is fully written and unused — a remnant of an earlier design. | `unit.constants.ts:210` | [Units](design/units.md) |
| 21 | **Only units can damage a base.** Turrets, projectiles and gears cannot reach base HP at all, so there is no ranged pressure on the win condition. | `WinConditionSystem.ts:40` | [Balance](design/balance.md#the-win-condition) |

---

## Open design questions

Unresolved intent, recorded so the decisions are made deliberately rather than by default.

1. **Should power become a real currency?** Divergences 1, 6, 7 and 10 are one question wearing four hats. Either power is a second resource that gears cost and capacitors bank — which gives amplifiers and capacitors a reason to exist — or it is removed from the fiction entirely and chain output is renamed. The current half-state is the worst of both.
2. **How do elite and support units become reachable?** Divergence 3 leaves five units built and unplayable. Do they get spawner gears, or does something like the retired `getChainUnitType` rule return, where chain *composition* decides what a spawner emits?
3. **Should the counter triangle govern all combat?** Divergence 4 means the RPS relationship advertised in unit descriptions is honoured by melee only. Either every damage path consults it, or the descriptions and the tech that leans on counter-picking need rewriting.
4. **Is there a second way to win?** Divergence 21 makes the only route "walk a unit into a wall". A defensive machine with no spawners cannot win, only fail to lose.

---

## Maintaining this document

- Changing a **mechanic** → update the relevant chapter's intent prose in the same commit.
- Changing a **constant** → run `npm run docs:gen`; CI (`npm run docs:check`) fails otherwise.
- Closing a **divergence** → delete its marker and its register row in the same commit as the fix.
- Adding a **feature** → state which pillar it serves. If none, reconsider it.
