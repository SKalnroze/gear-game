import Phaser from 'phaser';
import { EventBus } from '../systems/EventBus';
import { World } from '../world/World';
import { NEON } from '../constants/ui.constants';

/**
 * FloatingTextManager
 *
 * Spawns world-space floating text labels whenever a gear produces a result,
 * or when a unit takes damage.
 * Each label rises 60px and fades out over 3.5s, following world coordinates
 * (so they scroll correctly with the camera).
 *
 * Only shows text for the player's own gears to avoid cluttering the screen.
 *
 * Driven by:
 *   gear:rotation_result  – emitted by EconomySystem and UnitSystem
 *   power:capacitor_burst – emitted by RotationPhysicsSystem
 *   unit:damaged          – emitted by UnitSystem and ProjectileSystem
 */
export class FloatingTextManager {
  private scene: Phaser.Scene;
  private world: World;
  private eventBus: EventBus;

  // Spacing: if a gear fires multiple labels quickly, stagger vertically
  private lastYOffset: Map<string, number> = new Map();
  private lastFireTime: Map<string, number> = new Map();

  private static readonly RISE_PX = 60;
  private static readonly DURATION_MS = 3500;
  private static readonly STAGGER_PX = 16;
  private static readonly STAGGER_WINDOW_MS = 400;

  private readonly handleRotationResult = ({ gearId, owner, text, color }: {
    gearId: string; owner: 'player' | 'ai'; text: string; color: number;
  }): void => {
    if (owner !== 'player') return;
    this.spawn(gearId, text, color);
  };

  private readonly handleCapacitorBurst = ({ gearId, owner, goldEarned }: {
    gearId: string; owner: 'player' | 'ai'; goldEarned: number;
  }): void => {
    if (owner !== 'player') return;
    this.spawn(gearId, `⚡ +${goldEarned.toFixed(1)}g`, NEON.cyan);
  };

  private readonly handleUnitDamaged = ({ damage, x, y }: {
    damage: number; x: number; y: number;
  }): void => {
    this.spawnAt(x, y, `-${Math.ceil(damage)}`, 0xff4444);
  };

  constructor(scene: Phaser.Scene, eventBus: EventBus, world: World) {
    this.scene = scene;
    this.world = world;
    this.eventBus = eventBus;

    eventBus.on('gear:rotation_result', this.handleRotationResult);
    eventBus.on('power:capacitor_burst', this.handleCapacitorBurst);
    eventBus.on('unit:damaged', this.handleUnitDamaged);
  }

  destroy(): void {
    this.eventBus.off('gear:rotation_result', this.handleRotationResult);
    this.eventBus.off('power:capacitor_burst', this.handleCapacitorBurst);
    this.eventBus.off('unit:damaged', this.handleUnitDamaged);
  }

  private spawn(gearId: string, text: string, color: number): void {
    const gear = this.world.getGear(gearId);
    if (!gear) return;

    const now = Date.now();

    // Stagger offset so rapid labels from the same gear don't overlap
    const lastTime = this.lastFireTime.get(gearId) ?? 0;
    let yOffset = this.lastYOffset.get(gearId) ?? 0;
    if (now - lastTime > FloatingTextManager.STAGGER_WINDOW_MS) {
      yOffset = 0;
    } else {
      yOffset -= FloatingTextManager.STAGGER_PX;
    }
    this.lastFireTime.set(gearId, now);
    this.lastYOffset.set(gearId, yOffset);

    const startX = gear.x;
    const startY = gear.y - 14 + yOffset; // just above the gear center

    this.spawnAt(startX, startY, text, color);
  }

  /** Spawn a floating text label at world coordinates (x, y). */
  private spawnAt(x: number, y: number, text: string, color: number): void {
    const hexStr = '#' + color.toString(16).padStart(6, '0');
    const label = this.scene.add.text(x, y, text, {
      fontSize: '11px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: hexStr,
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(200);

    this.scene.tweens.add({
      targets: label,
      y: y - FloatingTextManager.RISE_PX,
      alpha: 0,
      duration: FloatingTextManager.DURATION_MS,
      ease: 'Quad.Out',
      onComplete: () => label.destroy(),
    });
  }
}
