import { AIPersonality, AIStrategyProfile, ThreatLevel } from '../types/ai.types';

/**
 * The strategic layer, between the AI's fixed goal (win) and its per-tick
 * tactical execution (AIChainPlanner: which gear, where). Recomputed
 * periodically from a read of the match, not fixed at spawn -- a rusher who
 * is losing still shifts weight toward defense; personality biases the
 * starting point, it doesn't override what the board is saying.
 */

export interface StrategicInputs {
  personality: AIPersonality;
  threat: ThreatLevel;
  /** Current passive gold/sec income (base rate + researched/gear bonuses). */
  goldPerSec: number;
  /** ms since the match started. */
  matchElapsedMs: number;
  profile: Exclude<AIStrategyProfile, 'practice'>;
}

export interface StrategicPosture {
  /** Economy / defense / offense weights, summing to 1. */
  economy: number;
  defense: number;
  offense: number;
  /** How many chains the AI believes it can currently sustain, across all roles. */
  capacity: number;
}

const PERSONALITY_BASE: Record<AIPersonality, { economy: number; defense: number; offense: number }> = {
  rusher:    { economy: 0.25, defense: 0.15, offense: 0.60 },
  economist: { economy: 0.60, defense: 0.15, offense: 0.25 },
  turtle:    { economy: 0.20, defense: 0.55, offense: 0.25 },
  balanced:  { economy: 1 / 3, defense: 1 / 3, offense: 1 / 3 },
};

/** Capacity growth tuning per difficulty -- higher difficulty reaches for growth faster, not a higher hard ceiling. */
const CAPACITY_BASE: Record<'easy' | 'medium' | 'hard', number> = { easy: 2, medium: 3, hard: 4 };
const CAPACITY_GOLD_STEP: Record<'easy' | 'medium' | 'hard', number> = { easy: 14, medium: 9, hard: 5 };
const CAPACITY_MINUTE_STEP: Record<'easy' | 'medium' | 'hard', number> = { easy: 3.5, medium: 2.2, hard: 1.3 };
const CAPACITY_MAX: Record<'easy' | 'medium' | 'hard', number> = { easy: 6, medium: 10, hard: 18 };

export function computePosture(inputs: StrategicInputs): StrategicPosture {
  const base = { ...PERSONALITY_BASE[inputs.personality] };

  // Threat reshapes the blend on top of personality, not instead of it.
  if (inputs.threat === 'critical') {
    // No time for economy -- survive, then push back.
    base.economy *= 0.35;
    base.defense *= 1.5;
    base.offense *= 1.35;
  } else if (inputs.threat === 'danger') {
    base.economy *= 0.7;
    base.defense *= 1.25;
  } else if (inputs.threat === 'winning') {
    // Ahead: press the advantage economically, spend less urgency on defense.
    base.economy *= 1.25;
    base.defense *= 0.85;
  }

  const total = base.economy + base.defense + base.offense;
  const economy = base.economy / total;
  const defense = base.defense / total;
  const offense = base.offense / total;

  const matchMinutes = inputs.matchElapsedMs / 60000;
  const capacityBase = CAPACITY_BASE[inputs.profile];
  const goldGrowth = Math.floor(inputs.goldPerSec / CAPACITY_GOLD_STEP[inputs.profile]);
  const timeGrowth = Math.floor(matchMinutes / CAPACITY_MINUTE_STEP[inputs.profile]);
  const capacity = Math.min(CAPACITY_MAX[inputs.profile], capacityBase + goldGrowth + timeGrowth);

  return { economy, defense, offense, capacity };
}

/** How many chains of a given role the posture currently justifies, always at least the minimum for a role already in use. */
export function roleCapFromPosture(posture: StrategicPosture, weight: number, minimum: number): number {
  return Math.max(minimum, Math.round(posture.capacity * weight));
}
