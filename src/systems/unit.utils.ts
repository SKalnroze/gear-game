/**
 * Pure unit-scaling utility functions extracted from UnitSystem for testability.
 * No Phaser dependencies — safe to import in Node/test environments.
 */

import { UnitDefinition, UnitState, UnitType } from '../types/unit.types';
import { DEFAULT_TEETH } from '../constants/gear.constants';
import {
  ENGAGE_DISTANCE, UNIT_SIZE_TEETH_MULT, CROSSBOW_RANGE_MULT, ARTILLERY_RANGE_MULT,
  CAVALRY_CHARGE_DAMAGE_DIVISOR,
} from '../constants/balance.constants';
import {
  LANE_Y_MIN, LANE_Y_MAX,
  PLAYER_BASE_X, AI_BASE_X,
  PLAYER_ZONE_MAX_X, AI_ZONE_MIN_X,
} from '../constants/world.constants';

// ─── Mass multipliers by unit type ───────────────────────────────────────────

export const TYPE_MASS_MULT: Partial<Record<UnitType, number>> = {
  iron_guard: 3,
  cavalry: 0.8,
  elite_cavalry: 0.8,
  aether_phantom: 0.5,
  artillery: 1.5,
  elite_artillery: 1.5,
  crystal_sentinel: 1.0,
  infantry: 1.0,
  elite_infantry: 1.0,
  mixed: 1.0,
  crossbow: 0.9,
  sentry_unit: 1.0,
  slime: 0.6,
  sapper: 1.8,
  skirmish_diver: 0.7,
  saboteur: 1.0,
  raider: 0.7,
  field_medic: 0.9,
};

// ─── Stat scaling ─────────────────────────────────────────────────────────────

/**
 * Compute per-unit stats scaled from gear teeth count.
 *
 * Base values in UNIT_DEFINITIONS are calibrated at DEFAULT_TEETH (10).
 * Scaling rules:
 *   size (visual radius)  = teeth × 1.2              — matches gear silhouette
 *   hp                    ∝ teeth^1.5                — bigger = tankier
 *   speed                 ∝ teeth^(-0.5)             — bigger = slower (min 15 px/s)
 *   baseDamage / damage   ∝ teeth^1.2                — bigger hits harder
 *   attackRange           ∝ teeth^0.8  × ENGAGE_BASE — bigger reaches further
 *   mass                  ∝ teeth^2                  — quadratic (area-based)
 *   costAmount            ∝ teeth^1.3                — larger units cost more
 */
export function computeScaledStats(def: UnitDefinition, teeth: number, unitType: UnitType): {
  hp: number; speed: number; baseDamage: number; damage: number;
  size: number; attackRange: number; mass: number; costAmount: number;
} {
  const s = teeth / DEFAULT_TEETH;
  const baseMass = Math.max(1, Math.round(10 * s * s));
  const massMult = TYPE_MASS_MULT[unitType] ?? 1.0;
  return {
    hp:          Math.max(1, Math.round(def.hp          * Math.pow(s, 1.5))),
    speed:       Math.max(15, Math.round(def.speed      * Math.pow(s, -0.5))),
    baseDamage:  Math.max(1, Math.round(def.baseDamage  * Math.pow(s, 1.2))),
    damage:      Math.max(1, Math.round(def.damage      * Math.pow(s, 1.2))),
    size:        Math.max(4, Math.round(teeth * UNIT_SIZE_TEETH_MULT)),
    // Artillery: stop-and-fire range = 5 unit diameters (10 × size)
    // Crystal sentinel: ranged, stops ~3 diameters away (6 × size)
    // Crossbow: short ranged skirmish distance (4 × size) -- stops well short
    // of melee contact but far closer than artillery/sentinel
    // (Crossbow/Artillery multipliers shared with turretRange() in
    // gear.constants.ts, so a turret's range is always derived from these.)
    attackRange: (unitType === 'artillery' || unitType === 'elite_artillery')
      ? Math.max(4, Math.round(teeth * UNIT_SIZE_TEETH_MULT)) * ARTILLERY_RANGE_MULT
      : (unitType === 'crystal_sentinel')
        ? Math.max(4, Math.round(teeth * UNIT_SIZE_TEETH_MULT)) * 6
        : (unitType === 'crossbow')
          ? Math.max(4, Math.round(teeth * UNIT_SIZE_TEETH_MULT)) * CROSSBOW_RANGE_MULT
          : Math.max(ENGAGE_DISTANCE, Math.round(ENGAGE_DISTANCE * Math.pow(s, 0.8))),
    mass:        Math.max(1, Math.round(baseMass * massMult)),
    costAmount:  Math.max(1, Math.round(def.costAmount  * Math.pow(s, 1.3))),
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

/** Returns true if a gear at gearY overlaps the lane band (melee reachability). */
export function gearInLane(gearY: number): boolean {
  return gearY >= LANE_Y_MIN && gearY <= LANE_Y_MAX;
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
