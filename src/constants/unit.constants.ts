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

  // Ranged skirmisher, gold-based
  crossbow: {
    type: 'crossbow',
    hp: 20,
    speed: 60,
    damage: INFANTRY_BASE_DAMAGE,
    baseDamage: 5,
    costResource: 'gold',
    costAmount: 6,
    description: 'Ranged skirmisher. Same per-hit damage as Infantry but a slower cadence -- lower DPS, traded for reach: stops and shoots instead of closing to melee. Less durable than Infantry. Beats Aether Phantom, loses to Cavalry, tanked by Iron Guard.',
  },

  // Mobile true-sight pulse, counters hidden mines
  sentry_unit: {
    type: 'sentry_unit',
    hp: 30,
    speed: 45,
    damage: 2,
    baseDamage: 2,
    costResource: 'gold',
    costAmount: 10,
    description: 'Patrol unit. Pulses true-sight in a radius as it marches, revealing hidden enemy mines early. Weak in a fight -- it answers stealth, not the front line.',
    sightRadius: 150,
    sightPulseIntervalMs: 2000,
  },

  // The clog unit: no damage, cheap, explodes into a slowing puddle on death
  slime: {
    type: 'slime',
    hp: 10,
    speed: 40,
    damage: 0,
    baseDamage: 0,
    costResource: 'gold',
    costAmount: 2,
    description: 'The clog unit. Deals no damage and never stops to fight -- it exists to physically pile up and block the lane. On death it bursts into a puddle that slows both sides\' units and adds friction to gears standing in it, then dissipates.',
    frictionValue: 20,
    puddleRadius: 50,
    puddleDuration: 6,
    puddleSlowFactor: 0.55,
  },
};

/**
 * Counter table: damage multipliers.
 * Gold units: Infantry beats Artillery, Artillery beats Cavalry, Cavalry beats Infantry
 * Resource units: Iron Guard has 0.7× damage taken modifier (shields), Crystal Sentinel shields allies (0.8×), Aether Phantom low HP but escapes easily
 * Crossbow: same per-hit damage as Infantry, lower DPS, answers Aether Phantom, loses to Cavalry, tanked by Iron Guard (alongside its existing Cavalry counter)
 * Slime deals no damage (baseDamage 0) -- its attacker row is inert, kept only so every unit type has a complete row
 * Sentry Unit is a detection utility, weak in a straight fight either way
 */
export const COUNTER_TABLE: CounterTable = {
  infantry: {
    infantry: 1, artillery: 2, cavalry: 0.5, mixed: 1,
    elite_infantry: 1, elite_artillery: 2, elite_cavalry: 0.5,
    iron_guard: 1, crystal_sentinel: 1.2, aether_phantom: 1.5,
    crossbow: 1, sentry_unit: 1.2, slime: 1,
  },
  artillery: {
    infantry: 0.5, artillery: 1, cavalry: 2, mixed: 1,
    elite_infantry: 0.5, elite_artillery: 1, elite_cavalry: 2,
    iron_guard: 1.5, crystal_sentinel: 0.8, aether_phantom: 1,
    crossbow: 1, sentry_unit: 1, slime: 1,
  },
  cavalry: {
    infantry: 2, artillery: 0.5, cavalry: 1, mixed: 1,
    elite_infantry: 2, elite_artillery: 0.5, elite_cavalry: 1,
    iron_guard: 0.5, crystal_sentinel: 1, aether_phantom: 2,
    crossbow: 2, sentry_unit: 1.5, slime: 2,
  },
  mixed: {
    infantry: 1, artillery: 1, cavalry: 1, mixed: 1,
    elite_infantry: 1, elite_artillery: 1, elite_cavalry: 1,
    iron_guard: 1, crystal_sentinel: 1, aether_phantom: 1,
    crossbow: 1, sentry_unit: 1, slime: 1,
  },
  elite_infantry: {
    infantry: 1.5, artillery: 3, cavalry: 0.5, mixed: 1.2,
    elite_infantry: 1, elite_artillery: 3, elite_cavalry: 0.5,
    iron_guard: 1.2, crystal_sentinel: 1.5, aether_phantom: 2,
    crossbow: 1.5, sentry_unit: 1.5, slime: 1.5,
  },
  elite_artillery: {
    infantry: 0.5, artillery: 1.5, cavalry: 3, mixed: 1.2,
    elite_infantry: 0.5, elite_artillery: 1, elite_cavalry: 3,
    iron_guard: 2, crystal_sentinel: 0.8, aether_phantom: 1.2,
    crossbow: 1.2, sentry_unit: 1, slime: 1,
  },
  elite_cavalry: {
    infantry: 3, artillery: 0.5, cavalry: 1.5, mixed: 1.2,
    elite_infantry: 3, elite_artillery: 0.5, elite_cavalry: 1,
    iron_guard: 0.5, crystal_sentinel: 1.2, aether_phantom: 2.5,
    crossbow: 3, sentry_unit: 2, slime: 3,
  },
  iron_guard: {
    infantry: 1, artillery: 0.8, cavalry: 2, mixed: 1,
    elite_infantry: 1, elite_artillery: 0.8, elite_cavalry: 2,
    iron_guard: 1, crystal_sentinel: 1, aether_phantom: 1.5,
    crossbow: 1.5, sentry_unit: 1, slime: 1,
  },
  crystal_sentinel: {
    infantry: 0.8, artillery: 1, cavalry: 0.9, mixed: 0.9,
    elite_infantry: 0.8, elite_artillery: 1, elite_cavalry: 0.9,
    iron_guard: 1, crystal_sentinel: 1, aether_phantom: 1,
    crossbow: 0.9, sentry_unit: 1, slime: 1,
  },
  aether_phantom: {
    infantry: 0.6, artillery: 1, cavalry: 0.5, mixed: 0.8,
    elite_infantry: 0.6, elite_artillery: 1, elite_cavalry: 0.5,
    iron_guard: 1, crystal_sentinel: 1, aether_phantom: 1,
    crossbow: 0.6, sentry_unit: 1, slime: 1,
  },
  // Same per-hit damage as Infantry, lower DPS (see UNIT_DEFINITIONS.crossbow) --
  // ranged reach beats Aether Phantom's hit-and-run, loses hard to Cavalry closing
  // the distance, and Iron Guard's armor tanks it the same way it tanks Cavalry.
  crossbow: {
    infantry: 1, artillery: 1.2, cavalry: 0.5, mixed: 1,
    elite_infantry: 1, elite_artillery: 1.2, elite_cavalry: 0.5,
    iron_guard: 0.6, crystal_sentinel: 1, aether_phantom: 2,
    crossbow: 1, sentry_unit: 1.2, slime: 1,
  },
  // Detection utility, not a fighter -- low damage everywhere via its own base
  // stats (baseDamage 2) rather than counter multipliers.
  sentry_unit: {
    infantry: 1, artillery: 1, cavalry: 1, mixed: 1,
    elite_infantry: 1, elite_artillery: 1, elite_cavalry: 1,
    iron_guard: 1, crystal_sentinel: 1, aether_phantom: 1,
    crossbow: 1, sentry_unit: 1, slime: 1,
  },
  slime: {
    infantry: 0.5, artillery: 0.5, cavalry: 0.5, mixed: 0.5,
    elite_infantry: 0.5, elite_artillery: 0.5, elite_cavalry: 0.5,
    iron_guard: 0.5, crystal_sentinel: 0.5, aether_phantom: 0.5,
    crossbow: 0.5, sentry_unit: 0.5, slime: 1,
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

/**
 * What a core spawner (infantry/artillery/cavalry) actually produces, once
 * the chain it sits on and the owner's research are taken into account.
 * Revives the old chain-composition idea (this function used to decide unit
 * type from hasMotor/hasAmplifier/hasConverter alone, and was never called)
 * and extends it to cover the five unit types that otherwise have no
 * spawner at all: mixed and the three elites.
 *
 * Mixed takes priority over an elite upgrade when both conditions are met:
 * it requires a converter placed on the chain by deliberate choice, on top
 * of all three core spawner techs, so it reads as the stronger signal of
 * intent. An elite upgrade only needs the matching elite tech and a chain
 * that has grown to combo size -- the passive, no-extra-thought path.
 */
export function getChainUnitType(
  baseType: 'infantry' | 'artillery' | 'cavalry',
  chainSize: number,
  eliteResearched: boolean,
  mixedUnlocked: boolean,
  hasConverter: boolean,
  comboMinGears: number,
): UnitType {
  if (mixedUnlocked && hasConverter) return 'mixed';
  if (eliteResearched && chainSize >= comboMinGears) {
    if (baseType === 'infantry') return 'elite_infantry';
    if (baseType === 'artillery') return 'elite_artillery';
    if (baseType === 'cavalry') return 'elite_cavalry';
  }
  return baseType;
}
