import Phaser from 'phaser';
import { EventBus } from './EventBus';
import { GAME_SETTINGS } from '../constants/ui.constants';

/**
 * SoundManager: subscribes to game events and plays corresponding audio cues.
 *
 * Currently a stub — no audio assets are loaded yet.
 * Wire real audio sprites (JSON + file) via the Boot scene when assets are ready.
 * Reads GAME_SETTINGS.soundEnabled for mute toggle.
 */
export class SoundManager {
  private scene: Phaser.Scene;
  private eventBus: EventBus;

  constructor(scene: Phaser.Scene, eventBus: EventBus) {
    this.scene = scene;
    this.eventBus = eventBus;
    this.wireEvents();
  }

  private play(_key: string, _config?: Phaser.Types.Sound.SoundConfig): void {
    // Stub: replace body with this.scene.sound.play(key, config) once assets are loaded
    if (!GAME_SETTINGS.soundEnabled) return;
    // this.scene.sound.play(_key, _config);
  }

  private wireEvents(): void {
    this.eventBus.on('gear:placed', () => {
      this.play('sfx_gear_place', { volume: 0.6 });
    });

    this.eventBus.on('gear:full_rotation', ({ gearId: _gearId }) => {
      // TODO: pitch-shift by teeth count when audio is wired
      this.play('sfx_gear_chime', { volume: 0.3 });
    });

    this.eventBus.on('gear:jammed', () => {
      this.play('sfx_gear_jam', { volume: 0.8 });
    });

    this.eventBus.on('gear:destroyed', () => {
      this.play('sfx_gear_break', { volume: 0.9 });
    });

    this.eventBus.on('ability:activated', () => {
      this.play('sfx_ability', { volume: 0.7 });
    });

    this.eventBus.on('unit:entered_combat', () => {
      this.play('sfx_clash', { volume: 0.5 });
    });

    this.eventBus.on('combat:base_damaged', () => {
      this.play('sfx_base_hit', { volume: 1.0 });
    });

    this.eventBus.on('power:capacitor_burst', () => {
      this.play('sfx_capacitor_burst', { volume: 0.85 });
    });
  }

  destroy(): void {
    // Event bus listeners are removed globally on scene shutdown
  }
}
