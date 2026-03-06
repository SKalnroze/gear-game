import { AbilityDefinition, AbilityId } from '../types/ability.types';

const GOLD_SURGE_AMOUNT = 30;  // gold granted by gold surge ability

export const ABILITY_DEFINITIONS: Record<AbilityId, AbilityDefinition> = {
  power_surge: {
    id: 'power_surge',
    name: 'Gold Surge',
    cooldownMs: 60000,
    description: `Instantly gain ${GOLD_SURGE_AMOUNT} gold.`,
    passive: false,
  },
  wave_blitz: {
    id: 'wave_blitz',
    name: 'Wave Blitz',
    cooldownMs: 90000,
    description: 'Send 2 waves simultaneously for the cost of 1.',
    passive: false,
  },
  counter_intel: {
    id: 'counter_intel',
    name: 'Counter Intel',
    cooldownMs: 0,
    description: 'Passively reveals the AI\'s last sent unit type.',
    passive: true,
  },
  overclock_no_burnout: {
    id: 'overclock_no_burnout',
    name: 'Overclock Mastery',
    cooldownMs: 0,
    description: 'Player Overclock gears never burn out.',
    passive: true,
  },
};
