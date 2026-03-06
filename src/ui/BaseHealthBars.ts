import Phaser from 'phaser';
import { eventBus } from '../systems/EventBus';
import type { WinConditionSystem } from '../systems/WinConditionSystem';
import { NEON, NEON_STR } from '../constants/ui.constants';

const BAR_W   = 440;
const BAR_H   = 38;
const PAD     = 10;
const LABEL_W = 92;
const NUM_W   = 68;
const GAP     = 6;
const FILL_W  = BAR_W - PAD * 2 - LABEL_W - NUM_W - GAP * 2;
const FILL_Y  = Math.round((BAR_H - 12) / 2);
const FILL_H  = 12;
const TEXT_Y  = BAR_H / 2;

/**
 * Renders two base health bars fixed in screen space (UIScene).
 * Player bar: top-left. AI bar: top-right.
 * Both update via eventBus 'combat:base_damaged' events.
 */
export class BaseHealthBars {
  private readonly scene: Phaser.Scene;
  private readonly winSystem: WinConditionSystem;

  private playerHp: number;
  private aiHp: number;

  // Fill graphics (redrawn on every HP change)
  private readonly playerFill: Phaser.GameObjects.Graphics;
  private readonly aiFill: Phaser.GameObjects.Graphics;

  // HP number texts
  private readonly playerNumText: Phaser.GameObjects.Text;
  private readonly aiNumText: Phaser.GameObjects.Text;

  private readonly onDamaged: (d: { owner: 'player' | 'ai'; remainingHp: number }) => void;
  private readonly onResearch: () => void;

  // All created objects (for destroy)
  private readonly objects: Phaser.GameObjects.GameObject[] = [];

  constructor(
    scene: Phaser.Scene,
    winSystem: WinConditionSystem,
    playerLabel: string = 'PLAYER BASE',
    aiLabel: string = 'AI BASE',
  ) {
    this.scene = scene;
    this.winSystem = winSystem;
    this.playerHp = winSystem.getHp('player');
    this.aiHp     = winSystem.getHp('ai');

    const cw = scene.scale.width;
    const playerX = 6;
    const aiX     = cw - 6 - BAR_W;
    const barY    = 4;

    // ── Background panels ──────────────────────────────────────────────────
    const playerBg = scene.add.graphics().setDepth(490);
    this.drawPanel(playerBg, playerX, barY, NEON.blue);

    const aiBg = scene.add.graphics().setDepth(490);
    this.drawPanel(aiBg, aiX, barY, NEON.red);

    // ── Player label (left edge of player bar) ─────────────────────────────
    const plLabel = scene.add.text(playerX + PAD, barY + TEXT_Y, playerLabel, {
      fontSize: '11px', color: NEON_STR.blue,
      fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(492);

    // ── AI label (right edge of AI bar) ───────────────────────────────────
    const aiLbl = scene.add.text(aiX + BAR_W - PAD, barY + TEXT_Y, aiLabel, {
      fontSize: '11px', color: NEON_STR.red,
      fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(1, 0.5).setDepth(492);

    // ── Fill graphics ──────────────────────────────────────────────────────
    this.playerFill = scene.add.graphics().setDepth(491);
    this.aiFill     = scene.add.graphics().setDepth(491);

    // ── HP number texts ────────────────────────────────────────────────────
    // Player numbers: right of fill bar
    const pNumX = playerX + PAD + LABEL_W + GAP + FILL_W + GAP + NUM_W;
    this.playerNumText = scene.add.text(pNumX, barY + TEXT_Y, '', {
      fontSize: '11px', color: NEON_STR.cyan,
      fontFamily: 'monospace',
    }).setOrigin(1, 0.5).setDepth(492);

    // AI numbers: left of fill bar (mirrored)
    const aNumX = aiX + PAD;
    this.aiNumText = scene.add.text(aNumX, barY + TEXT_Y, '', {
      fontSize: '11px', color: '#ff8888',
      fontFamily: 'monospace',
    }).setOrigin(0, 0.5).setDepth(492);

    this.objects.push(playerBg, aiBg, plLabel, aiLbl,
      this.playerFill, this.aiFill, this.playerNumText, this.aiNumText);

    this.redraw();

    // ── Event listeners ────────────────────────────────────────────────────
    this.onDamaged = ({ owner, remainingHp }) => {
      if (owner === 'player') this.playerHp = remainingHp;
      else                    this.aiHp     = remainingHp;
      this.redraw();
      this.flashBar(owner);
    };

    this.onResearch = () => {
      // Max HP can increase on tech research — refresh
      this.playerHp = winSystem.getHp('player');
      this.aiHp     = winSystem.getHp('ai');
      this.redraw();
    };

    eventBus.on('combat:base_damaged', this.onDamaged);
    eventBus.on('tech:research_complete', this.onResearch);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private drawPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, accent: number): void {
    g.fillStyle(0x060612, 0.88);
    g.fillRoundedRect(x, y, BAR_W, BAR_H, 7);
    g.lineStyle(1.5, accent, 0.5);
    g.strokeRoundedRect(x, y, BAR_W, BAR_H, 7);
    // Subtle inner glow line at top
    g.lineStyle(1, accent, 0.2);
    g.beginPath();
    g.moveTo(x + 8, y + 1);
    g.lineTo(x + BAR_W - 8, y + 1);
    g.strokePath();
  }

  private redraw(): void {
    const cw    = this.scene.scale.width;
    const barY  = 4;
    const maxP  = this.winSystem.getMaxHp('player');
    const maxA  = this.winSystem.getMaxHp('ai');

    // ── Player fill (left-to-right) ────────────────────────────────────────
    const pFillX = 6 + PAD + LABEL_W + GAP;
    const pPct   = maxP > 0 ? Math.max(0, Math.min(1, this.playerHp / maxP)) : 0;

    this.playerFill.clear();
    // Track bg
    this.playerFill.fillStyle(0x0a0a22, 1);
    this.playerFill.fillRoundedRect(pFillX, barY + FILL_Y, FILL_W, FILL_H, 4);
    // Filled section
    if (pPct > 0) {
      const fillCol = pPct > 0.5 ? NEON.cyan : pPct > 0.25 ? NEON.yellow : NEON.red;
      this.playerFill.fillStyle(fillCol, 1);
      this.playerFill.fillRoundedRect(pFillX, barY + FILL_Y, Math.ceil(FILL_W * pPct), FILL_H, 4);
      // Shine stripe
      this.playerFill.fillStyle(0xffffff, 0.12);
      this.playerFill.fillRect(pFillX, barY + FILL_Y + 1, Math.ceil(FILL_W * pPct), 3);
    }
    this.playerFill.lineStyle(1, 0x223355, 0.7);
    this.playerFill.strokeRoundedRect(pFillX, barY + FILL_Y, FILL_W, FILL_H, 4);

    this.playerNumText.setText(`${Math.ceil(this.playerHp)}/${maxP}`);

    // ── AI fill (right-to-left mirror) ─────────────────────────────────────
    const aFillX = cw - 6 - BAR_W + PAD + NUM_W + GAP;
    const aPct   = maxA > 0 ? Math.max(0, Math.min(1, this.aiHp / maxA)) : 0;
    const aFillW = Math.ceil(FILL_W * aPct);

    this.aiFill.clear();
    this.aiFill.fillStyle(0x220a0a, 1);
    this.aiFill.fillRoundedRect(aFillX, barY + FILL_Y, FILL_W, FILL_H, 4);
    if (aPct > 0) {
      const fillCol = aPct > 0.5 ? NEON.red : aPct > 0.25 ? NEON.orange : 0xff5555;
      // AI bar drains from right: fill starts at right edge
      this.aiFill.fillStyle(fillCol, 1);
      this.aiFill.fillRoundedRect(aFillX + FILL_W - aFillW, barY + FILL_Y, aFillW, FILL_H, 4);
      this.aiFill.fillStyle(0xffffff, 0.12);
      this.aiFill.fillRect(aFillX + FILL_W - aFillW, barY + FILL_Y + 1, aFillW, 3);
    }
    this.aiFill.lineStyle(1, 0x553322, 0.7);
    this.aiFill.strokeRoundedRect(aFillX, barY + FILL_Y, FILL_W, FILL_H, 4);

    this.aiNumText.setText(`${Math.ceil(this.aiHp)}/${maxA}`);
  }

  private flashBar(owner: 'player' | 'ai'): void {
    const cw   = this.scene.scale.width;
    const x    = owner === 'player' ? 6 : cw - 6 - BAR_W;
    const col  = owner === 'player' ? NEON.blue : NEON.red;
    const flash = this.scene.add.graphics().setDepth(493);
    flash.fillStyle(col, 0.35);
    flash.fillRoundedRect(x, 4, BAR_W, BAR_H, 7);
    this.scene.tweens.add({
      targets: flash, alpha: 0, duration: 350,
      onComplete: () => flash.destroy(),
    });
  }

  destroy(): void {
    eventBus.off('combat:base_damaged', this.onDamaged);
    eventBus.off('tech:research_complete', this.onResearch);
    for (const obj of this.objects) obj.destroy();
  }
}
