/**
 * Pure unit-scaling utility functions extracted from UnitSystem for testability.
 * No Phaser dependencies — safe to import in Node/test environments.
 */

import { UnitDefinition, UnitState, UnitType } from '../types/unit.types';
import { DEFAULT_TEETH } from '../constants/gear.constants';
import {
  TIER_TEETH, tierPower, tierRangeFactor, tierCostFactor, tierForTeeth,
} from '../constants/tier.constants';
import type { GearTier } from '../types/gear.types';
import {
  ENGAGE_DISTANCE, UNIT_SIZE_TEETH_MULT, CROSSBOW_RANGE_MULT, ARTILLERY_RANGE_MULT,
  CAVALRY_CHARGE_DAMAGE_DIVISOR,
} from '../constants/balance.constants';
import {
  PLAYER_BASE_X, AI_BASE_X,
  PLAYER_ZONE_MAX_X, AI_ZONE_MIN_X,
} from '../constants/world.constants';

// ─── Mass multipliers by unit type ───────────────────────────────────────────

export const TYPE_MASS_MULT: Partial<Record<UnitType, number>> = {
  iron_guard: 3,
  cavalry: 0.8,
  artillery: 1.5,
  infantry: 1.0,
  crossbow: 0.9,
  slime: 0.6,
  sapper: 1.8,
  field_medic: 0.9,
};

/**
 * How a unit's speed responds to tier, as a per-tier exponent base.
 *
 * The ladder makes everything else uniformly 1.5x stronger, which would make
 * tier choice automatic. Speed is where identity is preserved *and sharpened*:
 * light units get faster with tier, heavy units get slower. Across the full
 * ladder that is +36% for a tier-5 cavalry and -22% for a tier-5 iron guard,
 * so the gap between the fast flanker and the slow wall widens as you climb --
 * which is what makes picking a tier per factory an actual decision.
 *
 * Sits beside TYPE_MASS_MULT because it is the same kind of knob: a per-type
 * deviation from an otherwise uniform rule.
 */
export const TIER_SPEED_BASE: Partial<Record<UnitType, number>> = {
  // Light -- tier makes them faster.
  cavalry: 1.08,
  infantry: 1.04,
  crossbow: 1.04,
  field_medic: 1.04,
  iron_guard: 0.94,
  artillery: 0.94,
  sapper: 0.94,
  slime: 0.94,
};

// ─── Stat scaling ─────────────────────────────────────────────────────────────

/**
 * @deprecated Teeth-keyed shim over computeTierStats.
 *
 * Kept only so the call sites that still hold a raw tooth count keep compiling
 * while they are converted. Deleted with `teeth` itself.
 */
export function computeScaledStats(def: UnitDefinition, teeth: number, unitType: UnitType): {
  hp: number; speed: number; baseDamage: number; damage: number;
  size: number; attackRange: number; mass: number; costAmount: number;
} {
  return computeTierStats(def, tierForTeeth(teeth), unitType);
}

/**
 * Per-unit stats for a unit built by a tier-N factory.
 *
 * One rule: everything that makes a unit stronger is `base x 1.5^(tier-1)`, so
 * a tier-3 unit is exactly 2.25x a tier-1 one and the player can reason about
 * the ladder without a table. Base values in UNIT_DEFINITIONS are the tier-1
 * values.
 *
 * Three deliberate exceptions, each documented in the GDD:
 *
 *  - **Range** uses the shallow 1.15^p curve. At the full 1.5^p a tier-5
 *    artillery would reach 5.06x as far and shoot across most of the map.
 *  - **Armor** is additive, not multiplicative. HP and damage are each already
 *    x1.5, which puts raw duel power at 2.25x per tier (26x across the ladder);
 *    a multiplicative resistance on top of that makes high tiers literally
 *    unkillable by low ones and deletes the counterplay that keeps cheap
 *    swarms worth building.
 *  - **Speed** uses a per-type base (TIER_SPEED_BASE) so heavy units get
 *    slower with tier while light ones get faster.
 *
 * Cost uses 1.6^p -- steeper than power, so scaling up is a commitment.
 */
export function computeTierStats(def: UnitDefinition, tier: GearTier, unitType: UnitType): {
  hp: number; speed: number; baseDamage: number; damage: number;
  size: number; attackRange: number; mass: number; costAmount: number;
} {
  const power = tierPower(tier);
  const teeth = TIER_TEETH[tier];
  const massMult = TYPE_MASS_MULT[unitType] ?? 1.0;
  const speedBase = TIER_SPEED_BASE[unitType] ?? 1.0;
  const p = tier - 1;

  // Visual radius tracks the gear silhouette, as it always has.
  const size = Math.max(4, Math.round(teeth * UNIT_SIZE_TEETH_MULT));
  // Ranges are anchored to the TIER-1 silhouette and then grown on the shallow
  // curve, so they do not inherit the 1.5x size growth.
  const baseSize = Math.max(4, Math.round(TIER_TEETH[1] * UNIT_SIZE_TEETH_MULT));
  const rangeFactor = tierRangeFactor(tier);

  const attackRange =
    (unitType === 'artillery')
      ? Math.round(baseSize * ARTILLERY_RANGE_MULT * rangeFactor)
      : (unitType === 'crystal_sentinel')
        ? Math.round(baseSize * 6 * rangeFactor)
        : (unitType === 'crossbow')
          ? Math.round(baseSize * CROSSBOW_RANGE_MULT * rangeFactor)
          : Math.max(ENGAGE_DISTANCE, Math.round(ENGAGE_DISTANCE * rangeFactor));

  return {
    hp:          Math.max(1, Math.round(def.hp         * power)),
    speed:       Math.max(15, Math.round(def.speed     * Math.pow(speedBase, p))),
    baseDamage:  Math.max(1, Math.round(def.baseDamage * power)),
    damage:      Math.max(1, Math.round(def.damage     * power)),
    size,
    attackRange,
    mass:        Math.max(1, Math.round(10 * massMult * power)),
    costAmount:  Math.max(1, Math.round(def.costAmount * tierCostFactor(tier))),
  };
}

// ─── Orientation ──────────────────────────────────────────────────────────────
//
// Owner ('player' / 'ai') says *whose* a thing is; it does not say which half
// of the map they occupy. `playerRight` flips that mapping. Everything
// directional must be derived from these helpers rather than from the owner
// label, which is what let march direction and base arrival disagree with
// spawn position and targeting when the lobby put the human on the right.

/** True when this side occupies the right half of the map. */
export function isOwnerOnRight(owner: UnitState['owner'], playerRight: boolean): boolean {
  return owner === 'player' ? playerRight : !playerRight;
}

/** +1 when this side marches toward increasing x, -1 when it marches left. */
export function marchDirection(owner: UnitState['owner'], playerRight: boolean): number {
  return isOwnerOnRight(owner, playerRight) ? -1 : 1;
}

/** x of the base this side is attacking. */
export function enemyBaseX(owner: UnitState['owner'], playerRight: boolean): number {
  return isOwnerOnRight(owner, playerRight) ? PLAYER_BASE_X : AI_BASE_X;
}

/** x of the base this side is defending. */
export function homeBaseX(owner: UnitState['owner'], playerRight: boolean): number {
  return isOwnerOnRight(owner, playerRight) ? AI_BASE_X : PLAYER_BASE_X;
}

/** x at which this side's units enter the lane. */
export function spawnX(owner: UnitState['owner'], playerRight: boolean): number {
  return isOwnerOnRight(owner, playerRight) ? AI_ZONE_MIN_X : PLAYER_ZONE_MAX_X;
}

/** True once a unit has crossed into the base it is attacking. */
export function hasReachedEnemyBase(unit: UnitState, playerRight: boolean): boolean {
  const target = enemyBaseX(unit.owner, playerRight);
  return marchDirection(unit.owner, playerRight) > 0 ? unit.x >= target : unit.x <= target;
}

/**
 * Returns true if `targetX` lies in front of the unit — the direction it
 * naturally marches.
 */
export function isInFront(unit: UnitState, targetX: number, playerRight: boolean): boolean {
  return marchDirection(unit.owner, playerRight) > 0
    ? targetX >= unit.x
    : targetX <= unit.x;
}

// ─── Combat formulas ──────────────────────────────────────────────────────────

/** Attack cooldown in ms for a unit with the given size. */
export function computeAttackCooldown(size: number): number {
  return (size / 1.2) * 100;
}

/** Charge-boosted damage for cavalry. Divisor loosened from 100 -- see
 * CAVALRY_CHARGE_DAMAGE_DIVISOR for why. */
export function computeChargeDamage(baseDamage: number, chargeAccum: number): number {
  return baseDamage * (1 + chargeAccum / CAVALRY_CHARGE_DAMAGE_DIVISOR);
}
