/**
 * Pure heat and oil model.
 *
 * No Phaser, no Matter, no system classes -- `stepThermal` takes numbers and
 * returns numbers, so every band transition, the hysteresis that stops a gear
 * flickering at its limit, and the conservation property of oil diffusion are
 * all plain table tests rather than scenarios staged in a running match.
 *
 * Follows the convention set by systems/unit.utils.ts.
 */

import type { GearTier } from '../types/gear.types';
import {
  FRICTION_K, FRICTION_SPEED_EXP, COOL_K,
  HEAT_THRESHOLD_BASE, HEAT_THRESHOLD_TIER_STEP,
  HOT_FRACTION, SEIZE_RELEASE_FRACTION, HOT_EFFICIENCY_FLOOR,
  SEIZE_STRESS_BASE, SEIZE_RAMP_PER_SEC,
  OIL_CAPACITY_BASE, OIL_FRICTION_RELIEF, OIL_BLEED_K, OIL_THRESHOLD_BONUS,
  OIL_BURN_K, OIL_BURN_HOT_MULT, OIL_BURN_HOT_FRACTION,
  OIL_DIFFUSE_K, OIL_CONTACT_MIN_OMEGA, OIL_STATIC_CONTACT,
} from '../constants/thermal.constants';
import { tierPower } from '../constants/tier.constants';

export type ThermalState = 'ok' | 'hot' | 'seized';

/** Heat a gear of this tier tolerates dry. Bigger gears have more metal to soak it. */
export function heatCapacityFor(tier: GearTier): number {
  return HEAT_THRESHOLD_BASE * Math.pow(HEAT_THRESHOLD_TIER_STEP, tier - 1);
}

/** Oil a gear of this tier can hold. */
export function oilCapacityFor(tier: GearTier): number {
  return OIL_CAPACITY_BASE * tierPower(tier);
}

/** Seizure stress for this tier -- feeds the existing jam-damage loop. */
export function seizeStressFor(tier: GearTier): number {
  return SEIZE_STRESS_BASE * tierPower(tier);
}

/**
 * The temperature at which this gear seizes, given how oiled it is.
 * A full film buys a large margin; that margin is the whole reason to run an
 * oiler rather than simply spinning slower.
 */
export function seizeThreshold(tier: GearTier, oilFraction: number): number {
  return heatCapacityFor(tier) * (1 + OIL_THRESHOLD_BONUS * clamp01(oilFraction));
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export interface ThermalInput {
  heat: number;
  oil: number;
  tier: GearTier;
  /** Angular velocity, rad/s. Sign is irrelevant -- friction does not care. */
  omega: number;
  dt: number;
  /** Heat from elsewhere this tick: burner self-heat, electrical overload. */
  externalHeat: number;
  /** Whether this gear was already seized, so hysteresis can be applied. */
  wasSeized: boolean;
}

export interface ThermalOutput {
  heat: number;
  oil: number;
  /** 0..1 multiplier on both torque contribution and production payout. */
  efficiency: number;
  state: ThermalState;
  /** Fraction of the seize threshold, for visuals. Can exceed 1. */
  heatFraction: number;
}

/**
 * Advance one gear's heat and oil by `dt` seconds.
 *
 * Bands, with hysteresis so an overheat is recoverable rather than a coin flip:
 *
 *   ok      heat < 0.8 x threshold        full efficiency
 *   hot     0.8 x threshold .. threshold  efficiency falls 1.0 -> 0.6, gear glows
 *   seized  heat >= threshold             stops, and starts taking damage
 *   release seized and heat < 0.7 x thr   back to hot
 *
 * The gap between seizing at 1.0 and releasing at 0.7 matters: without it a gear
 * sitting exactly at its limit would seize and release every frame.
 */
export function stepThermal(input: ThermalInput): ThermalOutput {
  const { tier, dt, wasSeized } = input;
  const speed = Math.abs(input.omega);
  const oilCapacity = oilCapacityFor(tier);
  const oilFraction = oilCapacity > 0 ? clamp01(input.oil / oilCapacity) : 0;

  // Bigger gears generate more friction heat: more metal in contact, more load.
  const friction = FRICTION_K
    * Math.pow(speed, FRICTION_SPEED_EXP)
    * tierPower(tier)
    * (1 - OIL_FRICTION_RELIEF * oilFraction);

  const cooling = (COOL_K + OIL_BLEED_K * oilFraction) * input.heat;
  const heat = Math.max(0, input.heat + (friction + input.externalHeat - cooling) * dt);

  const threshold = seizeThreshold(tier, oilFraction);
  const heatFraction = threshold > 0 ? heat / threshold : 0;

  // Oil cooks off as the gear turns, and faster once it is running hot -- so a
  // gear you keep pushing burns through its own protection.
  const burnMult = heatFraction > OIL_BURN_HOT_FRACTION ? OIL_BURN_HOT_MULT : 1;
  const oil = Math.max(0, input.oil - OIL_BURN_K * speed * dt * burnMult);

  const state = resolveState(heatFraction, wasSeized);
  return { heat, oil, efficiency: efficiencyFor(state, heatFraction), state, heatFraction };
}

function resolveState(heatFraction: number, wasSeized: boolean): ThermalState {
  if (wasSeized) {
    // Stay seized until well clear of the threshold -- see hysteresis above.
    return heatFraction < SEIZE_RELEASE_FRACTION ? 'hot' : 'seized';
  }
  if (heatFraction >= 1) return 'seized';
  return heatFraction >= HOT_FRACTION ? 'hot' : 'ok';
}

function efficiencyFor(state: ThermalState, heatFraction: number): number {
  if (state === 'seized') return 0;
  if (state === 'ok') return 1;
  // Falls linearly across the hot band, from 1.0 down to the floor.
  const through = (heatFraction - HOT_FRACTION) / (1 - HOT_FRACTION);
  return Math.max(HOT_EFFICIENCY_FLOOR, 1 - (1 - HOT_EFFICIENCY_FLOOR) * clamp01(through));
}

/** Stress on a gear that has been seized for `seconds`, escalating the longer it is ignored. */
export function escalatedSeizeStress(tier: GearTier, seconds: number): number {
  return seizeStressFor(tier) * (1 + SEIZE_RAMP_PER_SEC * Math.max(0, seconds));
}

/**
 * Current efficiency of a gear from its stored heat alone.
 *
 * A running-hot motor delivers less torque before it seizes outright, so the
 * chain visibly slows as it heats -- the warning is in the machine's behaviour,
 * not only in a colour.
 */
export function thermalEfficiency(gear: {
  heat?: number; oil?: number; tier: GearTier; isSeized?: boolean;
}): number {
  if (gear.isSeized) return 0;
  const oilFraction = clamp01((gear.oil ?? 0) / oilCapacityFor(gear.tier));
  const threshold = seizeThreshold(gear.tier, oilFraction);
  const fraction = threshold > 0 ? (gear.heat ?? 0) / threshold : 0;
  return efficiencyFor(resolveState(fraction, gear.isSeized ?? false), fraction);
}

// ─── Oil diffusion ───────────────────────────────────────────────────────────

export interface OilNode {
  oil: number;
  capacity: number;
  omega: number;
}

export interface OilEdge {
  gearIdA: string;
  gearIdB: string;
}

/**
 * Spread oil along meshed teeth, returning per-gear deltas for the caller to
 * apply.
 *
 * Two properties this shape buys, both directly asserted in the tests:
 *
 *  - **Order independence.** Deltas accumulate into a separate map instead of
 *    mutating as we walk, so the result cannot depend on the order the edge
 *    list happens to be in.
 *  - **Conservation.** Oil is only ever moved, never created, so the total is
 *    unchanged by diffusion.
 *
 * Flow equalises *saturation*, not volume, so a large reservoir next to a small
 * gear tops it up rather than draining into it.
 */
export function diffuseOil(
  edges: readonly OilEdge[],
  nodes: ReadonlyMap<string, OilNode>,
  dt: number,
): Map<string, number> {
  const deltas = new Map<string, number>();
  const add = (id: string, amount: number) => deltas.set(id, (deltas.get(id) ?? 0) + amount);

  for (const edge of edges) {
    const a = nodes.get(edge.gearIdA);
    const b = nodes.get(edge.gearIdB);
    if (!a || !b || a.capacity <= 0 || b.capacity <= 0) continue;

    // Turning teeth carry oil across properly; stationary ones only weep.
    const turning = Math.min(Math.abs(a.omega), Math.abs(b.omega)) > OIL_CONTACT_MIN_OMEGA;
    const contact = turning ? 1 : OIL_STATIC_CONTACT;

    const saturationGap = (a.oil / a.capacity) - (b.oil / b.capacity);
    let flow = OIL_DIFFUSE_K * saturationGap * Math.min(a.capacity, b.capacity) * dt * contact;

    // Never move more than the source has, or more than the sink can take.
    if (flow > 0) {
      flow = Math.min(flow, a.oil + (deltas.get(edge.gearIdA) ?? 0), b.capacity - b.oil);
    } else {
      flow = -Math.min(-flow, b.oil + (deltas.get(edge.gearIdB) ?? 0), a.capacity - a.oil);
    }
    if (flow === 0) continue;

    add(edge.gearIdA, -flow);
    add(edge.gearIdB, flow);
  }

  return deltas;
}
