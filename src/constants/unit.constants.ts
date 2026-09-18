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
    costAmount: 5,
    // The only gold-only unit. Whatever else has collapsed -- no coal, no
    // power, no miners -- you can still field a line.
    description: 'The line. Cheap, gold-only, and the one unit you can always afford. Beats Artillery.',
  },
  crossbow: {
    type: 'crossbow',
    hp: 20,
    speed: 60,
    damage: INFANTRY_BASE_DAMAGE,
    baseDamage: 5,
    costAmount: 6,
    secondaryResource: 'iron',
    secondaryAmount: 1,
    description: 'Ranged skirmisher. Stops and shoots instead of closing, trading DPS for reach. Beats Infantry, loses to Cavalry.',
  },
  cavalry: {
    type: 'cavalry',
    hp: 40,
    speed: 90,
    damage: CAVALRY_BASE_DAMAGE,
    baseDamage: 12,
    costAmount: 12,
    secondaryResource: 'coal',
    secondaryAmount: 2,
    description: 'Fast flanker. Runs down anything that stops to shoot. Beats Crossbow and Artillery, loses to Iron Guard.',
  },
  artillery: {
    type: 'artillery',
    hp: 20,
    speed: 40,
    damage: ARTILLERY_BASE_DAMAGE,
    baseDamage: 8,
    costAmount: 8,
    secondaryResource: 'crystal',
    secondaryAmount: 2,
    description: 'Long-ranged siege. Outranges everything and dies to anything that reaches it. Beats Iron Guard, loses to Cavalry.',
  },
  iron_guard: {
    type: 'iron_guard',
    hp: 80,
    speed: 35,
    damage: 12,
    baseDamage: 10,
    costAmount: 10,
    secondaryResource: 'iron',
    secondaryAmount: 4,
    description: 'The wall. Slow, heavy, and reduces incoming damage by 30%. Beats Cavalry, loses to Artillery.',
  },
  sapper: {
    type: 'sapper',
    hp: 45,
    speed: 35,
    damage: 4,
    baseDamage: 4,
    costAmount: 9,
    secondaryResource: 'coal',
    secondaryAmount: 3,
    description: 'Anti-gear siege. Weak against units, but every hit on a gear counts for 6x -- built to breach a turtled machine, including the cable runs feeding it.',
  },
  field_medic: {
    type: 'field_medic',
    hp: 25,
    speed: 65,
    damage: 0,
    baseDamage: 0,
    costAmount: 8,
    secondaryResource: 'crystal',
    secondaryAmount: 1,
    description: 'Mobile sustain. Pulses a heal to nearby allies as it marches. Deals no damage and never stops to fight -- the only healing that travels with a push.',
    healRadius: 90,
    healAmount: 6,
    healPulseIntervalMs: 2000,
  },
  slime: {
    type: 'slime',
    hp: 10,
    speed: 40,
    damage: 0,
    baseDamage: 0,
    costAmount: 2,
    secondaryResource: 'coal',
    secondaryAmount: 1,
    description: 'The clog. Deals no damage and never stops to fight -- it piles up to block the way. On death it bursts into a puddle that slows both sides and adds friction to gears standing in it, which now also cooks them.',
    frictionValue: 20,
    puddleRadius: 50,
    puddleDuration: 6,
    puddleSlowFactor: 0.55,
  },
};

export const UNIT_GEAR_DAMAGE_MULT: Partial<Record<UnitType, number>> = {
  sapper: 6,
};

/**
 * Counter table: damage multipliers.
 * Gold units: Infantry beats Artillery, Artillery beats Cavalry, Cavalry beats Infantry
 * Resource units: Iron Guard has 0.7× damage taken modifier (shields), Crystal Sentinel shields allies (0.8×), Aether Phantom low HP but escapes easily
 * Crossbow: same per-hit damage as Infantry, lower DPS, answers Aether Phantom, loses to Cavalry, tanked by Iron Guard (alongside its existing Cavalry counter)
 * Slime deals no damage (baseDamage 0) -- its attacker row is inert, kept only so every unit type has a complete row
 * Sentry Unit is a detection utility, weak in a straight fight either way
 */
/**
 * Who beats whom.
 *
 * One ring, readable end to end, rather than an eighteen-row matrix nobody
 * could hold in their head:
 *
 *     Infantry -> Artillery -> Iron Guard -> Cavalry -> Crossbow -> Infantry
 *
 * Every entry below is one of those five edges or its inverse. Sapper, Field
 * Medic and Slime sit outside the ring on purpose -- their identity is what
 * they do to gears, allies and the ground, not a damage multiplier.
 */
export const COUNTER_TABLE: CounterTable = {
  infantry: {
    artillery: 2.0,   // the line overruns a siege piece that cannot kite it
    crossbow: 0.5,
  },
  crossbow: {
    infantry: 2.0,    // shoots the line before it closes
    cavalry: 0.5,
  },
  cavalry: {
    crossbow: 2.0,    // closes on anything that stops to shoot
    artillery: 2.0,
    iron_guard: 0.5,
  },
  artillery: {
    iron_guard: 2.0,  // range beats armour that cannot catch it
    infantry: 0.5,
    cavalry: 0.5,
  },
  iron_guard: {
    cavalry: 2.0,     // a charge breaks on a wall
    artillery: 0.5,
  },
};

export function getCounterMultiplier(attacker: UnitType, defender: UnitType): number {
  return COUNTER_TABLE[attacker]?.[defender] ?? 1;
}

/** Iron Guard's armor: multiplies all incoming damage, regardless of source. */
export const IRON_GUARD_DAMAGE_REDUCTION = 0.7;

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


