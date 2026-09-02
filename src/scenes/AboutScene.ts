import Phaser from 'phaser';
import { NeonUI } from '../ui/NeonUI';
import { neonBtn } from '../ui/NeonRex';
import { neonCard } from '../ui/NeonLayout';
import { NEON, NEON_STR, BG } from '../constants/ui.constants';

/**
 * AboutScene: credits and game info.
 */
export class AboutScene extends Phaser.Scene {
  constructor() {
    super({ key: 'AboutScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    // Background
    const bg = this.add.graphics();
    bg.fillGradientStyle(BG.deep, BG.deep, BG.mid, BG.mid, 1);
    bg.fillRect(0, 0, width, height);

    // Title
    this.add.text(cx, cy - 100, 'ABOUT', NeonUI.neonTextStyle(NEON_STR.cyan, 28, true))
      .setOrigin(0.5);

    // Info card
    const cardW = Math.min(460, width - 60);
    neonCard(this, cx - cardW / 2, cy - 50,
      cardW,
      'GEAR GAME  v0.1.0',
      'A deep browser strategy game with interconnected gears.\n\nBuilt with Phaser 3 + TypeScript.',
      NEON.green,
    );

    // Back button
    this.createBackButton();
  }

  private createBackButton(): void {
    neonBtn(this, 16, 16, 100, 36, NEON.cyan, NEON_STR.cyan, '< BACK', 12, () => {
      this.scene.start('MenuScene');
    });
  }
}
