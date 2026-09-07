/**
 * Heat and oil.
 *
 * A gear train had no maintenance cost: once built it ran forever at whatever
 * speed its chain settled on. Heat gives speed a price. Friction rises with how
 * fast a gear turns and how heavy it is, heat builds, and past a threshold the
 * gear stops being useful and then starts destroying itself.
 *
 * Oil is the answer, and it is deliberately a *logistics* answer rather than a
 * toggle: an oiler makes it from coal, and it spreads along the teeth to the
 * gears actually touching it. Where you put the oiler decides which parts of
 * your machine can safely run fast.
 *
 * Heat shares its pipeline with electrical overload -- surplus power dumps into
 * generators as heat, so both failure modes escalate through the same curve and
 * the same visuals. The player learns "hot is bad" once.
 *
 * Phaser-free and Matter-free: safe for pure tests and for the docs generator.
 */

// ─── Heat ────────────────────────────────────────────────────────────────────

/**
 * Friction coefficient. Heat scales super-linearly with speed (|omega|^1.5), so
 * a chain run twice as fast costs nearly three times the cooling -- which is
 * what makes "just spin everything faster" a decision rather than a free win.
 *
 * Calibrated against real chain speeds, which is the whole point of the number.
 * A gear settles at `FRICTION_K * omega^1.5 / COOL_K`, so with a tier-1
 * threshold of 100:
 *
 *   ~4 rad/s  (a plain motor)                 ~37% of threshold -- safe
 *   ~6 rad/s  (a modest chain)                ~67% -- warm, still fine
 *   ~8 rad/s  (amplified or overclocked)      ~102% -- seizes dry
 *
 * So ordinary machines never overheat and never think about it, and pushing for
 * speed is exactly when oil stops being optional. At the earlier 0.55 a gear
 * could not have seized from friction at any speed the game can actually
 * produce, which would have made the whole mechanic decorative.
 */
export const FRICTION_K = 1.0;
export const FRICTION_SPEED_EXP = 1.5;

/** Newtonian cooling toward ambient. Fraction of current heat shed per second. */
export const COOL_K = 0.22;

/**
 * Heat a gear tolerates before seizing, at tier 1.
 *
 * Scales with tier: a bigger gear has more metal to soak heat into, which is
 * the one place where being large is straightforwardly better and helps pay for
 * a big gear's electricity bill.
 */
export const HEAT_THRESHOLD_BASE = 100;
export const HEAT_THRESHOLD_TIER_STEP = 1.5;

/**
 * Band edges, as fractions of the threshold.
 *
 * The gap between SEIZE (1.0) and RELEASE (0.7) is hysteresis, and it is
 * load-bearing: without it a gear sitting exactly at its limit would seize and
 * release every frame, flickering visually and stuttering the whole chain.
 */
export const HOT_FRACTION = 0.8;
export const SEIZE_RELEASE_FRACTION = 0.7;

/** Efficiency floor at the top of the 'hot' band, just before seizing. */
export const HOT_EFFICIENCY_FLOOR = 0.6;

/** Jam stress a seizure applies, at tier 1 -- feeds the existing damage loop. */
export const SEIZE_STRESS_BASE = 40;

/**
 * How fast seizure stress escalates while a gear is left hot, per second.
 *
 * Ignoring an overheat has to get worse, or the failure state is just a pause.
 * Reacting early costs some HP; ignoring it costs the gear.
 */
export const SEIZE_RAMP_PER_SEC = 0.35;

// ─── Oil ─────────────────────────────────────────────────────────────────────

/** Oil a gear can hold, at tier 1. */
export const OIL_CAPACITY_BASE = 20;

/** An oiler's own reservoir is far larger -- it is the source, not a consumer. */
export const OILER_CAPACITY_MULT = 6;

/** Oil produced per oiler rotation, and the coal it costs. */
export const OIL_PER_ROTATION = 4;
export const COAL_PER_OIL_ROTATION = 1;

/** Fraction of friction a fully oiled gear avoids. */
export const OIL_FRICTION_RELIEF = 0.45;

/** Extra cooling from a full oil film, on top of COOL_K. */
export const OIL_BLEED_K = 0.3;

/** How much a full oil film raises the seize threshold. */
export const OIL_THRESHOLD_BONUS = 0.8;

/** Oil burned off per radian turned, and the multiplier once a gear runs hot. */
export const OIL_BURN_K = 0.012;
export const OIL_BURN_HOT_MULT = 2;
/** Heat fraction above which oil starts cooking off faster. */
export const OIL_BURN_HOT_FRACTION = 0.6;

/**
 * Oil diffusion rate along meshed teeth, per second.
 *
 * Oil rides the teeth, so it spreads over the MESH graph, not the wire network.
 * It equalises by saturation rather than by volume, so a big gear next to a
 * small one does not drain it dry.
 */
export const OIL_DIFFUSE_K = 0.8;

/** Diffusion sub-tick. Oil moves slowly; resolving it every frame is waste. */
export const OIL_DIFFUSE_INTERVAL_MS = 250;

/** Below this speed two gears are treated as barely in contact -- they still weep a little. */
export const OIL_CONTACT_MIN_OMEGA = 0.05;
export const OIL_STATIC_CONTACT = 0.15;
