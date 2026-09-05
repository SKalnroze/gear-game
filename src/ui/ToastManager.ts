import Phaser from 'phaser';
import { EventBus } from '../systems/EventBus';
import type { World } from '../world/World';
import { NeonUI } from './NeonUI';

interface ToastEntry {
  message: string;
  color: string;
  accentColor: number;
  icon?: string;
}

/**
 * ToastManager: queued slide-in notification banners rendered in UIScene.
 *
 * Each toast slides in from the top of the viewport, holds for ~2s, then slides out.
 * Multiple toasts queue up and display sequentially.
 * Includes a 4px left accent bar colored per-toast.
 */
export class ToastManager {
  private scene: Phaser.Scene;
  private eventBus: EventBus;
  private world: World | null;
  private queue: ToastEntry[] = [];
  private busy: boolean = false;

  private readonly TOAST_W = 320;
  private readonly TOAST_H = 36;
  private readonly TOAST_DURATION_MS = 2200;
  private readonly TWEEN_DURATION_MS = 220;

  /** Severity threshold above which a jam is disruptive enough to interrupt the player with a toast. */
  private static readonly SEVERE_JAM_THRESHOLD = 0.6;

  constructor(scene: Phaser.Scene, eventBus: EventBus, world: World | null = null) {
    this.scene = scene;
    this.eventBus = eventBus;
    this.world = world;
    this.wireEvents();
  }

  private wireEvents(): void {
    this.eventBus.on('gear:jammed', ({ gearId, severity }) => {
      if (severity < ToastManager.SEVERE_JAM_THRESHOLD) return;
      if (this.world?.getGear(gearId)?.owner !== 'player') return;
      this.push('⚠ Gear jammed!', '#ff4444', 0xff2244);
    });

    this.eventBus.on('tech:research_complete', ({ nodeId, owner }) => {
      if (owner !== 'player') return;
      this.push(`✓ ${nodeId} researched`, '#44ffaa', 0x44ffaa);
    });

    this.eventBus.on('ability:activated', ({ id, owner }) => {
      if (owner !== 'player') return;
      this.push(`⚡ ${id} activated`, '#ffdd44', 0xffdd44);
    });

    this.eventBus.on('gear:destroyed', ({ owner }) => {
      if (owner === 'player') {
        this.push('⚠ Gear destroyed!', '#ff4444', 0xff2244);
      }
    });
  }

  push(message: string, color: string = '#ffffff', accentColor: number = 0xffffff, icon?: string): void {
    this.queue.push({ message, color, accentColor, icon });
    if (!this.busy) this.showNext();
  }

  private showNext(): void {
    const entry = this.queue.shift();
    if (!entry) { this.busy = false; return; }
    this.busy = true;

    const { width } = this.scene.scale;
    const toastX = (width - this.TOAST_W) / 2;
    const toastY = -this.TOAST_H; // start above viewport

    const container = this.scene.add.container(toastX, toastY).setDepth(500);

    const bg = this.scene.add.graphics();
    NeonUI.drawPanel(bg, 0, 0, this.TOAST_W, this.TOAST_H, entry.accentColor, 0.92);

    // 4px left accent bar
    bg.fillStyle(entry.accentColor, 0.9);
    bg.fillRect(0, 0, 4, this.TOAST_H);

    let labelX = this.TOAST_W / 2;
    if (entry.icon) {
      const iconText = this.scene.add.text(12, this.TOAST_H / 2, entry.icon, {
        fontSize: '16px',
      }).setOrigin(0, 0.5);
      container.add(iconText);
      labelX += 8;
    }

    const label = this.scene.add.text(
      labelX, this.TOAST_H / 2,
      entry.message,
      NeonUI.neonTextStyle(entry.color, 13, false),
    ).setOrigin(0.5);

    container.add([bg, label]);

    const targetY = 8;

    // Slide in
    this.scene.tweens.add({
      targets: container,
      y: targetY,
      duration: this.TWEEN_DURATION_MS,
      ease: 'Back.easeOut',
      onComplete: () => {
        // Hold
        this.scene.time.delayedCall(this.TOAST_DURATION_MS, () => {
          // Slide out
          this.scene.tweens.add({
            targets: container,
            y: -this.TOAST_H,
            duration: this.TWEEN_DURATION_MS,
            ease: 'Cubic.easeIn',
            onComplete: () => {
              container.destroy();
              this.showNext();
            },
          });
        });
      },
    });
  }

  destroy(): void {
    this.queue = [];
  }
}
