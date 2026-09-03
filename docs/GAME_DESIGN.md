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
| [Gears](design/gears.md) | The gear wiki — intent and numbers for all 23 types |
| [Units](design/units.md) | The unit wiki, behaviours, the counter matrix |
| [Tech tree](design/tech-tree.md) | All 48 nodes by column, and what each effect actually does |
| [Balance](design/balance.md) | Economy, the physics maths, worked examples, tuning levers |
| [Presentation](design/presentation.md) | Visual language, audio design, inspirations |
| [Tech stack](design/tech-stack.md) | Engine, build, test, CI, tooling |

---

## Divergence register

Places where the implementation does not match the design intent stated in this document. Each is verified against the code, and each is a decision waiting to be made: **fix the code, or change the intent.**

None currently open. The last entry (only units can damage a base) was reconsidered and kept as intentional design — see [Balance](design/balance.md#the-win-condition).

---

## Maintaining this document

- Changing a **mechanic** → update the relevant chapter's intent prose in the same commit.
- Changing a **constant** → run `npm run docs:gen`; CI (`npm run docs:check`) fails otherwise.
- Closing a **divergence** → delete its marker and its register row in the same commit as the fix.
- Adding a **feature** → state which pillar it serves. If none, reconsider it.
