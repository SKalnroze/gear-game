export type GearType =
  'motor' | 'amplifier' | 'capacitor' | 'overclock' |
  'spiked' | 'armored' | 'relief_valve' |
  'iron_miner' | 'crystal_miner' | 'aether_miner' |
  'infantry_spawner' | 'artillery_spawner' | 'cavalry_spawner' | 'slime_spawner' | 'crossbow_spawner' |
  'iron_guard_spawner' | 'crystal_sentinel_spawner' | 'aether_phantom_spawner' | 'sentry_spawner' |
  'researcher' |
  'iron_converter' | 'crystal_converter' | 'aether_converter' |
  'crossbow_turret' | 'artillery_turret' | 'minelayer' | 'sentry_gear' |
  'healer';

export interface GearDefinition {
  type: GearType;
  goldCost: number;
  description: string;
  unlockNode?: string;     // tech node required to unlock (undefined = available from start)
}

export interface GearState {
  id: string;
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
