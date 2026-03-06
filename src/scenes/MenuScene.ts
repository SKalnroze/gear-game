import Phaser from 'phaser';
import { NeonUI } from '../ui/NeonUI';
import { NEON, NEON_STR, BG } from '../constants/ui.constants';

/**
 * MenuScene: Modern, sophisticated main menu with structured layout.
 * Uses a three-column design: left gear (decorative), center (content), right gear (decorative).
 * No overlapping elements. Responsive spacing.
 */
export class MenuScene extends Phaser.Scene {
  private gearContainers: Phaser.GameObjects.Container[] = [];

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    // ─── Background ───────────────────────────────────────────────────
    const bg = this.add.graphics();
    bg.fillGradientStyle(BG.deep, BG.deep, BG.mid, BG.mid, 1);
    bg.fillRect(0, 0, width, height);

    // ─── Layout Zones ─────────────────────────────────────────────────
    // Responsive margins and spacing
    const margin = Math.max(40, width * 0.08);
    const contentWidth = Math.min(400, width - 2 * margin);
    const centerX = width / 2;
    const centerY = height / 2;

    // Left decorative zone
    const leftGearX = margin + 60;
    // Right decorative zone
    const rightGearX = width - margin - 60;
    // Content zone (center)
    const contentLeft = centerX - contentWidth / 2;
    const contentRight = centerX + contentWidth / 2;

    // ─── Decorative Gears (Non-Overlapping Zones) ─────────────────────
    // Top-left corner
    this.createDecorativeGear(leftGearX, centerY - 140, 50, NEON.green, 0.15, 0.3);
    // Bottom-left corner
    this.createDecorativeGear(leftGearX, centerY + 140, 45, NEON.orange, 0.12, -0.25);
    // Top-right corner
    this.createDecorativeGear(rightGearX, centerY - 140, 50, NEON.blue, 0.15, -0.35);
    // Bottom-right corner
    this.createDecorativeGear(rightGearX, centerY + 140, 45, NEON.cyan, 0.12, 0.2);

    // ─── Title Section ────────────────────────────────────────────────
    const titleY = centerY - 180;
    this.add.text(centerX, titleY, 'GEAR GAME', NeonUI.neonTextStyle(NEON_STR.green, 56, true))
      .setOrigin(0.5)
      .setDepth(10);

    // Subtitle with subtle underline
    const subtitleY = titleY + 50;
    this.add.text(centerX, subtitleY, 'A Strategy of Gears and Battles', {
      fontSize: '14px', color: '#5588aa', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(10);

    // Decorative line under title
    const lineGraphics = this.add.graphics();
    lineGraphics.lineStyle(1, NEON.cyan, 0.3);
    lineGraphics.lineBetween(contentLeft, subtitleY + 18, contentRight, subtitleY + 18);
    lineGraphics.setDepth(10);

    // ─── Buttons Section ──────────────────────────────────────────────
    const btnW = Math.min(320, contentWidth);
    const btnH = 52;
    const gap = 18;
    const buttons: {
      label: string;
      color: number;
      action: () => void;
      dimmed?: boolean;
      hoverText?: string;
    }[] = [
      {
        label: 'SINGLEPLAYER',
        color: NEON.green,
        action: () => this.scene.start('DifficultySelectScene'),
      },
      {
        label: 'MULTIPLAYER',
        color: 0x556666,
        action: () => {},
        dimmed: true,
        hoverText: 'Coming Soon',
      },
      {
        label: 'SETTINGS',
        color: NEON.cyan,
        action: () => this.scene.start('SettingsScene'),
      },
      {
        label: 'ABOUT',
        color: NEON.cyan,
        action: () => this.scene.start('AboutScene'),
      },
    ];

    // Calculate button stack to be centered vertically
    const totalBtnH = buttons.length * btnH + (buttons.length - 1) * gap;
    const buttonsStartY = centerY - totalBtnH / 2 + 40;

    buttons.forEach((btn, i) => {
      const bx = centerX - btnW / 2;
      const by = buttonsStartY + i * (btnH + gap);

      // Button container
      const container = this.add.container(bx, by);
      container.setDepth(10);

      // Button background
      const g = this.add.graphics();
      NeonUI.drawButton(g, 0, 0, btnW, btnH, btn.color, false);
      container.add(g);

      // Button label
      const label = this.add.text(btnW / 2, btnH / 2, btn.label, {
        fontSize: '16px',
        color: btn.dimmed ? '#556666' : '#ffffff',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      container.add(label);

      // Dimmed state for unavailable buttons
      if (btn.dimmed) {
        container.setAlpha(0.4);
      }

      // Hover text for dimmed buttons - positioned BELOW the button stack, not overlapping
      let hoverLabel: Phaser.GameObjects.Text | null = null;
      if (btn.hoverText) {
        // Position below all buttons, not overlapping button area
        const hoverY = buttonsStartY + totalBtnH + 20;
        hoverLabel = this.add.text(centerX, hoverY, btn.hoverText, {
          fontSize: '11px', color: '#887766', fontFamily: 'monospace', fontStyle: 'italic',
        }).setOrigin(0.5).setAlpha(0).setDepth(10);
      }

      // Interactive zone for button
      container.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, btnW, btnH),
        Phaser.Geom.Rectangle.Contains,
      );

      container.on('pointerover', () => {
        if (!btn.dimmed) {
          g.clear();
          NeonUI.drawButton(g, 0, 0, btnW, btnH, btn.color, true);
          label.setColor('#ffffff');
        }
        if (hoverLabel) hoverLabel.setAlpha(1);
      });

      container.on('pointerout', () => {
        if (!btn.dimmed) {
          g.clear();
          NeonUI.drawButton(g, 0, 0, btnW, btnH, btn.color, false);
        }
        if (hoverLabel) hoverLabel.setAlpha(0);
      });

      container.on('pointerdown', () => {
        if (!btn.dimmed) btn.action();
      });
    });

    // ─── Footer Info ──────────────────────────────────────────────────
    const footerY = height - 40;
    this.add.text(centerX, footerY, 'v1.0.0 | Made with Phaser 3', {
      fontSize: '11px', color: '#445566', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(10);
  }

  /**
   * Create a decorative rotating gear in a specified zone.
   * Gears are positioned to frame the content, never overlapping buttons.
   */
  private createDecorativeGear(
    x: number, y: number, radius: number, color: number,
    alpha: number, rotSpeed: number,
  ): void {
    const container = this.add.container(x, y);
    container.setDepth(5); // Behind content but visible

    const g = this.add.graphics();
    const toothCount = 10;
    const toothDepth = radius * 0.2;

    // Gear shape
    g.fillStyle(color, alpha);
    g.lineStyle(1, color, alpha * 2);
    g.beginPath();

    const segments = toothCount * 2;
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const r = i % 2 === 0 ? radius : radius - toothDepth;
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.fillPath();
    g.strokePath();

    // Hub
    g.fillStyle(color, alpha * 0.5);
    g.fillCircle(0, 0, radius * 0.25);

    container.add(g);

    // Smooth rotation animation
    this.tweens.add({
      targets: container,
      angle: rotSpeed < 0 ? -360 : 360,
      duration: Math.abs(1 / rotSpeed) * 10000,
      repeat: -1,
      ease: 'Linear',
    });

    this.gearContainers.push(container);
  }
}
