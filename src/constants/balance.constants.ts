// Tick intervals (ms)
export const GOLD_TICK_INTERVAL = 1000;
export const AI_DECISION_INTERVAL = 2000;
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

// Gear-unit interaction
export const ARMORED_DAMAGE_RATE = 0.08;   // baseDamage fraction per second (~8%/sec)
export const UNIT_GEAR_DAMAGE_RATE = 1.0;  // HP/sec per baseDamage point (combat units vs non-armored gears)
export const WRENCH_FRICTION_VALUE = 30;   // matches unit.constants wrench frictionValue

// AI timing
export const AI_INITIAL_DECISION_DELAY = 2000;  // ms before first AI action

// Gear repositioning
export const REPOSITION_COOLDOWN_MS = 3000;  // 3s cooldown after moving a gear

// Gear jam and health
export const JAM_DAMAGE_RATE = 8;          // HP/sec base rate when jammed
export const JAM_STRESS_MULTIPLIER = 0.1;  // torque → stress multiplier

// Unit spawning

// Gold cost per unit spawn (used by AI to reserve gold before placing spawners)
export const UNIT_SPAWN_COST: Record<string, number> = {
  infantry: 5,
  cavalry: 12,
  artillery: 8,
  elite_infantry: 10,
  elite_cavalry: 20,
  elite_artillery: 15,
};
