import Phaser from 'phaser';
import { eventBus } from '../systems/EventBus';
import { neonBadge } from './NeonFeedback';
import { NEON } from '../constants/ui.constants';
import type { World } from '../world/World';

/**
 * JamIndicator: small badge near the health bars showing how many of the
 * player's gears are currently jammed. Hidden when the count is zero —
 * gives the player a persistent signal even when the jam is off-screen.
 */
export class JamIndicator {
  private badge: ReturnType<typeof neonBadge> | null = null;
  private jammedIds: Set<string> = new Set();
  private readonly scene: Phaser.Scene;
  private readonly world: World;
  private readonly x: number;
  private readonly y: number;

  private readonly onJammed = ({ gearId }: { gearId: string }): void => {
    if (this.world.getGear(gearId)?.owner !== 'player') return;
    this.jammedIds.add(gearId);
    this.refresh();
  };

  private readonly onCleared = ({ gearId }: { gearId: string }): void => {
    this.jammedIds.delete(gearId);
    this.refresh();
  };

  constructor(scene: Phaser.Scene, world: World, x: number, y: number) {
    this.scene = scene;
    this.world = world;
    this.x = x;
    this.y = y;
    eventBus.on('gear:jammed', this.onJammed);
    eventBus.on('gear:jam_cleared', this.onCleared);
  }

  private refresh(): void {
    const count = this.jammedIds.size;
    if (count === 0) {
      this.badge?.destroy();
      this.badge = null;
      return;
    }
    const text = `⚠ ${count} JAMMED`;
    if (this.badge) {
      this.badge.setText(text);
    } else {
      this.badge = neonBadge(this.scene, this.x, this.y, text, NEON.orange);
    }
  }

  destroy(): void {
    eventBus.off('gear:jammed', this.onJammed);
    eventBus.off('gear:jam_cleared', this.onCleared);
    this.badge?.destroy();
    this.badge = null;
  }
}
