import { ThreatLevel } from '../types/ai.types';

// ─── Context ──────────────────────────────────────────────────────────────────

/**
 * Snapshot of game state passed to every ability handler.
 * Add new fields here when new abilities need additional context.
 */
export interface AIAbilityContext {
  threat: ThreatLevel;
  gold: number;
  /** Chains that have not yet reached 'full' phase */
  chainsWaiting: number;
  /** True when every chain is fully built */
  allChainsFull: boolean;
  /** 0–1 fraction of own base HP remaining */
  myHpPct: number;
  /** 0–1 fraction of opponent base HP remaining */
  oppHpPct: number;
  aiResearched: Set<string>;
}

// ─── Handler interface ────────────────────────────────────────────────────────

/**
 * Implement this interface to add a new AI ability.
 *
 * Registration: push a new instance into AI_ABILITY_HANDLERS below,
 * or call aiController.registerAbilityHandler(handler) at runtime.
 *
 * The AIController calls shouldUse() every poll. If true AND this side's own
 * AbilitySystem says the ability is unlocked and off cooldown, activate()
 * fires through that same AbilitySystem -- the real one a human's UI click
 * uses, not a parallel cooldown tracker.
 */
export interface AIAbilityHandler {
  /** Human-readable name for logging */
  readonly name: string;
  /** The ability's id (also used for cooldown/unlock lookups against AbilitySystem) */
  readonly abilityId: string;
  /**
   * Tech nodes that must all be researched before this handler is active.
   * Informational only now that AbilitySystem.canActivate() is the real
   * gate -- kept so a handler can still document its own prerequisite.
   */
  readonly requiredTech: string[];
  /** Milliseconds between uses (informational -- AbilitySystem owns the real cooldown) */
  readonly cooldownMs: number;
  /** Return true when the ability should fire right now */
  shouldUse(ctx: AIAbilityContext): boolean;
  /** Human-readable explanation of the current decision (used/skipped) */
  reason(ctx: AIAbilityContext): string;
}

// ─── Built-in handlers ────────────────────────────────────────────────────────

const GOLD_SURGE_AMOUNT = 30;

/**
 * Gold Surge — instantly earns 30 gold.
 * Fires when chains are waiting to be built but gold is scarce.
 * Also fires defensively at critical HP.
 */
export class PowerSurgeHandler implements AIAbilityHandler {
  readonly name = 'Gold Surge';
  readonly abilityId = 'power_surge';
  readonly requiredTech = ['power_surge'];
  readonly cooldownMs = 60_000;

  shouldUse(ctx: AIAbilityContext): boolean {
    if (ctx.threat === 'critical' && ctx.gold < 60) return true;   // defensive emergency
    return ctx.chainsWaiting > 0 && ctx.gold < 35;                 // gold-starved with work to do
  }

  reason(ctx: AIAbilityContext): string {
    if (ctx.threat === 'critical' && ctx.gold < 60) {
      return `power_surge: critical threat + low gold (${ctx.gold.toFixed(0)}g) → emergency +${GOLD_SURGE_AMOUNT}g`;
    }
    if (this.shouldUse(ctx)) {
      return `power_surge: gold=${ctx.gold.toFixed(0)}g < 35 with ${ctx.chainsWaiting} chain(s) waiting → +${GOLD_SURGE_AMOUNT}g`;
    }
    return `power_surge: skipped (gold=${ctx.gold.toFixed(0)}g, waiting=${ctx.chainsWaiting})`;
  }
}

// ─── Registry ─────────────────────────────────────────────────────────────────

/**
 * All built-in AI ability handlers.
 * To add a new ability:
 *   1. Implement AIAbilityHandler
 *   2. Add an instance here
 *
 * Alternatively, call aiController.registerAbilityHandler(handler)
 * at runtime for dynamic registration.
 */
export const AI_ABILITY_HANDLERS: AIAbilityHandler[] = [
  new PowerSurgeHandler(),

  // Future handlers (examples of what would go here):
  // new EmergencyFortifyHandler(),   // research fortification under heavy attack
];
