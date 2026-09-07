# Tech tree

[← Game Design Document](../GAME_DESIGN.md)

Research is the second economy. Gold buys gears *now*; research buys the ability to build different gears *later*, and takes real time to arrive.

---

## Intent

The tech tree exists to answer one question repeatedly: **spend on the board, or spend on the future?** Gold spent researching is gold not spent placing, and research takes time during which your opponent may simply be producing more units. A player who never researches is capped at motors and infantry spawners; a player who over-researches loses to a machine that already exists.

Three properties support that:

- **Both sides research independently.** The AI has its own tech state and its own priorities.
- **Research can be queued**, and is paid for at queue time — so committing to a plan is a real gold commitment, not an intention.
- **Rotation can buy time.** A researcher gear converts chain speed into research progress, which is how a strong machine converts into a strong tech position without touching gold.

Research runs on game time, so pausing genuinely pauses it, and game speed scales it along with everything else.

<!-- BEGIN GENERATED: tech.summary -->
| Column | Nodes | Total gold | Total research time |
|---|---|---|---|
| Gears | 14 | 1255 | 642s |
| Units | 18 | 945 | 890s |
| Economy | 13 | 865 | 612s |
| Abilities | 2 | 100 | 60s |
| Defense | 11 | 670 | 444s |
| **All** | **58** | **3835** | **2648s** |
<!-- END GENERATED: tech.summary -->

## Shape

Five columns, each a separate strategic axis, and three tiers of depth. Columns are deliberately near-independent — you can go deep in one or spread across several — with only three cross-column dependencies (Super Amplifier needs an economy node; the resource spawners need their mining nodes; the Saboteur Spawner needs Relief Valve, on the reasoning that understanding a jam well enough to build a clutch for one is also what it takes to cause one deliberately).

Tiers gate escalation: a tier-3 node is a long, expensive commitment that pays off only in a long match.

---

## Gears column

**Intent.** Improve the machine itself — bigger gears, better multipliers, longer overclock windows. This is the column for a player who wants to win the engineering game rather than out-produce.

The **Gear Precision** line is the backbone: each node unlocks larger tooth counts, and since every gear property scales from teeth, it is the broadest upgrade in the game.

<!-- BEGIN GENERATED: tech.gears -->
| Node | Tier | Gold | Time | Requires | Effects |
|---|---|---|---|---|---|
| **Basic Amplifier**<br>`basic_amplifier` | T1 | 20 | 15s | — | `unlock_gear` (gearType=amplifier) |
| **Basic Capacitor**<br>`basic_capacitor` | T1 | 25 | 18s | — | `unlock_gear` (gearType=capacitor) |
| **Basic Overclock**<br>`basic_overclock` | T1 | 30 | 21s | — | `unlock_gear` (gearType=overclock) |
| **Gear Precision I**<br>`gear_precision_1` | T1 | 40 | 24s | — | `unlock_teeth` (teeth=12) |
| **Relief Valve**<br>`unlock_relief_valve` | T2 | 50 | 30s | `gear_precision_1` | `unlock_gear` (gearType=relief_valve) |
| **Capacitor Upgrade**<br>`capacitor_upgrade` | T2 | 60 | 36s | `basic_capacitor` | `capacitor_burst_multiplier` (value=1) |
| **Extended Overclock**<br>`extended_overclock` | T2 | 60 | 36s | `basic_overclock` | `overclock_duration_bonus` (value=5000) |
| **Gear Precision II**<br>`gear_precision_2` | T2 | 80 | 36s | `gear_precision_1` | `unlock_teeth` (teeth=18) |
| **Gear Precision III**<br>`gear_precision_3` | T2 | 120 | 45s | `gear_precision_2` | `unlock_teeth` (teeth=27) |
| **Combo Chain Bonus**<br>`combo_chain_bonus` | T3 | 110 | 66s | `super_amplifier` | `chain_combo_bonus` (value=0.25) |
| **Super Amplifier**<br>`super_amplifier` | T3 | 120 | 75s | `gear_precision_3`<br>`power_efficiency_2` | `power_bonus_pct` (value=0.33) |
| **Gear Precision IV**<br>`gear_precision_4` | T3 | 160 | 60s | `gear_precision_3` | `unlock_teeth` (teeth=40) |
| **Overclock Mastery**<br>`overclock_mastery` | T3 | 180 | 105s | `extended_overclock` | `overclock_duration_bonus` (value=15000)<br>`enable_ability` (abilityId=overclock_no_burnout) |
| **Gear Precision V**<br>`gear_precision_5` | T3 | 200 | 75s | `gear_precision_4` | `unlock_teeth` (teeth=40) |
<!-- END GENERATED: tech.gears -->

`Combo Chain Bonus` (110 gold, 66 s) grants `chain_combo_bonus`: a second, gear-type-agnostic way into the same "big chain spins faster" territory the Amplifier occupies. Any chain of 4+ gears on a side that has researched it gets its total motor torque multiplied by `1 + 0.25`, composing with further Combo Chain research the same way Capacitor Burst and Overclock Duration bonuses do.

`Overclock Mastery`'s "duration doubled" text is accurate, not a mismatch: its hard prereq `Extended Overclock` always puts a player at 15s of boost time before this node can be researched, and its own flat +15s takes that to 30s — exactly double. `Super Amplifier`'s description was corrected instead of the code: it grants +33% capacitor burst yield, and despite the name does not touch the Amplifier gear's own torque multiplier, which is fixed at 1.4×. See [Gears](gears.md#amplifier).

## Units column

**Intent.** Widen the roster, which is what makes the counter triangle playable — a player with only infantry cannot respond to being countered.

<!-- BEGIN GENERATED: tech.units -->
| Node | Tier | Gold | Time | Requires | Effects |
|---|---|---|---|---|---|
| **Infantry Training**<br>`unlock_infantry` | T1 | 15 | 12s | — | `unit_hp_pct` (unitType=infantry, value=0.2) |
| **Quick March**<br>`infantry_speed` | T1 | 15 | 12s | `unlock_infantry` | `unit_speed_pct` (unitType=infantry, value=0.2) |
| **Slime Spawner**<br>`unlock_slime_spawner` | T1 | 20 | 30s | — | `unlock_gear` (gearType=slime_spawner)<br>`unlock_unit` (unitType=slime) |
| **Artillery Spawner**<br>`unlock_artillery_spawner` | T1 | 25 | 45s | — | `unlock_gear` (gearType=artillery_spawner)<br>`unlock_unit` (unitType=artillery) |
| **Crossbow Spawner**<br>`unlock_crossbow_spawner` | T1 | 25 | 36s | — | `unlock_gear` (gearType=crossbow_spawner)<br>`unlock_unit` (unitType=crossbow) |
| **Cavalry Spawner**<br>`unlock_cavalry_spawner` | T1 | 30 | 54s | — | `unlock_gear` (gearType=cavalry_spawner)<br>`unlock_unit` (unitType=cavalry) |
| **Iron Guard Spawner**<br>`unlock_iron_guard_spawner` | T2 | 20 | 36s | `unlock_iron_mining` | `unlock_gear` (gearType=iron_guard_spawner)<br>`unlock_unit` (unitType=iron_guard) |
| **Sapper Spawner**<br>`unlock_sapper_spawner` | T2 | 30 | 40s | `unlock_infantry` | `unlock_gear` (gearType=sapper_spawner)<br>`unlock_unit` (unitType=sapper) |
| **Raider Spawner**<br>`unlock_raider_spawner` | T2 | 30 | 42s | `unlock_infantry` | `unlock_gear` (gearType=raider_spawner)<br>`unlock_unit` (unitType=raider) |
| **Skirmish Diver Spawner**<br>`unlock_skirmish_diver_spawner` | T2 | 35 | 42s | `unlock_cavalry_spawner` | `unlock_gear` (gearType=skirmish_diver_spawner)<br>`unlock_unit` (unitType=skirmish_diver) |
| **Cavalry Charge**<br>`cavalry_charge` | T2 | 65 | 39s | `unlock_cavalry_spawner` | `unit_speed_pct` (unitType=cavalry, value=0.3)<br>`unit_damage_pct` (unitType=cavalry, value=0.15) |
| **Elite Infantry**<br>`elite_infantry_unlock` | T2 | 70 | 42s | `unlock_infantry`<br>`infantry_speed` | `unlock_unit` (unitType=elite_infantry) |
| **Crystal Sentinel Spawner**<br>`unlock_crystal_sentinel_spawner` | T3 | 50 | 75s | `unlock_crystal_mining` | `unlock_gear` (gearType=crystal_sentinel_spawner)<br>`unlock_unit` (unitType=crystal_sentinel) |
| **Saboteur Spawner**<br>`unlock_saboteur_spawner` | T3 | 65 | 55s | `unlock_relief_valve` | `unlock_gear` (gearType=saboteur_spawner)<br>`unlock_unit` (unitType=saboteur) |
| **Elite Artillery**<br>`elite_artillery_unlock` | T3 | 100 | 60s | `unlock_artillery_spawner`<br>`elite_infantry_unlock` | `unlock_unit` (unitType=elite_artillery) |
| **Elite Cavalry**<br>`elite_cavalry_unlock` | T3 | 100 | 60s | `cavalry_charge`<br>`elite_infantry_unlock` | `unlock_unit` (unitType=elite_cavalry) |
| **Aether Phantom Spawner**<br>`unlock_aether_phantom_spawner` | T3 | 100 | 120s | `unlock_aether_mining` | `unlock_gear` (gearType=aether_phantom_spawner)<br>`unlock_unit` (unitType=aether_phantom) |
| **Total War**<br>`total_war` | T3 | 150 | 90s | `elite_infantry_unlock`<br>`elite_artillery_unlock`<br>`elite_cavalry_unlock` | `unit_damage_pct` (unitType=infantry, value=0.2)<br>`unit_damage_pct` (unitType=artillery, value=0.2)<br>`unit_damage_pct` (unitType=cavalry, value=0.2)<br>`unit_damage_pct` (unitType=mixed, value=0.2)<br>`unit_damage_pct` (unitType=elite_infantry, value=0.2)<br>`unit_damage_pct` (unitType=elite_artillery, value=0.2)<br>`unit_damage_pct` (unitType=elite_cavalry, value=0.2)<br>`unit_damage_pct` (unitType=iron_guard, value=0.2)<br>`unit_damage_pct` (unitType=crystal_sentinel, value=0.2)<br>`unit_damage_pct` (unitType=aether_phantom, value=0.2) |
<!-- END GENERATED: tech.units -->

Note that the elite unlocks and `Total War` sit at the end of long chains, so roster escalation is a late-match phenomenon by design. Researching an elite node doesn't unlock a new gear — it changes what the matching core spawner produces once its chain reaches combo size (4+ gears). See [Units](units.md) for the exact rule.

## Economy column

**Intent.** Compound returns. The gold line is a straight income increase; the mining line opens a parallel resource economy that requires *machine* investment (miners and converters) to realise, with each tier converting at a better rate than the last.

The two lines are a genuine choice: gold nodes pay immediately and passively, mining nodes pay more but only if you build for them.

**All three mining nodes are researchable in parallel from the start** — Iron, Crystal, and Aether Mining share no prerequisite chain between them, so a player can diversify into any resource, or several at once, as soon as they can afford the research. This was previously a strict `iron → crystal → aether` gate; removing it is deliberate, in service of letting players (and the AI) explore build variety early rather than being funneled down one mining line before the others even unlock. Their gold/time costs are priced standalone rather than assuming prior mining investment: Aether Mining in particular costs meaningfully more than it used to (150g/110s, up from 100g/75s) precisely because reaching it is no longer proof you already built iron and crystal infrastructure — rushing straight to the best conversion rate is now a real, expensive gamble rather than a late-game payoff for earlier investment.

<!-- BEGIN GENERATED: tech.economy -->
| Node | Tier | Gold | Time | Requires | Effects |
|---|---|---|---|---|---|
| **Gold Mining I**<br>`gold_mining_1` | T1 | 15 | 12s | — | `gold_bonus_per_sec` (value=1) |
| **Power Efficiency I**<br>`power_efficiency_1` | T1 | 20 | 15s | — | `power_bonus_pct` (value=0.1) |
| **Iron Mining**<br>`unlock_iron_mining` | T1 | 20 | 24s | — | `unlock_gear` (gearType=iron_miner) |
| **Crystal Mining**<br>`unlock_crystal_mining` | T1 | 45 | 40s | — | `unlock_gear` (gearType=crystal_miner) |
| **Aether Mining**<br>`unlock_aether_mining` | T1 | 150 | 110s | — | `unlock_gear` (gearType=aether_miner) |
| **Iron Smelting**<br>`iron_to_gold` | T2 | 35 | 30s | `unlock_iron_mining` | `unlock_gear` (gearType=iron_converter) |
| **Gold Mining II**<br>`gold_mining_2` | T2 | 45 | 27s | `gold_mining_1` | `gold_bonus_per_sec` (value=2) |
| **Power Efficiency II**<br>`power_efficiency_2` | T2 | 55 | 33s | `power_efficiency_1` | `power_bonus_pct` (value=0.15) |
| **Crystal Refining**<br>`crystal_to_gold` | T3 | 60 | 54s | `unlock_crystal_mining`<br>`iron_to_gold` | `unlock_gear` (gearType=crystal_converter) |
| **Gold Mining III**<br>`gold_mining_3` | T3 | 80 | 42s | `gold_mining_2` | `gold_bonus_per_sec` (value=3) |
| **Aether Transmutation**<br>`aether_to_gold` | T3 | 90 | 75s | `unlock_aether_mining`<br>`crystal_to_gold` | `unlock_gear` (gearType=aether_converter) |
| **Gold Empire**<br>`gold_empire` | T3 | 120 | 72s | `gold_mining_3` | `gold_bonus_per_sec` (value=5) |
| **Power Overdrive**<br>`power_overdrive` | T3 | 130 | 78s | `power_efficiency_2`<br>`capacitor_upgrade` | `power_bonus_pct` (value=0.25) |
<!-- END GENERATED: tech.economy -->

## Abilities column

**Intent.** A small set of one-off interventions — the only place in the game where a player acts directly rather than through the machine. Deliberately thin, because direct action fights [pillar 1](../GAME_DESIGN.md#1-the-machine-is-the-strategy).

<!-- BEGIN GENERATED: tech.abilities -->
| Node | Tier | Gold | Time | Requires | Effects |
|---|---|---|---|---|---|
| **Counter Intelligence**<br>`counter_intel` | T1 | 40 | 24s | — | `enable_ability` (abilityId=counter_intel) |
| **Gold Surge**<br>`power_surge` | T2 | 60 | 36s | `power_efficiency_1` | `enable_ability` (abilityId=power_surge) |
<!-- END GENERATED: tech.abilities -->

### Abilities

<!-- BEGIN GENERATED: abilities -->
| Ability | Kind | Cooldown | Description |
|---|---|---|---|
| Gold Surge | active | 60s | Instantly gain 30 gold. |
| Counter Intel | passive | — | Passively reveals the AI's last sent unit type. |
| Overclock Mastery | passive | — | Player Overclock gears never burn out. |
<!-- END GENERATED: abilities -->

`enable_ability` only applies when the owner is the player (`TechSystem.ts:228`). This looks asymmetric but is not a gap: the AI never touches the player-only `AbilitySystem` object at all. It gates its own ability use directly against researched tech in `AIController.tryUseAbilities`, independent of this effect — see [Units](units.md#the-ai-opponent).

## Defense column

**Intent.** Buy time. Fortification raises base HP directly; the defensive gears make ground expensive to cross. This is the column that lets a slower economy survive to reach its late game.

<!-- BEGIN GENERATED: tech.defense -->
| Node | Tier | Gold | Time | Requires | Effects |
|---|---|---|---|---|---|
| **Base Fortification**<br>`base_fortification` | T1 | 30 | 24s | — | `base_hp_bonus` (value=20) |
| **Spiked Gears**<br>`spiked_gears` | T1 | 45 | 27s | — | `unlock_gear` (gearType=spiked) |
| **Field Medic Spawner**<br>`unlock_field_medic_spawner` | T2 | 40 | 48s | `armored_gears` | `unlock_gear` (gearType=field_medic_spawner)<br>`unlock_unit` (unitType=field_medic) |
| **Armored Gears**<br>`armored_gears` | T2 | 45 | 27s | `base_fortification` | `unlock_gear` (gearType=armored) |
| **Sentry**<br>`unlock_sentry` | T2 | 50 | 33s | `spiked_gears` | `unlock_gear` (gearType=sentry_gear)<br>`unlock_gear` (gearType=sentry_spawner)<br>`unlock_unit` (unitType=sentry_unit) |
| **Crossbow Turret**<br>`crossbow_turret_tech` | T2 | 55 | 36s | `spiked_gears` | `unlock_gear` (gearType=crossbow_turret) |
| **Minelayer**<br>`unlock_minelayer` | T2 | 55 | 33s | `spiked_gears` | `unlock_gear` (gearType=minelayer) |
| **Healing Gear**<br>`healer_gear_tech` | T2 | 60 | 42s | `armored_gears` | `unlock_gear` (gearType=healer) |
| **Fortress Wall**<br>`fortress_wall` | T2 | 80 | 48s | `base_fortification`<br>`armored_gears` | `base_hp_bonus` (value=50) |
| **Artillery Turret**<br>`artillery_turret_tech` | T3 | 90 | 66s | `crossbow_turret_tech` | `unlock_gear` (gearType=artillery_turret) |
| **Heavy Fortification**<br>`heavy_fortification` | T3 | 120 | 60s | `fortress_wall` | `base_hp_bonus` (value=80) |
<!-- END GENERATED: tech.defense -->

---

## What the effects do

The declared effect kinds, and their real semantics.

| Effect | Meaning | Status |
|---|---|---|
| `unlock_teeth` | Adds tooth counts to the side's available sizes | Implemented |
| `unlock_unit` | Marks a unit type usable | Implemented — but **global, not per side** |
| `power_bonus_pct` | Raises chain output, accumulating per side | Implemented |
| `gold_bonus_per_sec` | Raises passive income for that side | Implemented |
| `unit_hp_pct` / `unit_speed_pct` / `unit_damage_pct` | Buffs one unit type for that side | Implemented, per owner |
| `base_hp_bonus` | Raises that side's base max HP and current HP | Implemented |
| `overclock_duration_bonus` | Extends that side's overclock boost window | Implemented |
| `capacitor_burst_multiplier` | Adds to that side's burst multiplier, composing with prior nodes | Implemented |
| `enable_ability` | Unlocks an ability | Implemented, **player only by design** — see below |
| `unlock_gear` | No-op by design; gating reads `def.unlockNode` directly | Intentional no-op |
| `chain_combo_bonus` | Intended to reward long chains | **No-op** |

`unlock_gear` is deliberately an empty case (`TechSystem.ts:181`): gear gating works by reading `def.unlockNode` directly at placement time, so the effect list documents intent without being the mechanism.

`enable_ability` only applies for the player because `AbilitySystem` is a player-only object — the AI never touches it. It gates its own ability use directly against researched tech instead, independent of this effect. See [Units](units.md#the-ai-opponent).

`unlock_unit` unlocks for both sides at once, by design comment but likely not by intent — one side's research widens the other side's roster.

---

## Research mechanics

| Rule | Behaviour |
|---|---|
| Cost | Charged up front, including for queued nodes |
| Time | Real research time, on the game clock — pausing pauses it, game speed scales it |
| Queue | One node in progress; the rest wait and auto-advance on completion |
| Cancel | Refunds the full gold cost |
| Acceleration | Researcher gears rewind the progress clock by `teeth × 150` ms per rotation |
| Prerequisites | All prereqs must be *researched*, not merely queued |
