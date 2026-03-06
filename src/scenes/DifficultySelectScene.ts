import Phaser from 'phaser';
import { AIStrategyProfile } from '../types/ai.types';
import { NeonUI } from '../ui/NeonUI';
import { NEON, NEON_STR, BG } from '../constants/ui.constants';

/**
 * DifficultySelectScene: lets the player pick a difficulty then start the game.
 */
export class DifficultySelectScene extends Phaser.Scene {
  private selectedDifficulty: AIStrategyProfile = 'medium';
  private diffButtons: Phaser.GameObjects.Container[] = [];

  constructor() {
    super({ key: 'DifficultySelectScene' });
  }

  init(data: { difficulty?: AIStrategyProfile }): void {
    if (data.difficulty) this.selectedDifficulty = data.difficulty;
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
    this.add.text(cx, cy - 120, 'SELECT DIFFICULTY', NeonUI.neonTextStyle(NEON_STR.cyan, 28, true))
      .setOrigin(0.5);

    // Difficulty buttons in horizontal row
    const difficulties: { label: string; profile: AIStrategyProfile; color: number; hint?: string }[] = [
      { label: 'PRACTICE', profile: 'practice', color: NEON.cyan, hint: 'AI disabled — freely experiment' },
      { label: 'EASY', profile: 'easy', color: NEON.green },
      { label: 'NORMAL', profile: 'medium', color: NEON.green },
      { label: 'HARD', profile: 'hard', color: NEON.orange },
    ];

    const btnW = 140;
    const btnH = 48;
    const gap = 16;
    const totalW = difficulties.length * btnW + (difficulties.length - 1) * gap;
    const startX = cx - totalW / 2;

    difficulties.forEach((d, i) => {
      const bx = startX + i * (btnW + gap);
      const by = cy - 40;
      const isSelected = d.profile === this.selectedDifficulty;

      const container = this.add.container(bx, by);
      const g = this.add.graphics();

      NeonUI.drawButton(g, 0, 0, btnW, btnH, d.color, isSelected);
      container.add(g);

      const label = this.add.text(btnW / 2, btnH / 2, d.label,
        NeonUI.neonTextStyle(isSelected ? '#ffffff' : '#889999', 13, true),
      ).setOrigin(0.5);
      container.add(label);

      container.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, btnW, btnH),
        Phaser.Geom.Rectangle.Contains,
      );

      container.on('pointerover', () => {
        g.clear();
        NeonUI.drawButton(g, 0, 0, btnW, btnH, d.color, true);
        label.setColor('#ffffff');
      });
      container.on('pointerout', () => {
        g.clear();
        NeonUI.drawButton(g, 0, 0, btnW, btnH, d.color, d.profile === this.selectedDifficulty);
        label.setColor(d.profile === this.selectedDifficulty ? '#ffffff' : '#889999');
      });
      container.on('pointerdown', () => {
        this.selectedDifficulty = d.profile;
        this.scene.restart({ difficulty: d.profile });
      });

      this.diffButtons.push(container);
    });

    // Practice hint
    if (this.selectedDifficulty === 'practice') {
      this.add.text(cx, cy + 24,
        'AI is disabled — freely experiment with gears and units',
        { fontSize: '12px', color: NEON_STR.cyan, fontFamily: 'monospace' },
      ).setOrigin(0.5);
    }

    // Start Game button
    const startY = cy + 70;
    const startW = 260;
    const startH = 52;
    const startContainer = this.add.container(cx - startW / 2, startY);
    const startG = this.add.graphics();
    NeonUI.drawButton(startG, 0, 0, startW, startH, NEON.green, false);
    startContainer.add(startG);

    const startLabel = this.add.text(startW / 2, startH / 2, 'START GAME',
      NeonUI.neonTextStyle(NEON_STR.green, 20, true),
    ).setOrigin(0.5);
    startContainer.add(startLabel);

    startContainer.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, startW, startH),
      Phaser.Geom.Rectangle.Contains,
    );
    startContainer.on('pointerover', () => {
      startG.clear();
      NeonUI.drawButton(startG, 0, 0, startW, startH, NEON.green, true);
    });
    startContainer.on('pointerout', () => {
      startG.clear();
      NeonUI.drawButton(startG, 0, 0, startW, startH, NEON.green, false);
    });
    startContainer.on('pointerdown', () => {
      this.scene.start('GameScene', { difficulty: this.selectedDifficulty });
      this.scene.launch('UIScene', { difficulty: this.selectedDifficulty });
    });

    // Spectate button (AI vs AI)
    const specY = cy + 136;
    const specW = 260;
    const specH = 44;
    const specContainer = this.add.container(cx - specW / 2, specY);
    const specG = this.add.graphics();
    NeonUI.drawButton(specG, 0, 0, specW, specH, 0x9933cc, false);
    specContainer.add(specG);

    const specLabel = this.add.text(specW / 2, specH / 2, 'SPECTATE  (AI vs AI)',
      NeonUI.neonTextStyle('#cc88ff', 14, true),
    ).setOrigin(0.5);
    specContainer.add(specLabel);

    specContainer.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, specW, specH),
      Phaser.Geom.Rectangle.Contains,
    );
    specContainer.on('pointerover', () => {
      specG.clear();
      NeonUI.drawButton(specG, 0, 0, specW, specH, 0x9933cc, true);
    });
    specContainer.on('pointerout', () => {
      specG.clear();
      NeonUI.drawButton(specG, 0, 0, specW, specH, 0x9933cc, false);
    });
    specContainer.on('pointerdown', () => {
      this.scene.start('GameScene', { difficulty: 'spectate' });
      this.scene.launch('UIScene', { difficulty: 'spectate', spectateOwner: 'player' });
    });

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
