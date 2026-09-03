import { UnitDefinition, UnitType, CounterTable } from '../types/unit.types';
import {
  INFANTRY_BASE_DAMAGE, ARTILLERY_BASE_DAMAGE, CAVALRY_BASE_DAMAGE,
  ELITE_BASE_DAMAGE_MULTIPLIER,
} from './balance.constants';

export const UNIT_DEFINITIONS: Record<UnitType, UnitDefinition> = {
  // Gold-based units (from Motor/Amplifier/Converter)
  infantry: {
    type: 'infantry',
    hp: 30,
    speed: 60,
    damage: INFANTRY_BASE_DAMAGE,
    baseDamage: 5,
    costResource: 'gold',
    costAmount: 5,
    description: 'Basic unit. Beats Artillery (2× dmg). Spawned by Motors.',
  },
  artillery: {
    type: 'artillery',
    hp: 20,
    speed: 40,
    damage: ARTILLERY_BASE_DAMAGE,
    baseDamage: 8,
    costResource: 'gold',
    costAmount: 8,
    description: 'Ranged unit. Beats Cavalry (2× dmg). Spawned by Motor+Amplifier chains.',
  },
  cavalry: {
    type: 'cavalry',
    hp: 40,
    speed: 90,
    damage: CAVALRY_BASE_DAMAGE,
    baseDamage: 12,
    costResource: 'gold',
    costAmount: 12,
    description: 'Fast unit. Beats Infantry (2× dmg). Spawned by Motor+Amplifier+Converter chains.',
  },
  mixed: {
    type: 'mixed',
    hp: 35,
    speed: 65,
    damage: 10,
    baseDamage: 8,
    costResource: 'gold',
    costAmount: 10,
    description: 'Mixed squad. Balanced stats.',
  },
  elite_infantry: {
    type: 'elite_infantry',
    hp: 60,
    speed: 60,
    damage: INFANTRY_BASE_DAMAGE * ELITE_BASE_DAMAGE_MULTIPLIER,
    baseDamage: 10,
    costResource: 'gold',
    costAmount: 20,
    description: 'Elite infantry. Higher HP and damage.',
  },
  elite_artillery: {
    type: 'elite_artillery',
    hp: 40,
    speed: 40,
    damage: ARTILLERY_BASE_DAMAGE * ELITE_BASE_DAMAGE_MULTIPLIER,
    baseDamage: 16,
    costResource: 'gold',
    costAmount: 25,
    description: 'Elite artillery. Bonus ranged damage.',
  },
  elite_cavalry: {
    type: 'elite_cavalry',
    hp: 80,
    speed: 90,
    damage: CAVALRY_BASE_DAMAGE * ELITE_BASE_DAMAGE_MULTIPLIER,
    baseDamage: 24,
    costResource: 'gold',
    costAmount: 30,
    description: 'Elite cavalry. High speed and damage.',
  },

  // Iron-based unit (from iron_miner)
  iron_guard: {
    type: 'iron_guard',
    hp: 80,
    speed: 35,
    damage: 12,
    baseDamage: 10,
    costResource: 'iron',
    costAmount: 8,
    description: 'Heavy armored unit. High HP, slow. Spawned by Iron Miners. Reduces incoming damage by 30%.',
  },

  // Crystal-based unit (from crystal_miner)
  crystal_sentinel: {
    type: 'crystal_sentinel',
    hp: 50,
    speed: 55,
    damage: 8,
    baseDamage: 6,
    costResource: 'crystal',
    costAmount: 6,
    description: 'Defensive unit. Shields nearby allies. Spawned by Crystal Miners.',
  },

  // Aether-based unit (from aether_miner)
  aether_phantom: {
    type: 'aether_phantom',
    hp: 25,
    speed: 100,
    damage: 6,
    baseDamage: 4,
    costResource: 'aether',
    costAmount: 5,
    description: 'Fast phantom unit. Very high speed, low HP. Spawned by Aether Miners. Can slip past defenses.',
  },

  // Special wrench unit (no cost, spawned manually via tech)
  wrench: {
    type: 'wrench',
    hp: 20,
    speed: 50,
    damage: 0,
    baseDamage: 0,
    costResource: 'none',
    costAmount: 0,
    description: 'Anti-gear unit. Latches onto enemy gears, adding friction and slowing chains.',
    frictionValue: 30,
  },
};

/**
 * Counter table: damage multipliers.
 * Gold units: Infantry beats Artillery, Artillery beats Cavalry, Cavalry beats Infantry
 * Resource units: Iron Guard has 0.7× damage taken modifier (shields), Crystal Sentinel shields allies (0.8×), Aether Phantom low HP but escapes easily
 * Wrench ignores combat — it targets gears only
 */
export const COUNTER_TABLE: CounterTable = {
  infantry: {
    infantry: 1, artillery: 2, cavalry: 0.5, mixed: 1,
    elite_infantry: 1, elite_artillery: 2, elite_cavalry: 0.5,
    iron_guard: 1, crystal_sentinel: 1.2, aether_phantom: 1.5,
    wrench: 1,
  },
  artillery: {
    infantry: 0.5, artillery: 1, cavalry: 2, mixed: 1,
    elite_infantry: 0.5, elite_artillery: 1, elite_cavalry: 2,
    iron_guard: 1.5, crystal_sentinel: 0.8, aether_phantom: 1,
    wrench: 1,
  },
  cavalry: {
    infantry: 2, artillery: 0.5, cavalry: 1, mixed: 1,
    elite_infantry: 2, elite_artillery: 0.5, elite_cavalry: 1,
    iron_guard: 0.5, crystal_sentinel: 1, aether_phantom: 2,
    wrench: 2,
  },
  mixed: {
    infantry: 1, artillery: 1, cavalry: 1, mixed: 1,
    elite_infantry: 1, elite_artillery: 1, elite_cavalry: 1,
    iron_guard: 1, crystal_sentinel: 1, aether_phantom: 1,
    wrench: 1,
  },
  elite_infantry: {
    infantry: 1.5, artillery: 3, cavalry: 0.5, mixed: 1.2,
    elite_infantry: 1, elite_artillery: 3, elite_cavalry: 0.5,
    iron_guard: 1.2, crystal_sentinel: 1.5, aether_phantom: 2,
    wrench: 1.5,
  },
  elite_artillery: {
    infantry: 0.5, artillery: 1.5, cavalry: 3, mixed: 1.2,
    elite_infantry: 0.5, elite_artillery: 1, elite_cavalry: 3,
    iron_guard: 2, crystal_sentinel: 0.8, aether_phantom: 1.2,
    wrench: 1,
  },
  elite_cavalry: {
    infantry: 3, artillery: 0.5, cavalry: 1.5, mixed: 1.2,
    elite_infantry: 3, elite_artillery: 0.5, elite_cavalry: 1,
    iron_guard: 0.5, crystal_sentinel: 1.2, aether_phantom: 2.5,
    wrench: 3,
  },
  iron_guard: {
    infantry: 1, artillery: 0.8, cavalry: 2, mixed: 1,
    elite_infantry: 1, elite_artillery: 0.8, elite_cavalry: 2,
    iron_guard: 1, crystal_sentinel: 1, aether_phantom: 1.5,
    wrench: 1,
  },
  crystal_sentinel: {
    infantry: 0.8, artillery: 1, cavalry: 0.9, mixed: 0.9,
    elite_infantry: 0.8, elite_artillery: 1, elite_cavalry: 0.9,
    iron_guard: 1, crystal_sentinel: 1, aether_phantom: 1,
    wrench: 1,
  },
  aether_phantom: {
    infantry: 0.6, artillery: 1, cavalry: 0.5, mixed: 0.8,
    elite_infantry: 0.6, elite_artillery: 1, elite_cavalry: 0.5,
    iron_guard: 1, crystal_sentinel: 1, aether_phantom: 1,
    wrench: 1,
  },
  wrench: {
    infantry: 0.5, artillery: 0.5, cavalry: 0.5, mixed: 0.5,
    elite_infantry: 0.5, elite_artillery: 0.5, elite_cavalry: 0.5,
    iron_guard: 0.5, crystal_sentinel: 0.5, aether_phantom: 0.5,
    wrench: 1,
  },
};

export function getCounterMultiplier(attacker: UnitType, defender: UnitType): number {
  return COUNTER_TABLE[attacker]?.[defender] ?? 1;
}

/** Iron Guard's armor: multiplies all incoming damage, regardless of source. */
export const IRON_GUARD_DAMAGE_REDUCTION = 0.7;

/**
 * Resolves a raw hit into the damage actually dealt: applies the counter
 * multiplier (skipped if the attacker has no unit type, e.g. a turret),
 * Iron Guard's flat armor, and the defender's active shield buff (Crystal
 * Sentinel aura). One function so every damage-application site --
 * CombatSystem, the UnitSystem behavior methods, and ProjectileSystem --
 * applies defense the same way.
 */
export function computeDamage(
  attackerType: UnitType | undefined,
  defender: { type: UnitType; shieldFactor?: number },
  rawDamage: number,
): number {
  let dmg = rawDamage * (attackerType ? getCounterMultiplier(attackerType, defender.type) : 1);
  if (defender.type === 'iron_guard') dmg *= IRON_GUARD_DAMAGE_REDUCTION;
  dmg *= defender.shieldFactor ?? 1;
  return dmg;
}

// Determines unit type produced by a chain composition
export function getChainUnitType(
  hasMotor: boolean,
  hasAmplifier: boolean,
  hasConverter: boolean,
): UnitType {
  if (hasMotor && hasAmplifier && hasConverter) return 'mixed';
  if (hasMotor && hasConverter) return 'cavalry';
  if (hasMotor && hasAmplifier) return 'artillery';
  return 'infantry';
}
