/**
 * Pure electrical-grid logic: what may be wired to what, and how one grid
 * settles in a tick.
 *
 * Phaser-free, Matter-free, and free of any system class -- `solveGrid` takes
 * plain numbers and returns plain numbers, so every case that matters
 * (brownout, storage fill, sell cap, overload, an untied grid) is a table test
 * rather than a scenario that has to be staged in a running match.
 */

import type { GearState, GearTier } from '../types/gear.types';
import { distance } from '../utils/MathUtils';
import {
  WIRE_BASE_RANGE, POLE_RANGE, MAX_WIRES_PER_GEAR, MAX_WIRES_PER_POLE,
  SATISFACTION_STEPS,
} from '../constants/power.constants';

export type PowerRole = 'generator' | 'battery' | 'consumer' | 'pole' | 'tie';

export type WireResult =
  | 'ok'
  | 'same-gear'
  | 'different-owner'
  | 'duplicate'
  | 'out-of-range'
  | 'not-electrical'
  | 'wire-limit';

/** How far this gear can throw a wire. Poles exist to be long. */
export function wireReach(role: PowerRole | undefined): number {
  if (!role) return 0;
  return role === 'pole' || role === 'tie' ? POLE_RANGE : WIRE_BASE_RANGE;
}

/** How many wires this gear may hold. */
export function wireCapacity(role: PowerRole | undefined): number {
  if (!role) return 0;
  return role === 'pole' || role === 'tie' ? MAX_WIRES_PER_POLE : MAX_WIRES_PER_GEAR;
}

export interface WireCandidate {
  gear: GearState;
  role: PowerRole | undefined;
  /** Wires this gear already holds. */
  wireCount: number;
}

/**
 * Whether a wire may be drawn between two gears.
 *
 * Reach is `max(reachA, reachB)`, deliberately not `min`. Under `min`, a power
 * pole -- whose entire purpose is to span distance -- could never reach an
 * ordinary short-range consumer, which would make poles useless.
 */
export function canWire(a: WireCandidate, b: WireCandidate, alreadyWired: boolean): WireResult {
  if (a.gear.id === b.gear.id) return 'same-gear';
  if (!a.role || !b.role) return 'not-electrical';
  if (a.gear.owner !== b.gear.owner) return 'different-owner';
  if (alreadyWired) return 'duplicate';
  if (a.wireCount >= wireCapacity(a.role) || b.wireCount >= wireCapacity(b.role)) return 'wire-limit';

  const reach = Math.max(wireReach(a.role), wireReach(b.role));
  if (distance(a.gear.x, a.gear.y, b.gear.x, b.gear.y) > reach) return 'out-of-range';

  return 'ok';
}

// ─── Grid solve ──────────────────────────────────────────────────────────────

export interface BatteryState {
  /** Current stored charge. */
  charge: number;
  capacity: number;
  /** Cap on charge released per second. */
  maxDischarge: number;
}

export interface GridInput {
  /** Total generation available this tick, in units/sec. */
  generation: number;
  /** Total draw requested by consumers, in units/sec. */
  demand: number;
  batteries: BatteryState[];
  /** Total intake of grid-tie nodes IN THIS GRID. Zero when not wired to one. */
  sellCap: number;
  dt: number;
}

export interface GridResult {
  /** 0..1, quantised. Written to every consumer on the grid, uniformly. */
  satisfaction: number;
  /** Charge deltas to apply, index-aligned with `batteries`. */
  batteryDeltas: number[];
  /** Units/sec sold to the grid tie. */
  sold: number;
  /** Units/sec with nowhere to go. Becomes heat. */
  overflow: number;
  brownout: boolean;
}

/** Round satisfaction to a fixed number of steps -- see SATISFACTION_STEPS. */
export function quantiseSatisfaction(value: number): number {
  return Math.round(value * SATISFACTION_STEPS) / SATISFACTION_STEPS;
}

/** Distribute `total` across `weights` in proportion, guarding a zero sum. */
function proRata(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  return weights.map((w) => (total * w) / sum);
}

/**
 * Settle one electrical grid for one tick.
 *
 * Order matters and is the design: consumers are served first (from generation,
 * then from storage), surplus charges batteries, what is left is sold to the
 * tie, and only what still has nowhere to go overloads. Storage before selling
 * means a battery bank genuinely protects you from overload rather than merely
 * earning you less.
 */
export function solveGrid(input: GridInput): GridResult {
  const { generation, demand, batteries, sellCap, dt } = input;

  // What storage could contribute this tick, respecting both charge and rate.
  const dischargeAvail = dt > 0
    ? batteries.reduce((sum, b) => sum + Math.min(b.charge / dt, b.maxDischarge), 0)
    : 0;

  const served = Math.min(demand, generation + dischargeAvail);
  const satisfaction = quantiseSatisfaction(demand > 0 ? served / demand : 1);

  const batteryDeltas = batteries.map(() => 0);

  // Storage covers whatever generation could not.
  const deficit = Math.max(0, served - generation);
  if (deficit > 0) {
    const draws = proRata(deficit, batteries.map((b) => Math.min(b.charge / dt, b.maxDischarge)));
    draws.forEach((draw, i) => { batteryDeltas[i] -= draw * dt; });
  }

  let surplus = Math.max(0, generation - demand);

  // Surplus charges storage before it is sold: a battery bank should protect
  // you from overload, not just earn you less gold.
  if (surplus > 0) {
    const headroom = batteries.map((b) => Math.max(0, b.capacity - b.charge));
    const totalHeadroom = headroom.reduce((a, b) => a + b, 0);
    const stored = Math.min(surplus, dt > 0 ? totalHeadroom / dt : 0);
    if (stored > 0) {
      proRata(stored, headroom).forEach((amount, i) => { batteryDeltas[i] += amount * dt; });
      surplus -= stored;
    }
  }

  const sold = Math.min(surplus, sellCap);
  surplus -= sold;

  return {
    satisfaction,
    batteryDeltas,
    sold,
    overflow: surplus,
    brownout: served < demand - 1e-9,
  };
}

/** Motor torque multiplier for a given power satisfaction. */
export function motorPowerFactor(satisfaction: number, baseline: number): number {
  return baseline + (1 - baseline) * Math.max(0, Math.min(1, satisfaction));
}

/** Whether a motor of this tier can drive a chain given its power satisfaction. */
export function tierIsPowered(tier: GearTier, satisfaction: number, maxUnpoweredTier: number): boolean {
  return tier <= maxUnpoweredTier || satisfaction > 0;
}
