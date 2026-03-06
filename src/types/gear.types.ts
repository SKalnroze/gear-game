export type GearType =
  'motor' | 'amplifier' | 'capacitor' | 'overclock' |
  'spiked' | 'armored' |
  'iron_miner' | 'crystal_miner' | 'aether_miner' |
  'infantry_spawner' | 'artillery_spawner' | 'cavalry_spawner' |
  'iron_guard_spawner' | 'crystal_sentinel_spawner' | 'aether_phantom_spawner' |
  'researcher' |
  'iron_converter' | 'crystal_converter' | 'aether_converter' |
  'crossbow_turret' | 'artillery_turret' |
  'healer';

export interface GearDefinition {
  type: GearType;
  basePowerCost: number;   // power cost at 10 teeth; scales as Math.round(basePowerCost * (teeth/10))
  goldCost: number;
  synergies: GearSynergy[];
  description: string;
  unlockNode?: string;     // tech node required to unlock (undefined = available from start)
}

export interface GearSynergy {
  requiredNeighbor: GearType;
  bonus: SynergyBonus;
  description: string;
}

export interface SynergyBonus {
  type: 'chain_power_pct' | 'burst_multiplier' | 'wave_type' | 'speed_pct';
  value: number;
}

export interface GearState {
  id: string;
  definitionKey: GearType;   // key into GEAR_DEFINITIONS (now just the type)
  type: GearType;
  teeth: number;              // replaces GearSize; radius = teeth * GEAR_MODULE
  x: number;                  // pixel x position (center)
  y: number;                  // pixel y position (center)
  owner: 'player' | 'ai';
  angularVelocity: number;    // omega, radians/sec (negative = counter-clockwise)
  currentAngle: number;       // current angle for rendering (radians)
  accumulatedAngle: number;   // total rotation since last full-rotation event (radians)
  frictionLoad: number;       // friction from attached units
  torqueOutput: number;       // effective torque computed by RotationPhysicsSystem
  isSpinning: boolean;
  isBurntOut: boolean;
  burntOutAt?: number;
  overclockUntil?: number;
  chainId?: string;
  lastRepositionedAt?: number; // timestamp of last reposition (for cooldown)
  hp: number;                 // current health (all gears have HP)
  maxHp: number;              // max health, set at placement
  isJammed: boolean;          // true when rotation conflict detected
  crackLevel: number;         // 0–4 visual damage tier (0=pristine, 4=near-destroyed)
  jamStress: number;          // torque magnitude at jam point, drives damage rate
  ammo?: number;              // current ammo (turret gears only)
  maxAmmo?: number;           // max ammo capacity
}
