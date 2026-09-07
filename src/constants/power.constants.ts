/**
 * The electrical grid.
 *
 * Motors used to be the only source of motion and had no running cost, so a
 * gear train was a one-off purchase with no failure mode to manage. Electricity
 * gives the machine an appetite: generation you build, storage you size, a
 * buyer you have to physically reach with cable, and a punishment for
 * overshooting.
 *
 * The asymmetry is the point, and the GDD states it plainly:
 * **under-power is safe, over-power burns.** A brownout only slows you down; an
 * overload dumps its surplus into heat and eventually destroys the generators
 * making it. That is what makes batteries and the run back to the grid tie
 * worth building rather than optional.
 *
 * Units are nominal "kW" -- an arbitrary scale chosen so a tier-1 solar panel
 * reads as 1. Phaser-free and Matter-free: safe for pure tests and for
 * tools/gen-design-docs.mjs.
 */

// ─── Wiring ──────────────────────────────────────────────────────────────────

/** Reach of an ordinary electrical gear, in px. */
export const WIRE_BASE_RANGE = 140;

/** Reach of a power pole. A pole's entire job is span, so it gets a long one. */
export const POLE_RANGE = 420;

/**
 * Wires per gear. Uncapped, the network becomes unreadable spaghetti and the
 * renderer's edge count grows quadratically; poles get a higher cap because
 * being a junction is what they are for.
 */
export const MAX_WIRES_PER_GEAR = 4;
export const MAX_WIRES_PER_POLE = 8;

// ─── Generation ──────────────────────────────────────────────────────────────

/** Solar: small, free, weather-proof, and never enough on its own. */
export const SOLAR_OUTPUT = 1;

/** Burner: the workhorse. Turns coal into electricity and waste heat. */
export const BURNER_OUTPUT = 6;
export const BURNER_COAL_PER_SEC = 0.35;
/** Heat a running burner adds to itself per second, before any overload. */
export const BURNER_SELF_HEAT = 4;

/**
 * Crank: the cold-start bootstrap. One click spins it, and its output decays to
 * nothing across the window, so it can get a first burner lit but can never be
 * the basis of an economy.
 */
export const CRANK_OUTPUT = 4;
export const CRANK_WINDOW_MS = 6000;

// ─── Storage ─────────────────────────────────────────────────────────────────

export const BATTERY_CAPACITY = 40;
/** Cap on how fast a battery can give its charge back, per second. */
export const BATTERY_MAX_DISCHARGE = 8;

// ─── Consumption ─────────────────────────────────────────────────────────────

/** Electricity a tier-1 motor asks for. Scales ×1.5 per tier like everything else. */
export const MOTOR_DRAW = 1.5;

/**
 * What an unpowered motor still manages. Motors are not bricked by a blackout --
 * they idle, slowly. This is what keeps a bad grid recoverable instead of a
 * dead run.
 *
 * STAGED AT 1.0. The grid is wired up and solving, but nothing depends on it
 * yet: dropping this to its intended 0.15 before the grid tie, the wire tool
 * and AI grid-building all exist would leave every unwired motor -- which is
 * every motor in an opening position, and every motor the AI builds -- running
 * at 15% speed with no way to fix it. Lowered to 0.15 in the same change that
 * gives both players a grid to build.
 */
export const MOTOR_BASELINE = 1.0;

/** The value MOTOR_BASELINE becomes once the grid is playable. */
export const MOTOR_BASELINE_TARGET = 0.15;

/**
 * Largest tier a motor can drive on baseline power alone. Above this, the grid
 * is not optional: electricity is what makes big gears usable, which is the
 * trade that replaced the old r⁴ inertia penalty.
 */
export const MAX_UNPOWERED_TIER = 2;

// ─── Selling ─────────────────────────────────────────────────────────────────

/**
 * The grid tie at each base wall buys surplus electricity. It is a node you
 * must physically reach with cable, not an ambient rule -- so the long exposed
 * run back across your own territory is part of the cost, and an enemy sapper
 * can cut it.
 *
 * Because a wire is a graph edge, connecting to the tie merges your network
 * into the tie's component. Splitting your grid to multiply sell income simply
 * disconnects the pieces from the buyer, so no anti-exploit rule is needed.
 */
export const TIE_INTAKE = 12;
export const GOLD_PER_ELECTRICITY = 0.35;

// ─── Overload ────────────────────────────────────────────────────────────────

/**
 * Surplus with nowhere to go becomes heat in the generators producing it,
 * shared in proportion to output. Overload and overheating therefore run
 * through one escalation curve and one visual language: the player learns
 * "hot is bad" once and it covers both.
 */
export const OVERLOAD_HEAT_PER_UNIT = 3;

/** Grid events are throttled to this rate so a steady overload does not spam. */
export const GRID_EVENT_INTERVAL_MS = 250;

/**
 * Power satisfaction is rounded to this many steps before it reaches a motor.
 *
 * Motor torque depends on satisfaction, and torque changes force
 * RotationPhysicsSystem to re-run an O(V+E) double BFS. Continuous satisfaction
 * would mean rebuilding every chain every frame. Quantising means the value
 * only changes when it meaningfully changes, so a settled grid costs nothing.
 */
export const SATISFACTION_STEPS = 32;
