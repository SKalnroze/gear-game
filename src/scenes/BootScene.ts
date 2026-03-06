import Phaser from 'phaser';
import { NeonUI } from '../ui/NeonUI';
import { NEON_STR } from '../constants/ui.constants';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    this.load.on('progress', (_value: number) => {});
  }

  create(): void {
    const { width, height } = this.scale;
    this.add.text(width / 2, height / 2 - 20, 'GEAR GAME',
      NeonUI.neonTextStyle(NEON_STR.green, 48, true),
    ).setOrigin(0.5);

    this.add.text(width / 2, height / 2 + 40, 'Loading...', {
      fontSize: '16px', color: '#448899', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.time.delayedCall(600, () => {
      this.scene.start('MenuScene');
    });
  }
}
