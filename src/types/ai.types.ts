import { GearType } from './gear.types';
import { UnitType } from './unit.types';
import { ResourceState } from './economy.types';

export type AIStrategyProfile = 'easy' | 'medium' | 'hard' | 'practice';

/** Threat urgency level — shared across AI systems */
export type ThreatLevel = 'critical' | 'danger' | 'normal' | 'winning';

/** Randomly assigned play-style bias — stable per game instance */
export type AIPersonality = 'rusher' | 'economist' | 'turtle' | 'balanced';

export interface AIStrategy {
  profile: AIStrategyProfile;
  gearPriority: number;   // 0-1, probability bucket for gear building
  wavePriority: number;   // 0-1, probability bucket for wave sending
  researchPriority: number;
  preferredUnitType: UnitType;
}

export type AIDecisionType = 'place_gear' | 'reposition_gear' | 'idle';

export interface AIDecision {
  type: AIDecisionType;
  // For place_gear:
  gearType?: GearType;
  teeth?: number;
  x?: number;
  y?: number;
  // For reposition_gear:
  gearId?: string;
  /** Human-readable explanation of why this decision was made */
  reason?: string;
}

/** Slim snapshot of one chain's state for the debug overlay */
export interface AIChainSummary {
  id: string;
  phase: string;
  role: string;
  origin: { x: number; y: number };
  gearCount: number;
  /** Total gold spent placing all gears in this chain */
  totalCost: number;
  /** True when this is the chain the AI is currently developing (earliest non-full phase) */
  isFocus: boolean;
  stats: {
    motorCount: number;
    amplifierCount: number;
    spawnerTypes: string[];
    researcherCount: number;
    capacitorCount: number;
    minerCount: number;
    healerCount: number;
    spikedCount: number;
    armoredCount: number;
    overclockCount: number;
    turretCount: number;
  };
}

/** Full snapshot returned by AIController.getDebugState() */
export interface AIDebugState {
  owner: 'player' | 'ai';
  profile: AIStrategyProfile;
  threat: ThreatLevel;
  gold: number;
  researchGoal: string;
  chainCount: number;
  chainSummaries: AIChainSummary[];
  lastDecisionReason: string;
  lastDecisionType: AIDecisionType;
  /** Active (unlocked, non-passive) abilities and their cooldown state */
  abilities: Array<{ id: string; cooldownRemaining: number }>;
  personality: AIPersonality;
}

export interface AIGameState {
  playerUnitHistory: UnitType[];  // last N unit types sent by opponent
  playerGearCount: number;
  aiGearCount: number;
  aiGold: number;
  aiBaseHp: number;
  playerBaseHp: number;
  tickNumber: number;
  aiResources: ResourceState;
  playerResources: ResourceState;
  aiUnitCount: number;
  playerUnitCount: number;
  aiResearched: Set<string>;
  chainCount: number;
}
