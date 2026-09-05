import Phaser from 'phaser';
import { eventBus } from '../systems/EventBus';
import type { WinConditionSystem } from '../systems/WinConditionSystem';
import { NEON, NEON_STR, hostileColor, hostileColorStr, BP_SMALL } from '../constants/ui.constants';
import { drawNeonBarFill } from './NeonGame';

const BAR_H   = 38;
const PAD     = 10;
const LABEL_W = 92;
const NUM_W   = 68;
const GAP     = 6;
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

  /** Bar width — shrinks below the small breakpoint so two bars don't crowd a narrow viewport. */
  private barW: number;
  private fillW: number;
  private fillY: number;

  // Fill graphics (redrawn on every HP change)
  private readonly playerFill: Phaser.GameObjects.Graphics;
  private readonly aiFill: Phaser.GameObjects.Graphics;

  private readonly playerBg: Phaser.GameObjects.Graphics;
  private readonly aiBg: Phaser.GameObjects.Graphics;
  private readonly plLabel: Phaser.GameObjects.Text;
  private readonly aiLbl: Phaser.GameObjects.Text;

  // HP number texts
  private readonly playerNumText: Phaser.GameObjects.Text;
  private readonly aiNumText: Phaser.GameObjects.Text;

  private readonly onDamaged: (d: { owner: 'player' | 'ai'; remainingHp: number }) => void;
  private readonly onResearch: () => void;
  private readonly onSettingsChanged: () => void;

  // All created objects (for destroy)
  private readonly objects: Phaser.GameObjects.GameObject[] = [];

  /** Which slot draws in friendly colours; 'both' in a spectate match. */
  private readonly friendlySlot: 'player' | 'ai' | 'both';

  private isFriendly(slot: 'player' | 'ai'): boolean {
    return this.friendlySlot === 'both' || this.friendlySlot === slot;
  }

  constructor(
    scene: Phaser.Scene,
    winSystem: WinConditionSystem,
    playerLabel: string = 'PLAYER BASE',
    aiLabel: string = 'AI BASE',
    /**
     * Which owner the human is playing, or null when spectating. The lobby can
     * seat the human on either side, so friendly/hostile colouring has to
     * follow this rather than the fixed left/right slots -- otherwise a
     * flipped match paints the human's own base in enemy red.
     */
    humanOwner: 'player' | 'ai' | null = 'player',
  ) {
    this.friendlySlot = humanOwner === null ? 'both' : humanOwner;
    this.scene = scene;
    this.winSystem = winSystem;
    this.playerHp = winSystem.getHp('player');
    this.aiHp     = winSystem.getHp('ai');

    this.barW = this.computeBarW(scene.scale.width);
    this.fillW = this.computeFillW();
    this.fillY = Math.round((BAR_H - FILL_H) / 2);

    const barY = 4;

    // ── Background panels ──────────────────────────────────────────────────
    this.playerBg = scene.add.graphics().setDepth(490);
    this.aiBg = scene.add.graphics().setDepth(490);

    // ── Player label (left edge of player bar) ─────────────────────────────
    this.plLabel = scene.add.text(0, barY + TEXT_Y, playerLabel, {
      fontSize: '11px', color: this.isFriendly('player') ? NEON_STR.blue : hostileColorStr(),
      fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(492);

    // ── AI label (right edge of AI bar) ───────────────────────────────────
    this.aiLbl = scene.add.text(0, barY + TEXT_Y, aiLabel, {
      fontSize: '11px', color: this.isFriendly('ai') ? NEON_STR.blue : hostileColorStr(),
      fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(1, 0.5).setDepth(492);

    // ── Fill graphics ──────────────────────────────────────────────────────
    this.playerFill = scene.add.graphics().setDepth(491);
    this.aiFill     = scene.add.graphics().setDepth(491);

    // ── HP number texts ────────────────────────────────────────────────────
    this.playerNumText = scene.add.text(0, barY + TEXT_Y, '', {
      fontSize: '11px', color: NEON_STR.cyan,
      fontFamily: 'monospace',
    }).setOrigin(1, 0.5).setDepth(492);

    this.aiNumText = scene.add.text(0, barY + TEXT_Y, '', {
      fontSize: '11px', color: '#ff8888',
      fontFamily: 'monospace',
    }).setOrigin(0, 0.5).setDepth(492);

    this.objects.push(this.playerBg, this.aiBg, this.plLabel, this.aiLbl,
      this.playerFill, this.aiFill, this.playerNumText, this.aiNumText);

    this.layout();
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

    this.onSettingsChanged = () => {
      this.plLabel.setColor(this.isFriendly('player') ? NEON_STR.blue : hostileColorStr());
      this.aiLbl.setColor(this.isFriendly('ai') ? NEON_STR.blue : hostileColorStr());
      this.layout();
      this.redraw();
    };

    eventBus.on('combat:base_damaged', this.onDamaged);
    eventBus.on('tech:research_complete', this.onResearch);
    eventBus.on('settings:changed', this.onSettingsChanged);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private computeBarW(canvasW: number): number {
    return canvasW < BP_SMALL ? 300 : 440;
  }

  private computeFillW(): number {
    return this.barW - PAD * 2 - LABEL_W - NUM_W - GAP * 2;
  }

  /** Repositions everything for the current barW / canvas width. Call after a resize or barW change. */
  private layout(): void {
    const cw = this.scene.scale.width;
    const playerX = 6;
    const aiX     = cw - 6 - this.barW;
    const barY    = 4;

    this.plLabel.setPosition(playerX + PAD, barY + TEXT_Y);
    this.aiLbl.setPosition(aiX + this.barW - PAD, barY + TEXT_Y);

    const pNumX = playerX + PAD + LABEL_W + GAP + this.fillW + GAP + NUM_W;
    this.playerNumText.setPosition(pNumX, barY + TEXT_Y);

    const aNumX = aiX + PAD;
    this.aiNumText.setPosition(aNumX, barY + TEXT_Y);
  }

  private drawPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, accent: number): void {
    g.clear();
    g.fillStyle(0x060612, 0.88);
    g.fillRoundedRect(x, y, this.barW, BAR_H, 7);
    g.lineStyle(1.5, accent, 0.5);
    g.strokeRoundedRect(x, y, this.barW, BAR_H, 7);
    // Subtle inner glow line at top
    g.lineStyle(1, accent, 0.2);
    g.beginPath();
    g.moveTo(x + 8, y + 1);
    g.lineTo(x + this.barW - 8, y + 1);
    g.strokePath();
  }

  private redraw(): void {
    this.barW = this.computeBarW(this.scene.scale.width);
    this.fillW = this.computeFillW();

    const cw    = this.scene.scale.width;
    const barY  = 4;
    const maxP  = this.winSystem.getMaxHp('player');
    const maxA  = this.winSystem.getMaxHp('ai');

    this.drawPanel(this.playerBg, 6, barY, this.isFriendly('player') ? NEON.blue : hostileColor());
    this.drawPanel(this.aiBg, cw - 6 - this.barW, barY, this.isFriendly('ai') ? NEON.blue : hostileColor());

    // ── Player fill (left-to-right) ────────────────────────────────────────
    const pFillX = 6 + PAD + LABEL_W + GAP;
    const pPct   = maxP > 0 ? Math.max(0, Math.min(1, this.playerHp / maxP)) : 0;
    const pFillCol = this.isFriendly('player')
      ? (pPct > 0.5 ? NEON.cyan : pPct > 0.25 ? NEON.yellow : NEON.red)
      : (pPct > 0.5 ? hostileColor() : pPct > 0.25 ? NEON.orange : 0xff5555);

    this.playerFill.clear();
    drawNeonBarFill(this.playerFill, pFillX, barY + this.fillY, this.fillW, FILL_H, pPct, pFillCol,
      { direction: 'ltr', trackColor: 0x0a0a22, radius: 4 });
    this.playerFill.lineStyle(1, 0x223355, 0.7);
    this.playerFill.strokeRoundedRect(pFillX, barY + this.fillY, this.fillW, FILL_H, 4);

    this.playerNumText.setText(`${Math.ceil(this.playerHp)}/${maxP}`);

    // ── AI fill (right-to-left mirror) ─────────────────────────────────────
    const aFillX = cw - 6 - this.barW + PAD + NUM_W + GAP;
    const aPct   = maxA > 0 ? Math.max(0, Math.min(1, this.aiHp / maxA)) : 0;
    const aFillCol = this.isFriendly('ai')
      ? (aPct > 0.5 ? NEON.cyan : aPct > 0.25 ? NEON.yellow : NEON.red)
      : (aPct > 0.5 ? hostileColor() : aPct > 0.25 ? NEON.orange : 0xff5555);

    this.aiFill.clear();
    // AI bar drains from right: fill anchors to the right edge
    drawNeonBarFill(this.aiFill, aFillX, barY + this.fillY, this.fillW, FILL_H, aPct, aFillCol,
      { direction: 'rtl', trackColor: 0x220a0a, radius: 4 });
    this.aiFill.lineStyle(1, 0x553322, 0.7);
    this.aiFill.strokeRoundedRect(aFillX, barY + this.fillY, this.fillW, FILL_H, 4);

    this.aiNumText.setText(`${Math.ceil(this.aiHp)}/${maxA}`);
  }

  private flashBar(owner: 'player' | 'ai'): void {
    const cw   = this.scene.scale.width;
    const x    = owner === 'player' ? 6 : cw - 6 - this.barW;
    const col  = this.isFriendly(owner) ? NEON.blue : hostileColor();
    const flash = this.scene.add.graphics().setDepth(493);
    flash.fillStyle(col, 0.35);
    flash.fillRoundedRect(x, 4, this.barW, BAR_H, 7);
    this.scene.tweens.add({
      targets: flash, alpha: 0, duration: 350,
      onComplete: () => flash.destroy(),
    });
  }

  /** Recomputes bar width/positions for the new canvas width. Call from UIScene's resize handler. */
  resize(_width: number): void {
    this.layout();
    this.redraw();
  }

  destroy(): void {
    eventBus.off('combat:base_damaged', this.onDamaged);
    eventBus.off('tech:research_complete', this.onResearch);
    eventBus.off('settings:changed', this.onSettingsChanged);
    for (const obj of this.objects) obj.destroy();
  }
}
