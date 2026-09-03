# Units

[← Game Design Document](../GAME_DESIGN.md)

Units are the machine's output, not the player's instrument. Nothing in the game selects, orders or steers a unit — once spawned it acts on its own until it dies or reaches a base.

---

## The contract

**Units spawn only from spawner gears, one per full rotation.** There is no wave button, no timed wave, no build queue. This is the single most important rule in the game and it is not negotiable: the game was once a wave-driven tower defence, that model was removed deliberately, and it must not return. Production rate is a function of chain speed, which is a function of layout — so the army is downstream of engineering.

Each unit is paid for in its own resource on every rotation of its spawner. A fast chain with an expensive spawner is a liability.

---

## Stats

Base values, calibrated at 10 teeth. A spawner's tooth count scales everything.

<!-- BEGIN GENERATED: units.stats -->
| Unit | HP | Speed | Combat dmg | Base dmg | Cost | Range @10t |
|---|---|---|---|---|---|---|
| Infantry | 30 | 60 | 5 | 3 | 5 gold | 36 |
| Artillery | 20 | 40 | 8 | 5 | 8 gold | 120 |
| Cavalry | 40 | 90 | 12 | 8 | 12 gold | 36 |
| Mixed | 35 | 65 | 8 | 10 | 10 gold | 36 |
| Elite Infantry | 60 | 60 | 10 | 6 | 20 gold | 36 |
| Elite Artillery | 40 | 40 | 16 | 10 | 25 gold | 120 |
| Elite Cavalry | 80 | 90 | 24 | 16 | 30 gold | 36 |
| Iron Guard | 80 | 35 | 10 | 12 | 8 iron | 36 |
| Crystal Sentinel | 50 | 55 | 6 | 8 | 6 crystal | 72 |
| Aether Phantom | 25 | 100 | 4 | 6 | 5 aether | 36 |
| Wrench | 20 | 50 | 0 | 0 | — | 36 |
<!-- END GENERATED: units.stats -->

**Combat dmg** is dealt to units and gears in the field; **base dmg** is the damage applied to the enemy base on arrival. They are separate numbers, so a unit can be a good raider and a poor fighter or the reverse.

### How size changes a unit

<!-- BEGIN GENERATED: units.scaling -->
| Stat | Formula | Effect of bigger gears |
|---|---|---|
| HP | `base × s^1.5` | grows faster than size — bigger is tankier |
| Speed | `base × s^-0.5` | shrinks — bigger is slower |
| Damage | `base × s^1.2` | grows |
| Size | `teeth × 1.2` | linear |
| Attack range | `36 × s^0.8` (artillery `size × 10`, sentinel `size × 6`) | grows sublinearly |
| Mass | `10 × s² × typeMult` | quadratic |
| Cost | `base × s^1.3` | grows faster than output |
<!-- END GENERATED: units.scaling -->

The intent of these exponents: bigger spawners make **fewer, tougher, slower, more expensive** units. HP grows faster than cost, so mass is efficient — but speed falls, so a big unit reaches the enemy later, and cost grows faster than damage, so bigness is not a free win. The design wants tooth count on a spawner to be a genuine trade rather than a straight upgrade.

---

## The roster

### Infantry

**Intent.** The default. Cheap, unremarkable, available from the first minute — the unit you get for building the simplest possible machine, and the yardstick every other unit is measured against.

**Behaviour.** Marches; on finding an enemy unit within 300 px ahead, or an enemy gear in the lane within 400 px, it closes and attacks on a cooldown.

**Status.** Implemented. The only unit reachable at match start.

### Artillery

**Intent.** Converts positioning into safety — it stops and fires from outside melee reach, so it beats anything that has to walk to it and loses to anything fast enough to close.

**Behaviour.** Detects at 1.5× its attack range, stops at attack range, and lobs shells on a slow cooldown that explode for area damage. The barrel tracks its target independently of the body.

**Status.** Implemented.

### Cavalry

**Intent.** A commitment. It accelerates continuously while charging, so its damage is a function of how much clear ground it had — rewarding a player who opens a lane rather than one who merely spawns more.

**Behaviour.** Accumulates charge while advancing; hits for damage scaled by accumulated charge, shoves the target, then retreats for 3.5 s before turning to charge again.

**Status.** Implemented.

### Iron Guard

**Intent.** The wall that walks. Slow and heavy, it exists to absorb a defensive line's attention, and its death explosion means killing it is not free.

**Behaviour.** Moves at 70% speed, hits hard on a long cooldown, and shoves what it hits. On death it explodes for heavy area damage — **hitting both sides' units and gears indiscriminately**.

**Status.** Implemented. Every hit it takes — melee, charge, beam, shell, or its own death blast — is cut by 30% (`IRON_GUARD_DAMAGE_REDUCTION` in `unit.constants.ts`), applied through the same `computeDamage` helper every damage site in the game now goes through.

### Crystal Sentinel

**Intent.** Area control rather than damage. It is meant to make ground expensive to cross, not to win fights.

**Behaviour.** Fires a hitscan beam at range that damages a small area and leaves a **cold zone** — a lingering field that slows enemy units and adds friction to enemy gears caught inside it, which is the only mechanic in the game that attacks the *machine's speed* rather than its health.

**Status.** Implemented. Every beam tick (800ms), it grants a shield to allies within its aura radius — 20% off their next incoming hits for 1.2s, refreshed as long as the sentinel keeps firing.

### Aether Phantom

**Intent.** A pure harasser that ignores the front line entirely — it never stops to fight, so it answers a turtling opponent by walking through them.

**Behaviour.** Always marches at full speed and never acquires a target. Damages enemies continuously while overlapping them, and passes through enemy units instead of colliding. It takes damage doing so — the pass-through is a cost, not a free hit.

**Status.** Implemented.

### Wrench

**Intent.** The anti-machine unit, and the purest expression of the game's thesis: instead of attacking health, it attacks *rotation*. A latched wrench adds friction, slowing the whole chain it is attached to.

**Behaviour.** Seeks an enemy gear, latches on, and adds friction until removed. Deals no damage.

**Status.** Implemented. Its own spawner, `wrench_spawner`, produces it directly — a plain, cheap, early-tier gear like the other support spawners, needing only `unlock_wrench_spawner`.

### Mixed and the Elites

**Intent.** Elites are the late-tech reward: strictly stronger versions of the core three, gated behind deep research, so a long match escalates. `Mixed` is a generalist with no counter weaknesses.

**Status.** Implemented and reachable. Neither has its own spawner gear — instead, the three core spawners (`infantry_spawner`, `artillery_spawner`, `cavalry_spawner`) produce them under the right chain conditions, via `getChainUnitType()` (`unit.constants.ts`), the chain-composition-decides-output rule this section used to describe as retired and unused. It now runs on every core-spawner rotation:

- **Elite upgrade.** Once the matching elite tech is researched (`elite_infantry_unlock` / `elite_artillery_unlock` / `elite_cavalry_unlock`) *and* the spawner's chain has grown to combo size (4+ gears — the same threshold Combo Chain Bonus uses), the spawner produces the elite variant instead of the base unit. No new gear to place: growing the chain is the trigger.
- **Mixed.** Once all three core spawner techs are researched (`unlock_infantry`, `unlock_artillery_spawner`, `unlock_cavalry_spawner`) *and* the chain carries any converter gear (iron/crystal/aether), every core spawner on it produces `mixed` instead. This takes priority over an elite upgrade when both conditions are met — a converter is a deliberate placement, a stronger signal of intent than merely growing the chain.
- Neither condition needs the *other* side's tech or chain state — this is evaluated per owner, same as everything else research gates.

---

## The counter matrix

**Intent.** A rock-paper-scissors triangle — infantry beats artillery beats cavalry beats infantry, at double damage — so that scouting what the opponent produces is worth doing, and so no single spawner is correct.

<!-- BEGIN GENERATED: units.counters -->
| Attacker ↓ / Defender → | Infantry | Artillery | Cavalry | Mixed | Elite Infantry | Elite Artillery | Elite Cavalry | Iron Guard | Crystal Sentinel | Aether Phantom | Wrench |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Infantry** | · | 2× | 0.5× | · | · | 2× | 0.5× | · | 1.2× | 1.5× | · |
| **Artillery** | 0.5× | · | 2× | · | 0.5× | · | 2× | 1.5× | 0.8× | · | · |
| **Cavalry** | 2× | 0.5× | · | · | 2× | 0.5× | · | 0.5× | · | 2× | 2× |
| **Mixed** | · | · | · | · | · | · | · | · | · | · | · |
| **Elite Infantry** | 1.5× | 3× | 0.5× | 1.2× | · | 3× | 0.5× | 1.2× | 1.5× | 2× | 1.5× |
| **Elite Artillery** | 0.5× | 1.5× | 3× | 1.2× | 0.5× | · | 3× | 2× | 0.8× | 1.2× | · |
| **Elite Cavalry** | 3× | 0.5× | 1.5× | 1.2× | 3× | 0.5× | · | 0.5× | 1.2× | 2.5× | 3× |
| **Iron Guard** | · | 0.8× | 2× | · | · | 0.8× | 2× | · | · | 1.5× | · |
| **Crystal Sentinel** | 0.8× | · | 0.9× | 0.9× | 0.8× | · | 0.9× | · | · | · | · |
| **Aether Phantom** | 0.6× | · | 0.5× | 0.8× | 0.6× | · | 0.5× | · | · | · | · |
| **Wrench** | 0.5× | 0.5× | 0.5× | 0.5× | 0.5× | 0.5× | 0.5× | 0.5× | 0.5× | 0.5× | · |
<!-- END GENERATED: units.counters -->

`·` means no modifier. Elites hit their favoured matchup harder than the base units do.

The matrix is applied everywhere damage is dealt, not just inside `CombatSystem`. A single `computeDamage(attackerType, defender, rawDamage)` helper (`unit.constants.ts`) is the one place the multiplier, Iron Guard's armor, and Crystal Sentinel's shield buff are resolved, and every damage-application site — `CombatSystem`'s melee pairs, `UnitSystem`'s cavalry charge, Iron Guard melee, Aether Phantom passthrough, Crystal Sentinel's beam and Iron Guard's death explosion, and `ProjectileSystem`'s artillery shells and crystal shards — calls it. A turret-fired shot has no unit type and so skips the counter lookup (turrets aren't part of the matrix), but still respects Iron Guard's armor and shields.

---

## Movement and the lane

Units walk along the **lane band**, the horizontal strip through the middle of the arena. Gears outside the band cannot be reached by marching units, which makes vertical placement a real defensive choice: build in the lane for spikes and turrets to bite, build outside it to keep your economy safe.

Direction is derived from which half of the map a side occupies, never from its owner label — the lobby can seat a human on either side, and every directional decision (march, targeting, base arrival) must agree. A unit reaching the enemy base deals its base damage and is consumed.

---

## The AI opponent

**Intent.** The AI should feel like a person on the other side of the board, not a script. It plays the same game by the same rules — the same `GearSystem.tryPlace`, `TechSystem.startResearch`, `EconomySystem.spendGold`, and (as of this pass) the same `AbilitySystem` a human's clicks go through, gold-checked and tech-gated identically. What makes it feel human isn't a privileged shortcut; it's that its *reach* (how fast it can act) is limited the way a person's hands are, and its *judgment* is layered the way a person's actually is — a standing plan for the match, revised strategy as the board changes, and moment-to-moment tactics that serve whichever strategy is currently in force.

### The three layers

Every decision the AI makes traces back through three levels, cheapest-to-recompute at the top:

1. **Goal — fixed.** Get enough units into the enemy base. Never re-evaluated; everything below serves it.
2. **Strategic posture — recomputed periodically** (`AIStrategicPlanner`, every few seconds, independent of the action-budget clock below). A continuous read of the match: economy strength (gold income, chain capacity used), threat level (own/opponent base HP), match age, and what the opponent's build says about their intentions (their unit mix, their researched tech). Output is a blend, not a single label — **economy / defense / offense** weights that sum to 1, plus how many chains the AI believes it can currently sustain. Personality (below) biases this blend; it doesn't override it. A rusher who is losing still shifts weight toward defense — the posture reflects the game, personality just tilts the starting point.
3. **Tactical execution — every decision tick** (`AIChainPlanner`, unchanged in spirit from before this pass). Given the current posture, which chain gets the next gear, which gear, what size, and where. This is where counter-picking, chain-phase progression (bootstrap → spawn → amplify → support → expand → full) and placement scoring already lived, and still do — they now read their targets (how many economy/defense/combat chains to run, when a chain is worth recycling) from the posture instead of a fixed number baked in at match start.

This is why chain count no longer plateaus: the old model capped total chains at a fixed number per difficulty (2/3/5) that never moved for the rest of the match — once full, the AI had nothing left to decide but small `expand`-phase tweaks. Capacity is now a function of the economy the AI has actually built (`AIStrategicPlanner.computeCapacity`) — it keeps growing as gold income grows, with difficulty setting how fast it's willing to reach for that growth, not a ceiling on how far it can go.

### APM, not faked mistakes

**Difficulty is an actions-per-minute budget**, not a hidden coin-flip. Every AI-executed action (place a gear, start research, sell, reposition, use an ability) costs from a per-side budget that refills continuously at a fixed rate — easy refills slowest, hard fastest — with a small burst allowance so the AI can spend a run of banked actions at once, the way a person queues up several moves and executes them in a burst. The AI evaluates the board often; what differs by difficulty is purely how much it can *do* about what it sees, which is the same kind of constraint a human's hands are under, not a difference in whether it "notices" a move exists. The old easy-mode behavior — silently discarding over half its decision ticks — was a fake: it looked like incompetence but wasn't a constraint the AI was actually reasoning under. Real placement mistakes exist instead: at low difficulty, the placement search sometimes settles for a valid-but-flawed slot, and occasionally accepts a rotation conflict it would otherwise reject — an actual mis-mesh, seeded and consequential (it can jam), not merely a worse-looking gear. Hard never does either.

### Zoning

Chain placement follows the same lane geometry a human should: **defense chains sit in the lane band**, where marching units actually walk, built as a barrier the enemy must fight through rather than route around; **economy and spawner-heavy combat chains sit off-lane**, in the back of the zone, out of marching units' reach. This was already true before this pass for the (fixed, capped) defense/economy roles; what's new is that it now scales with the posture's role weights instead of stopping at one or two chains of each kind regardless of how large the economy has grown.

### Personality

Chosen per slot in the lobby, and still meaningfully different — but now expressed as a bias on the strategic posture and research priority, not a fixed, unconditional build order:

| Personality | Bias |
|---|---|
| **Rusher** | Posture starts offense-heavy; boosts spawner and speed research |
| **Economist** | Posture starts economy-heavy; holds more gold in reserve; boosts mining and conversion research |
| **Turtle** | Posture starts defense-heavy; heavily boosts armour, spikes, turrets, fortification |
| **Balanced** | No bias — posture is driven purely by the match state |

**Threat assessment** is percentage-based on base HP and feeds the posture directly (a critical threat pulls weight toward defense/offense and away from economy) as well as shifting research priority — under pressure the AI reprices fortification above everything else.

**Counter-picking.** It keeps a rolling 45-second window of the units it has seen you spawn and, if one type dominates, researches and builds the spawner that counters it. The counter matrix applies to every unit's attacks, not just melee, so the counter it picks actually counters what it saw.

`AIEvaluator.ts`, `AIPlanner.ts` and the `AI_STRATEGIES` table described an earlier decision model, superseded by `AIChainPlanner`; confirmed zero references anywhere in `src/` or `tests/` and deleted.

The AI pays for its gear placements the same way the player does — `AIController.executeDecision` charges gold up front and refunds it if `tryPlace` refuses the location, so its difficulty is tuned against the same constraint the player plays under. Its abilities now run through the same `AbilitySystem` a human's ACTIONS-tab click does (one instance per side) instead of a parallel, invisible cooldown tracker — unlocking Overclock Mastery, for instance, now actually stops the AI's own overclock gears from burning out, which it silently never did before.
