import { EventBus } from './EventBus';
import { BASE_MAX_HP } from '../constants/balance.constants';

/**
 * Tracks base HP and emits game:over when a base reaches 0.
 * In practice mode, neither base's HP is ever decremented -- it's a
 * sandbox for building, not a match either side can actually lose.
 */
export class WinConditionSystem {
  private eventBus: EventBus;
  private playerHp: number;
  private aiHp: number;
  private playerMaxHp: number;
  private aiMaxHp: number;
  private gameOver: boolean = false;
  private practiceMode: boolean = false;

  private readonly onUnitReachedBase: (data: { unit: any }) => void;

  constructor(eventBus: EventBus, practiceMode: boolean = false) {
    this.eventBus = eventBus;
    this.playerHp = BASE_MAX_HP;
    this.aiHp = BASE_MAX_HP;
    this.playerMaxHp = BASE_MAX_HP;
    this.aiMaxHp = BASE_MAX_HP;
    this.practiceMode = practiceMode;

    this.onUnitReachedBase = ({ unit }) => {
      if (this.gameOver) return;
      // Apply base damage (skipped in practice mode)
      if (!this.practiceMode) {
        if (unit.owner === 'player') {
          this.damageBase('ai', unit.damage);
        } else {
          this.damageBase('player', unit.damage);
        }
      }
      // Always destroy the unit on base contact
      this.eventBus.emit('unit:died', { unitId: unit.id, owner: unit.owner });
    };
    this.eventBus.on('unit:reached_base', this.onUnitReachedBase);
  }

  private damageBase(owner: 'player' | 'ai', damage: number): void {
    if (owner === 'player') {
      this.playerHp = Math.max(0, this.playerHp - damage);
      this.eventBus.emit('combat:base_damaged', {
        owner, damage, remainingHp: this.playerHp,
      });
      if (this.playerHp <= 0 && !this.gameOver) {
        this.gameOver = true;
        this.eventBus.emit('game:over', { winner: 'ai', reason: 'Player base destroyed' });
      }
    } else {
      this.aiHp = Math.max(0, this.aiHp - damage);
      this.eventBus.emit('combat:base_damaged', {
        owner, damage, remainingHp: this.aiHp,
      });
      if (this.aiHp <= 0 && !this.gameOver) {
        this.gameOver = true;
        this.eventBus.emit('game:over', { winner: 'player', reason: 'AI base destroyed' });
      }
    }
  }

  addMaxHp(owner: 'player' | 'ai', amount: number): void {
    if (owner === 'player') {
      this.playerMaxHp += amount;
      this.playerHp += amount;
    } else {
      this.aiMaxHp += amount;
      this.aiHp += amount;
    }
  }

  getHp(owner: 'player' | 'ai'): number {
    return owner === 'player' ? this.playerHp : this.aiHp;
  }

  getMaxHp(owner: 'player' | 'ai'): number {
    return owner === 'player' ? this.playerMaxHp : this.aiMaxHp;
  }

  isGameOver(): boolean {
    return this.gameOver;
  }

  destroy(): void {
    this.eventBus.off('unit:reached_base', this.onUnitReachedBase);
  }
}
