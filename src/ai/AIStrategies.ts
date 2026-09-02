import { AIStrategy, AIStrategyProfile } from '../types/ai.types';

export const AI_STRATEGIES: Record<AIStrategyProfile, AIStrategy> = {
  easy: {
    profile: 'easy',
    gearPriority: 0.55,
    researchPriority: 0.2,
    preferredUnitType: 'infantry',
  },
  medium: {
    profile: 'medium',
    gearPriority: 0.60,
    researchPriority: 0.25,
    preferredUnitType: 'infantry',
  },
  hard: {
    profile: 'hard',
    gearPriority: 0.65,
    researchPriority: 0.15,
    preferredUnitType: 'cavalry',
  },
  practice: {
    profile: 'practice',
    gearPriority: 0,
    researchPriority: 0,
    preferredUnitType: 'infantry',
  },
};
