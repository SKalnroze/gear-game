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

**Status.** Implemented, with one gap.

> **⚠ DIVERGENCE** — Its description promises "reduces incoming damage by 30%" (`unit.constants.ts:81`). No damage reduction exists. The only 0.7 factor on this unit is its movement speed.

### Crystal Sentinel

**Intent.** Area control rather than damage. It is meant to make ground expensive to cross, not to win fights.

**Behaviour.** Fires a hitscan beam at range that damages a small area and leaves a **cold zone** — a lingering field that slows enemy units and adds friction to enemy gears caught inside it, which is the only mechanic in the game that attacks the *machine's speed* rather than its health.

**Status.** Implemented, with one gap.

> **⚠ DIVERGENCE** — Its description promises it "shields nearby allies" (`unit.constants.ts:93`). There is no shielding code.

### Aether Phantom

**Intent.** A pure harasser that ignores the front line entirely — it never stops to fight, so it answers a turtling opponent by walking through them.

**Behaviour.** Always marches at full speed and never acquires a target. Damages enemies continuously while overlapping them, and passes through enemy units instead of colliding. It takes damage doing so — the pass-through is a cost, not a free hit.

**Status.** Implemented.

### Wrench

**Intent.** The anti-machine unit, and the purest expression of the game's thesis: instead of attacking health, it attacks *rotation*. A latched wrench adds friction, slowing the whole chain it is attached to.

**Behaviour.** Seeks an enemy gear, latches on, and adds friction until removed. Deals no damage.

**Status.** Implemented but unreachable — no spawner produces it.

### Mixed and the Elites

**Intent.** Elites are the late-tech reward: strictly stronger versions of the core three, gated behind deep research, so a long match escalates. `Mixed` is a generalist with no counter weaknesses.

**Status.** Implemented, tested, and **unreachable** — no spawner gear produces any of them.

> **⚠ DIVERGENCE** — Five of eleven unit types cannot occur in a match (`UnitSystem.ts:1091`). Their tech nodes are researchable and their stats are tuned. A retired function, `getChainUnitType()` (`unit.constants.ts:210`), still encodes an older rule where a chain's *composition* — motor + amplifier + converter — decided which unit its spawner emitted. That rule is a live candidate for making these units reachable again. See open question 2 in the [hub](../GAME_DESIGN.md#open-design-questions).

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

> **⚠ DIVERGENCE** — The matrix is applied by `CombatSystem`, which excludes cavalry, artillery, crystal sentinel, aether phantom and both their elites from combat resolution entirely (`CombatSystem.ts:36`). Those types manage their own attacks in `UnitSystem` and never consult a multiplier. In practice the triangle applies only between infantry, mixed, elite infantry, iron guard and wrench — so the counter relationship the unit descriptions advertise, and that the AI's counter-picking logic assumes, is largely inactive. See open question 3 in the [hub](../GAME_DESIGN.md#open-design-questions).

---

## Movement and the lane

Units walk along the **lane band**, the horizontal strip through the middle of the arena. Gears outside the band cannot be reached by marching units, which makes vertical placement a real defensive choice: build in the lane for spikes and turrets to bite, build outside it to keep your economy safe.

Direction is derived from which half of the map a side occupies, never from its owner label — the lobby can seat a human on either side, and every directional decision (march, targeting, base arrival) must agree. A unit reaching the enemy base deals its base damage and is consumed.

---

## The AI opponent

The AI plays the same game by the same rules: it places gears, researches, and lets its machine produce.

**Difficulty** changes how much machine it can manage — chain count, gear sizes, how carefully it picks locations, and whether it acts every opportunity or skips some at random.

**Personality** changes what it wants, and is chosen per slot in the lobby:

| Personality | Wants |
|---|---|
| **Rusher** | Two combat chains before anything else; boosts spawner and speed research |
| **Economist** | Holds more gold in reserve; boosts mining and conversion research |
| **Turtle** | Defence before economy; heavily boosts armour, spikes, turrets, fortification |
| **Balanced** | No bias |

**Threat assessment** is percentage-based on base HP and shifts research priority — under pressure the AI reprices fortification above everything else.

**Counter-picking.** It keeps a rolling 45-second window of the units it has seen you spawn and, if one type dominates, researches and builds the spawner that counters it. This is the feature most affected by divergence 4: the counter it picks may not actually counter anything.

> **⚠ DIVERGENCE** — `AIEvaluator.ts`, `AIPlanner.ts` and the `AI_STRATEGIES` table are referenced nowhere in the codebase. They describe an earlier decision model that has been replaced by `AIChainPlanner`. Either delete them or note them as retained for reference.

> **⚠ DIVERGENCE** — The AI is never charged gold for gear placement (`GameScene.ts:864` is the only `spendGold` for a placement, and it is player-only), so its difficulty is not tuned against the constraint the player plays under. See [Balance](balance.md#gear-placement).
