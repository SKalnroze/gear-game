import Matter from 'matter-js';
import { GearDefinition, GearType, GearTier } from '../types/gear.types';
import {
  TIER_TEETH, tierPower, tierRangeFactor, tierForTeeth, DEFAULT_TIER, MAX_TIER,
} from './tier.constants';
import {
  UNIT_SIZE_TEETH_MULT, CROSSBOW_RANGE_MULT, ARTILLERY_RANGE_MULT,
  CROSSBOW_TURRET_RANGE_FRACTION, ARTILLERY_TURRET_RANGE_FRACTION,
} from './balance.constants';

// ─── Tier-based sizing ───────────────────────────────────────────────────────
//
// Every "how strong is this gear" number below is `BASE × tierPower(tier)`,
// where BASE is the value the old formula produced at DEFAULT_TEETH (10). That
// keeps the opening game feeling exactly as it did while making each tier step
// a clean ×1.5 across the board. The old file had six independent `teeth × k`
// formulas that were free to drift apart from one another; there is now one
// curve and six base constants.
//
// The functions still take `teeth` so the call sites did not all have to change
// at once. They resolve it to a tier immediately. Once `teeth` leaves GearState
// these signatures take a GearTier directly.

/** Radius = teeth × GEAR_MODULE */
export const GEAR_MODULE = 2.5;
export const DEFAULT_TEETH = TIER_TEETH[DEFAULT_TIER];
/** Teeth of the largest gear that can exist -- used to size spatial-grid cells. */
export const MAX_GEAR_TEETH = TIER_TEETH[MAX_TIER];

/** Compute gear radius from teeth count */
export function gearRadius(teeth: number): number {
  return teeth * GEAR_MODULE;
}

/** Radius for a tier, the preferred form. */
export function tierRadius(tier: GearTier): number {
  return gearRadius(TIER_TEETH[tier]);
}

// Base values, all calibrated to what the old per-teeth formulas produced at
// 10 teeth -- the size a match used to open on.
const MOTOR_OUTPUT_BASE = 4;        // was teeth * 0.4
export const MOTOR_TORQUE_BASE = 80; // was teeth² * 0.8
const SPIKE_DAMAGE_BASE = 5;        // was teeth * 0.5
const GEAR_MAX_HP_BASE = 50;        // was round(teeth² * 0.5)
const MINING_OUTPUT_BASE = 3;       // was teeth * 0.3
const RESEARCHER_OUTPUT_BASE = 1500; // ms of research per rotation
const CONVERTER_OUTPUT_BASE = 2.5;  // was teeth * 0.25
const HEALER_OUTPUT_BASE = 15;      // was teeth * 1.5
const TURRET_AMMO_BASE = 5;         // was max(3, round(teeth * 0.5))
const MINELAYER_ZONE_BASE = 180;
const MINE_RADIUS_BASE = 30;
const MINE_DAMAGE_BASE = 30;

/** Motor output per full rotation -- feeds the chain's yield, not a stored resource. */
export function motorOutput(teeth: number): number {
  return MOTOR_OUTPUT_BASE * tierPower(tierForTeeth(teeth));
}

/**
 * Motor drive torque.
 *
 * Scales ×1.5 per tier -- exactly matching gearInertia below, which is what
 * makes a lone motor of any tier settle at the same omega. Size no longer buys
 * or costs speed; it buys strength.
 */
export function motorTorque(teeth: number): number {
  return MOTOR_TORQUE_BASE * tierPower(tierForTeeth(teeth));
}

/** Spiked gear damage per second coefficient (multiplied by angular velocity) */
export function spikeDamage(teeth: number): number {
  return SPIKE_DAMAGE_BASE * tierPower(tierForTeeth(teeth));
}

/** Universal max HP for all gears; armored type gets 3×, spiked gets 0.7× */
export function gearMaxHp(teeth: number, type: GearType): number {
  const base = Math.round(GEAR_MAX_HP_BASE * tierPower(tierForTeeth(teeth)));
  if (type === 'armored') return base * 3;
  if (type === 'spiked') return Math.round(base * 0.7);
  return base;
}

/**
 * Visual damage tier, 0 (pristine) to 4 (near-destroyed).
 * Guards maxHp of 0, which would otherwise yield NaN and skip every clamp.
 */
export function crackLevelFor(hp: number, maxHp: number): number {
  if (maxHp <= 0) return 4;
  const ratio = 1 - hp / maxHp;
  return Math.max(0, Math.min(4, Math.floor(ratio * 5)));
}

/** Mining gear output per full rotation */
export function miningOutput(teeth: number): number {
  return MINING_OUTPUT_BASE * tierPower(tierForTeeth(teeth));
}

/** Researcher gear: research progress added per full rotation (ms of research time) */
export function researcherOutput(teeth: number): number {
  return RESEARCHER_OUTPUT_BASE * tierPower(tierForTeeth(teeth));
}

/** Converter gear: resources converted per full rotation */
export function converterOutput(teeth: number): number {
  return CONVERTER_OUTPUT_BASE * tierPower(tierForTeeth(teeth));
}

/** Healer gear: HP healed per full rotation per target */
export function healerOutput(teeth: number): number {
  return HEALER_OUTPUT_BASE * tierPower(tierForTeeth(teeth));
}

/**
 * Healer gear: aura radius.
 * Geometric, not a strength stat -- it stays tied to the gear's actual drawn
 * size so the aura keeps visually matching the thing casting it.
 */
export function healerRadius(teeth: number): number {
  return gearRadius(teeth) * 3;
}

/** Turret: max ammo capacity */
export function turretMaxAmmo(teeth: number): number {
  return Math.max(3, Math.round(TURRET_AMMO_BASE * tierPower(tierForTeeth(teeth))));
}

/**
 * Turret attack range -- always a fraction of its mobile counterpart's own
 * attack range (see unit.utils.ts computeTierStats), never an independent
 * number. Used to be a flat base (400/250) scaled by sqrt(teeth/10) that
 * hugely outranged the mobile Crossbow/Artillery it's meant to lose to --
 * 250 vs 48, 400 vs 120 at 10 teeth -- backwards from "defense is cheap but
 * falls to ranged pressure." Deriving it this way makes that inversion
 * structurally impossible: whatever the mobile unit's range becomes, the
 * turret's stays a fixed fraction under it.
 *
 * Note the tier factor is tierRangeFactor, not tierPower -- range is the
 * ladder's one deliberate exception, and the mobile units use the same
 * shallower curve, so the fraction holds at every tier.
 */
export function turretRange(teeth: number, type: 'crossbow_turret' | 'artillery_turret'): number {
  const tier = tierForTeeth(teeth);
  const baseSize = Math.max(4, Math.round(TIER_TEETH[1] * UNIT_SIZE_TEETH_MULT));
  const reach = type === 'artillery_turret'
    ? baseSize * ARTILLERY_RANGE_MULT * ARTILLERY_TURRET_RANGE_FRACTION
    : baseSize * CROSSBOW_RANGE_MULT * CROSSBOW_TURRET_RANGE_FRACTION;
  return Math.round(reach * tierRangeFactor(tier));
}

/** How far ahead of a minelayer its firing zone reaches -- a range, so the shallow curve. */
export function minelayerFireZoneRange(teeth: number): number {
  return Math.round(MINELAYER_ZONE_BASE * tierRangeFactor(tierForTeeth(teeth)));
}

/** Mine AoE explosion radius on detonation -- a range, so the shallow curve. */
export function mineRadius(teeth: number): number {
  return Math.max(20, Math.round(MINE_RADIUS_BASE * tierRangeFactor(tierForTeeth(teeth))));
}

/** Mine detonation damage -- high, deliberately above the artillery turret's per-hit damage. */
export function mineDamage(teeth: number): number {
  return Math.max(15, Math.round(MINE_DAMAGE_BASE * tierPower(tierForTeeth(teeth))));
}

// ─── Physics constants ───────────────────────────────────────────────────────

export const GEAR_MESH_TOLERANCE = 4;  // pixels

/**
 * Density fed to Matter.js to compute a body's real mass and rotational
 * inertia from its geometry (a solid disk of radius `gearRadius(teeth)`).
 *
 * Retained for UnitPhysicsWorld, which simulates units as genuine Matter
 * bodies. It is deliberately NO LONGER on the gear rotation path -- see
 * `gearInertia` below.
 */
export const INERTIA_DENSITY = 0.000008158;

const gearInertiaCache = new Map<number, { mass: number; inertia: number }>();

/** Real mass and rotational inertia for a `teeth`-sized disk, from Matter.js's own physics. */
export function gearPhysics(teeth: number): { mass: number; inertia: number } {
  let cached = gearInertiaCache.get(teeth);
  if (!cached) {
    const body = Matter.Bodies.circle(0, 0, gearRadius(teeth), { density: INERTIA_DENSITY });
    cached = { mass: body.mass, inertia: body.inertia };
    gearInertiaCache.set(teeth, cached);
  }
  return cached;
}

/**
 * Rotational inertia of a gear, from the TIER LADDER rather than from geometry.
 *
 * This function used to return `gearPhysics(teeth).inertia`, i.e. a real solid
 * disk, whose inertia scales with r⁴ (mass ∝ r², inertia ∝ mass·r²). Motor
 * torque only scales with r². Since a chain settles at ω = torque / inertia,
 * that made every large gear catastrophically slow: measured on the real
 * bodies, a 40-tooth motor span at 0.0159 rad/s against an 8-tooth motor's
 * 10.08 -- **634× slower**. Size was not a trade-off, it was a punishment, and
 * the optimal line was to avoid the game's central mechanic entirely.
 *
 * Inertia now steps ×1.5 per tier, exactly matching motorTorque, so a lone
 * motor of any tier settles at the same ~4.07 rad/s. BASE_INERTIA is the old
 * 10-tooth disk inertia, so tier 1 reproduces the pacing the game already had.
 *
 * The trade this replaces r⁴ with: a bigger gear is strictly stronger, costs
 * more gold, and -- once the power grid lands -- draws far more electricity.
 * Scarcity moves from physics to the grid, where the player can see and manage
 * it. Physical realism was buying an unreadable, unwinnable trade-off.
 */
export const BASE_INERTIA = 19.6366;

export function gearInertia(teeth: number): number {
  return BASE_INERTIA * tierPower(tierForTeeth(teeth));
}

// ─── Gear definitions (per-type, properties scale with teeth) ────────────────

export const GEAR_DEFINITIONS: Record<GearType, GearDefinition> = {
  motor: {
    type: 'motor',
    goldCost: 0,
    description: 'Drives rotation. Larger motors deliver more torque, but every gear meshed on the chain slows it down.',
  },

  amplifier: {
    type: 'amplifier',
    goldCost: 0,
    description: 'Multiplies the whole chain torque by 1.4x -- the chain spins faster, so everything on it happens more often.',
    unlockNode: 'basic_amplifier',
  },

  capacitor: {
    type: 'capacitor',
    goldCost: 0,
    description: 'Stores rotations and pays out a gold burst every 8th -- 2.5x the chain output.',
    unlockNode: 'basic_capacitor',
  },

  overclock: {
    type: 'overclock',
    goldCost: 10,
    description: '+50% torque/omega to adjacent gears. Runs 10s, burns out for 5s, then restarts.',
    unlockNode: 'basic_overclock',
  },

  spiked: {
    type: 'spiked',
    goldCost: 0,
    description: 'Damages units on contact. Damage = |omega| × spikeDamage(teeth).',
    unlockNode: 'spiked_gears',
  },

  armored: {
    type: 'armored',
    goldCost: 0,
    description: 'Blocks unit movement. HP scales with teeth². Must be destroyed to pass.',
    unlockNode: 'armored_gears',
  },

  iron_miner: {
    type: 'iron_miner',
    goldCost: 0,
    description: 'Generates iron per full rotation. Output scales with teeth.',
    unlockNode: 'unlock_iron_mining',
  },

  crystal_miner: {
    type: 'crystal_miner',
    goldCost: 0,
    description: 'Generates crystal per full rotation. Output scales with teeth.',
    unlockNode: 'unlock_crystal_mining',
  },

  aether_miner: {
    type: 'aether_miner',
    goldCost: 0,
    description: 'Generates aether per full rotation. Output scales with teeth.',
    unlockNode: 'unlock_aether_mining',
  },

  infantry_spawner: {
    type: 'infantry_spawner',
    goldCost: 5,
    description: 'Spawns an Infantry unit per full rotation (5 gold cost).',
  },

  artillery_spawner: {
    type: 'artillery_spawner',
    goldCost: 8,
    description: 'Spawns an Artillery unit per full rotation (8 gold cost).',
    unlockNode: 'unlock_artillery_spawner',
  },

  cavalry_spawner: {
    type: 'cavalry_spawner',
    goldCost: 12,
    description: 'Spawns a Cavalry unit per full rotation (12 gold cost).',
    unlockNode: 'unlock_cavalry_spawner',
  },

  slime_spawner: {
    type: 'slime_spawner',
    goldCost: 5,
    description: 'Spawns a Slime unit per full rotation (2 gold cost -- cheap and spammable). Slimes deal no damage and never stop to fight; they pile up and physically clog the lane, then burst into a slowing puddle on death.',
    unlockNode: 'unlock_slime_spawner',
  },

  crossbow_spawner: {
    type: 'crossbow_spawner',
    goldCost: 6,
    description: 'Spawns a Crossbow unit per full rotation (6 gold cost). Ranged skirmisher: same per-hit damage as Infantry, lower DPS, stops and shoots instead of closing to melee.',
    unlockNode: 'unlock_crossbow_spawner',
  },

  sentry_spawner: {
    type: 'sentry_spawner',
    goldCost: 8,
    description: 'Spawns a Sentry unit per full rotation (10 gold cost). Pulses true-sight as it marches, revealing hidden enemy mines early.',
    unlockNode: 'unlock_sentry',
  },

  iron_guard_spawner: {
    type: 'iron_guard_spawner',
    goldCost: 8,
    description: 'Spawns an Iron Guard unit per full rotation (8 iron cost).',
    unlockNode: 'unlock_iron_guard_spawner',
  },

  crystal_sentinel_spawner: {
    type: 'crystal_sentinel_spawner',
    goldCost: 6,
    description: 'Spawns a Crystal Sentinel unit per full rotation (6 crystal cost).',
    unlockNode: 'unlock_crystal_sentinel_spawner',
  },

  aether_phantom_spawner: {
    type: 'aether_phantom_spawner',
    goldCost: 5,
    description: 'Spawns an Aether Phantom unit per full rotation (5 aether cost).',
    unlockNode: 'unlock_aether_phantom_spawner',
  },

  researcher: {
    type: 'researcher',
    goldCost: 0,
    description: 'Advances current research on each full rotation. Larger gears research faster.',
  },

  iron_converter: {
    type: 'iron_converter',
    goldCost: 0,
    description: 'Converts iron into gold on each full rotation. Larger gears convert more.',
    unlockNode: 'iron_to_gold',
  },

  crystal_converter: {
    type: 'crystal_converter',
    goldCost: 0,
    description: 'Converts crystal into gold on each full rotation at a favorable rate.',
    unlockNode: 'crystal_to_gold',
  },

  aether_converter: {
    type: 'aether_converter',
    goldCost: 0,
    description: 'Converts aether into gold on each full rotation at the best rate.',
    unlockNode: 'aether_to_gold',
  },

  crossbow_turret: {
    type: 'crossbow_turret',
    goldCost: 5,
    description: 'Defensive turret. Each rotation buys 1 ammo bolt (2 gold). Fires quickly at nearby enemies; low damage, medium range.',
    unlockNode: 'crossbow_turret_tech',
  },

  artillery_turret: {
    type: 'artillery_turret',
    goldCost: 8,
    description: 'Heavy turret. Each rotation buys 1 ammo shell (6 gold). Fires slowly with AoE; high damage, long range.',
    unlockNode: 'artillery_turret_tech',
  },

  minelayer: {
    type: 'minelayer',
    goldCost: 6,
    description: 'Each rotation buys 1 mine shell (5 gold). Lobs a mine into a zone ahead of it; mines arm after a short delay, then hide from the enemy until triggered.',
    unlockNode: 'unlock_minelayer',
  },

  healer: {
    type: 'healer',
    goldCost: 0,
    description: 'Emits a healing aura on each full rotation. Heals nearby friendly gears and units. Aura size and healing scale with gear size.',
    unlockNode: 'healer_gear_tech',
  },

  sentry_gear: {
    type: 'sentry_gear',
    goldCost: 6,
    description: 'Pulses true-sight on each full rotation, revealing hidden enemy mines within its radius early. Stationary counter to the Minelayer.',
    unlockNode: 'unlock_sentry',
  },

  relief_valve: {
    type: 'relief_valve',
    goldCost: 8,
    description: 'A clutch built to take a jam for the chain instead of breaking. Sharply reduces its own jam damage, and softens jam damage on a meshed neighbour too.',
    unlockNode: 'unlock_relief_valve',
  },

  sapper_spawner: {
    type: 'sapper_spawner',
    goldCost: 6,
    description: 'Spawns a Sapper unit per full rotation (9 gold cost). Weak against other units, but its hits against gears count for 6x -- built to breach a turtled defense.',
    unlockNode: 'unlock_sapper_spawner',
  },

  skirmish_diver_spawner: {
    type: 'skirmish_diver_spawner',
    goldCost: 6,
    description: 'Spawns a Skirmish Diver unit per full rotation (9 gold cost). Fast flanker that punishes Artillery, Crystal Sentinel and Crossbow for stopping to shoot -- loses hard to anything that can also close on it.',
    unlockNode: 'unlock_skirmish_diver_spawner',
  },

  saboteur_spawner: {
    type: 'saboteur_spawner',
    goldCost: 6,
    description: 'Spawns a Saboteur unit per full rotation (10 gold cost). Fouls an enemy gear\'s rotation on contact instead of damaging it -- attacks the machine\'s speed, not its health.',
    unlockNode: 'unlock_saboteur_spawner',
  },

  raider_spawner: {
    type: 'raider_spawner',
    goldCost: 6,
    description: 'Spawns a Raider unit per full rotation (10 gold cost). Disables an enemy miner or converter within the lane for a few seconds instead of damaging it.',
    unlockNode: 'unlock_raider_spawner',
  },

  field_medic_spawner: {
    type: 'field_medic_spawner',
    goldCost: 6,
    description: 'Spawns a Field Medic unit per full rotation (8 gold cost). Marches with the army, healing nearby allied units on a pulse. Never fights.',
    unlockNode: 'unlock_field_medic_spawner',
  },
};
