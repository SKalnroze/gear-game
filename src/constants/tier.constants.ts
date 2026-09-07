/**
 * The gear tier ladder.
 *
 * Gears used to take any tooth count from 5 to 60, and size was a *trap*:
 * Matter.js gives a solid disk inertia ∝ r⁴ while motor torque only grew ∝ r²,
 * so with ω = torque / inertia a 40-tooth motor span at 0.016 rad/s against an
 * 8-tooth motor's 10.08 -- 634× slower. Optimal play was to build the smallest
 * gear that did the job, which is the opposite of a game about gears.
 *
 * Five discrete tiers replace that. Each step is exactly ×1.5 in teeth, in
 * strength, and in inertia. Because torque and inertia now scale together, a
 * lone motor of any tier settles at the same ~4.07 rad/s: **tier buys strength,
 * electricity buys speed.** That separation is the whole redesign.
 *
 * TIER_STEP is the single strength scalar. Anything that gets stronger with
 * size derives from `tierPower()` rather than inventing its own curve -- the
 * old per-teeth formulas (miningOutput, converterOutput, healerOutput...) were
 * four independent `teeth × k` lines free to drift apart from each other.
 *
 * Phaser-free and Matter-free: safe to import from pure test modules and from
 * tools/gen-design-docs.mjs.
 */

import type { GearTier } from '../types/gear.types';

export const MIN_TIER: GearTier = 1;
export const MAX_TIER: GearTier = 5;
export const DEFAULT_TIER: GearTier = 1;

export const ALL_TIERS: readonly GearTier[] = [1, 2, 3, 4, 5];

/** Strength multiplier per tier step. The ladder's one constant. */
export const TIER_STEP = 1.5;

/**
 * Teeth per tier = round(8 · 1.5^p), so the silhouette ladder *is* the power
 * ladder -- a gear that looks 1.5× bigger is 1.5× stronger.
 */
export const TIER_TEETH: Record<GearTier, number> = {
  1: 8,
  2: 12,
  3: 18,
  4: 27,
  5: 40,
};

/**
 * Attack/aura range grows far more slowly than strength. At the full 1.5^p a
 * tier-5 artillery would reach 5.06× as far and shoot across most of the map;
 * 1.15^p gives ≈1.75× at T5 -- clearly better, not map-breaking. Documented in
 * the GDD as a deliberate exception to the ladder.
 */
export const TIER_RANGE_STEP = 1.15;

/** Cost climbs faster than power, so a big gear is a commitment, not a default. */
export const TIER_COST_STEP = 1.6;

/** Strength multiplier for a tier. `tierPower(1) === 1`. */
export function tierPower(tier: GearTier): number {
  return Math.pow(TIER_STEP, tier - 1);
}

/** Range multiplier for a tier -- deliberately shallower than tierPower. */
export function tierRangeFactor(tier: GearTier): number {
  return Math.pow(TIER_RANGE_STEP, tier - 1);
}

/** Cost multiplier for a tier -- deliberately steeper than tierPower. */
export function tierCostFactor(tier: GearTier): number {
  return Math.pow(TIER_COST_STEP, tier - 1);
}

/** Teeth for a tier. Radius is still teeth × GEAR_MODULE. */
export function teethForTier(tier: GearTier): number {
  return TIER_TEETH[tier];
}

/**
 * Nearest tier for a raw tooth count.
 *
 * Migration shim only: it lets the teeth-keyed call sites keep working while
 * they are converted tier by tier. Deleted once `teeth` leaves GearState.
 */
export function tierForTeeth(teeth: number): GearTier {
  let best: GearTier = MIN_TIER;
  let bestDelta = Infinity;
  for (const tier of ALL_TIERS) {
    const delta = Math.abs(TIER_TEETH[tier] - teeth);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = tier;
    }
  }
  return best;
}

/** Clamp any number into the tier range, for stepper UI and loaded saves. */
export function clampTier(tier: number): GearTier {
  return Math.max(MIN_TIER, Math.min(MAX_TIER, Math.round(tier))) as GearTier;
}
