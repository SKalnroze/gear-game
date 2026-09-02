export type AbilityId = 'power_surge' | 'counter_intel' | 'overclock_no_burnout';

export interface AbilityDefinition {
  id: AbilityId;
  name: string;
  cooldownMs: number;
  description: string;
  /** If true, this is a passive ability — no UI button */
  passive: boolean;
}

export interface AbilityState {
  id: AbilityId;
  unlocked: boolean;
  lastUsedAt: number;
}
