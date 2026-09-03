# Gears

[← Game Design Document](../GAME_DESIGN.md)

Gears are the game. Everything a player builds is a gear, and everything the game produces happens when one completes a rotation.

---

## What a gear is

A gear has exactly one dial: **teeth**, 5 to 60. Every other property derives from it — radius, health, output, cost, damage. There are no levels, no upgrades on a placed gear, and no stats to allocate. Choosing a tooth count *is* the decision.

Tooth counts are literal. A 10-tooth gear has ten teeth drawn on it and meshes as a ten-toothed wheel would. This is a hard rule: no formula anywhere may approximate or rescale a tooth count.

<!-- BEGIN GENERATED: gears.physics -->
| Constant | Value | Meaning |
|---|---|---|
| `GEAR_MODULE` | 2.5 | px of radius per tooth |
| `GEAR_MESH_TOLERANCE` | 4 | px of slack when deciding two gears mesh |
| `INERTIA_DENSITY` | 0.01 | mass per unit area, sets chain sluggishness |
| `MIN_TEETH` / `MAX_TEETH` | 5 / 60 | tooth count bounds |
| `DEFAULT_TEETH` | 10 | calibration point for every scaling formula |
<!-- END GENERATED: gears.physics -->

### Meshing

Two gears mesh when the distance between their centres is within tolerance of the sum of their radii — they are touching, neither overlapping nor apart. Meshing is symmetric, automatic, and purely geometric; there is no adjacency rule beyond the geometry. When placing, a ghost gear snaps to exact meshing distance if released near a valid contact.

Meshed gears transmit rotation with the direction reversed and the speed scaled by the inverse tooth ratio:

```
ω_B = −(ω_A × teeth_A / teeth_B)
```

A small gear driving a large one turns it slowly; a large gear driving a small one spins it fast. The sign flip is what makes **jams** possible.

### Chains, and why size costs speed

A connected group of meshed gears is a **chain**, and physics is computed for the chain as a whole: total motor torque divided by total inertia, with each gear's inertia weighted by the square of its speed ratio relative to the motor.

That weighting has a consequence worth internalising, because it drives the whole build:

> Inertia grows with the square of radius, and the speed ratio shrinks with the inverse of teeth. The two cancel exactly. **Every gear in a chain contributes the same reflected inertia, no matter how big it is.**

So a chain's speed is set by its *gear count*, not its gear sizes. Three gears turn at ⅔ the speed of two; four at ½. Adding a gear always slows everything already there, and making that gear larger costs nothing extra in speed — only in gold. See [Balance](balance.md#the-physics-result-that-governs-everything) for the arithmetic.

### Jams

If a chain contains a cycle with an odd number of gears, the direction flips do not resolve: one gear is required to turn both ways at once. Both offending gears stop dead and take stress damage proportional to the torque running through them, until one is destroyed and the contradiction is broken.

This is a real design constraint on layout, not an error state — an even ring is a valid, working structure; an odd ring is a self-destructing one.

---

## The catalogue

Costs and unlocks for all 22 gear types.

<!-- BEGIN GENERATED: gears.catalogue -->
| Gear | Power cost | Gold cost | Unlocked by | In-game description |
|---|---|---|---|---|
| Motor | 0 | 0 | _from start_ | Drives rotation and generates power per full rotation. Output scales with teeth. |
| Amplifier | 20 | 0 | `basic_amplifier` | ×1.4 power multiplier on all downstream chain power. |
| Capacitor | 30 | 0 | `basic_capacitor` | Stores rotations and releases a 2.5× burst every 8 full rotations. |
| Overclock | 40 | 10 | `basic_overclock` | +50% torque/omega to adjacent gears. Runs 10s, burns out for 5s, then restarts. |
| Spiked | 15 | 0 | `spiked_gears` | Damages units on contact. Damage = \|omega\| × spikeDamage(teeth). |
| Armored | 20 | 0 | `armored_gears` | Blocks unit movement. HP scales with teeth². Must be destroyed to pass. |
| Iron Miner | 25 | 0 | `unlock_iron_mining` | Generates iron per full rotation. Output scales with teeth. |
| Crystal Miner | 25 | 0 | `unlock_crystal_mining` | Generates crystal per full rotation. Output scales with teeth. |
| Aether Miner | 25 | 0 | `unlock_aether_mining` | Generates aether per full rotation. Output scales with teeth. |
| Infantry Spawner | 10 | 5 | _from start_ | Spawns an Infantry unit per full rotation (5 gold cost). |
| Artillery Spawner | 15 | 8 | `unlock_artillery_spawner` | Spawns an Artillery unit per full rotation (8 gold cost). |
| Cavalry Spawner | 20 | 12 | `unlock_cavalry_spawner` | Spawns a Cavalry unit per full rotation (12 gold cost). |
| Iron Guard Spawner | 15 | 8 | `unlock_iron_guard_spawner` | Spawns an Iron Guard unit per full rotation (8 iron cost). |
| Crystal Sentinel Spawner | 12 | 6 | `unlock_crystal_sentinel_spawner` | Spawns a Crystal Sentinel unit per full rotation (6 crystal cost). |
| Aether Phantom Spawner | 10 | 5 | `unlock_aether_phantom_spawner` | Spawns an Aether Phantom unit per full rotation (5 aether cost). |
| Researcher | 10 | 0 | _from start_ | Advances current research on each full rotation. Larger gears research faster. |
| Iron Converter | 20 | 0 | `iron_to_gold` | Converts iron into gold on each full rotation. Larger gears convert more. |
| Crystal Converter | 20 | 0 | `crystal_to_gold` | Converts crystal into gold on each full rotation at a favorable rate. |
| Aether Converter | 20 | 0 | `aether_to_gold` | Converts aether into gold on each full rotation at the best rate. |
| Crossbow Turret | 30 | 5 | `crossbow_turret_tech` | Defensive turret. Each rotation buys 1 ammo bolt (2 gold). Fires quickly at nearby enemies; low damage, medium range. |
| Artillery Turret | 50 | 8 | `artillery_turret_tech` | Heavy turret. Each rotation buys 1 ammo shell (6 gold). Fires slowly with AoE; high damage, long range. |
| Healer | 25 | 0 | `healer_gear_tech` | Emits a healing aura on each full rotation. Heals nearby friendly gears and units. Aura size and healing scale with gear size. |
<!-- END GENERATED: gears.catalogue -->

<!-- BEGIN GENERATED: gears.formulas -->
| Quantity | Formula | At 10 teeth | Scaling |
|---|---|---|---|
| Radius | `teeth × 2.5` | 25 px | linear |
| Motor output | `teeth × 0.4` | 4 | linear |
| Motor torque | `teeth² × 0.8` | 80 | quadratic |
| Spike damage | `teeth × 0.5` | 5 | linear, × spin |
| Max HP | `round(teeth² × 0.5)` | 50 | quadratic; armored ×3, spiked ×0.7 |
| Mining output | `teeth × 0.3` | 3 | linear |
| Researcher output | `teeth × 150` ms | 1500 ms | linear |
| Converter output | `teeth × 0.25` | 2.5 | linear |
| Healer output | `teeth × 1.5` | 15 | linear |
| Healer radius | `radius × 3` | 75 px | linear |
| Turret ammo | `max(3, round(teeth × 0.5))` | 5 | linear, floor 3 |
| Crossbow range | `250 × √(teeth/10)` | 250 px | square root |
| Artillery range | `400 × √(teeth/10)` | 400 px | square root |
<!-- END GENERATED: gears.formulas -->

---

## Production gears

### Motor

**Intent.** The origin of everything. A chain without a motor is inert scenery, so the first decision in any match is where the first motor goes.

**Player decision.** How big? Torque scales with teeth *squared* while inertia scales the same way — so a bigger motor drives a bigger chain at the same speed, rather than driving the same chain faster. Motor size is a question of *how much machine you intend to build around it*, not of speed.

**Behaviour.** Provides torque to its chain. Multiple motors in one chain sum their torque, so a slowing chain can be revived by adding another motor rather than removing gears.

**Status.** Implemented. Available from the start.

### Researcher

**Intent.** Converts rotation into research time, letting a player who is winning the machine game convert that lead into the tech tree without touching gold. It is the "my engine is my economy" option.

**Player decision.** Spend chain speed on the future instead of on units now.

**Behaviour.** Each rotation subtracts `teeth × 150` ms from the remaining time on the current research.

**Status.** Implemented. Available from the start.

### Miners — iron, crystal, aether

**Intent.** Open a second, parallel economy that is *earned by machine* rather than granted by time. Passive gold arrives whether or not you build well; ore only arrives if your chain turns.

**Player decision.** Ore is worth nothing on its own — it must be paired with either a converter (to become gold) or the matching spawner (to become a unit). Committing to a miner is committing to a second gear later.

**Behaviour.** `teeth × 0.3` of the matching resource per rotation. All three miners share the same output formula; they differ only in what they produce and therefore what they unlock downstream.

**Status.** Implemented.

### Converters — iron, crystal, aether

**Intent.** The exchange rate that makes the deeper resources worth reaching. Each tier converts at a better rate than the last, so the reward for pushing further down the mining tree is compounding, not linear.

**Player decision.** Feed ore to units or to gold?

**Behaviour.** Each rotation consumes `teeth × 0.25` ore and pays gold at **×2** (iron), **×3** (crystal), **×6** (aether). Skipped silently if the ore is not there.

**Status.** Implemented.

### Spawners — infantry, artillery, cavalry, iron guard, crystal sentinel, aether phantom

**Intent.** The only door units come through. Pinning production to a spawner gear is what makes the army a property of the machine rather than a purchase — you cannot buy a wave, you can only build something that produces one.

**Player decision.** Every spawner is a standing cost: it charges its unit's price *on every rotation*, so a fast chain with an expensive spawner will bankrupt you. Spawner size and chain speed are an economic decision as much as a military one.

**Behaviour.** One unit per rotation, paid in that unit's resource, scaled by the spawner's teeth. If the resource is short, nothing spawns and a "No <resource>!" note appears.

**Status.** Implemented. See [Units](units.md) for what each produces.

> **⚠ DIVERGENCE** — There are six spawner gears but eleven unit types. `mixed`, the three elites and `wrench` have no spawner and cannot appear in a match (`UnitSystem.ts:1091`). See open question 2 in the [hub](../GAME_DESIGN.md#open-design-questions).

---

## Force-multiplier gears

### Amplifier

**Intent.** The reward for building a *deep* chain rather than a wide one — a gear that produces nothing itself and makes everything around it worth more.

**Behaviour.** Multiplies chain output by 1.4, compounding per amplifier in the chain.

**Status.** Implemented, but see below.

> **⚠ DIVERGENCE** — Chain output is consumed by exactly one thing: the capacitor burst payload (`RotationPhysicsSystem.ts:444`). An amplifier in a chain with no capacitor changes no number the player can observe. Combined with divergence 7, the whole amplifier→capacitor value path is currently cosmetic.

### Capacitor

**Intent.** Rewards patience and uptime. It converts sustained rotation into a periodic spike, and it is the gear that makes amplifiers and extra motors *visible* — they are inputs whose only readout is the burst.

**Player decision.** Spend space and speed on a gear that produces nothing for seven rotations out of eight.

**Behaviour.** Counts rotations; every 8th releases a burst worth chain output × 2.5. A capacitor meshed to a live overclock gear bursts at 3.5 instead.

**Status.** Implemented mechanically.

> **⚠ DIVERGENCE** — The burst is emitted as an event carrying a `powerReleased` figure, and nothing banks it. Its subscribers are camera shake, particles, sound and floating text (`RotationPhysicsSystem.ts:433`). The player sees a satisfying flash worth exactly zero.

### Overclock

**Intent.** A deliberate instability. It buys speed for its neighbours at the cost of a gear slot that periodically stops working, so the player trades reliability for throughput and must design a chain that survives the downtime.

**Player decision.** Where to put it, given that it boosts only gears it directly touches — and whether to accept the recurring 5-second hole.

**Behaviour.** Starts automatically when placed and runs a cycle: boost neighbours' ω and torque by +50% for 10 s → burn out for 5 s → recover → repeat. Boost compounds down the chain, because boosted values are what propagate onward. Research extends the boost window; the Overclock Mastery ability removes the burnout entirely.

**Status.** Implemented.

---

## Defensive gears

### Spiked

**Intent.** Turns the machine itself into a weapon, so a chain built inside the lane is not merely exposed but actively dangerous. Damage scales with rotation speed, which ties defence to the same variable as everything else.

**Behaviour.** Damages enemy units on contact at `teeth × 0.5 × spin`, where a stationary gear still deals a small fraction. Heals itself slightly each rotation.

**Status.** Implemented. Has a bespoke rusted-sawblade visual — see [Presentation](presentation.md#gears).

### Armored

**Intent.** A wall you have to build rather than buy — it occupies chain space and slows the chain like any other gear, so fortifying costs throughput.

**Behaviour.** Blocks enemy units physically. Triple health. Spinning armored gears shove nearby enemies away. Repairs itself each rotation for a small gold fee.

**Status.** Implemented.

### Turrets — crossbow, artillery

**Intent.** Ranged defence that is *fed* rather than free: each rotation buys one round of ammunition, so a turret's rate of fire is a function of chain speed and gold, not a fixed cooldown.

**Player decision.** A turret on a fast chain is expensive; on a slow chain it is a poor turret. Its placement is a bet on both.

**Behaviour.** Crossbow fires fast, cheap, short-ranged single shots that slow the target. Artillery fires slowly at long range with area damage. Both target the nearest enemy unit in range, ignoring lane and direction.

**Status.** Implemented.

### Healer

**Intent.** Makes a defensive position sustainable, converting rotation into repair so a machine under sustained pressure can hold without the player intervening.

**Behaviour.** Each rotation heals all friendly gears and units within `radius × 3`, for `teeth × 1.5` each.

**Status.** Implemented.

---

## Synergies

The design intends gears to be worth more beside particular neighbours. Two such relationships are declared in the gear definitions:

| Gear | Beside | Intended effect |
|---|---|---|
| Motor | Amplifier | +10% chain power |
| Capacitor | Overclock | Burst at 3.5× instead of 2.5× |

> **⚠ DIVERGENCE** — Nothing reads `GearDefinition.synergies` (`gear.constants.ts:103`). The motor↔amplifier bonus never applies. The capacitor↔overclock one *does* work, but only because it is separately hard-coded in the burst calculation — so the declared data and the working behaviour are unrelated.

If adjacency bonuses are to be a real design lever, the synergy list needs a consumer in the physics pass. As it stands the field is documentation, not mechanics.

---

## Gear lifecycle

| Stage | Rule |
|---|---|
| **Placement** | Must be inside your own zone, not overlapping an existing gear, and the type must be unlocked. Costs gold; snaps to mesh if released near a valid contact. |
| **Repositioning** | A placed gear can be picked up and moved, subject to a cooldown shown as a shrinking arc on the gear. |
| **Damage** | Gears take damage from enemy units in contact, from projectiles, and from jam stress. Damage shows as cracks in four tiers, seeded from the gear's id so a given gear always cracks identically. |
| **Destruction** | At 0 HP the gear is removed and the chain re-forms around the hole — which may split one chain into two, or strand a section with no motor. |
| **Selling** | A gear can be sold in SELL mode for half its placement cost, rounded up. |
| **Burnout** | Overclock only, and recoverable — distinct from destruction. |
