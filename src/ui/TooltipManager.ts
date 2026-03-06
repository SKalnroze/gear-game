import Phaser from 'phaser';
import { EventBus } from '../systems/EventBus';

/**
 * Shows floating tooltips on hover with fade animation.
 */
export class TooltipManager {
  private scene: Phaser.Scene;
  private eventBus: EventBus;
  private bg: Phaser.GameObjects.Graphics;
  private text: Phaser.GameObjects.Text;
  private container: Phaser.GameObjects.Container;

  private readonly onTooltipShow = ({ text, x, y }: { text: string; x: number; y: number }) => {
    this.show(text, x, y);
  };

  private readonly onTooltipHide = () => {
    this.hide();
  };

  constructor(scene: Phaser.Scene, eventBus: EventBus) {
    this.scene = scene;
    this.eventBus = eventBus;

    this.container = scene.add.container(0, 0);
    this.container.setDepth(200);
    this.container.setAlpha(0);
    this.container.setVisible(false);

    this.bg = scene.add.graphics();
    this.container.add(this.bg);

    this.text = scene.add.text(0, 0, '', {
      fontSize: '11px',
      color: '#eeeeff',
      fontFamily: 'monospace',
      backgroundColor: '#00000000',
      wordWrap: { width: 220 },
    });
    this.container.add(this.text);

    eventBus.on('ui:tooltip_show', this.onTooltipShow);
    eventBus.on('ui:tooltip_hide', this.onTooltipHide);
  }

  show(text: string, _x: number, _y: number): void {
    this.text.setText(text);

    // Compute bounds after setting text
    const bounds = this.text.getBounds();
    const camW = this.scene.scale.width;
    const camH = this.scene.scale.height;

    // Position tooltip near cursor (12px right, 8px down)
    const pointer = this.scene.input.activePointer;
    let tooltipX = pointer.x + 12;
    let tooltipY = pointer.y + 8;

    // Clamp so tooltip doesn't exceed canvas edges
    if (tooltipX + bounds.width > camW) {
      tooltipX = pointer.x - bounds.width - 8;
    }
    if (tooltipY + bounds.height > camH) {
      tooltipY = pointer.y - bounds.height - 4;
    }

    this.container.setPosition(tooltipX, tooltipY);
    this.text.setPosition(4, 0);

    this.bg.clear();
    this.bg.fillStyle(0x05050f, 0.95);
    this.bg.fillRect(0, -2, bounds.width + 8, bounds.height + 4);
    this.bg.lineStyle(1, 0x00ffcc, 0.6);
    this.bg.strokeRect(0, -2, bounds.width + 8, bounds.height + 4);

    // Stop any existing tween, then fade in with scale
    this.scene.tweens.killTweensOf(this.container);
    this.container.setVisible(true);
    this.container.setScale(0.95);
    this.scene.tweens.add({
      targets: this.container,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 100,
      ease: 'Quad.Out',
    });
  }

  hide(): void {
    this.scene.tweens.killTweensOf(this.container);
    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      duration: 80,
      ease: 'Quad.In',
      onComplete: () => {
        this.container.setVisible(false);
      },
    });
  }

  destroy(): void {
    this.eventBus.off('ui:tooltip_show', this.onTooltipShow);
    this.eventBus.off('ui:tooltip_hide', this.onTooltipHide);
  }
}
