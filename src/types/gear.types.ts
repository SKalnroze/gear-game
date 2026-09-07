export type GearType =
  'motor' | 'amplifier' | 'capacitor' | 'overclock' |
  'spiked' | 'armored' | 'relief_valve' |
  'iron_miner' | 'crystal_miner' | 'aether_miner' |
  'infantry_spawner' | 'artillery_spawner' | 'cavalry_spawner' | 'slime_spawner' | 'crossbow_spawner' |
  'iron_guard_spawner' | 'crystal_sentinel_spawner' | 'aether_phantom_spawner' | 'sentry_spawner' |
  'sapper_spawner' | 'skirmish_diver_spawner' | 'saboteur_spawner' | 'raider_spawner' | 'field_medic_spawner' |
  'researcher' |
  'iron_converter' | 'crystal_converter' | 'aether_converter' |
  'crossbow_turret' | 'artillery_turret' | 'minelayer' | 'sentry_gear' |
  'healer' |
  // Electrical
  'crank' | 'solar_panel' | 'burner' | 'battery' | 'power_pole' | 'grid_tie' |
  'coal_miner' | 'oiler';

/**
 * Gear size tier. Five discrete steps replaced free tooth counts of 5..60 --
 * see constants/tier.constants.ts for why. Each step is ×1.5 in teeth and in
 * every derived strength stat.
 */
export type GearTier = 1 | 2 | 3 | 4 | 5;

export interface GearDefinition {
  type: GearType;
  goldCost: number;
  description: string;
  unlockNode?: string;     // tech node required to unlock (undefined = available from start)
}

export interface GearState {
  id: string;
  type: GearType;
  tier: GearTier;             // authored size step; drives every strength stat
  teeth: number;              // derived from tier (TIER_TEETH); radius = teeth * GEAR_MODULE
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
  /** 0..1 share of its electricity draw this gear is receiving. Written by PowerSystem. */
  powerSatisfaction?: number;
  /** Stored electricity (batteries only). */
  charge?: number;
  /** Coal buffer (burners only) -- drawn from the owner's stock as it burns. */
  coalBuffer?: number;
  /** ms timestamp until which a hand-cranked gear is still generating. */
  crankUntil?: number;
  /** Accumulated heat, in the same units as the seize threshold. */
  heat?: number;
  /** Oil film on the teeth. Suppresses friction, raises the seize threshold. */
  oil?: number;
  /** True while heat has seized this gear -- distinct from a rotation-conflict jam. */
  isSeized?: boolean;
  /** ms timestamp the current seizure began, so stress can escalate. */
  seizedAt?: number;
  ammo?: number;              // current ammo (turret gears only)
  maxAmmo?: number;           // max ammo capacity
  disabledUntil?: number;     // ms timestamp; a Raider-disabled gear produces nothing until then
}
