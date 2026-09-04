export type UnitBehaviorState = 'marching' | 'attacking' | 'charging' | 'retreating' | 'firing';

export type UnitType =
  // Gold-based (from motor/amplifier/converter gears)
  | 'infantry' | 'artillery' | 'cavalry' | 'mixed'
  // Elite gold units
  | 'elite_infantry' | 'elite_artillery' | 'elite_cavalry'
  // Iron-based (from iron_miner)
  | 'iron_guard'
  // Crystal-based (from crystal_miner)
  | 'crystal_sentinel'
  // Aether-based (from aether_miner)
  | 'aether_phantom'
  // Ranged skirmisher, gold-based
  | 'crossbow'
  // Mobile true-sight pulse, counters hidden mines
  | 'sentry_unit'
  // Special -- the clog unit: no damage, explodes into a slowing puddle on death
  | 'slime';

export interface UnitDefinition {
  type: UnitType;
  hp: number;
  speed: number;           // pixels per second
  damage: number;          // damage dealt to base on arrival
  baseDamage: number;      // damage in combat per tick
  costResource: 'gold' | 'iron' | 'crystal' | 'aether' | 'none';  // resource used to spawn this unit
  costAmount: number;      // amount of resource required
  description: string;
  frictionValue?: number;  // friction the slime's death puddle adds to gears standing in it
  /** Slime only: radius/duration/slow of the puddle left on death. */
  puddleRadius?: number;
  puddleDuration?: number;   // seconds
  puddleSlowFactor?: number; // speed multiplier while standing in the puddle
  /** Sentry unit only: radius and interval of its true-sight pulse. */
  sightRadius?: number;
  sightPulseIntervalMs?: number;
}

export type CounterTable = {
  [attacker in UnitType]?: {
    [defender in UnitType]?: number;  // damage multiplier
  };
};

export interface UnitState {
  id: string;
  type: UnitType;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  owner: 'player' | 'ai';
  speed: number;
  baseDamage: number;
  inCombat: boolean;
  combatTarget?: string;   // id of unit being fought
  reachedBase: boolean;
  damage: number;          // base damage on arrival
  attachedGearId?: string; // unused (no unit type latches any more) -- kept for the collision-filter guard
  frictionValue: number;   // scaled puddle-friction value (slime), seeded onto its death puddle

  /** Visual radius in px — derived from spawner gear teeth */
  size: number;
  /** Engagement range in px — larger units can initiate combat from further away */
  attackRange: number;
  /** Physical mass — scales with gear size² for future physics-based movement */
  mass: number;

  // Physics-based movement
  vx: number;            // velocity x (px/s)
  vy: number;            // velocity y (px/s)
  knockbackVx: number;   // pending impulse from this frame's combat, applied after all units' behavior updates
  knockbackVy: number;
  behaviorState: UnitBehaviorState;   // current AI state machine state
  lastAttackTime: number;             // ms timestamp of last attack
  chargeAccum: number;                // cavalry: px/s accumulated during charge (reset on retreat)
  retreatTimer: number;               // cavalry: seconds remaining in retreat
  slowTimer: number;                  // crystal shard slow remaining seconds (0 = not slowed)
  slowFactor: number;                 // speed multiplier when slowed (0.5 when hit by crystal shard)
  turretAngle?: number;               // artillery: current barrel angle in radians (0 = right)
  shieldTimer: number;                // crystal sentinel aura remaining seconds (0 = not shielded)
  shieldFactor: number;               // incoming damage multiplier while shielded (0.8 in the aura)
}
