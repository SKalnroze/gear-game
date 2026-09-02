import { GearDefinition, GearType } from '../types/gear.types';

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

/** Scale a base power cost (defined at teeth=10) using area-based (quadratic) scaling */
export function gearPowerCost(baseCost: number, teeth: number): number {
  return Math.round(baseCost * (teeth * teeth) / (DEFAULT_TEETH * DEFAULT_TEETH));
}

/** Motor power output per full rotation */
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

/** Turret attack range */
export function turretRange(teeth: number, type: 'crossbow_turret' | 'artillery_turret'): number {
  const base = type === 'artillery_turret' ? 400 : 250;
  return Math.round(base * Math.sqrt(teeth / 10));
}

// ─── Physics constants ───────────────────────────────────────────────────────

export const GEAR_MESH_TOLERANCE = 4;  // pixels
export const INERTIA_DENSITY = 0.01;

// ─── Gear definitions (per-type, properties scale with teeth) ────────────────

export const GEAR_DEFINITIONS: Record<GearType, GearDefinition> = {
  motor: {
    type: 'motor',
    basePowerCost: 0,
    goldCost: 0,
    synergies: [
      {
        requiredNeighbor: 'amplifier',
        bonus: { type: 'chain_power_pct', value: 0.1 },
        description: '+10% chain power when adjacent to Amplifier',
      },
    ],
    description: 'Drives rotation and generates power per full rotation. Output scales with teeth.',
  },

  amplifier: {
    type: 'amplifier',
    basePowerCost: 20,
    goldCost: 0,
    synergies: [],
    description: '×1.4 power multiplier on all downstream chain power.',
    unlockNode: 'basic_amplifier',
  },

  capacitor: {
    type: 'capacitor',
    basePowerCost: 30,
    goldCost: 0,
    synergies: [
      {
        requiredNeighbor: 'overclock',
        bonus: { type: 'burst_multiplier', value: 1.0 },
        description: 'Burst at 4× instead of 3× when adjacent to Overclock gear',
      },
    ],
    description: 'Stores rotations and releases a 2.5× burst every 8 full rotations.',
    unlockNode: 'basic_capacitor',
  },

  overclock: {
    type: 'overclock',
    basePowerCost: 40,
    goldCost: 10,
    synergies: [],
    description: '+50% torque/omega to adjacent gears for 10s, then burns out.',
    unlockNode: 'basic_overclock',
  },

  spiked: {
    type: 'spiked',
    basePowerCost: 15,
    goldCost: 0,
    synergies: [],
    description: 'Damages units on contact. Damage = |omega| × spikeDamage(teeth).',
    unlockNode: 'spiked_gears',
  },

  armored: {
    type: 'armored',
    basePowerCost: 20,
    goldCost: 0,
    synergies: [],
    description: 'Blocks unit movement. HP scales with teeth². Must be destroyed to pass.',
    unlockNode: 'armored_gears',
  },

  iron_miner: {
    type: 'iron_miner',
    basePowerCost: 25,
    goldCost: 0,
    synergies: [],
    description: 'Generates iron per full rotation. Output scales with teeth.',
    unlockNode: 'unlock_iron_mining',
  },

  crystal_miner: {
    type: 'crystal_miner',
    basePowerCost: 25,
    goldCost: 0,
    synergies: [],
    description: 'Generates crystal per full rotation. Output scales with teeth.',
    unlockNode: 'unlock_crystal_mining',
  },

  aether_miner: {
    type: 'aether_miner',
    basePowerCost: 25,
    goldCost: 0,
    synergies: [],
    description: 'Generates aether per full rotation. Output scales with teeth.',
    unlockNode: 'unlock_aether_mining',
  },

  infantry_spawner: {
    type: 'infantry_spawner',
    basePowerCost: 10,
    goldCost: 5,
    synergies: [],
    description: 'Spawns an Infantry unit per full rotation (5 gold cost).',
  },

  artillery_spawner: {
    type: 'artillery_spawner',
    basePowerCost: 15,
    goldCost: 8,
    synergies: [],
    description: 'Spawns an Artillery unit per full rotation (8 gold cost).',
    unlockNode: 'unlock_artillery_spawner',
  },

  cavalry_spawner: {
    type: 'cavalry_spawner',
    basePowerCost: 20,
    goldCost: 12,
    synergies: [],
    description: 'Spawns a Cavalry unit per full rotation (12 gold cost).',
    unlockNode: 'unlock_cavalry_spawner',
  },

  iron_guard_spawner: {
    type: 'iron_guard_spawner',
    basePowerCost: 15,
    goldCost: 8,
    synergies: [],
    description: 'Spawns an Iron Guard unit per full rotation (8 iron cost).',
    unlockNode: 'unlock_iron_guard_spawner',
  },

  crystal_sentinel_spawner: {
    type: 'crystal_sentinel_spawner',
    basePowerCost: 12,
    goldCost: 6,
    synergies: [],
    description: 'Spawns a Crystal Sentinel unit per full rotation (6 crystal cost).',
    unlockNode: 'unlock_crystal_sentinel_spawner',
  },

  aether_phantom_spawner: {
    type: 'aether_phantom_spawner',
    basePowerCost: 10,
    goldCost: 5,
    synergies: [],
    description: 'Spawns an Aether Phantom unit per full rotation (5 aether cost).',
    unlockNode: 'unlock_aether_phantom_spawner',
  },

  researcher: {
    type: 'researcher',
    basePowerCost: 10,
    goldCost: 0,
    synergies: [],
    description: 'Advances current research on each full rotation. Larger gears research faster.',
  },

  iron_converter: {
    type: 'iron_converter',
    basePowerCost: 20,
    goldCost: 0,
    synergies: [],
    description: 'Converts iron into gold on each full rotation. Larger gears convert more.',
    unlockNode: 'iron_to_gold',
  },

  crystal_converter: {
    type: 'crystal_converter',
    basePowerCost: 20,
    goldCost: 0,
    synergies: [],
    description: 'Converts crystal into gold on each full rotation at a favorable rate.',
    unlockNode: 'crystal_to_gold',
  },

  aether_converter: {
    type: 'aether_converter',
    basePowerCost: 20,
    goldCost: 0,
    synergies: [],
    description: 'Converts aether into gold on each full rotation at the best rate.',
    unlockNode: 'aether_to_gold',
  },

  crossbow_turret: {
    type: 'crossbow_turret',
    basePowerCost: 30,
    goldCost: 5,
    synergies: [],
    description: 'Defensive turret. Each rotation buys 1 ammo bolt (2 gold). Fires quickly at nearby enemies; low damage, medium range.',
    unlockNode: 'crossbow_turret_tech',
  },

  artillery_turret: {
    type: 'artillery_turret',
    basePowerCost: 50,
    goldCost: 8,
    synergies: [],
    description: 'Heavy turret. Each rotation buys 1 ammo shell (6 gold). Fires slowly with AoE; high damage, long range.',
    unlockNode: 'artillery_turret_tech',
  },

  healer: {
    type: 'healer',
    basePowerCost: 25,
    goldCost: 0,
    synergies: [],
    description: 'Emits a healing aura on each full rotation. Heals nearby friendly gears and units. Aura size and healing scale with gear size.',
    unlockNode: 'healer_gear_tech',
  },
};
