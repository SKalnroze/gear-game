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

**Starting position.** 30 gold, +2 gold/sec, and three unlocked gears: motor, infantry spawner, researcher. Both sides also start with a free, pre-placed motor + crossbow tower behind it, meshed and already defending the lane — a pure buff on top of the gold/income above, not paid for out of the opening purse. Either side may sell them like any placed gear if they'd rather have the gold. This directly shortens the previously-uncontested opening: without it, the first defended position took as long as a player chose to build one; the free tower means an early rush is never entirely free to walk in.

**The first build.** A gear costs `10 + teeth × 0.5`, so a 10-tooth gear is 15 gold. Motor plus infantry spawner is exactly 30 gold — **the starting purse buys precisely one working machine and nothing else.** That is a deliberate opening: there is exactly one sensible first move.

**What it produces.** Two gears, so ω = 2.037 rad/s → **0.324 rotations/sec**, one infantry every 3.08 s.

**What it costs to run.** The spawner charges its unit's price every rotation: 5 gold × 0.324 = **1.62 gold/sec** against 2.00 gold/sec of income. Net **+0.38 gold/sec** — the opening machine is barely profitable, which is the pressure that forces the first real decision at around the 40-second mark, when you can afford a third gear.

**What that third gear costs you.** Adding any gear drops the chain to 0.216 rot/s. Unit output falls by a third; spend falls to 1.08 gold/sec, so net income rises to +0.92. The player is choosing between *army now* and *savings for a bigger machine*.

**Time to win.** A base has 100 HP and an infantry deals 3 on arrival, so **34 infantry** end a match. At the opening rate that is 105 seconds of completely uncontested arrivals — the floor on match length, before any defence exists — though the free starting tower above now contests the very earliest arrivals.

### Reading the trend, not just the total

The resource row (`SlidingPanel`) shows each resource's raw total alongside a trailing-average rate — e.g. `G 42 (+1.8/s)` — computed over the last 60 seconds of *organic* change: passive income, mining, converting, spawner upkeep, ammo/repair costs. Manual, discrete actions (placing or selling a gear, spending or cancelling research, using an ability) are deliberately excluded from the sample, so the number answers "what is my machine doing for me right now," not "what did I just spend on that gear." The rate is omitted once it's negligible (under 0.05/sec) rather than showing a misleading `+0.0/s`.

---

## Where the economy still has rough edges

Reading the numbers against the intent turns up two problems worth recording.

### Ore beats gold decisively once converters arrive

A miner produces `teeth × 0.3` ore per rotation; a converter turns `teeth × 0.25` ore into gold at ×2 (iron), ×3 (crystal), ×6 (aether). At 10 teeth, an iron miner and iron converter on a 4-gear chain produce 0.162 rot/s × 2.5 ore = 0.41 ore/sec, converting to 0.81 gold/sec — worse than the 2/sec baseline. But at aether's ×6 the same pair yields 2.4 gold/sec, doubling passive income, and tooth count scales it linearly with no speed penalty.

The intended shape — deeper resources pay better — holds. The risk is the **absence of an upper bound**: since bigger gears cost speed nothing, a large aether chain scales without limit.

### Gear Precision has no trade-off

Already noted [above](#the-physics-result-that-governs-everything): reflected inertia cancels teeth entirely, so Gear Precision buys output, HP and range with zero cost in chain speed. Restated here because it is the clearest single balance lever in the game — see [tuning levers](#tuning-levers) below.

---

## Gear placement

| | |
|---|---|
| Formula | `10 + teeth × 0.5` gold, rounded once |
| At 10 teeth | 15 gold |
| At 60 teeth | 40 gold |
| Sell refund | half, rounded up |

A single function (`gearPlacementCost` in `balance.constants.ts`) is the only place this formula is computed — the player's charge, every UI price tag, the AI's affordability checks and its sell refund all call it. It used to be reimplemented five times, two of them wrong: one hardcoded copy charged the unrounded price while the UI displayed a rounded one, so an odd tooth count showed a price 0.5 gold from what it actually cost.

Placement cost is **linear** in teeth while almost everything a gear does scales linearly or better — output linearly, HP and torque quadratically. Large gears are therefore cheap for what they deliver, which is the same "bigger is better" shape noted above.

Gears no longer carry a power cost at all — see below.

## Power was deleted, not fixed

Every gear used to declare a `basePowerCost`, and the HUD's language implied power was something you banked and spent. It never was: the tracked resources have only ever been gold, iron, crystal and aether, and chain "output" was a number computed in detail that fed a capacitor-burst event nothing consumed.

Rather than build a fifth resource to justify that language, the language was removed. `basePowerCost` and the formula that scaled it are gone from the codebase entirely — placement has always been gold-only in practice, and now it is gold-only in the text too. The number that used to be called "power" is now framed for what it actually is: **chain motor output**, which feeds the capacitor's burst-yield calculation and nothing else. Motor and amplifier descriptions no longer mention power at all — the motor drives torque, the amplifier multiplies it, and the capacitor turns the chain's output into gold. See [Gears](gears.md#force-multiplier-gears) for the current mechanics.

---

## The win condition

| | |
|---|---|
| Base HP | 100, both sides, raised by fortification research |
| Damage source | **Only** a unit walking into the base |
| Damage amount | The unit's base damage stat, 3–16 |
| End | First base to 0 |

**Confirmed design, not a gap.** Nothing but a unit walking into the base can damage it (`WinConditionSystem.ts:40`) — turrets, projectiles, spiked gears and explosions all stop at 0 HP on the gear or unit they hit and never touch base HP. This was flagged and reconsidered: the alternative is any of those sources chipping the base directly, giving a pure-defence machine with no spawners a route to win. The kept design is deliberate — [pillar 1](../GAME_DESIGN.md#1-the-machine-is-the-strategy) is "the machine is the strategy," and production is the one thing every machine must eventually point at. A defensive build can refuse to lose; it cannot win without also building something that spawns.

---

## Jamming

A jam (two meshed gears required to turn in opposing directions — see [the vocabulary](../GAME_DESIGN.md#vocabulary)) now reads its severity, not just its presence. `jamSeverity(stress)` (`balance.constants.ts`) normalizes a jam's stress value to 0-1 against `JAM_SEVERE_STRESS`, and that number drives:

- **The jam ring's pulse.** Faster and brighter for a severe jam, slower and dimmer for a light one, instead of a flat on/off ring (`GearEntity.startJamTween`).
- **The jam sound's volume and pitch.** `SoundManager.playGearJam(severity)` grinds louder and lower for a harder crush.

**Relief Valve** (see [Gears](gears.md#relief-valve)) is the strategic answer to a jam-prone layout: it reduces jam damage sharply for itself, and softens it for a directly-meshed jammed neighbour, so a chokepoint can be reinforced instead of just accepting the eventual break.

This is deliberately a lighter-weight pass on top of the existing analytical jam model (odd-cycle detection in `RotationPhysicsSystem`), not the full torque-servo rigidbody rework researched alongside it — reading real coupling-force-driven damage (the motor straining against a physical obstruction, not just an odd-cycle contradiction) needs actual Matter.js rigidbodies to be honest about what's being measured, which is still future work (see the [physics migration](gears.md#meshing)).

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
| `SLIME_FRICTION_VALUE` | 30 | friction a slime puddle adds to gears standing in it |
| `AI_POLL_INTERVAL` | 500 | how often the AI re-evaluates the board, ms (actual action rate is throttled by its APM budget, not this) |
| `AI_ACTION_BUDGET_CAPACITY` | 4 | AI action-budget burst allowance, actions |
| `GEAR_PLACEMENT_COST_BASE` | 10 | flat gold per gear |
| `GEAR_PLACEMENT_COST_MULTIPLIER` | 0.5 | gold per tooth |
| `REPOSITION_COOLDOWN_MS` | 3000 | gear move cooldown |
<!-- END GENERATED: balance.constants -->

`AI_APM` (`balance.constants.ts`) sets the AI's actions-per-minute budget per difficulty — its actual difficulty axis, see [Units](units.md#the-ai-opponent):

| Difficulty | APM |
|---|---|
| Easy | 14 |
| Medium | 26 |
| Hard | 42 |

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
