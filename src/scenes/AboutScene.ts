import Phaser from 'phaser';
import { NeonUI } from '../ui/NeonUI';
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

    // Game info
    this.add.text(cx, cy - 40, 'GEAR GAME', NeonUI.neonTextStyle(NEON_STR.green, 22, true))
      .setOrigin(0.5);

    this.add.text(cx, cy - 10, 'v0.1.0', {
      fontSize: '12px', color: '#667788', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(cx, cy + 20, 'A deep browser strategy game with interconnected gears', {
      fontSize: '13px', color: '#99aabb', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(cx, cy + 50, 'Built with Phaser 3 + TypeScript', {
      fontSize: '12px', color: '#667788', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Back button
    this.createBackButton();
  }

  private createBackButton(): void {
    const btnW = 100;
    const btnH = 36;
    const container = this.add.container(16, 16);
    const g = this.add.graphics();
    NeonUI.drawButton(g, 0, 0, btnW, btnH, NEON.cyan, false);
    container.add(g);

    const label = this.add.text(btnW / 2, btnH / 2, '< BACK', {
      fontSize: '12px', color: NEON_STR.cyan, fontFamily: 'monospace',
    }).setOrigin(0.5);
    container.add(label);

    container.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, btnW, btnH),
      Phaser.Geom.Rectangle.Contains,
    );
    container.on('pointerover', () => {
      g.clear();
      NeonUI.drawButton(g, 0, 0, btnW, btnH, NEON.cyan, true);
    });
    container.on('pointerout', () => {
      g.clear();
      NeonUI.drawButton(g, 0, 0, btnW, btnH, NEON.cyan, false);
    });
    container.on('pointerdown', () => {
      this.scene.start('MenuScene');
    });
  }
}
