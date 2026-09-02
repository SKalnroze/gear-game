export type TechNodeId = string;

export type TechTier = 1 | 2 | 3;

export type TechUnlockEffect =
  | { kind: 'unlock_gear'; gearType: string }
  | { kind: 'unlock_unit'; unitType: string }
  | { kind: 'power_bonus_pct'; value: number }
  | { kind: 'gold_bonus_per_sec'; value: number }
  | { kind: 'unit_hp_pct'; unitType: string; value: number }
  | { kind: 'unit_speed_pct'; unitType: string; value: number }
  | { kind: 'unit_damage_pct'; unitType: string; value: number }
  | { kind: 'overclock_duration_bonus'; value: number }
  | { kind: 'capacitor_burst_multiplier'; value: number }
  | { kind: 'enable_ability'; abilityId: string }
  | { kind: 'chain_combo_bonus'; value: number }
  | { kind: 'base_hp_bonus'; value: number }
  | { kind: 'unlock_teeth'; teeth: number };

export interface TechNode {
  id: TechNodeId;
  name: string;
  description: string;
  tier: TechTier;
  goldCost: number;
  researchTime: number;   // milliseconds
  prereqs: TechNodeId[];  // must be researched first
  effects: TechUnlockEffect[];
  column?: number;        // thematic column for layout (0-4)
}

export interface TechState {
  researched: Set<TechNodeId>;
  inProgress?: TechNodeId;
  progressStartedAt?: number;
  queue: TechNodeId[];
  unlockedTeeth: number[];  // teeth counts available to player (starts as [10])
}
