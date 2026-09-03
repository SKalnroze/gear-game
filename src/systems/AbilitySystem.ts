import { AbilityId, AbilityState } from '../types/ability.types';
import { ABILITY_DEFINITIONS } from '../constants/ability.constants';
import { EventBus } from './EventBus';
import { EconomySystem } from './EconomySystem';
import { GameClock, NEVER } from './GameClock';

const GOLD_SURGE_AMOUNT = 30;

/**
 * Manages one side's abilities: unlocking, cooldowns, and activation effects.
 * Each side (player and AI) owns its own instance -- the AI activates
 * abilities through the exact same class and gold/cooldown rules a human's
 * UI click does, not a parallel tracker.
 */
export class AbilitySystem {
  private eventBus: EventBus;
  private economySystem: EconomySystem;
  private abilities: Map<AbilityId, AbilityState> = new Map();
  private clock: GameClock;
  private readonly owner: 'player' | 'ai';

  constructor(eventBus: EventBus, economySystem: EconomySystem, clock: GameClock, owner: 'player' | 'ai' = 'player') {
    this.eventBus = eventBus;
    this.economySystem = economySystem;
    this.clock = clock;
    this.owner = owner;

    // Initialise all abilities as locked
    const ids: AbilityId[] = ['power_surge', 'counter_intel', 'overclock_no_burnout'];
    for (const id of ids) {
      this.abilities.set(id, { id, unlocked: false, lastUsedAt: NEVER });
    }
  }

  unlock(id: AbilityId): void {
    const state = this.abilities.get(id);
    if (state) {
      state.unlocked = true;
      this.eventBus.emit('ability:unlocked', { id });
    }
  }

  isUnlocked(id: AbilityId): boolean {
    return this.abilities.get(id)?.unlocked ?? false;
  }

  canActivate(id: AbilityId): boolean {
    const state = this.abilities.get(id);
    if (!state?.unlocked) return false;
    const def = ABILITY_DEFINITIONS[id];
    if (def.passive) return false;
    if (def.cooldownMs <= 0) return true;
    return this.clock.now - state.lastUsedAt >= def.cooldownMs;
  }

  getCooldownRemaining(id: AbilityId): number {
    const state = this.abilities.get(id);
    if (!state) return 0;
    const def = ABILITY_DEFINITIONS[id];
    if (def.cooldownMs <= 0) return 0;
    return Math.max(0, def.cooldownMs - (this.clock.now - state.lastUsedAt));
  }

  activate(id: AbilityId): boolean {
    if (!this.canActivate(id)) return false;

    const state = this.abilities.get(id)!;
    state.lastUsedAt = this.clock.now;

    switch (id) {
      case 'power_surge':
        this.economySystem.earnGold(this.owner, GOLD_SURGE_AMOUNT);
        break;
    }

    this.eventBus.emit('ability:activated', { id, owner: this.owner });
    return true;
  }

  /** Whether counter intel is active (passive reveal) */
  isRevealing(): boolean {
    return this.isUnlocked('counter_intel');
  }

  getAbilities(): Map<AbilityId, AbilityState> {
    return this.abilities;
  }
}
