import Phaser from 'phaser';
import { BG } from '../constants/ui.constants';

/**
 * Static drawing helpers for the neon UI aesthetic.
 * Provides glow-bordered panels, buttons, dividers, and text styles.
 */
export class NeonUI {
  /** Draw a neon-bordered panel with glow effect */
  static drawPanel(
    g: Phaser.GameObjects.Graphics,
    x: number, y: number, w: number, h: number,
    color: number, alpha: number = 0.9,
  ): void {
    // Soft outer glow
    g.fillStyle(color, 0.06);
    g.fillRect(x - 4, y - 4, w + 8, h + 8);
    g.fillStyle(color, 0.03);
    g.fillRect(x - 8, y - 8, w + 16, h + 16);

    // Dark fill
    g.fillStyle(BG.panel, alpha);
    g.fillRect(x, y, w, h);

    // Crisp inner border
    g.lineStyle(1.5, color, 0.8);
    g.strokeRect(x, y, w, h);
  }

  /** Draw a neon button (panel with hover-aware styling) */
  static drawButton(
    g: Phaser.GameObjects.Graphics,
    x: number, y: number, w: number, h: number,
    color: number, hovered: boolean = false,
  ): void {
    if (hovered) {
      // Brighter glow on hover
      g.fillStyle(color, 0.1);
      g.fillRect(x - 4, y - 4, w + 8, h + 8);
      g.fillStyle(color, 0.06);
      g.fillRect(x - 6, y - 6, w + 12, h + 12);
    } else {
      g.fillStyle(color, 0.04);
      g.fillRect(x - 3, y - 3, w + 6, h + 6);
    }

    // Dark fill
    g.fillStyle(BG.panel, 0.92);
    g.fillRect(x, y, w, h);

    // Border
    g.lineStyle(hovered ? 2 : 1.5, color, hovered ? 1.0 : 0.7);
    g.strokeRect(x, y, w, h);
  }

  /** Draw a soft glow divider line */
  static drawDivider(
    g: Phaser.GameObjects.Graphics,
    x1: number, y1: number, x2: number, y2: number,
    color: number,
  ): void {
    // Soft glow (wider, dimmer)
    g.lineStyle(4, color, 0.08);
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.strokePath();

    // Crisp line
    g.lineStyle(1, color, 0.5);
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.strokePath();
  }

  /** Returns a Phaser text style config with neon glow shadow */
  static neonTextStyle(
    color: string,
    size: number,
    bold: boolean = false,
  ): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      fontSize: `${size}px`,
      color,
      fontFamily: 'monospace',
      fontStyle: bold ? 'bold' : '',
      shadow: {
        offsetX: 0,
        offsetY: 0,
        color,
        blur: 8,
        fill: true,
        stroke: true,
      },
    };
  }
}
