import Phaser from 'phaser';
import { eventBus } from '../systems/EventBus';
import type { EconomySystem } from '../systems/EconomySystem';
import type { TechSystem } from '../systems/TechSystem';
import type { ResourceState } from '../types/economy.types';
import { BP_SMALL } from '../constants/ui.constants';
import { drawNeonBarFill } from './NeonGame';

type Side = 'player' | 'ai';

const RES_DEFS: { key: keyof ResourceState; icon: string; colorStr: string }[] = [
  { key: 'gold',    icon: '●', colorStr: '#ffcc00' },
  { key: 'iron',    icon: '■', colorStr: '#aabbcc' },
  { key: 'crystal', icon: '◆', colorStr: '#00ffcc' },
  { key: 'aether',  icon: '✦', colorStr: '#cc44ff' },
  { key: 'coal',    icon: '▲', colorStr: '#998877' },
];

// Layout, stacked directly under BaseHealthBars (which occupies y=4..42).
const PANEL_Y         = 44;
const RES_ROW_Y       = 46;
const RES_RATE_ROW_Y  = 59;
const RESEARCH_LBL_Y  = 79;
const RESEARCH_BAR_Y  = 96;
const RESEARCH_BAR_H  = 6;
const PANEL_BOTTOM_PAD = 6;

/** Bottom edge of the stack, in screen space — other HUD elements should sit below this. */
export const INFO_BARS_BOTTOM_Y = RESEARCH_BAR_Y + RESEARCH_BAR_H + PANEL_BOTTOM_PAD;

/**
 * Resource totals + research progress for both players, always visible under
 * each player's health bar (top-left / top-right). Economy and research are
 * open information for both sides -- there is no fog-of-war on this HUD.
 */
export class PlayerInfoBars {
  private readonly scene: Phaser.Scene;
  private readonly economySystem: EconomySystem;
  private readonly techSystem: TechSystem;

  private barW: number;

  private readonly panelBg: Record<Side, Phaser.GameObjects.Graphics> = {} as Record<Side, Phaser.GameObjects.Graphics>;
  private readonly resourceTexts: Record<Side, Phaser.GameObjects.Text[]> = { player: [], ai: [] };
  private readonly resourceRateTexts: Record<Side, Phaser.GameObjects.Text[]> = { player: [], ai: [] };
  private readonly researchLabels: Record<Side, Phaser.GameObjects.Text> = {} as Record<Side, Phaser.GameObjects.Text>;
  private readonly researchBarBg: Record<Side, Phaser.GameObjects.Graphics> = {} as Record<Side, Phaser.GameObjects.Graphics>;
  private readonly researchBarFill: Record<Side, Phaser.GameObjects.Graphics> = {} as Record<Side, Phaser.GameObjects.Graphics>;

  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly rateRefreshEvent: Phaser.Time.TimerEvent;

  private readonly onEconomyChanged = (): void => this.refreshResources();

  constructor(scene: Phaser.Scene, economySystem: EconomySystem, techSystem: TechSystem) {
    this.scene = scene;
    this.economySystem = economySystem;
    this.techSystem = techSystem;
    this.barW = this.computeBarW(scene.scale.width);

    for (const side of ['player', 'ai'] as const) {
      this.panelBg[side] = scene.add.graphics().setDepth(489);
      this.objects.push(this.panelBg[side]);

      for (const def of RES_DEFS) {
        const t = scene.add.text(0, RES_ROW_Y, `${def.icon} —`, {
          fontSize: '12px', color: def.colorStr, fontFamily: 'monospace',
        }).setOrigin(0, 0).setDepth(492);
        this.resourceTexts[side].push(t);
        this.objects.push(t);

        const rt = scene.add.text(0, RES_RATE_ROW_Y, '—', {
          fontSize: '9px', color: '#667788', fontFamily: 'monospace',
        }).setOrigin(0, 0).setDepth(492);
        this.resourceRateTexts[side].push(rt);
        this.objects.push(rt);
      }

      this.researchLabels[side] = scene.add.text(0, RESEARCH_LBL_Y, '', {
        fontSize: '11px', color: '#00ffcc', fontFamily: 'monospace',
      }).setOrigin(0, 0).setDepth(492);
      this.researchBarBg[side] = scene.add.graphics().setDepth(490);
      this.researchBarFill[side] = scene.add.graphics().setDepth(491);
      this.objects.push(this.researchLabels[side], this.researchBarBg[side], this.researchBarFill[side]);
    }

    this.layout();
    this.refreshResources();
    this.refreshResearch();

    eventBus.on('economy:gold_changed', this.onEconomyChanged);
    eventBus.on('economy:resources_changed', this.onEconomyChanged);

    // Rates drift continuously (samples age out of the trailing-average window
    // even with no new earn/spend), not just on economy:*_changed, so refresh on a timer.
    this.rateRefreshEvent = scene.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => this.refreshResources(),
    });
  }

  private computeBarW(canvasW: number): number {
    return canvasW < BP_SMALL ? 300 : 440;
  }

  private sideX(side: Side): number {
    const cw = this.scene.scale.width;
    return side === 'player' ? 6 : cw - 6 - this.barW;
  }

  private layout(): void {
    for (const side of ['player', 'ai'] as const) {
      const x = this.sideX(side);
      const slotW = this.barW / RES_DEFS.length;
      this.resourceTexts[side].forEach((t, i) => t.setPosition(x + i * slotW, RES_ROW_Y));
      this.resourceRateTexts[side].forEach((t, i) => t.setPosition(x + i * slotW, RES_RATE_ROW_Y));
      this.researchLabels[side].setPosition(x, RESEARCH_LBL_Y);

      const panelH = INFO_BARS_BOTTOM_Y - PANEL_Y;
      const bg = this.panelBg[side];
      bg.clear();
      bg.fillStyle(0x060612, 0.88);
      bg.fillRoundedRect(x, PANEL_Y, this.barW, panelH, 6);
    }
  }

  private refreshResources(): void {
    for (const side of ['player', 'ai'] as const) {
      const res = this.economySystem.getResources(side);
      this.resourceTexts[side].forEach((t, i) => {
        const def = RES_DEFS[i];
        t.setText(`${def.icon} ${Math.floor(res[def.key])}`);
      });
      this.resourceRateTexts[side].forEach((t, i) => {
        const rate = this.economySystem.getRate(side, RES_DEFS[i].key);
        if (Math.abs(rate) < 0.05) {
          t.setText('—').setColor('#667788');
        } else {
          const sign = rate > 0 ? '+' : '';
          t.setText(`${sign}${rate.toFixed(1)}/s`).setColor(rate > 0 ? '#66ff99' : '#ff6666');
        }
      });
    }
  }

  /** Called once per frame from UIScene -- research progress ticks continuously, not just on events. */
  refreshResearch(): void {
    for (const side of ['player', 'ai'] as const) {
      const x = this.sideX(side);
      const info = this.techSystem.getResearchProgress(side);
      const bg = this.researchBarBg[side];
      const fill = this.researchBarFill[side];
      bg.clear();
      fill.clear();

      if (!info) {
        this.researchLabels[side].setText('NO RESEARCH').setColor('#556677');
        bg.fillStyle(0x0a0f1a, 0.6);
        bg.fillRoundedRect(x, RESEARCH_BAR_Y, this.barW, RESEARCH_BAR_H, 3);
        continue;
      }

      const pct = Math.floor(info.progress * 100);
      this.researchLabels[side].setText(`◈ ${info.nodeId} ${pct}%`).setColor('#00ffcc');
      drawNeonBarFill(fill, x, RESEARCH_BAR_Y, this.barW, RESEARCH_BAR_H, info.progress, 0x00ffcc,
        { direction: 'ltr', trackColor: 0x0a0f1a, radius: 3 });
    }
  }

  /** Recomputes positions for the new canvas width. Call from UIScene's resize handler. */
  resize(_width: number): void {
    this.barW = this.computeBarW(this.scene.scale.width);
    this.layout();
    this.refreshResources();
    this.refreshResearch();
  }

  destroy(): void {
    eventBus.off('economy:gold_changed', this.onEconomyChanged);
    eventBus.off('economy:resources_changed', this.onEconomyChanged);
    this.rateRefreshEvent.remove();
    for (const obj of this.objects) obj.destroy();
  }
}
