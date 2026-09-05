import Matter from 'matter-js';
import { GearDefinition, GearType } from '../types/gear.types';
import {
  UNIT_SIZE_TEETH_MULT, CROSSBOW_RANGE_MULT, ARTILLERY_RANGE_MULT,
  CROSSBOW_TURRET_RANGE_FRACTION, ARTILLERY_TURRET_RANGE_FRACTION,
} from './balance.constants';

// ─── Teeth-based sizing ───────────────────────────────────────────────────────

/** Radius = teeth × GEAR_MODULE */
export const GEAR_MODULE = 2.5;
export const DEFAULT_TEETH = 10;
export const MIN_TEETH = 5;
export const MAX_TEETH = 60;

/** Compute gear radius from teeth count */
export function gearRadius(teeth: number): number {
  return teeth * GEAR_MODULE;
}

/** Motor output per full rotation -- feeds the chain's capacitor burst yield, not a stored resource. */
export function motorOutput(teeth: number): number {
  return teeth * 0.4;
}

/** Motor drive torque */
export function motorTorque(teeth: number): number {
  return teeth * teeth * 0.8;
}

/** Spiked gear damage per second coefficient (multiplied by angular velocity) */
export function spikeDamage(teeth: number): number {
  return teeth * 0.5;
}

/** Universal max HP for all gears; armored type gets 3×, spiked gets 0.7× */
export function gearMaxHp(teeth: number, type: GearType): number {
  const base = Math.round(teeth * teeth * 0.5);
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
  return teeth * 0.3;
}

/** Researcher gear: research progress added per full rotation (ms of research time) */
export function researcherOutput(teeth: number): number {
  return teeth * 150; // 10-tooth gear: 1500ms per rotation
}

/** Converter gear: resources converted per full rotation */
export function converterOutput(teeth: number): number {
  return teeth * 0.25;
}

/** Healer gear: HP healed per full rotation per target */
export function healerOutput(teeth: number): number {
  return teeth * 1.5;
}

/** Healer gear: aura radius */
export function healerRadius(teeth: number): number {
  return gearRadius(teeth) * 3;
}

/** Turret: max ammo capacity */
export function turretMaxAmmo(teeth: number): number {
  return Math.max(3, Math.round(teeth * 0.5));
}

/**
 * Turret attack range -- always a fraction of its mobile counterpart's own
 * attack range (see unit.utils.ts computeScaledStats), never an independent
 * number. Used to be a flat base (400/250) scaled by sqrt(teeth/10) that
 * hugely outranged the mobile Crossbow/Artillery it's meant to lose to --
 * 250 vs 48, 400 vs 120 at 10 teeth -- backwards from "defense is cheap but
 * falls to ranged pressure." Deriving it this way makes that inversion
 * structurally impossible: whatever the mobile unit's range becomes, the
 * turret's stays a fixed fraction under it.
 */
export function turretRange(teeth: number, type: 'crossbow_turret' | 'artillery_turret'): number {
  const size = Math.max(4, Math.round(teeth * UNIT_SIZE_TEETH_MULT));
  return type === 'artillery_turret'
    ? Math.round(size * ARTILLERY_RANGE_MULT * ARTILLERY_TURRET_RANGE_FRACTION)
    : Math.round(size * CROSSBOW_RANGE_MULT * CROSSBOW_TURRET_RANGE_FRACTION);
}

/** How far ahead of a minelayer its firing zone reaches, same sqrt-scaling idiom as turretRange. */
export function minelayerFireZoneRange(teeth: number): number {
  return Math.round(180 * Math.sqrt(teeth / 10));
}

/** Mine AoE explosion radius on detonation -- scales with the firing gear's size. */
export function mineRadius(teeth: number): number {
  return Math.max(20, Math.round(teeth * 3));
}

/** Mine detonation damage -- high, deliberately above the artillery turret's per-hit damage. */
export function mineDamage(teeth: number): number {
  return Math.max(15, Math.round(teeth * 3));
}

// ─── Physics constants ───────────────────────────────────────────────────────

export const GEAR_MESH_TOLERANCE = 4;  // pixels

/**
 * Density fed to Matter.js to compute each gear's real rotational inertia
 * from its actual geometry (a solid disk of radius `gearRadius(teeth)`),
 * instead of the old hand-rolled `π·r²·density` "inertia" figure that was
 * really just mass reused as if it were rotational inertia. Real inertia
 * scales with r⁴ (mass ∝ r², inertia ∝ mass·r²), not r² -- which is what
 * makes tooth count cost genuine chain speed now: a reflected-inertia term
 * that used to cancel exactly against the mesh-ratio weighting (the
 * documented "Gear Precision has no trade-off" divergence) no longer does,
 * because real inertia and the ratio² weighting no longer scale the same
 * way. Calibrated so a lone 10-tooth motor's equilibrium omega lands where
 * it always did (~4.07 rad/s) -- the pacing is preserved, only the *shape*
 * of how size costs speed changed, from "not at all" to "quadratically."
 */
export const INERTIA_DENSITY = 0.000008158;

const gearInertiaCache = new Map<number, { mass: number; inertia: number }>();

/** Real mass and rotational inertia for a `teeth`-sized gear, from Matter.js's own solid-disk physics. */
export function gearPhysics(teeth: number): { mass: number; inertia: number } {
  let cached = gearInertiaCache.get(teeth);
  if (!cached) {
    const body = Matter.Bodies.circle(0, 0, gearRadius(teeth), { density: INERTIA_DENSITY });
    cached = { mass: body.mass, inertia: body.inertia };
    gearInertiaCache.set(teeth, cached);
  }
  return cached;
}

/** Real rotational inertia for a `teeth`-sized gear -- see `gearPhysics`. */
export function gearInertia(teeth: number): number {
  return gearPhysics(teeth).inertia;
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
