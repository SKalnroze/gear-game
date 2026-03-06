import { AIGameState } from '../types/ai.types';
import { UnitType } from '../types/unit.types';

/**
 * Evaluates game state to determine counter-pick unit type.
 * Reads recent player unit history from AI game state.
 */
export class AIEvaluator {
  /**
   * Counter-pick: given what the player recently sent, return best AI unit type.
   * Infantry → beats Artillery (2×)
   * Artillery → beats Cavalry (2×)
   * Cavalry → beats Infantry (2×)
   *
   * Weighting: most recent 3 units weighted 2× vs older entries.
   */
  static getCounterUnit(playerHistory: UnitType[]): UnitType {
    if (playerHistory.length === 0) return 'infantry';

    const counts: Partial<Record<UnitType, number>> = {};
    const recentThreshold = Math.max(0, playerHistory.length - 3);

    playerHistory.forEach((t, i) => {
      // Most recent 3 units: weight 2×; older: weight 1×
      const weight = i >= recentThreshold ? 2 : 1;
      counts[t] = (counts[t] ?? 0) + weight;
    });

    // Find dominant type
    let dominant: UnitType = 'infantry';
    let maxCount = 0;
    for (const [type, count] of Object.entries(counts) as [UnitType, number][]) {
      if (count > maxCount) {
        maxCount = count;
        dominant = type;
      }
    }

    // Counter it
    switch (dominant) {
      case 'infantry':
      case 'elite_infantry':
        return 'cavalry';   // cavalry beats infantry
      case 'cavalry':
      case 'elite_cavalry':
        return 'artillery'; // artillery beats cavalry
      case 'artillery':
      case 'elite_artillery':
        return 'infantry';  // infantry beats artillery
      default:
        return 'infantry';
    }
  }

  /**
   * Score the current board state for the AI (higher = AI winning).
   */
  static scoreBoard(state: AIGameState): number {
    let score = 0;
    score += (100 - state.playerBaseHp) * 2;  // damage to player base
    score -= (100 - state.aiBaseHp) * 2;       // damage to AI base
    score += state.aiGearCount * 3;             // each AI gear = advantage
    score -= state.playerGearCount * 2;
    score += state.aiGold * 0.05;               // gold for gear placement
    return score;
  }
}
