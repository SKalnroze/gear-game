# Balance

[← Game Design Document](../GAME_DESIGN.md)

Why the numbers are what they are, and which ones to reach for when the game feels wrong.

---

## The physics result that governs everything

A chain's speed is `total motor torque ÷ (total reflected inertia + friction)`. Each gear's inertia is weighted by the square of its speed ratio relative to the motor. Work that through:

```
inertia of gear i          = π × (teeth_i × 2.5)² × 0.01
speed ratio of gear i      = teeth_motor / teeth_i
reflected inertia          = inertia × ratio²
                           = π × 6.25 × 0.01 × teeth_i² × (teeth_motor / teeth_i)²
                           = π × 6.25 × 0.01 × teeth_motor²
```

The gear's own tooth count **cancels completely**. Every gear in a chain contributes exactly the motor's own inertia, whatever size it is. And since motor torque is also quadratic in teeth, the motor's size cancels too:

```
ω = (0.8 × teeth_m²) ÷ (n × 0.19635 × teeth_m²) = 4.074 / n  rad/s
```

> ### **Chain speed depends only on how many gears are in the chain. Not on their sizes. Not even on the motor's size.**

| Gears in chain | ω (rad/s) | Rotations/sec | Seconds per rotation |
|---|---|---|---|
| 1 | 4.074 | 0.649 | 1.54 |
| 2 | 2.037 | 0.324 | 3.08 |
| 3 | 1.358 | 0.216 | 4.63 |
| 4 | 1.019 | 0.162 | 6.17 |
| 5 | 0.815 | 0.130 | 7.71 |
| 6 | 0.679 | 0.108 | 9.25 |

Two consequences the design has to live with:

1. **Every gear you add taxes everything already there.** Going from two gears to three cuts production by a third. This is the central tension of the build and it is working as intended — [pillar 2](../GAME_DESIGN.md#2-rotation-is-the-only-clock).
2. **Bigger gears are free speed-wise.** Tooth count buys output, HP, damage and range at no cost in rotation rate — its only cost is gold. That makes the **Gear Precision** research line strictly good, with no trade-off. If tooth count is meant to be a genuine decision rather than a straight upgrade, this is the lever to change: making reflected inertia scale with teeth even slightly would restore the trade.

Adding a **second motor** is the only way to speed a chain up without removing gears: torque sums while inertia grows by one gear, so a second motor in a 3-gear chain takes it from 1.358 to 2.037 rad/s.

---

## Worked example: the opening

The clearest way to read the economy is to follow the first minute.

**Starting position.** 30 gold, +2 gold/sec, and three unlocked gears: motor, infantry spawner, researcher.

**The first build.** A gear costs `10 + teeth × 0.5`, so a 10-tooth gear is 15 gold. Motor plus infantry spawner is exactly 30 gold — **the starting purse buys precisely one working machine and nothing else.** That is a deliberate opening: there is exactly one sensible first move.

**What it produces.** Two gears, so ω = 2.037 rad/s → **0.324 rotations/sec**, one infantry every 3.08 s.

**What it costs to run.** The spawner charges its unit's price every rotation: 5 gold × 0.324 = **1.62 gold/sec** against 2.00 gold/sec of income. Net **+0.38 gold/sec** — the opening machine is barely profitable, which is the pressure that forces the first real decision at around the 40-second mark, when you can afford a third gear.

**What that third gear costs you.** Adding any gear drops the chain to 0.216 rot/s. Unit output falls by a third; spend falls to 1.08 gold/sec, so net income rises to +0.92. The player is choosing between *army now* and *savings for a bigger machine*.

**Time to win.** A base has 100 HP and an infantry deals 3 on arrival, so **34 infantry** end a match. At the opening rate that is 105 seconds of completely uncontested arrivals — the floor on match length, before any defence exists.

---

## Where the economy is unbalanced today

Reading the numbers against the intent turns up three problems worth recording.

### Amplifiers are a pure loss

An amplifier multiplies **chain output**, and chain output is consumed by exactly one thing: the capacitor burst payload, which nothing banks (divergences 6 and 7). So placing an amplifier:

- adds a gear, cutting production by `1/n`
- costs 15+ gold
- changes no number the player can observe

A player who follows the tech tree into Basic Amplifier is buying a downgrade. Any fix to divergence 7 — making burst power a real resource — fixes this at the same time.

### Ore beats gold decisively once converters arrive

A miner produces `teeth × 0.3` ore per rotation; a converter turns `teeth × 0.25` ore into gold at ×2 (iron), ×3 (crystal), ×6 (aether). At 10 teeth, an iron miner and iron converter on a 4-gear chain produce 0.162 rot/s × 2.5 ore = 0.41 ore/sec, converting to 0.81 gold/sec — worse than the 2/sec baseline. But at aether's ×6 the same pair yields 2.4 gold/sec, doubling passive income, and tooth count scales it linearly with no speed penalty.

The intended shape — deeper resources pay better — holds. The risk is the **absence of an upper bound**: since bigger gears cost speed nothing, a large aether chain scales without limit.

### The AI plays a different economy

The AI computes placement costs and checks affordability, but no code path charges it (divergence 12). Its difficulty is therefore tuned against a constraint it does not experience, and any balance conclusion drawn from watching AI-vs-AI matches is suspect.

---

## Gear placement

| | |
|---|---|
| Formula | `10 + teeth × 0.5` gold |
| At 10 teeth | 15 gold |
| At 60 teeth | 40 gold |
| Sell refund | half, rounded up |

Placement cost is **linear** in teeth while almost everything a gear does scales linearly or better — output linearly, HP and torque quadratically. Large gears are therefore cheap for what they deliver, reinforcing the "bigger is strictly better" problem above.

> **⚠ DIVERGENCE** — The formula exists in three places: a hard-coded literal for the player's charge (`GameScene.ts:858`), a rounded copy for the UI price tag (`GearGridSection.ts:10`), and the constants themselves (`balance.constants.ts:18`). The charge is not rounded and the display is, so an odd tooth count displays a price 0.5 gold from what it takes.

> **⚠ DIVERGENCE** — Gears carry a `basePowerCost` and there is a `gearPowerCost()` formula scaling it quadratically, but nothing charges it (`GearSystem.ts:178`). Placement is gold-only. Either power becomes a real second cost — which would give the resource meaning and rebalance large gears — or the field should go.

## Power is not a currency

Every gear declares a power cost, the HUD implies power exists, and chain output is calculated in detail. None of it is stored: the tracked resources are gold, iron, crystal and aether. Chain output exists solely as a figure attached to a capacitor burst event that no system banks.

This single gap explains four divergences (1, 6, 7, 10) and hollows out three gears — amplifier, capacitor, and to a degree the motor, whose `motorOutput` feeds only that unbanked number. Resolving it is the largest open design question in the game. See open question 1 in the [hub](../GAME_DESIGN.md#open-design-questions).

---

## The win condition

| | |
|---|---|
| Base HP | 100, both sides, raised by fortification research |
| Damage source | **Only** a unit walking into the base |
| Damage amount | The unit's base damage stat, 3–16 |
| End | First base to 0 |

> **⚠ DIVERGENCE** — Nothing else can damage a base (`WinConditionSystem.ts:40`). Turrets, projectiles, spiked gears and explosions cannot. A machine with no spawners literally cannot win, only avoid losing, which makes pure-defence builds strategically void rather than merely weak.

---

## Tuning levers

Reach for these first, in roughly this order of impact.

| Lever | Constant | Effect |
|---|---|---|
| Match pace | `INERTIA_DENSITY` | Scales every chain's speed inversely. The single strongest dial in the game — it moves production, income and match length together. |
| Build tax | reflected-inertia weighting | Currently exactly `1/n` per gear. Changing the exponent changes how much a big machine is punished. |
| Opening | `BASE_GOLD_PER_SEC`, starting gold | Sets how long before the second decision. Starting gold is currently exactly the price of the minimum machine. |
| Escalation | `GEAR_PLACEMENT_COST_MULTIPLIER` | Linear today; making it quadratic would price large gears against their quadratic benefits. |
| Match length | `BASE_MAX_HP`, unit base damage | 100 HP ÷ 3 damage = 34 arrivals to win. |
| Aggression | Unit `costAmount` | Directly sets the gold-per-second a spawner burns. |
| Defence value | `ARMORED_DAMAGE_RATE`, `spikeDamage` | How long a wall holds. |
| Research pace | node `researchTime`, `researcherOutput` | How fast the second economy delivers. |

<!-- BEGIN GENERATED: balance.constants -->
| Constant | Value | Governs |
|---|---|---|
| `BASE_GOLD_PER_SEC` | 2 | passive income for both sides |
| `GOLD_TICK_INTERVAL` | 1000 | income tick, ms |
| `BASE_MAX_HP` | 100 | starting base HP |
| `AMPLIFIER_CHAIN_MULTIPLIER` | 1.4 | per-amplifier chain output multiplier |
| `CAPACITOR_BURST_MULTIPLIER` | 2.5 | capacitor burst size |
| `CAPACITOR_BURST_ROTATIONS` | 8 | rotations between bursts |
| `CAPACITOR_OVERCLOCK_BURST_BONUS` | 1 | added to the multiplier beside a live overclock |
| `OVERCLOCK_DURATION` | 10000 | boost window, ms |
| `OVERCLOCK_BURNOUT_DURATION` | 5000 | downtime after burnout, ms |
| `OVERCLOCK_SPEED_BONUS` | 0.5 | omega and torque bonus to neighbours |
| `JAM_DAMAGE_RATE` | 8 | HP/sec per unit of jam stress |
| `JAM_STRESS_MULTIPLIER` | 0.1 | torque → stress |
| `COMBAT_TICK_INTERVAL` | 250 | combat resolution period, ms |
| `ENGAGE_DISTANCE` | 36 | default melee range, px |
| `ARMORED_DAMAGE_RATE` | 0.08 | unit damage to armored gears |
| `UNIT_GEAR_DAMAGE_RATE` | 1 | unit damage to ordinary gears |
| `WRENCH_FRICTION_VALUE` | 30 | friction a wrench adds |
| `AI_DECISION_INTERVAL` | 2000 | AI think period, ms |
| `GEAR_PLACEMENT_COST_BASE` | 10 | flat gold per gear |
| `GEAR_PLACEMENT_COST_MULTIPLIER` | 0.5 | gold per tooth |
| `REPOSITION_COOLDOWN_MS` | 3000 | gear move cooldown |
<!-- END GENERATED: balance.constants -->

> **⚠ DIVERGENCE** — `CAPACITOR_BURST_INTERVAL`, `LARGE_GEAR_GOLD_BONUS` and `AI_INITIAL_DECISION_DELAY` are declared and never read. The first is a remnant of time-based bursting, since replaced by rotation counting; the second describes a per-large-gear income bonus that does not exist.

---

## Unit scaling

Unit stats derive from the spawner's tooth count, calibrated at 10 teeth.

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

The exponents encode the intent that bigger spawners make **fewer, tougher, slower, costlier** units: HP grows faster than linear (1.5) so mass is efficient, speed *falls* (−0.5) so big units arrive later, and cost grows faster than damage (1.3 vs 1.2) so size is not free. Since a bigger spawner does not slow the chain, tooth count on a spawner trades gold and arrival time for durability.
