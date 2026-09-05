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
| `INERTIA_DENSITY` | 0.000008158 | density fed to Matter.js for real gear mass/inertia -- sets chain sluggishness |
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

**Each gear's mass and rotational inertia are computed by Matter.js from its actual geometry** (a solid disk of radius `gearRadius(teeth)`) rather than a hand-rolled formula — `gearInertia(teeth)` in `gear.constants.ts` builds a real Matter body once per tooth count (cached; gears never need to translate, so this is used purely as a physics-accurate mass/inertia calculator, not a live simulated body) and reads its `.inertia` back. The mesh-graph discovery, chain bookkeeping and jam detection below are unchanged from before this pass — what changed is that the *inertia* value feeding all of it now comes from a real rigidbody physics library instead of an approximated area formula, which is what makes tooth count a genuine trade-off (see "Chains" below).

### Chains, and why size costs speed

A connected group of meshed gears is a **chain**, and physics is computed for the chain as a whole: total motor torque divided by total inertia, with each gear's real inertia weighted by the square of its speed ratio relative to the motor.

Real rotational inertia scales with the *fourth power* of radius (mass ∝ r², inertia ∝ mass·r² ∝ r⁴), not the square — and that's the fix for a divergence this document used to record here: the old hand-rolled "inertia" (mass reused as if it were rotational inertia, ∝ r²) scaled with exactly the same power as the ratio² weighting, so they cancelled *exactly* and tooth count was free. Real inertia doesn't cancel the same way:

> **A bigger follower gear now costs genuinely more chain speed — quadratically more, not "the same regardless of size."** A 20-tooth gear meshed to a 10-tooth motor now drags the chain roughly 4× harder than a same-sized follower would, where it used to cost exactly the same as any other size.

Chain size (gear *count*) still taxes speed the way it always did — three gears turn slower than two, four slower still — but gear *size* is no longer free. Making a gear bigger buys output, HP and range at a real, escalating cost in chain speed, not just gold. See [Balance](balance.md#the-physics-result-that-governs-everything) for the worked numbers.

### Jams

If a chain contains a cycle with an odd number of gears, the direction flips do not resolve: one gear is required to turn both ways at once. Both offending gears stop dead and take stress damage proportional to the torque running through them, until one is destroyed and the contradiction is broken.

This is a real design constraint on layout, not an error state — an even ring is a valid, working structure; an odd ring is a self-destructing one.

---

## The catalogue

Costs and unlocks for all 33 gear types.

<!-- BEGIN GENERATED: gears.catalogue -->
| Gear | Gold cost | Unlocked by | In-game description |
|---|---|---|---|
| Motor | 0 | _from start_ | Drives rotation. Larger motors deliver more torque, but every gear meshed on the chain slows it down. |
| Amplifier | 0 | `basic_amplifier` | Multiplies the whole chain torque by 1.4x -- the chain spins faster, so everything on it happens more often. |
| Capacitor | 0 | `basic_capacitor` | Stores rotations and pays out a gold burst every 8th -- 2.5x the chain output. |
| Overclock | 10 | `basic_overclock` | +50% torque/omega to adjacent gears. Runs 10s, burns out for 5s, then restarts. |
| Spiked | 0 | `spiked_gears` | Damages units on contact. Damage = \|omega\| × spikeDamage(teeth). |
| Armored | 0 | `armored_gears` | Blocks unit movement. HP scales with teeth². Must be destroyed to pass. |
| Iron Miner | 0 | `unlock_iron_mining` | Generates iron per full rotation. Output scales with teeth. |
| Crystal Miner | 0 | `unlock_crystal_mining` | Generates crystal per full rotation. Output scales with teeth. |
| Aether Miner | 0 | `unlock_aether_mining` | Generates aether per full rotation. Output scales with teeth. |
| Infantry Spawner | 5 | _from start_ | Spawns an Infantry unit per full rotation (5 gold cost). |
| Artillery Spawner | 8 | `unlock_artillery_spawner` | Spawns an Artillery unit per full rotation (8 gold cost). |
| Cavalry Spawner | 12 | `unlock_cavalry_spawner` | Spawns a Cavalry unit per full rotation (12 gold cost). |
| Slime Spawner | 5 | `unlock_slime_spawner` | Spawns a Slime unit per full rotation (2 gold cost -- cheap and spammable). Slimes deal no damage and never stop to fight; they pile up and physically clog the lane, then burst into a slowing puddle on death. |
| Crossbow Spawner | 6 | `unlock_crossbow_spawner` | Spawns a Crossbow unit per full rotation (6 gold cost). Ranged skirmisher: same per-hit damage as Infantry, lower DPS, stops and shoots instead of closing to melee. |
| Sentry Spawner | 8 | `unlock_sentry` | Spawns a Sentry unit per full rotation (10 gold cost). Pulses true-sight as it marches, revealing hidden enemy mines early. |
| Iron Guard Spawner | 8 | `unlock_iron_guard_spawner` | Spawns an Iron Guard unit per full rotation (8 iron cost). |
| Crystal Sentinel Spawner | 6 | `unlock_crystal_sentinel_spawner` | Spawns a Crystal Sentinel unit per full rotation (6 crystal cost). |
| Aether Phantom Spawner | 5 | `unlock_aether_phantom_spawner` | Spawns an Aether Phantom unit per full rotation (5 aether cost). |
| Researcher | 0 | _from start_ | Advances current research on each full rotation. Larger gears research faster. |
| Iron Converter | 0 | `iron_to_gold` | Converts iron into gold on each full rotation. Larger gears convert more. |
| Crystal Converter | 0 | `crystal_to_gold` | Converts crystal into gold on each full rotation at a favorable rate. |
| Aether Converter | 0 | `aether_to_gold` | Converts aether into gold on each full rotation at the best rate. |
| Crossbow Turret | 5 | `crossbow_turret_tech` | Defensive turret. Each rotation buys 1 ammo bolt (2 gold). Fires quickly at nearby enemies; low damage, medium range. |
| Artillery Turret | 8 | `artillery_turret_tech` | Heavy turret. Each rotation buys 1 ammo shell (6 gold). Fires slowly with AoE; high damage, long range. |
| Minelayer | 6 | `unlock_minelayer` | Each rotation buys 1 mine shell (5 gold). Lobs a mine into a zone ahead of it; mines arm after a short delay, then hide from the enemy until triggered. |
| Healer | 0 | `healer_gear_tech` | Emits a healing aura on each full rotation. Heals nearby friendly gears and units. Aura size and healing scale with gear size. |
| Sentry Gear | 6 | `unlock_sentry` | Pulses true-sight on each full rotation, revealing hidden enemy mines within its radius early. Stationary counter to the Minelayer. |
| Relief Valve | 8 | `unlock_relief_valve` | A clutch built to take a jam for the chain instead of breaking. Sharply reduces its own jam damage, and softens jam damage on a meshed neighbour too. |
| Sapper Spawner | 6 | `unlock_sapper_spawner` | Spawns a Sapper unit per full rotation (9 gold cost). Weak against other units, but its hits against gears count for 6x -- built to breach a turtled defense. |
| Skirmish Diver Spawner | 6 | `unlock_skirmish_diver_spawner` | Spawns a Skirmish Diver unit per full rotation (9 gold cost). Fast flanker that punishes Artillery, Crystal Sentinel and Crossbow for stopping to shoot -- loses hard to anything that can also close on it. |
| Saboteur Spawner | 6 | `unlock_saboteur_spawner` | Spawns a Saboteur unit per full rotation (10 gold cost). Fouls an enemy gear's rotation on contact instead of damaging it -- attacks the machine's speed, not its health. |
| Raider Spawner | 6 | `unlock_raider_spawner` | Spawns a Raider unit per full rotation (10 gold cost). Disables an enemy miner or converter within the lane for a few seconds instead of damaging it. |
| Field Medic Spawner | 6 | `unlock_field_medic_spawner` | Spawns a Field Medic unit per full rotation (8 gold cost). Marches with the army, healing nearby allied units on a pulse. Never fights. |
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
| Crossbow turret range | `size(teeth) × 4 × 0.75` | 36 px | linear -- always 0.75x the mobile Crossbow's own range |
| Artillery turret range | `size(teeth) × 10 × 0.8` | 96 px | linear -- always 0.8x the mobile Artillery's own range |
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

### Spawners — infantry, artillery, cavalry, iron guard, crystal sentinel, aether phantom, crossbow, sentry, sapper, skirmish diver, saboteur, raider, field medic

**Intent.** The only door units come through. Pinning production to a spawner gear is what makes the army a property of the machine rather than a purchase — you cannot buy a wave, you can only build something that produces one.

**Player decision.** Every spawner is a standing cost: it charges its unit's price *on every rotation*, so a fast chain with an expensive spawner will bankrupt you. Spawner size and chain speed are an economic decision as much as a military one.

**Behaviour.** One unit per rotation, paid in that unit's resource, scaled by the spawner's teeth. If the resource is short, nothing spawns and a "No <resource>!" note appears.

**Status.** Implemented. See [Units](units.md) for what each produces.

There are fourteen spawner gears and eighteen unit types. The remaining four — `mixed` and the three elites — have no spawner of their own; instead the three core spawners (infantry/artillery/cavalry) produce them under the right conditions. See [Units](units.md) for exactly what those conditions are.

---

## Force-multiplier gears

### Amplifier

**Intent.** The reward for building a *deep* chain rather than a wide one — a gear that produces nothing itself and makes every gear already on the chain do its job more often.

**Behaviour.** Multiplies the chain's total motor torque by 1.4×, stacking per amplifier present. Since ω = torque / inertia, this directly speeds up the whole chain: every gear on it — spawner, miner, researcher, turret — rotates faster, so `gear:full_rotation` fires more often everywhere. A burnt-out amplifier is excluded from the chain traversal entirely and contributes nothing.

**Status.** Implemented. This is a change from an earlier version: the multiplier used to feed an unbanked "chain power" figure consumed only by the capacitor burst, so an amplifier in a chain with no capacitor changed nothing a player could observe. It now speeds up the chain directly, whether or not a capacitor is present.

### Capacitor

**Intent.** Rewards patience and uptime. It converts sustained rotation into a periodic gold payout, and it is the gear that gives raw chain throughput — motor output, boosted by burst-yield research — a purpose beyond spinning.

**Player decision.** Spend space and speed on a gear that produces nothing for seven rotations out of eight.

**Behaviour.** Counts rotations; every 8th pays out gold worth the chain's motor output × 2.5, credited directly to the owner. A capacitor meshed to a live overclock gear pays 3.5× instead. Amplifiers do not affect the payout amount — their job is chain speed, so a chain benefits from an amplifier once (faster bursts), not twice (bigger bursts too).

**Status.** Implemented, including the gold credit. Previously the burst emitted only an event nothing but camera shake, particles, sound and floating text subscribed to — a satisfying flash worth exactly zero.

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

### Minelayer

**Intent.** Ranged defence that punishes the opponent's information, not their position — unlike a turret, it never aims at a target. It seeds a zone ahead of it with hidden explosives, so an enemy either scouts carefully or accepts the risk of the ground itself. It sits next to Spiked in the tech chain and costs a little more, as the early, cheap answer to "how do I make my lane dangerous before I can afford turrets."

**Player decision.** Because a mine's payoff depends on the enemy not knowing it's there, a minelayer is at its best on a lane the opponent hasn't yet approached — laid reactively once a threat is already close, its mines arm too late to matter.

**Behaviour.** Each rotation buys one mine shell (5 gold, fed the same way turret ammo is). On cooldown, it lobs a shell in an artillery-style arc to a random point within a zone ahead of it — never at a specific enemy — provided that point isn't within `mineRadius(teeth) × 1.5` of one of its own existing mines; if the zone is too crowded, it holds its ammo and tries again next tick. A landed mine is a small visible marker for 1.5s while it arms, then — the one place in the game with real per-side visibility — disappears from the opposing owner's view entirely (visible in spectate and practice, where there's no "enemy" to hide it from). It detonates in an artillery-style area burst on contact with an enemy unit, or when caught in another explosion's blast radius (a mine can be chain-detonated by a nearby artillery shell or an Iron Guard's death blast). Mine size and damage scale with the teeth of the minelayer that fired it.

**Status.** Implemented.

### Healer

**Intent.** Makes a defensive position sustainable, converting rotation into repair so a machine under sustained pressure can hold without the player intervening.

**Behaviour.** Each rotation heals all friendly gears and units within `radius × 3`, for `teeth × 1.5` each.

**Status.** Implemented.

### Sentry

**Intent.** The stationary counter to the Minelayer's hidden mines — mines are the one place in the game with genuine per-side visibility, and a Sentry is how a player answers that without having to guess. Its mobile counterpart is the [Sentry Unit](units.md#sentry-unit); both emit the identical pulse.

**Behaviour.** Each rotation, pulses true-sight in a radius (same radius formula as the Healer's aura, `radius × 3`), revealing any hidden enemy mine caught in it to its owner for a few seconds.

**Status.** Implemented.

### Relief Valve

**Intent.** A gear built to take a jam for the chain instead of the chain breaking — see [Balance](balance.md#jamming) for the damage model it modifies. Placed near a jam-prone chokepoint (an odd-cycle-heavy layout), it turns a jam from "something breaks" into "something absorbs it."

**Behaviour.** While jammed itself, its own jam damage is cut sharply (85% reduction). A jammed gear meshed directly to a live Relief Valve also takes reduced jam damage (40% reduction) — the valve softens the shock for its neighbour, not just itself.

**Status.** Implemented.

---

## Adjacency

Gears do not have a general adjacency-bonus system — a gear's neighbours matter only where a specific mechanic reads them directly:

- **Amplifier** boosts the whole chain's torque structurally (see above), not as a bonus tied to being next to a motor.
- **Capacitor beside a live Overclock** bursts at 3.5× instead of 2.5× — the one genuine adjacency effect in the game, checked directly in the burst calculation.

An earlier version of the game declared a broader `GearDefinition.synergies` list (a motor↔amplifier adjacency bonus, plus this same capacitor↔overclock one) that nothing ever read. It has been removed rather than wired up: the amplifier's new whole-chain mechanism already does that job better than a neighbour-only bonus would.

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
