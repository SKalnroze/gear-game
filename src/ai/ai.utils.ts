/**
 * Pure AI utility functions extracted from AIController for testability.
 * No Phaser or system dependencies — safe to import in Node/test environments.
 */

import type { AIChainPlan } from './AIChainPlanner';
import type { ThreatLevel, AIStrategyProfile } from '../types/ai.types';

/**
 * How strongly each difficulty leans on its "need" signal (research score,
 * gear-size preference) rather than picking uniformly at random.
 * Shared by research selection (AIController) and gear-size selection
 * (AIChainPlanner) so "easy = mostly random, hard = near-optimal" reads the
 * same way across both decisions. `practice` mirrors `hard` -- it never
 * actually decides anything (AIController short-circuits first).
 */
export const AI_BIAS_STRENGTH: Record<AIStrategyProfile, number> = {
  easy: 1.5,
  medium: 5,
  hard: 14,
  practice: 14,
};

/**
 * Pick one item at random, weighted by the parallel `weights` array.
 * Every item needs weight > 0 to have a chance; a single-item list short-
 * circuits without consuming a random draw (keeps call counts stable for
 * random-seeded tests elsewhere in the AI).
 */
export function weightedRandomPick<T>(items: T[], weights: number[], rand: () => number = Math.random): T {
  if (items.length === 1) return items[0];
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return items[Math.floor(rand() * items.length)];
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// Phase priority: bootstrap first, full last
const PHASE_ORDER: Record<string, number> = {
  bootstrap: 0, spawn: 1, amplify: 2, support: 3, expand: 4, full: 5,
};

/**
 * Sort comparator: orders chain plans from highest to lowest priority phase.
 * Economy and defense chains are slightly lower priority than combat at the same phase.
 */
export function byPhase(a: AIChainPlan, b: AIChainPlan): number {
  const roleOffset = (role: string) => (role === 'economy' || role === 'defense') ? 0.5 : 0;
  const phaseA = (PHASE_ORDER[a.phase] ?? 99) + roleOffset(a.role);
  const phaseB = (PHASE_ORDER[b.phase] ?? 99) + roleOffset(b.role);
  return phaseA - phaseB;
}

/**
 * Classify current game state by urgency.
 * Uses percentages so base HP buffs from tech scale correctly.
 *
 * @param myHp      current HP of the AI's base
 * @param myMaxHp   max HP of the AI's base
 * @param oppHp     current HP of the opponent's base
 * @param oppMaxHp  max HP of the opponent's base
 */
export function assessThreatLevel(
  myHp: number, myMaxHp: number,
  oppHp: number, oppMaxHp: number,
): ThreatLevel {
  const myPct  = myMaxHp  > 0 ? myHp  / myMaxHp  : 0;
  const oppPct = oppMaxHp > 0 ? oppHp / oppMaxHp : 1;
  if (myPct  < 0.30) return 'critical';
  if (myPct  < 0.55) return 'danger';
  if (oppPct < 0.50) return 'winning';
  return 'normal';
}
