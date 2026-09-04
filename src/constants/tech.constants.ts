import { TechNode } from '../types/tech.types';

/**
 * All tech nodes.
 * Column assignments (thematic):
 *   0 = Gear mechanics
 *   1 = Units
 *   2 = Economy / Mining
 *   3 = Abilities
 *   4 = Defense
 */
export const TECH_NODES: Record<string, TechNode> = {

  // ─── COLUMN 0: GEARS ──────────────────────────────────────────────────────

  // T1
  basic_amplifier: {
    id: 'basic_amplifier', name: 'Basic Amplifier',
    description: 'Unlocks the Amplifier gear. Multiplies the whole chain torque by 1.4x, so it spins faster.',
    tier: 1, goldCost: 20, researchTime: 15000,
    prereqs: [],
    effects: [{ kind: 'unlock_gear', gearType: 'amplifier' }],
    column: 0,
  },
  basic_capacitor: {
    id: 'basic_capacitor', name: 'Basic Capacitor',
    description: 'Unlocks the Capacitor gear. Stores rotations and releases a burst every 8 rotations.',
    tier: 1, goldCost: 25, researchTime: 18000,
    prereqs: [],
    effects: [{ kind: 'unlock_gear', gearType: 'capacitor' }],
    column: 0,
  },
  basic_overclock: {
    id: 'basic_overclock', name: 'Basic Overclock',
    description: 'Unlocks the Overclock gear. +50% torque/omega to adjacent gears for 10s, then a 5s burnout.',
    tier: 1, goldCost: 30, researchTime: 21000,
    prereqs: [],
    effects: [{ kind: 'unlock_gear', gearType: 'overclock' }],
    column: 0,
  },
  gear_precision_1: {
    id: 'gear_precision_1', name: 'Gear Precision I',
    description: 'Unlocks 5-tooth and 15-tooth gears.',
    tier: 1, goldCost: 40, researchTime: 24000,
    prereqs: [],
    effects: [{ kind: 'unlock_teeth', teeth: 5 }, { kind: 'unlock_teeth', teeth: 15 }],
    column: 0,
  },

  // T2
  gear_precision_2: {
    id: 'gear_precision_2', name: 'Gear Precision II',
    description: 'Unlocks 20-tooth and 25-tooth gears.',
    tier: 2, goldCost: 80, researchTime: 36000,
    prereqs: ['gear_precision_1'],
    effects: [{ kind: 'unlock_teeth', teeth: 20 }, { kind: 'unlock_teeth', teeth: 25 }],
    column: 0,
  },
  capacitor_upgrade: {
    id: 'capacitor_upgrade', name: 'Capacitor Upgrade',
    description: 'Capacitor burst multiplier increased from 2.5× to 3.5×.',
    tier: 2, goldCost: 60, researchTime: 36000,
    prereqs: ['basic_capacitor'],
    effects: [{ kind: 'capacitor_burst_multiplier', value: 1 }],
    column: 0,
  },
  gear_precision_3: {
    id: 'gear_precision_3', name: 'Gear Precision III',
    description: 'Unlocks 30-tooth and 35-tooth gears.',
    tier: 2, goldCost: 120, researchTime: 45000,
    prereqs: ['gear_precision_2'],
    effects: [{ kind: 'unlock_teeth', teeth: 30 }, { kind: 'unlock_teeth', teeth: 35 }],
    column: 0,
  },
  extended_overclock: {
    id: 'extended_overclock', name: 'Extended Overclock',
    description: 'Overclock duration increased to 15s.',
    tier: 2, goldCost: 60, researchTime: 36000,
    prereqs: ['basic_overclock'],
    effects: [{ kind: 'overclock_duration_bonus', value: 5000 }],
    column: 0,
  },
  unlock_relief_valve: {
    id: 'unlock_relief_valve', name: 'Relief Valve',
    description: 'Unlocks the Relief Valve gear -- a clutch built to take a jam for the chain instead of breaking. Sharply reduces its own jam damage, and softens jam damage on a meshed neighbour too.',
    tier: 2, goldCost: 50, researchTime: 30000,
    prereqs: ['gear_precision_1'],
    effects: [{ kind: 'unlock_gear', gearType: 'relief_valve' }],
    column: 0,
  },

  // T3
  gear_precision_4: {
    id: 'gear_precision_4', name: 'Gear Precision IV',
    description: 'Unlocks 40-tooth and 45-tooth gears.',
    tier: 3, goldCost: 160, researchTime: 60000,
    prereqs: ['gear_precision_3'],
    effects: [{ kind: 'unlock_teeth', teeth: 40 }, { kind: 'unlock_teeth', teeth: 45 }],
    column: 0,
  },
  super_amplifier: {
    id: 'super_amplifier', name: 'Super Amplifier',
    description: '+33% capacitor burst yield. (Despite the name, this does not touch the Amplifier gear itself -- its torque multiplier is fixed.)',
    tier: 3, goldCost: 120, researchTime: 75000,
    prereqs: ['gear_precision_3', 'power_efficiency_2'],
    effects: [{ kind: 'power_bonus_pct', value: 0.33 }],
    column: 0,
  },
  gear_precision_5: {
    id: 'gear_precision_5', name: 'Gear Precision V',
    description: 'Unlocks 50-tooth, 55-tooth, and 60-tooth gears.',
    tier: 3, goldCost: 200, researchTime: 75000,
    prereqs: ['gear_precision_4'],
    effects: [
      { kind: 'unlock_teeth', teeth: 50 },
      { kind: 'unlock_teeth', teeth: 55 },
      { kind: 'unlock_teeth', teeth: 60 },
    ],
    column: 0,
  },
  overclock_mastery: {
    id: 'overclock_mastery', name: 'Overclock Mastery',
    description: 'Overclock no longer burns out. Duration doubled.',
    tier: 3, goldCost: 180, researchTime: 105000,
    prereqs: ['extended_overclock'],
    effects: [
      { kind: 'overclock_duration_bonus', value: 15000 },
      { kind: 'enable_ability', abilityId: 'overclock_no_burnout' },
    ],
    column: 0,
  },
  combo_chain_bonus: {
    id: 'combo_chain_bonus', name: 'Combo Chain Bonus',
    description: 'Chains with 4+ gears spin 25% faster.',
    tier: 3, goldCost: 110, researchTime: 66000,
    prereqs: ['super_amplifier'],
    effects: [{ kind: 'chain_combo_bonus', value: 0.25 }],
    column: 0,
  },

  // ─── COLUMN 1: UNITS ──────────────────────────────────────────────────────

  // T1
  unlock_infantry: {
    id: 'unlock_infantry', name: 'Infantry Training',
    description: 'Improves Infantry HP by 20%.',
    tier: 1, goldCost: 15, researchTime: 12000,
    prereqs: [],
    effects: [{ kind: 'unit_hp_pct', unitType: 'infantry', value: 0.2 }],
    column: 1,
  },
  infantry_speed: {
    id: 'infantry_speed', name: 'Quick March',
    description: 'Infantry move 20% faster.',
    tier: 1, goldCost: 15, researchTime: 12000,
    prereqs: ['unlock_infantry'],
    effects: [{ kind: 'unit_speed_pct', unitType: 'infantry', value: 0.2 }],
    column: 1,
  },
  unlock_artillery_spawner: {
    id: 'unlock_artillery_spawner', name: 'Artillery Spawner',
    description: 'Unlocks the Artillery Spawner gear. Each rotation spawns an Artillery unit.',
    tier: 1, goldCost: 25, researchTime: 45000,
    prereqs: [],
    effects: [
      { kind: 'unlock_gear', gearType: 'artillery_spawner' },
      { kind: 'unlock_unit', unitType: 'artillery' },
    ],
    column: 1,
  },
  unlock_cavalry_spawner: {
    id: 'unlock_cavalry_spawner', name: 'Cavalry Spawner',
    description: 'Unlocks the Cavalry Spawner gear. Each rotation spawns a Cavalry unit.',
    tier: 1, goldCost: 30, researchTime: 54000,
    prereqs: [],
    effects: [
      { kind: 'unlock_gear', gearType: 'cavalry_spawner' },
      { kind: 'unlock_unit', unitType: 'cavalry' },
    ],
    column: 1,
  },
  unlock_slime_spawner: {
    id: 'unlock_slime_spawner', name: 'Slime Spawner',
    description: 'Unlocks the Slime Spawner gear. Cheap, spammable, no-damage units that pile up and clog the lane, then burst into a slowing puddle on death.',
    tier: 1, goldCost: 20, researchTime: 30000,
    prereqs: [],
    effects: [
      { kind: 'unlock_gear', gearType: 'slime_spawner' },
      { kind: 'unlock_unit', unitType: 'slime' },
    ],
    column: 1,
  },
  unlock_crossbow_spawner: {
    id: 'unlock_crossbow_spawner', name: 'Crossbow Spawner',
    description: 'Unlocks the Crossbow Spawner gear. Ranged skirmisher: same per-hit damage as Infantry, lower DPS, stops and shoots instead of closing to melee.',
    tier: 1, goldCost: 25, researchTime: 36000,
    prereqs: [],
    effects: [
      { kind: 'unlock_gear', gearType: 'crossbow_spawner' },
      { kind: 'unlock_unit', unitType: 'crossbow' },
    ],
    column: 1,
  },

  // T2
  elite_infantry_unlock: {
    id: 'elite_infantry_unlock', name: 'Elite Infantry',
    description: 'Unlocks Elite Infantry: 2× HP and damage.',
    tier: 2, goldCost: 70, researchTime: 42000,
    prereqs: ['unlock_infantry', 'infantry_speed'],
    effects: [{ kind: 'unlock_unit', unitType: 'elite_infantry' }],
    column: 1,
  },
  cavalry_charge: {
    id: 'cavalry_charge', name: 'Cavalry Charge',
    description: 'Cavalry move 30% faster and deal 15% more damage.',
    tier: 2, goldCost: 65, researchTime: 39000,
    prereqs: ['unlock_cavalry_spawner'],
    effects: [
      { kind: 'unit_speed_pct', unitType: 'cavalry', value: 0.3 },
      { kind: 'unit_damage_pct', unitType: 'cavalry', value: 0.15 },
    ],
    column: 1,
  },
  unlock_iron_guard_spawner: {
    id: 'unlock_iron_guard_spawner', name: 'Iron Guard Spawner',
    description: 'Unlocks the Iron Guard Spawner gear. Requires Iron Mining.',
    tier: 2, goldCost: 20, researchTime: 36000,
    prereqs: ['unlock_iron_mining'],
    effects: [
      { kind: 'unlock_gear', gearType: 'iron_guard_spawner' },
      { kind: 'unlock_unit', unitType: 'iron_guard' },
    ],
    column: 1,
  },

  // T3
  elite_artillery_unlock: {
    id: 'elite_artillery_unlock', name: 'Elite Artillery',
    description: 'Unlocks Elite Artillery: 2× HP and damage.',
    tier: 3, goldCost: 100, researchTime: 60000,
    prereqs: ['unlock_artillery_spawner', 'elite_infantry_unlock'],
    effects: [{ kind: 'unlock_unit', unitType: 'elite_artillery' }],
    column: 1,
  },
  elite_cavalry_unlock: {
    id: 'elite_cavalry_unlock', name: 'Elite Cavalry',
    description: 'Unlocks Elite Cavalry: 2× HP and damage.',
    tier: 3, goldCost: 100, researchTime: 60000,
    prereqs: ['cavalry_charge', 'elite_infantry_unlock'],
    effects: [{ kind: 'unlock_unit', unitType: 'elite_cavalry' }],
    column: 1,
  },
  unlock_crystal_sentinel_spawner: {
    id: 'unlock_crystal_sentinel_spawner', name: 'Crystal Sentinel Spawner',
    description: 'Unlocks Crystal Sentinel Spawner. Requires Crystal Mining.',
    tier: 3, goldCost: 50, researchTime: 75000,
    prereqs: ['unlock_crystal_mining'],
    effects: [
      { kind: 'unlock_gear', gearType: 'crystal_sentinel_spawner' },
      { kind: 'unlock_unit', unitType: 'crystal_sentinel' },
    ],
    column: 1,
  },
  unlock_aether_phantom_spawner: {
    id: 'unlock_aether_phantom_spawner', name: 'Aether Phantom Spawner',
    description: 'Unlocks Aether Phantom Spawner. Requires Aether Mining.',
    tier: 3, goldCost: 100, researchTime: 120000,
    prereqs: ['unlock_aether_mining'],
    effects: [
      { kind: 'unlock_gear', gearType: 'aether_phantom_spawner' },
      { kind: 'unlock_unit', unitType: 'aether_phantom' },
    ],
    column: 1,
  },
  total_war: {
    id: 'total_war', name: 'Total War',
    description: 'All units deal 20% more damage.',
    tier: 3, goldCost: 150, researchTime: 90000,
    prereqs: ['elite_infantry_unlock', 'elite_artillery_unlock', 'elite_cavalry_unlock'],
    effects: [
      { kind: 'unit_damage_pct', unitType: 'infantry', value: 0.2 },
      { kind: 'unit_damage_pct', unitType: 'artillery', value: 0.2 },
      { kind: 'unit_damage_pct', unitType: 'cavalry', value: 0.2 },
      { kind: 'unit_damage_pct', unitType: 'mixed', value: 0.2 },
      { kind: 'unit_damage_pct', unitType: 'elite_infantry', value: 0.2 },
      { kind: 'unit_damage_pct', unitType: 'elite_artillery', value: 0.2 },
      { kind: 'unit_damage_pct', unitType: 'elite_cavalry', value: 0.2 },
      { kind: 'unit_damage_pct', unitType: 'iron_guard', value: 0.2 },
      { kind: 'unit_damage_pct', unitType: 'crystal_sentinel', value: 0.2 },
      { kind: 'unit_damage_pct', unitType: 'aether_phantom', value: 0.2 },
    ],
    column: 1,
  },

  // ─── COLUMN 2: ECONOMY ────────────────────────────────────────────────────

  // T1
  gold_mining_1: {
    id: 'gold_mining_1', name: 'Gold Mining I',
    description: '+1 gold per second base income.',
    tier: 1, goldCost: 15, researchTime: 12000,
    prereqs: [],
    effects: [{ kind: 'gold_bonus_per_sec', value: 1 }],
    column: 2,
  },
  power_efficiency_1: {
    id: 'power_efficiency_1', name: 'Power Efficiency I',
    description: '+10% capacitor burst yield.',
    tier: 1, goldCost: 20, researchTime: 15000,
    prereqs: [],
    effects: [{ kind: 'power_bonus_pct', value: 0.1 }],
    column: 2,
  },
  unlock_iron_mining: {
    id: 'unlock_iron_mining', name: 'Iron Mining',
    description: 'Unlocks the Iron Miner gear. Generates iron per rotation.',
    tier: 1, goldCost: 20, researchTime: 24000,
    prereqs: [],
    effects: [{ kind: 'unlock_gear', gearType: 'iron_miner' }],
    column: 2,
  },

  // T2
  gold_mining_2: {
    id: 'gold_mining_2', name: 'Gold Mining II',
    description: '+2 gold per second base income.',
    tier: 2, goldCost: 45, researchTime: 27000,
    prereqs: ['gold_mining_1'],
    effects: [{ kind: 'gold_bonus_per_sec', value: 2 }],
    column: 2,
  },
  power_efficiency_2: {
    id: 'power_efficiency_2', name: 'Power Efficiency II',
    description: '+15% capacitor burst yield, stacking with Power Efficiency I.',
    tier: 2, goldCost: 55, researchTime: 33000,
    prereqs: ['power_efficiency_1'],
    effects: [{ kind: 'power_bonus_pct', value: 0.15 }],
    column: 2,
  },
  unlock_crystal_mining: {
    id: 'unlock_crystal_mining', name: 'Crystal Mining',
    description: 'Unlocks the Crystal Miner gear. Generates crystal per rotation. Researchable independently of Iron Mining.',
    tier: 1, goldCost: 45, researchTime: 40000,
    prereqs: [],
    effects: [{ kind: 'unlock_gear', gearType: 'crystal_miner' }],
    column: 2,
  },
  iron_to_gold: {
    id: 'iron_to_gold', name: 'Iron Smelting',
    description: 'Unlocks the Iron Converter gear. Converts iron into gold on each rotation.',
    tier: 2, goldCost: 35, researchTime: 30000,
    prereqs: ['unlock_iron_mining'],
    effects: [{ kind: 'unlock_gear', gearType: 'iron_converter' }],
    column: 2,
  },

  // T3
  gold_mining_3: {
    id: 'gold_mining_3', name: 'Gold Mining III',
    description: '+3 gold per second base income.',
    tier: 3, goldCost: 80, researchTime: 42000,
    prereqs: ['gold_mining_2'],
    effects: [{ kind: 'gold_bonus_per_sec', value: 3 }],
    column: 2,
  },
  power_overdrive: {
    id: 'power_overdrive', name: 'Power Overdrive',
    description: '+25% capacitor burst yield, stacking with the Power Efficiency line.',
    tier: 3, goldCost: 130, researchTime: 78000,
    prereqs: ['power_efficiency_2', 'capacitor_upgrade'],
    effects: [{ kind: 'power_bonus_pct', value: 0.25 }],
    column: 2,
  },
  unlock_aether_mining: {
    id: 'unlock_aether_mining', name: 'Aether Mining',
    description: 'Unlocks the Aether Miner gear. Generates aether per rotation. Researchable independently of the other mining lines -- priced to reflect that a rush straight here is a real gamble, not proof of built-up infrastructure.',
    tier: 1, goldCost: 150, researchTime: 110000,
    prereqs: [],
    effects: [{ kind: 'unlock_gear', gearType: 'aether_miner' }],
    column: 2,
  },
  crystal_to_gold: {
    id: 'crystal_to_gold', name: 'Crystal Refining',
    description: 'Unlocks the Crystal Converter gear. Converts crystal into gold at 3× rate.',
    tier: 3, goldCost: 60, researchTime: 54000,
    prereqs: ['unlock_crystal_mining', 'iron_to_gold'],
    effects: [{ kind: 'unlock_gear', gearType: 'crystal_converter' }],
    column: 2,
  },
  aether_to_gold: {
    id: 'aether_to_gold', name: 'Aether Transmutation',
    description: 'Unlocks the Aether Converter gear. Converts aether into gold at 6× rate.',
    tier: 3, goldCost: 90, researchTime: 75000,
    prereqs: ['unlock_aether_mining', 'crystal_to_gold'],
    effects: [{ kind: 'unlock_gear', gearType: 'aether_converter' }],
    column: 2,
  },
  gold_empire: {
    id: 'gold_empire', name: 'Gold Empire',
    description: '+5 gold per second.',
    tier: 3, goldCost: 120, researchTime: 72000,
    prereqs: ['gold_mining_3'],
    effects: [{ kind: 'gold_bonus_per_sec', value: 5 }],
    column: 2,
  },

  // ─── COLUMN 3: ABILITIES ──────────────────────────────────────────────────

  // T1
  counter_intel: {
    id: 'counter_intel', name: 'Counter Intelligence',
    description: 'See which unit type the AI is currently producing.',
    tier: 1, goldCost: 40, researchTime: 24000,
    prereqs: [],
    effects: [{ kind: 'enable_ability', abilityId: 'counter_intel' }],
    column: 3,
  },

  // T2
  power_surge: {
    id: 'power_surge', name: 'Gold Surge',
    description: 'Unlocks the Gold Surge ability: instantly gain 30 gold (60s cooldown).',
    tier: 2, goldCost: 60, researchTime: 36000,
    prereqs: ['power_efficiency_1'],
    effects: [{ kind: 'enable_ability', abilityId: 'power_surge' }],
    column: 3,
  },

  // T3

  // ─── COLUMN 4: DEFENSE ────────────────────────────────────────────────────

  // T1
  base_fortification: {
    id: 'base_fortification', name: 'Base Fortification',
    description: 'Your base gains +20 max HP.',
    tier: 1, goldCost: 30, researchTime: 24000,
    prereqs: [],
    effects: [{ kind: 'base_hp_bonus', value: 20 }],
    column: 4,
  },
  spiked_gears: {
    id: 'spiked_gears', name: 'Spiked Gears',
    description: 'Unlocks Spiked gear. Damages units on contact; damage scales with spin speed. Heals a little on each rotation.',
    tier: 1, goldCost: 45, researchTime: 27000,
    prereqs: [],
    effects: [{ kind: 'unlock_gear', gearType: 'spiked' }],
    column: 4,
  },
  // T2
  armored_gears: {
    id: 'armored_gears', name: 'Armored Gears',
    description: 'Unlocks Armored gear. Blocks unit movement; heals on rotation; pushes nearby units as it spins.',
    tier: 2, goldCost: 45, researchTime: 27000,
    prereqs: ['base_fortification'],
    effects: [{ kind: 'unlock_gear', gearType: 'armored' }],
    column: 4,
  },
  fortress_wall: {
    id: 'fortress_wall', name: 'Fortress Wall',
    description: 'Your base gains +50 max HP.',
    tier: 2, goldCost: 80, researchTime: 48000,
    prereqs: ['base_fortification', 'armored_gears'],
    effects: [{ kind: 'base_hp_bonus', value: 50 }],
    column: 4,
  },
  crossbow_turret_tech: {
    id: 'crossbow_turret_tech', name: 'Crossbow Turret',
    description: 'Unlocks the Crossbow Turret gear. Each rotation buys ammo (2 gold each). Fires quickly at nearby enemies.',
    tier: 2, goldCost: 55, researchTime: 36000,
    prereqs: ['spiked_gears'],
    effects: [{ kind: 'unlock_gear', gearType: 'crossbow_turret' }],
    column: 4,
  },
  unlock_minelayer: {
    id: 'unlock_minelayer', name: 'Minelayer',
    description: 'Unlocks the Minelayer gear. Each rotation buys a mine shell (5 gold). Lobs hidden mines into a zone ahead of it.',
    tier: 2, goldCost: 55, researchTime: 33000,
    prereqs: ['spiked_gears'],
    effects: [{ kind: 'unlock_gear', gearType: 'minelayer' }],
    column: 4,
  },
  healer_gear_tech: {
    id: 'healer_gear_tech', name: 'Healing Gear',
    description: 'Unlocks the Healer gear. On each rotation, emits a healing aura to nearby friendly gears and units.',
    tier: 2, goldCost: 60, researchTime: 42000,
    prereqs: ['armored_gears'],
    effects: [{ kind: 'unlock_gear', gearType: 'healer' }],
    column: 4,
  },
  unlock_sentry: {
    id: 'unlock_sentry', name: 'Sentry',
    description: 'Unlocks the Sentry gear and Sentry Spawner. Both pulse true-sight in a radius, revealing hidden enemy mines early -- the counter to a Minelayer.',
    tier: 2, goldCost: 50, researchTime: 33000,
    prereqs: ['spiked_gears'],
    effects: [
      { kind: 'unlock_gear', gearType: 'sentry_gear' },
      { kind: 'unlock_gear', gearType: 'sentry_spawner' },
      { kind: 'unlock_unit', unitType: 'sentry_unit' },
    ],
    column: 4,
  },

  // T3
  artillery_turret_tech: {
    id: 'artillery_turret_tech', name: 'Artillery Turret',
    description: 'Unlocks the Artillery Turret gear. Each rotation buys 1 ammo shell (6 gold). Fires AoE shells at long range.',
    tier: 3, goldCost: 90, researchTime: 66000,
    prereqs: ['crossbow_turret_tech'],
    effects: [{ kind: 'unlock_gear', gearType: 'artillery_turret' }],
    column: 4,
  },
  heavy_fortification: {
    id: 'heavy_fortification', name: 'Heavy Fortification',
    description: 'Your base gains +80 max HP.',
    tier: 3, goldCost: 120, researchTime: 60000,
    prereqs: ['fortress_wall'],
    effects: [{ kind: 'base_hp_bonus', value: 80 }],
    column: 4,
  },
};

export const TECH_NODE_LIST: TechNode[] = Object.values(TECH_NODES);
