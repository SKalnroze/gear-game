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
| Artillery | 20 | 40 | 8 | 5 | 8 gold | 100 |
| Cavalry | 40 | 90 | 12 | 8 | 12 gold | 36 |
| Mixed | 35 | 65 | 8 | 10 | 10 gold | 36 |
| Elite Infantry | 60 | 60 | 10 | 6 | 20 gold | 36 |
| Elite Artillery | 40 | 40 | 16 | 10 | 25 gold | 100 |
| Elite Cavalry | 80 | 90 | 24 | 16 | 30 gold | 36 |
| Iron Guard | 80 | 35 | 10 | 12 | 8 iron | 36 |
| Crystal Sentinel | 50 | 55 | 6 | 8 | 6 crystal | 60 |
| Aether Phantom | 25 | 100 | 4 | 6 | 5 aether | 36 |
| Crossbow | 20 | 60 | 5 | 3 | 6 gold | 40 |
| Sentry Unit | 30 | 70 | 2 | 2 | 10 gold | 36 |
| Slime | 10 | 40 | 0 | 0 | 2 gold | 36 |
| Sapper | 45 | 35 | 4 | 4 | 9 gold | 36 |
| Skirmish Diver | 18 | 110 | 7 | 3 | 9 gold | 36 |
| Saboteur | 22 | 55 | 3 | 2 | 10 gold | 36 |
| Raider | 20 | 100 | 3 | 2 | 10 gold | 36 |
| Field Medic | 25 | 65 | 0 | 0 | 8 gold | 36 |
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

### Crossbow

**Intent.** A ranged skirmisher that trades melee's damage-per-hit efficiency for reach — it answers a harasser that closes distance before Infantry can, at the cost of losing hard to anything fast enough to close on *it*.

**Behaviour.** Same per-hit combat damage as Infantry, but a slower cadence (1.8× Infantry's cooldown) means lower DPS for that reach. Detects at 1.5× its attack range, stops and fires a direct hit at attack range instead of closing to melee contact — the same stop-and-shoot shape as Artillery, just much shorter ranged and without the shell arc.

**Status.** Implemented. Its own spawner, `crossbow_spawner`, needs `unlock_crossbow_spawner`.

### Sentry Unit

**Intent.** The mobile half of the stealth counter. Mines are the one hidden thing in the game (see [Minelayer](gears.md#minelayer)); a Sentry answers that by pulsing true-sight as it marches, so a player doesn't have to guess where the opponent's mines are before walking into the lane.

**Behaviour.** Marches like any other unit — no special targeting, weak in a straight fight (low HP and damage; it's a detection tool, not a fighter). Every `sightPulseIntervalMs` (2s) it emits a `sentry:pulse` in a radius around itself; any hidden enemy mine caught in that radius is revealed to its owner for a few seconds. The stationary [Sentry gear](gears.md#sentry) emits the identical pulse on each full rotation, so a base can be defended by either the mobile or the stationary version.

**Status.** Implemented. Its own spawner, `sentry_spawner`, and the Sentry gear both need `unlock_sentry`.

### Slime

**Intent.** The clog unit, and the purest expression of the game's thesis in a different direction from the old anti-machine idea it replaces: instead of attacking anything, it exists to physically be in the way. A pile of slimes blocking the lane is a wall built from bodies, not gear placement.

**Behaviour.** Deals no damage and never stops to fight — always marching, so normal unit-unit collision (unlike Aether Phantom's pass-through) is what lets several of them pile up and slow an advance. Very cheap and low-HP by design, meant to be spammed. On death it bursts into a puddle (`puddleRadius`/`puddleDuration`/`puddleSlowFactor` on its definition) that slows **both sides'** units and adds friction to gears standing in it, then dissipates — unlike a Crystal Sentinel cold zone, which only affects the enemy.

**Status.** Implemented. Its own spawner, `slime_spawner`, needs only `unlock_slime_spawner`.

### Sapper

**Intent.** An answer to a pure-defense turtle. Every unit deals gear damage at the same flat rate regardless of type; Sapper is the one exception, so a player facing a wall of spiked and armored gears has a real tool for breaching it besides raw zerg numbers — attacking the machine directly, the [first pillar](../GAME_DESIGN.md#1-the-machine-is-the-strategy) taken literally.

**Behaviour.** Marches and fights exactly like Infantry (same targeting, same melee loop) — its identity isn't a bespoke AI, it's `UNIT_GEAR_DAMAGE_MULT` (`unit.constants.ts`): every hit it lands on a gear counts for 6× what an Infantry hit would, applied in `GearUnitInteractionSystem`'s contact-damage sites. Below-neutral counter multipliers against every unit type make it a poor choice for a straight fight; that trade is the point.

**Status.** Implemented. Its own spawner, `sapper_spawner`, needs `unlock_sapper_spawner`.

### Skirmish Diver

**Intent.** The counter to a kiting or artillery-heavy build. Cavalry already answers Infantry; Diver answers anything that wins by standing still and shooting — Artillery, Crystal Sentinel, Crossbow — the same way, but from the other side of the triangle.

**Behaviour.** Marches and fights exactly like Infantry — reach isn't the mechanic here, the counter table is: 2.5–3× damage against every stop-and-shoot type, at the cost of losing hard to anything that can also close distance on it (Cavalry, Iron Guard). Fast and fragile, so it either connects before dying or doesn't matter.

**Status.** Implemented. Its own spawner, `skirmish_diver_spawner`, needs `unlock_skirmish_diver_spawner`.

### Saboteur

**Intent.** Attacks a chain's *speed*, not its health — the unit-side counterpart to a jam. Weak in a fight by design, the same as Sentry Unit; its value is entirely in what it does to a gear it reaches, not what it can kill.

**Behaviour.** Seeks the nearest enemy gear in the lane; on contact, on a cooldown, it adds a heavy temporary friction load (`SABOTEUR_FRICTION_AMOUNT`, `UnitSystem.ts`) to that gear instead of dealing HP damage — the same `frictionLoad` field a Crystal Sentinel cold zone or a Slime puddle uses, so it throttles the *whole chain* the gear sits on, not just that one gear. The debuff decays back out after `SABOTEUR_FRICTION_DURATION_MS`. Never fights of its own accord — like Slime and Sentry Unit, CombatSystem's generic engagement handles it being attacked.

**Status.** Implemented. Its own spawner, `saboteur_spawner`, needs `unlock_saboteur_spawner`.

### Raider

**Intent.** The counter to an economy built inside the lane. A miner or converter placed off-lane is already safe from every marching unit in the game; Raider makes placing one *in* the lane for speed or safety elsewhere a real risk, without breaking the rule that a gear off-lane can't be reached at all.

**Behaviour.** Seeks the nearest enemy miner or converter gear *within the lane*; on contact, on a cooldown, it sets `disabledUntil` (`gear.types.ts`) instead of dealing HP damage. `EconomySystem` checks that field on every `gear:full_rotation` and withholds the gear's output entirely until it expires — the gear keeps spinning (and still costs its chain the same reflected inertia), it just doesn't pay out. Never fights of its own accord, same as Saboteur.

**Status.** Implemented. Its own spawner, `raider_spawner`, needs `unlock_raider_spawner`.

### Field Medic

**Intent.** The mobile counterpart to the stationary Healer gear's aura — sustain that travels with a push instead of waiting behind it. Lets a sustain-focused build spend a spawner slot on healing instead of a gear slot, a genuine build trade-off rather than a new mechanic.

**Behaviour.** Marches with the army and never fights (zero damage, like Slime). Every couple of seconds it heals every nearby allied unit below full HP within its radius, mirroring `healerOutput`/`healerRadius` but applied to units directly from the unit's own position rather than a fixed gear.

**Status.** Implemented. Its own spawner, `field_medic_spawner`, needs `unlock_field_medic_spawner`.

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
| Attacker ↓ / Defender → | Infantry | Artillery | Cavalry | Mixed | Elite Infantry | Elite Artillery | Elite Cavalry | Iron Guard | Crystal Sentinel | Aether Phantom | Crossbow | Sentry Unit | Slime | Sapper | Skirmish Diver | Saboteur | Raider | Field Medic |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Infantry** | · | 2× | 0.5× | · | · | 2× | 0.5× | · | 1.2× | 1.5× | · | 1.2× | · | · | · | · | · | · |
| **Artillery** | 0.5× | · | 2× | · | 0.5× | · | 2× | 1.5× | 0.8× | · | · | · | · | · | · | · | · | · |
| **Cavalry** | 2× | 0.5× | · | · | 2× | 0.5× | · | 0.5× | · | 2× | 2× | 1.5× | 2× | 2× | 2× | 1.5× | 2× | 2× |
| **Mixed** | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| **Elite Infantry** | 1.5× | 3× | 0.5× | 1.2× | · | 3× | 0.5× | 1.2× | 1.5× | 2× | 1.5× | 1.5× | 1.5× | · | · | · | · | · |
| **Elite Artillery** | 0.5× | 1.5× | 3× | 1.2× | 0.5× | · | 3× | 2× | 0.8× | 1.2× | 1.2× | · | · | · | · | · | · | · |
| **Elite Cavalry** | 3× | 0.5× | 1.5× | 1.2× | 3× | 0.5× | · | 0.5× | 1.2× | 2.5× | 3× | 2× | 3× | 2.5× | 2.5× | 2× | 2.5× | 2.5× |
| **Iron Guard** | · | 0.8× | 2× | · | · | 0.8× | 2× | · | · | 1.5× | 1.5× | · | · | · | 1.2× | 1.5× | 1.2× | 1.5× |
| **Crystal Sentinel** | 0.8× | · | 0.9× | 0.9× | 0.8× | · | 0.9× | · | · | · | 0.9× | · | · | · | · | · | · | · |
| **Aether Phantom** | 0.6× | · | 0.5× | 0.8× | 0.6× | · | 0.5× | · | · | · | 0.6× | · | · | · | · | · | · | · |
| **Crossbow** | · | 1.2× | 0.5× | · | · | 1.2× | 0.5× | 0.6× | · | 2× | · | 1.2× | · | · | · | · | · | · |
| **Sentry Unit** | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| **Slime** | 0.5× | 0.5× | 0.5× | 0.5× | 0.5× | 0.5× | 0.5× | 0.5× | 0.5× | 0.5× | 0.5× | 0.5× | · | 0.5× | 0.5× | 0.5× | 0.5× | 0.5× |
| **Sapper** | 0.8× | 0.8× | 0.6× | 0.8× | 0.8× | 0.8× | 0.6× | 0.6× | 0.8× | 0.6× | 0.8× | · | · | · | 0.8× | · | · | · |
| **Skirmish Diver** | · | 3× | 0.5× | · | · | 3× | 0.5× | 0.5× | 2.5× | · | 2.5× | 1.5× | 1.5× | 1.5× | · | 1.5× | · | 2× |
| **Saboteur** | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| **Raider** | 0.6× | · | 0.5× | 0.8× | 0.6× | · | 0.5× | · | · | · | 0.6× | · | · | · | · | · | · | 1.5× |
| **Field Medic** | 0.5× | 0.5× | 0.5× | 0.5× | 0.5× | 0.5× | 0.5× | 0.5× | 0.5× | 0.5× | 0.5× | 0.5× | 0.5× | 0.5× | 0.5× | 0.5× | 0.5× | · |
<!-- END GENERATED: units.counters -->

`·` means no modifier. Elites hit their favoured matchup harder than the base units do.

The matrix is applied everywhere damage is dealt, not just inside `CombatSystem`. A single `computeDamage(attackerType, defender, rawDamage)` helper (`unit.constants.ts`) is the one place the multiplier, Iron Guard's armor, and Crystal Sentinel's shield buff are resolved, and every damage-application site — `CombatSystem`'s melee pairs, `UnitSystem`'s cavalry charge, Iron Guard melee, Aether Phantom passthrough, Crystal Sentinel's beam and Iron Guard's death explosion, and `ProjectileSystem`'s artillery shells and crystal shards — calls it. A turret-fired shot has no unit type and so skips the counter lookup (turrets aren't part of the matrix), but still respects Iron Guard's armor and shields.

---

## Movement and the lane

Units walk along the **lane band**, the horizontal strip through the middle of the arena. Gears outside the band cannot be reached by marching units, which makes vertical placement a real defensive choice: build in the lane for spikes and turrets to bite, build outside it to keep your economy safe.

Direction is derived from which half of the map a side occupies, never from its owner label — the lobby can seat a human on either side, and every directional decision (march, targeting, base arrival) must agree. A unit reaching the enemy base deals its base damage and is consumed.

### Real rigidbody movement

Every unit is a real Matter.js body (`UnitPhysicsWorld`, real mass from the same size/type formula as before), not a position updated directly from a velocity number each frame. A behavior method (`updateInfantry`, `updateCavalry`, ...) is unchanged in what it *decides* — it still writes the velocity it wants onto `unit.vx`/`unit.vy` each tick — but that number is now a **target** a steering force pulls the body toward, rather than an instant swap. Three consequences:

- **Real acceleration.** A unit takes a beat to ramp up to speed instead of teleporting to its target velocity the instant a behavior decides on one — the closest thing to "inertia" a top-down march has.
- **Persistent knockback.** A hit that shoves a unit (cavalry charge, Iron Guard melee, an explosion) is a genuine velocity impulse now, decaying naturally over several frames as the steering force pulls the unit back toward what its behavior wants, instead of being overwritten completely by the very next frame's behavior update — previously knockback was visible for exactly one frame.
- **Native collision.** Unit-unit overlap is resolved by Matter's own solver instead of a single-pass positional nudge, which is what lets a pile of units pushing into the same space actually hold together and press forward rather than each just getting shoved sideways independently. Aether Phantom's pass-through-enemies rule is expressed as a Matter collision-category exclusion (it still collides with its own side).

**Explosions push back.** Every `aoe:explosion` event (artillery shells, mines, Iron Guard's death blast) now applies a real radial knockback impulse to units caught in the radius, falling off with distance from the blast centre — previously an explosion dealt damage only, with no pushback at all however close a survivor stood.

**Turrets and artillery lead their shots.** `TurretSystem` (crossbow/artillery turrets) and Artillery's own shell (`UnitSystem.updateArtillery`) now aim at where a moving target *will be* when the projectile arrives, computed from the target's real current velocity, rather than where it was standing at the instant of firing (`leadPosition` in `MathUtils.ts`). This only became meaningful once unit velocity was a real physical quantity rather than a per-frame steering intent that could be zero the instant after a shot was aimed.

Gears, by contrast, never translate — they're placed and stay put — so they don't need live simulated bodies the way units do. Their real-physics upgrade is different in kind: see [Gears § Meshing](gears.md#meshing).

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

### Research priority and gear size: weighted, not deterministic

Two decisions used to be either fully greedy (medium/hard research: always the single highest-scored node) or silently capped regardless of research (gear size: hard-coded to 10/15/20/30 teeth no matter what `gear_precision_1`–`5` had actually unlocked, so a fully-researched hard AI still never touched a 5-tooth or a 40+-tooth gear). Both are now a weighted random pick: every currently-available option — every researchable node, every unlocked tooth size — gets a baseline weight of 1, so nothing is ever fully excluded, plus a bias toward whichever option the AI actually needs more. How hard that bias leans is the difficulty axis (`AI_BIAS_STRENGTH`): easy barely favors its top pick over the rest, hard leans on it heavily without ever making the outcome certain.

For research, "needs more" is the existing ROI/opponent-adaptive score (`getResearchScore`) reused as the bias signal instead of a sort key. Gear-precision research (5/15/20/25/30/35/40/45/50/55/60 teeth) is scored higher once the foundation techs are up, since it stops competing with early economy/combat unlocks for priority.

For gear size, "needs more" depends on the gear's role, because bigger is not simply better everywhere: a spawner produces exactly one unit per rotation regardless of its own size, but a smaller gear meshed against the rest of the chain spins faster (gear-ratio physics — see [Balance](design/balance.md)), so a small spawner has a higher spawn rate and is biased toward the small end of what's unlocked. Every other gear type (motor, miner, converter, researcher, healer, spiked, armored, turret) produces output that scales with its own tooth count while placement cost only grows off a small flat base, so a bigger one is strictly better value once affordable, and is biased toward the large end. This is why a hard AI now visibly builds tiny fast spawners alongside oversized motors and miners once the relevant tech is up, instead of settling on the same 10-20 tooth gears all game.

Small spawners get a second, independent reason to lean smaller still: combat here is strictly 1v1 pairwise (`CombatSystem`), no cleave or splash exists anywhere, and Crossbow specifically fires at 1.8× its normal attack cooldown for the same per-hit damage as Infantry (`UnitSystem.updateCrossbow`). Against a slow-cadence or high-overkill single-target attacker — Cavalry, Crossbow, Artillery, Iron Guard — a wide swarm of cheap units both outnumbers what it can kill per attack window and eats its per-hit overkill for free, the same logic that already motivates the Slime spawner's design ("cheap, spammable... pile up and clog the lane"). When the AI's 30-second read on the opponent's dominant unit says they lean on one of those four (`opponentFavorsSwarmCounter`), spawner-size bias toward the small end is pushed harder still (`AIPlacementContext.preferSwarmSpawners`).

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

**Threat assessment** is percentage-based on base HP and feeds the posture directly (a critical threat pulls weight toward defense/offense and away from economy) as well as shifting research priority — under pressure the AI reprices fortification above everything else. **Weathering a push keeps paying off after the threat passes**: the controller remembers the last time threat was `critical`/`danger` (`recentlyThreatened`, a 25s window) and, once threat eases back to `normal`/`winning`, keeps leaning the posture toward economy (and away from offense) for that window rather than snapping straight back to the personality baseline the instant the pressure is gone — the push bought time, and that time is spent catching the economy up.

**Counter-picking.** It keeps a rolling 45-second window of the units it has seen you spawn and, if one type dominates, researches and builds the spawner that counters it: Cavalry answers Infantry, Artillery answers Cavalry, Crossbow answers Aether Phantom, and Skirmish Diver answers Artillery, Crystal Sentinel or Crossbow — whichever the opponent leans on, since Skirmish Diver beats all three of them. The counter matrix applies to every unit's attacks, not just melee, so the counter it picks actually counters what it saw.

**Roster diversification.** The counter-pick governs a chain's *primary* spawner. Beyond that, a hard-difficulty combat chain still in its `expand` phase works through the rest of the 14-spawner roster as tech allows — Iron Guard, Crystal Sentinel, Aether Phantom, Slime, Sapper, Raider, Sentry, Field Medic, Saboteur — instead of settling permanently on whichever spawner it counter-picked first. It will also deliberately add a converter to an established core-spawner (Infantry/Artillery/Cavalry) chain once all three core spawner techs are researched, flipping that spawner's output to the generalist Mixed unit — reading "a converter is a deliberate placement" the same way a human player would, rather than only reaching Mixed by accident.

`AIEvaluator.ts`, `AIPlanner.ts` and the `AI_STRATEGIES` table described an earlier decision model, superseded by `AIChainPlanner`; confirmed zero references anywhere in `src/` or `tests/` and deleted.

### The economy poverty loop, and why it isn't one anymore

A live AI-vs-AI spectate match was used to verify this section's claims against actual behaviour, not just against the code's intent, and turned up a real bug: the AI stayed at 1-2 chains and near-zero gold for the first 100+ seconds of a match, permanently idle with "insufficient gold for cheapest gear." Root cause: `determineNextChainRole()` won't start an economy chain (a miner) until a mining tech is researched, but spawner upkeep was consuming the entire passive income, so the gold to research that tech never accumulated either — a closed loop with no way out.

The fix (`AIController.makeDecision`'s budget-reserve gate) is narrowly scoped to the exact deadlock: while no mining tech is researched yet (`hasEconomyTech()`) *and* the top of the research queue is itself an economy-column node, the AI reserves the *full, uncapped* cost of that node rather than the usual 20g cap, holding off on gear placement until it can actually afford the research that unlocks its own economy — instead of spending every cheap gear's worth of gold as fast as it arrives and never crossing the threshold. This lift is deliberately narrow: it applies only until the *first* mining tech lands, not to every subsequent economy-column node, because uncapping it permanently would create the mirror-image trap (research perpetually outbidding the chain bootstrap that would actually put a miner on the board). Verified against a live spectate match: both sides now reach two developed combat chains (motor, amplifier, spawner, turret) by 100 seconds instead of freezing at one.

The AI pays for its gear placements the same way the player does — `AIController.executeDecision` charges gold up front and refunds it if `tryPlace` refuses the location, so its difficulty is tuned against the same constraint the player plays under. Its abilities now run through the same `AbilitySystem` a human's ACTIONS-tab click does (one instance per side) instead of a parallel, invisible cooldown tracker — unlocking Overclock Mastery, for instance, now actually stops the AI's own overclock gears from burning out, which it silently never did before.
