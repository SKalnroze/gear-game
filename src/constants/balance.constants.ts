// Tick intervals (ms)
export const GOLD_TICK_INTERVAL = 1000;
export const COMBAT_TICK_INTERVAL = 250;
export const OVERCLOCK_DURATION = 10000;  // 10 seconds
export const OVERCLOCK_BURNOUT_DURATION = 5000;  // 5 seconds disabled after burnout

// Economy
export const BASE_GOLD_PER_SEC = 2;
export const OVERCLOCK_SPEED_BONUS = 0.5;   // +50% speed
export const AMPLIFIER_CHAIN_MULTIPLIER = 1.4;
/** Minimum gears on a chain to count as "big" -- gates both Combo Chain Bonus and elite/mixed spawn upgrades. */
export const COMBO_CHAIN_MIN_GEARS = 4;
export const CAPACITOR_BURST_MULTIPLIER = 2.5;
export const CAPACITOR_BURST_ROTATIONS = 8;

// Gear placement costs (gold)
export const GEAR_PLACEMENT_COST_BASE = 10;  // base gold cost to place any gear
export const GEAR_PLACEMENT_COST_MULTIPLIER = 0.5;  // cost scales with teeth: base + (teeth * multiplier)

/**
 * Gold cost to place a gear of the given teeth count.
 * The single source of truth for this formula -- it used to be reimplemented
 * inline (and inconsistently: one unrounded, one rounded) in GameScene,
 * GearGridSection, GearSystem, AIController and AIChainPlanner.
 */
export function gearPlacementCost(teeth: number): number {
  // Rounded here, once, so every consumer -- the gold actually charged and
  // every UI display of the price -- agrees exactly. The three separate
  // reimplementations this replaced disagreed by 0.5 gold on odd teeth
  // because only one of them rounded.
  return Math.round(GEAR_PLACEMENT_COST_BASE + teeth * GEAR_PLACEMENT_COST_MULTIPLIER);
}

// Base HP
export const BASE_MAX_HP = 100;

// Unit damage on base arrival (unit is destroyed on hit)
export const INFANTRY_BASE_DAMAGE = 3;
export const ARTILLERY_BASE_DAMAGE = 5;
export const CAVALRY_BASE_DAMAGE = 8;
export const ELITE_BASE_DAMAGE_MULTIPLIER = 2;

// Motor bonus when adjacent to Amplifier
export const MOTOR_AMPLIFIER_ADJACENCY_BONUS = 0.1;

// Capacitor + Overclock adjacency bonus
export const CAPACITOR_OVERCLOCK_BURST_BONUS = 1.0;

// Combat
export const ENGAGE_DISTANCE = 36;         // px — unit-to-unit engagement range
export const UNIT_COLLISION_RADIUS = 10;   // approximate circle radius for a unit

/**
 * Mobile Crossbow/Artillery range formula pieces, shared between
 * unit.utils.ts (the mobile unit's own attack range) and turretRange() in
 * gear.constants.ts, so a turret's range is always *derived from* -- and
 * kept below -- its mobile counterpart's, instead of being an independent
 * flat number the two can drift apart from. See balance.md "Defense vs
 * ranged": a turret that outranges the unit meant to poke it inverts the
 * design (defense should fall to ranged pressure, not out-range it).
 */
export const UNIT_SIZE_TEETH_MULT = 1.2;   // matches computeScaledStats' size formula
export const CROSSBOW_RANGE_MULT = 4;      // mobile crossbow attack range = size * this
export const ARTILLERY_RANGE_MULT = 10;    // mobile artillery attack range = size * this
/** A turret's range is this fraction of its mobile counterpart's -- always under-ranged, by construction. */
export const CROSSBOW_TURRET_RANGE_FRACTION = 0.75;
export const ARTILLERY_TURRET_RANGE_FRACTION = 0.8;

/**
 * Cavalry charge: how far ahead it will sense a target/gear and start
 * accumulating charge, and how much that accumulation is worth in bonus
 * damage. Both used to be effectively unbounded -- no distance cap on the
 * "is there a forward target" check at all -- which let a charge across a
 * typical no-man's-land accumulate to 6x+ base damage, one-shotting a
 * standard gear outright. Capped to the game's longest existing sensor
 * range and the divisor loosened so a full-field charge is still the
 * hardest hit in the game without being an automatic kill. See
 * balance.md "Cavalry -- the charge formula needs a ceiling".
 */
export const CAVALRY_CHARGE_SENSE_RANGE = 500;
export const CAVALRY_CHARGE_DAMAGE_DIVISOR = 160;

// Gear-unit interaction
export const ARMORED_DAMAGE_RATE = 0.08;   // baseDamage fraction per second (~8%/sec)
export const UNIT_GEAR_DAMAGE_RATE = 1.0;  // HP/sec per baseDamage point (combat units vs non-armored gears)
export const SLIME_FRICTION_VALUE = 30;   // matches unit.constants slime frictionValue

// AI timing
export const AI_INITIAL_DECISION_DELAY = 2000;  // ms before first AI action
/** How often the AI re-evaluates the board. Actual action rate is throttled by AI_APM below, not this. */
export const AI_POLL_INTERVAL = 500;
/**
 * Actions-per-minute budget per difficulty -- the AI's actual difficulty axis.
 * Every executed action (place/sell/reposition/research/ability) spends 1 point;
 * the pool refills continuously at apm/60000 points/ms, capped at AI_ACTION_BUDGET_CAPACITY.
 * Replaces the old fixed 2s tick + easy's 55%-random-skip, which "faked" incompetence
 * via a coin-flip instead of a real constraint.
 */
export const AI_APM: Record<'easy' | 'medium' | 'hard', number> = {
  easy: 14,
  medium: 26,
  hard: 42,
};
/** Burst allowance -- how many banked actions the AI can spend in a row once accumulated. */
export const AI_ACTION_BUDGET_CAPACITY = 4;

// Gear repositioning
export const REPOSITION_COOLDOWN_MS = 3000;  // 3s cooldown after moving a gear

// Gear jam and health
export const JAM_DAMAGE_RATE = 8;          // HP/sec base rate when jammed
export const JAM_STRESS_MULTIPLIER = 0.1;  // torque → stress multiplier
/** Stress value treated as a fully "severe" jam for VFX/audio scaling (0-1 severity). */
export const JAM_SEVERE_STRESS = 30;
/** Relief valve gear: damage multiplier for itself while jammed. */
export const RELIEF_VALVE_SELF_DAMAGE_MULT = 0.15;
/** Relief valve gear: damage multiplier for a jammed neighbour it's meshed to. */
export const RELIEF_VALVE_NEIGHBOR_DAMAGE_MULT = 0.6;

/** 0-1 read of how severe a jam is, for VFX/audio intensity -- not a damage input. */
export function jamSeverity(stress: number): number {
  return Math.max(0, Math.min(1, stress / JAM_SEVERE_STRESS));
}

