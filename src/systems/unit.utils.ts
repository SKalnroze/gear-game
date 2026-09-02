/**
 * Pure unit-scaling utility functions extracted from UnitSystem for testability.
 * No Phaser dependencies — safe to import in Node/test environments.
 */

import { UnitDefinition, UnitState, UnitType } from '../types/unit.types';
import { DEFAULT_TEETH } from '../constants/gear.constants';
import { ENGAGE_DISTANCE } from '../constants/balance.constants';
import { LANE_Y_MIN, LANE_Y_MAX } from '../constants/world.constants';

// ─── Mass multipliers by unit type ───────────────────────────────────────────

export const TYPE_MASS_MULT: Partial<Record<UnitType, number>> = {
  iron_guard: 3,
  cavalry: 0.8,
  aether_phantom: 0.5,
  artillery: 1.5,
  crystal_sentinel: 1.0,
  infantry: 1.0,
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
    size:        Math.max(4, Math.round(teeth * 1.2)),
    // Artillery: stop-and-fire range = 5 unit diameters (10 × size)
    // Crystal sentinel: ranged, stops ~3 diameters away (6 × size)
    attackRange: (unitType === 'artillery' || unitType === 'elite_artillery')
      ? Math.max(4, Math.round(teeth * 1.2)) * 10
      : (unitType === 'crystal_sentinel')
        ? Math.max(4, Math.round(teeth * 1.2)) * 6
        : Math.max(ENGAGE_DISTANCE, Math.round(ENGAGE_DISTANCE * Math.pow(s, 0.8))),
    mass:        Math.max(1, Math.round(baseMass * massMult)),
    costAmount:  Math.max(1, Math.round(def.costAmount  * Math.pow(s, 1.3))),
  };
}

// ─── Positional helpers ───────────────────────────────────────────────────────

/**
 * Returns true if `targetX` lies in front of the unit (the direction it
 * naturally marches).  `playerRight` indicates whether the human side has
 * been flipped to the right half of the map; when that flag is set the
 * marching directions are inverted.
 */
export function isInFront(unit: UnitState, targetX: number, playerRight: boolean): boolean {
  if (!playerRight) {
    return unit.owner === 'player' ? targetX >= unit.x : targetX <= unit.x;
  } else {
    return unit.owner === 'player' ? targetX <= unit.x : targetX >= unit.x;
  }
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

/** Charge-boosted damage for cavalry. */
export function computeChargeDamage(baseDamage: number, chargeAccum: number): number {
  return baseDamage * (1 + chargeAccum / 100);
}
