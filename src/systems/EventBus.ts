import Phaser from 'phaser';
import { GameEventMap } from '../types/events.types';

type EventKey = keyof GameEventMap;
type EventPayload<K extends EventKey> = GameEventMap[K];
type Listener<K extends EventKey> = (payload: EventPayload<K>) => void;

/**
 * Typed wrapper around Phaser.Events.EventEmitter.
 * Enforces GameEventMap at compile time — no stringly-typed events.
 */
export class EventBus {
  private emitter: Phaser.Events.EventEmitter;

  constructor() {
    this.emitter = new Phaser.Events.EventEmitter();
  }

  emit<K extends EventKey>(event: K, payload: EventPayload<K>): void {
    this.emitter.emit(event, payload);
  }

  on<K extends EventKey>(event: K, listener: Listener<K>, context?: unknown): void {
    this.emitter.on(event, listener, context);
  }

  once<K extends EventKey>(event: K, listener: Listener<K>, context?: unknown): void {
    this.emitter.once(event, listener, context);
  }

  off<K extends EventKey>(event: K, listener?: Listener<K>, context?: unknown): void {
    this.emitter.off(event, listener, context);
  }

  removeAllListeners(event?: EventKey): void {
    if (event) {
      this.emitter.removeAllListeners(event);
    } else {
      this.emitter.removeAllListeners();
    }
  }

  destroy(): void {
    this.emitter.destroy();
  }
}

// Singleton instance shared across all systems
export const eventBus = new EventBus();
