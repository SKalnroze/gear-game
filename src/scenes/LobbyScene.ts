import Phaser from 'phaser';
import { AIStrategyProfile, AIPersonality, SlotKind, AISlotConfig, LobbyConfig } from '../types/ai.types';
import { NeonUI } from '../ui/NeonUI';
import { neonBtn, neonDropdown } from '../ui/NeonRex';
import { NEON, NEON_STR, BG, GAME_SETTINGS } from '../constants/ui.constants';
import { musicEngine } from '../audio/MusicEngine';

export class LobbyScene extends Phaser.Scene {
  private leftSlot: AISlotConfig  = { kind: 'human' };
  private rightSlot: AISlotConfig = { kind: 'ai', difficulty: 'medium', personality: 'random' };

  // Destroyable items per slot (GameObjects + dropdown handles).
  private slotItems: { left: { destroy(): void }[]; right: { destroy(): void }[] } =
    { left: [], right: [] };

  private slotOrigin: { left: { x: number; y: number }; right: { x: number; y: number } } =
    { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };

  private readonly SLOT_W   = 300;
  private readonly SLOT_H   = 284;
  private readonly SLOT_GAP = 64;

  constructor() {
    super({ key: 'LobbyScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    const cx = width  / 2;
    const cy = height / 2;

    // ─── Music ────────────────────────────────────────────────────────
    if (GAME_SETTINGS.soundEnabled && (!musicEngine.playing || musicEngine.mood !== 'menu')) {
      musicEngine.play('menu');
    }

    const bg = this.add.graphics();
    bg.fillGradientStyle(BG.deep, BG.deep, BG.mid, BG.mid, 1);
    bg.fillRect(0, 0, width, height);

    this.add.text(cx, cy - 228, 'LOBBY', NeonUI.neonTextStyle(NEON_STR.cyan, 40, true))
      .setOrigin(0.5);
    this.add.text(cx, cy - 186, 'Configure your match', {
      fontSize: '14px', color: '#5588aa', fontFamily: 'monospace',
    }).setOrigin(0.5);

    const lineG = this.add.graphics();
    NeonUI.drawDivider(lineG, cx - 220, cy - 166, cx + 220, cy - 166, NEON.cyan);

    const slotY = cy - this.SLOT_H / 2 - 10;
    this.slotOrigin.left  = { x: cx - this.SLOT_W - this.SLOT_GAP / 2, y: slotY };
    this.slotOrigin.right = { x: cx + this.SLOT_GAP / 2,               y: slotY };

    this.buildSlot('left');
    this.buildSlot('right');

    this.add.text(cx, cy - 10, 'VS', NeonUI.neonTextStyle(NEON_STR.orange, 26, true))
      .setOrigin(0.5);

    const startW = 280;
    const startH = 52;
    neonBtn(this, cx - startW / 2, slotY + this.SLOT_H + 36, startW, startH,
      NEON.green, NEON_STR.green, 'START GAME', 20, () => this.startGame());

    neonBtn(this, 16, 16, 120, 38, NEON.cyan, NEON_STR.cyan, '< BACK', 13, () => {
      this.scene.start('MenuScene');
    });
  }

  private buildSlot(side: 'left' | 'right'): void {
    this.refreshSlot(side);
  }

  private refreshSlot(side: 'left' | 'right'): void {
    for (const item of this.slotItems[side]) item.destroy();
    this.slotItems[side] = [];

    const slot = side === 'left' ? this.leftSlot : this.rightSlot;
    const { x, y } = this.slotOrigin[side];
    const W           = this.SLOT_W;
    const H           = this.SLOT_H;
    const isAI        = slot.kind === 'ai';
    const borderColor = side === 'left' ? NEON.cyan    : NEON.orange;
    const titleStr    = side === 'left' ? 'PLAYER 1'   : 'PLAYER 2';
    const titleColor  = side === 'left' ? NEON_STR.cyan : NEON_STR.orange;

    const track = (obj: { destroy(): void }) => {
      this.slotItems[side].push(obj);
      return obj;
    };

    const box = this.add.graphics();
    NeonUI.drawPanel(box, x, y, W, H, borderColor, 0.96);
    track(box);

    track(this.add.text(x + W / 2, y + 20, titleStr, {
      fontSize: '15px', color: titleColor, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5));

    const divG = this.add.graphics();
    NeonUI.drawDivider(divG, x + 16, y + 36, x + W - 16, y + 36, borderColor);
    track(divG);

    track(this.addLabel(x + 14, y + 52, 'TYPE'));

    const kindOpts = [
      { key: 'human', label: 'Human' },
      { key: 'ai',    label: 'AI Opponent' },
    ];
    track(neonDropdown(this, x + 14, y + 66, W - 28, kindOpts, slot.kind, (k: string) => {
      slot.kind = k as SlotKind;
      if (slot.kind === 'ai') {
        slot.difficulty  = slot.difficulty  ?? 'medium';
        slot.personality = slot.personality ?? 'random';
      } else {
        delete slot.difficulty;
        delete slot.personality;
      }
      this.refreshSlot(side);
    }));

    if (isAI) {
      track(this.addLabel(x + 14, y + 118, 'DIFFICULTY'));

      const diffOpts = [
        { key: 'easy',   label: 'Easy'   },
        { key: 'medium', label: 'Medium' },
        { key: 'hard',   label: 'Hard'   },
      ];
      track(neonDropdown(this, x + 14, y + 132, W - 28, diffOpts, slot.difficulty ?? 'medium', (k: string) => {
        slot.difficulty = k as AIStrategyProfile;
      }));

      track(this.addLabel(x + 14, y + 184, 'PERSONALITY'));

      const persOpts = [
        { key: 'random',    label: 'Random'    },
        { key: 'rusher',    label: 'Rusher'    },
        { key: 'economist', label: 'Economist' },
        { key: 'turtle',    label: 'Turtle'    },
        { key: 'balanced',  label: 'Balanced'  },
      ];
      track(neonDropdown(this, x + 14, y + 198, W - 28, persOpts, slot.personality ?? 'random', (k: string) => {
        slot.personality = k as AIPersonality | 'random';
      }));
    } else {
      track(this.add.text(x + W / 2, y + 154, 'Human Player\nReady', {
        fontSize: '13px', color: '#447755', fontFamily: 'monospace',
        align: 'center', lineSpacing: 6,
      }).setOrigin(0.5, 0.5));
    }
  }

  private addLabel(x: number, y: number, text: string): Phaser.GameObjects.Text {
    return this.add.text(x, y, text, {
      fontSize: '10px', color: '#5588aa', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0, 0.5);
  }

  private startGame(): void {
    if (this.scene.isActive('UIScene') || this.scene.isPaused('UIScene')) {
      this.scene.stop('UIScene');
    }
    const config: LobbyConfig = { left: this.leftSlot, right: this.rightSlot };
    this.scene.start('GameScene', config);
    this.scene.launch('UIScene');
  }
}
