import { GearType } from './gear.types';

export type AIStrategyProfile = 'easy' | 'medium' | 'hard' | 'practice';

/**
 * Indicates who is occupying a lobby slot.  Human means the player/controller
 * will be responsible for that side; AI means an automated opponent.
 */
export type SlotKind = 'human' | 'ai';

/**
 * Configuration for one side in the lobby screen.
 */
export interface AISlotConfig {
  kind: SlotKind;
  /** AI settings – only valid when kind === 'ai' */
  difficulty?: AIStrategyProfile;
  personality?: AIPersonality | 'random';
}

/**
 * Data passed from the lobby scene into GameScene when starting a match.
 */
export interface LobbyConfig {
  left: AISlotConfig;
  right: AISlotConfig;
}

/** Threat urgency level — shared across AI systems */
export type ThreatLevel = 'critical' | 'danger' | 'normal' | 'winning';

/** Randomly assigned play-style bias — stable per game instance */
export type AIPersonality = 'rusher' | 'economist' | 'turtle' | 'balanced';

export type AIDecisionType = 'place_gear' | 'place_generator' | 'reposition_gear' | 'idle';

export interface AIDecision {
  type: AIDecisionType;
  // For place_gear:
  gearType?: GearType;
  teeth?: number;
  x?: number;
  y?: number;
  /**
   * For place_generator: the gear to run cable to once placed. Placing and
   * wiring are one decision because a generator nobody wired to anything is
   * just an expensive ornament.
   */
  wireToId?: string;
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
  /** Gear type the planner would place here next, or null (full / nothing actionable). */
  nextGear: string | null;
  stats: {
    motorCount: number;
    amplifierCount: number;
    spawnerTypes: string[];
    researcherCount: number;
    capacitorCount: number;
    minerCount: number;
    converterCount: number;
    healerCount: number;
    spikedCount: number;
    armoredCount: number;
    overclockCount: number;
    turretCount: number;
    minelayerCount: number;
    sentryGearCount: number;
    reliefValveCount: number;
  };
}

/** One entry in the debug-overlay's preview of the AI's upcoming research queue. */
export interface AIResearchPreviewItem {
  id: string;
  name: string;
  goldCost: number;
  score: number;
}

/** Full snapshot returned by AIController.getDebugState() */
export interface AIDebugState {
  owner: 'player' | 'ai';
  profile: AIStrategyProfile;
  personality: AIPersonality;
  threat: ThreatLevel;
  gold: number;
  /** Passive gold/sec income (base + researched/gear bonuses). */
  goldPerSec: number;
  /** ms since this controller's match started. */
  matchElapsedMs: number;
  /** True when threat was critical/danger within the recent past (keeps posture leaning economy). */
  recentlyThreatened: boolean;
  /** Economy/defense/offense weights (sum to 1) + chain capacity, recomputed periodically. */
  posture: { economy: number; defense: number; offense: number; capacity: number };
  /** The AI's actions-per-minute pool -- its real difficulty axis. */
  actionBudget: { points: number; capacity: number; apm: number };
  chainCount: number;
  chainSummaries: AIChainSummary[];
  /** Role the AI would assign to its NEXT bootstrapped chain, and why. */
  nextChainRole: string;
  nextChainRoleReason: string;
  researchGoal: string;
  researchInProgress: boolean;
  /** Top of the prioritized research queue (already-researched/blocked entries excluded). */
  researchQueue: AIResearchPreviewItem[];
  /** What this controller has observed about its opponent's unit composition. */
  opponent: { dominantUnit: string; sampleCount: number };
  lastDecisionReason: string;
  lastDecisionType: AIDecisionType;
  /** Active (unlocked, non-passive) abilities and their cooldown state */
  abilities: Array<{ id: string; cooldownRemaining: number }>;
}

