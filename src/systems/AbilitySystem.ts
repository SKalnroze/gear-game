import { AbilityId, AbilityState } from '../types/ability.types';
import { ABILITY_DEFINITIONS } from '../constants/ability.constants';
import { EventBus } from './EventBus';
import { EconomySystem } from './EconomySystem';

const GOLD_SURGE_AMOUNT = 30;

/**
 * Manages player abilities: unlocking, cooldowns, and activation effects.
 */
export class AbilitySystem {
  private eventBus: EventBus;
  private economySystem: EconomySystem;
  private abilities: Map<AbilityId, AbilityState> = new Map();

  // Wave blitz: flag that makes the next wave trigger spawn 2 waves
  private waveBlitzActive: boolean = false;

  constructor(eventBus: EventBus, economySystem: EconomySystem) {
    this.eventBus = eventBus;
    this.economySystem = economySystem;

    // Initialise all abilities as locked
    const ids: AbilityId[] = ['power_surge', 'wave_blitz', 'counter_intel', 'overclock_no_burnout'];
    for (const id of ids) {
      this.abilities.set(id, { id, unlocked: false, lastUsedAt: 0 });
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
    return Date.now() - state.lastUsedAt >= def.cooldownMs;
  }

  getCooldownRemaining(id: AbilityId): number {
    const state = this.abilities.get(id);
    if (!state) return 0;
    const def = ABILITY_DEFINITIONS[id];
    if (def.cooldownMs <= 0) return 0;
    return Math.max(0, def.cooldownMs - (Date.now() - state.lastUsedAt));
  }

  activate(id: AbilityId): boolean {
    if (!this.canActivate(id)) return false;

    const state = this.abilities.get(id)!;
    state.lastUsedAt = Date.now();

    switch (id) {
      case 'power_surge':
        this.economySystem.earnGold('player', GOLD_SURGE_AMOUNT);
        break;
      case 'wave_blitz':
        this.waveBlitzActive = true;
        break;
    }

    this.eventBus.emit('ability:activated', { id });
    return true;
  }

  /** Returns true if the next wave should double-spawn (consumes the flag) */
  consumeWaveBlitz(): boolean {
    if (!this.waveBlitzActive) return false;
    this.waveBlitzActive = false;
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
