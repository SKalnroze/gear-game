import { EventBus } from './EventBus';
import { soundManager } from '../audio/SoundManager';
import { GAME_SETTINGS } from '../constants/ui.constants';
import type { UnitType } from '../types/unit.types';

/**
 * GameSoundManager — subscribes to game events and delegates to the
 * procedural audio engine (src/audio/SoundManager).
 *
 * Maintains a unitId→type cache so type-specific sounds can be played
 * on events that only carry an id (unit:died, unit:entered_combat, etc.).
 */
export class GameSoundManager {
  private _eventBus: EventBus;
  private _unitTypes = new Map<string, UnitType>();

  // Throttle maps — prevent audio spam when many events fire at once
  private _lastMelee   = 0;  // ms, max 1 clash sound per 280ms
  private _lastDamage  = 0;  // ms, max 1 hit sound per 200ms
  private _lastCrystal = 0;  // ms, max 1 crystal-fire per 120ms
  private _lastArty    = 0;  // ms, max 1 arty-fire per 500ms

  constructor(eventBus: EventBus) {
    this._eventBus = eventBus;
    this._wire();
  }

  private get _ok(): boolean { return GAME_SETTINGS.soundEnabled; }

  private _wire(): void {
    const bus = this._eventBus;

    // ── Unit lifecycle ───────────────────────────────────────────────────
    bus.on('unit:spawned', ({ unit }) => {
      this._unitTypes.set(unit.id, unit.type);
      if (!this._ok) return;
      soundManager.playUnitSpawn(unit.type);
    });

    bus.on('unit:died', ({ unitId }) => {
      if (!this._ok) return;
      const type = this._unitTypes.get(unitId) ?? 'infantry';
      soundManager.playUnitDie(type);
      this._unitTypes.delete(unitId);
    });

    // ── Unit combat ──────────────────────────────────────────────────────
    bus.on('unit:entered_combat', ({ unitId }) => {
      if (!this._ok) return;
      const now = Date.now();
      if (now - this._lastMelee < 280) return;
      this._lastMelee = now;
      const type = this._unitTypes.get(unitId) ?? 'infantry';
      soundManager.playUnitAttack(type);
      soundManager.playMeleeCombatStart();
    });

    bus.on('unit:damaged', ({ unitId: _unitId }) => {
      // Intentionally sparse — only play occasionally to avoid spam
      if (!this._ok) return;
      const now = Date.now();
      if (now - this._lastDamage < 200) return;
      this._lastDamage = now;
      // Light hit sound (reuse melee clash — short and unobtrusive)
      soundManager.playMeleeCombatStart();
    });

    // ── Projectiles ──────────────────────────────────────────────────────
    bus.on('projectile:fired', ({ type }) => {
      if (!this._ok) return;
      const now = Date.now();
      if (type === 'artillery_shell') {
        if (now - this._lastArty < 500) return;
        this._lastArty = now;
        soundManager.playArtilleryFire();
      } else {
        // crystal_shard (also used by crossbow turrets)
        if (now - this._lastCrystal < 120) return;
        this._lastCrystal = now;
        soundManager.playCrystalShardFire();
      }
    });

    bus.on('projectile:hit', ({ aoeRadius }) => {
      if (!this._ok) return;
      if (aoeRadius > 0) {
        soundManager.playArtilleryHit();
      } else {
        soundManager.playCrystalShardHit();
      }
    });

    // ── Gear sounds ──────────────────────────────────────────────────────
    bus.on('gear:placed', () => {
      if (!this._ok) return;
      soundManager.playGearPlace();
    });

    bus.on('gear:jammed', ({ severity }) => {
      if (!this._ok) return;
      soundManager.playGearJam(severity);
    });

    bus.on('gear:destroyed', () => {
      if (!this._ok) return;
      soundManager.playGearDestroyed();
    });

    bus.on('gear:burnt_out', () => {
      if (!this._ok) return;
      soundManager.playGearBurntOut();
    });

    bus.on('gear:overclock_started', () => {
      if (!this._ok) return;
      soundManager.playGearOverclock();
    });

    bus.on('slime_puddle:created', () => {
      // Slime bursts into a puddle on death
      if (!this._ok) return;
      soundManager.playSlimePop();
    });

    bus.on('gear:healer_pulse', () => {
      if (!this._ok) return;
      soundManager.playHealerPulse();
    });

    bus.on('gear:mesh_updated', () => {
      if (!this._ok) return;
      soundManager.playGearMesh();
    });

    // ── Power / special gear events ──────────────────────────────────────
    bus.on('power:capacitor_burst', () => {
      if (!this._ok) return;
      soundManager.playCapacitorBurst();
    });

    // ── Combat ───────────────────────────────────────────────────────────
    bus.on('combat:base_damaged', () => {
      if (!this._ok) return;
      soundManager.playBaseDamaged();
    });

    // ── Abilities ────────────────────────────────────────────────────────
    bus.on('ability:activated', ({ id, owner }) => {
      if (!this._ok || owner !== 'player') return;
      soundManager.playAbility(id);
    });
  }

  destroy(): void {
    this._unitTypes.clear();
  }
}
