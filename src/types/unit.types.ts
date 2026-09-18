export type UnitBehaviorState = 'marching' | 'attacking' | 'charging' | 'retreating' | 'firing';

/**
 * The eight units.
 *
 * Trimmed from eighteen. The cut ones were mostly variations rather than
 * identities -- three "elite" upgrades and a "mixed" unit that appeared through
 * chain composition rather than through a choice you made, plus several
 * near-duplicate skirmishers. What survives is one clear role each, so a
 * counter can be reasoned about rather than looked up.
 */
export type UnitType =
  | 'infantry'      // the line: cheap, gold-only, the thing you always have
  | 'crossbow'      // short-ranged skirmisher, beats the line
  | 'cavalry'       // fast flanker, runs down artillery
  | 'artillery'     // long-ranged siege, slow and fragile
  | 'iron_guard'    // the wall: slow, heavy, soaks damage
  | 'sapper'        // anti-gear specialist, tears machines apart
  | 'field_medic'   // support, heals the line
  | 'slime';        // the clog: no damage, bursts into a slowing puddle

export interface UnitDefinition {
  type: UnitType;
  hp: number;
  speed: number;           // pixels per second
  damage: number;          // damage dealt to base on arrival
  baseDamage: number;      // damage in combat per tick
  /**
   * Gold cost. Every unit costs gold; most also cost a little of something you
   * had to mine, so an army is downstream of a working machine rather than of
   * a gold counter. Infantry is the deliberate exception -- the line you can
   * always field, whatever else has gone wrong.
   */
  costAmount: number;
  secondaryResource?: 'iron' | 'crystal' | 'coal';
  secondaryAmount?: number;
  description: string;
  frictionValue?: number;  // friction the slime's death puddle adds to gears standing in it
  /** Slime only: radius/duration/slow of the puddle left on death. */
  puddleRadius?: number;
  puddleDuration?: number;   // seconds
  puddleSlowFactor?: number; // speed multiplier while standing in the puddle
  /** Sentry unit only: radius and interval of its true-sight pulse. */
  sightRadius?: number;
  sightPulseIntervalMs?: number;
  /** Field medic only: radius, per-pulse heal amount, and pulse interval. */
  healRadius?: number;
  healAmount?: number;
  healPulseIntervalMs?: number;
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
