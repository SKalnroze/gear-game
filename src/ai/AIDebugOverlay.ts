import Phaser from 'phaser';
import type { AIDebugState } from '../types/ai.types';

// ─── Visual constants ─────────────────────────────────────────────────────────

const CHAIN_COLOR: Record<string, number> = {
  combat:  0xff5555,
  economy: 0x55ff99,
  defense: 0xff8800,
};

const PHASE_SHORT: Record<string, string> = {
  bootstrap: 'BOOT',
  spawn:     'SPWN',
  amplify:   'AMP',
  support:   'SUPP',
  expand:    'EXP',
  full:      'FULL',
};

const THREAT_COLOR: Record<string, string> = {
  critical: '#ff3333',
  danger:   '#ffaa22',
  normal:   '#88ff88',
  winning:  '#44ffff',
};

const ROLE_LABEL: Record<string, string> = {
  combat:  'COMBAT',
  economy: 'ECON',
  defense: 'DEF',
};

const PANEL_W   = 380;
const PANEL_PAD = 8;
const LINE_H    = 13;
// Two world labels per chain (header + stats), plus a small margin
const WORLD_LABEL_POOL = 48;

// ─── AIDebugOverlay ────────────────────────────────────────────────────────────

/**
 * Renders an AI debug overlay onto the game scene.
 *
 * World-space layer (follows camera):
 *   • Coloured ring at each chain's origin point
 *   • Two-line label: role/phase/focus on line 1, stats + cost on line 2
 *
 * Screen-space HUD (fixed, top-right corner):
 *   • Threat level, gold, personality, chain summary with costs + focus marker
 *   • Last decision + reasoning
 *   • Active abilities with cooldown timers
 *   • Works for one or two AIs (spectate mode shows both)
 *
 * Toggle via setEnabled(). Press 'D' in GameScene to toggle.
 * Practice mode enables the overlay automatically.
 */
export class AIDebugOverlay {
  private readonly scene: Phaser.Scene;

  // World-space graphics (scrolls with camera)
  private readonly worldGfx: Phaser.GameObjects.Graphics;

  // Pool of world-space text labels for chain origins
  private readonly worldLabels: Phaser.GameObjects.Text[] = [];

  // Screen-space elements (setScrollFactor(0) — fixed on screen)
  private readonly hudBg: Phaser.GameObjects.Graphics;
  private readonly hudText: Phaser.GameObjects.Text;

  private enabled = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.worldGfx = scene.add.graphics().setDepth(260);

    this.hudBg = scene.add.graphics()
      .setDepth(261)
      .setScrollFactor(0);

    this.hudText = scene.add.text(PANEL_PAD, PANEL_PAD, '', {
      fontSize: '11px',
      fontFamily: '"Courier New", Courier, monospace',
      color: '#ddffdd',
      lineSpacing: 1,
    }).setDepth(262).setScrollFactor(0);

    // Pre-allocate world-label pool
    for (let i = 0; i < WORLD_LABEL_POOL; i++) {
      const t = scene.add.text(0, 0, '', {
        fontSize: '10px',
        fontFamily: '"Courier New", Courier, monospace',
        color: '#ffffff',
        backgroundColor: '#000000cc',
        padding: { x: 3, y: 2 },
      }).setDepth(261).setVisible(false);
      this.worldLabels.push(t);
    }

    this.setAllVisible(false);
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  setEnabled(v: boolean): void {
    this.enabled = v;
    this.setAllVisible(v);
    if (!v) {
      this.worldGfx.clear();
      this.hudBg.clear();
      this.hudText.setText('');
    }
  }

  toggle(): void {
    this.setEnabled(!this.enabled);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Call once per frame from GameScene.update() when the overlay is enabled.
   * @param states One entry per active AIController (max 2 in spectate mode).
   */
  update(states: AIDebugState[]): void {
    if (!this.enabled || states.length === 0) return;

    this.drawWorldLayer(states);
    this.drawHud(states);
  }

  destroy(): void {
    this.worldGfx.destroy();
    this.hudBg.destroy();
    this.hudText.destroy();
    for (const t of this.worldLabels) t.destroy();
  }

  // ─── World-space drawing ─────────────────────────────────────────────────────

  private drawWorldLayer(states: AIDebugState[]): void {
    this.worldGfx.clear();
    for (const t of this.worldLabels) t.setVisible(false);

    let labelIdx = 0;
    for (const state of states) {
      const isAI = state.owner === 'ai';

      for (const chain of state.chainSummaries) {
        const baseColor = CHAIN_COLOR[chain.role] ?? 0xffffff;
        const color = isAI ? baseColor : this.blendBlue(baseColor);
        const { x, y } = chain.origin;

        // Focus chain: thicker ring + larger radius
        const ringRadius = chain.isFocus ? 26 : 20;
        const ringWidth  = chain.isFocus ? 3 : 1.5;

        // Outer ring — role colour
        this.worldGfx.lineStyle(ringWidth, color, 0.9);
        this.worldGfx.strokeCircle(x, y, ringRadius);

        // Fill — semi-transparent (brighter for focus)
        this.worldGfx.fillStyle(color, chain.isFocus ? 0.18 : 0.1);
        this.worldGfx.fillCircle(x, y, ringRadius);

        // Small dot at exact origin
        this.worldGfx.fillStyle(color, 0.9);
        this.worldGfx.fillCircle(x, y, 3);

        // Focus chain: extra inner ring highlight
        if (chain.isFocus) {
          this.worldGfx.lineStyle(1, 0xffffff, 0.5);
          this.worldGfx.strokeCircle(x, y, ringRadius - 5);
        }

        // Two-line world label
        const label = this.worldLabel(labelIdx++);
        const phaseStr  = PHASE_SHORT[chain.phase] ?? chain.phase.toUpperCase();
        const roleStr   = ROLE_LABEL[chain.role] ?? chain.role.toUpperCase();
        const prefix    = isAI ? '▶' : '◀';
        const focusMark = chain.isFocus ? ' ★' : '';
        const line1 = `${prefix} ${roleStr}:${phaseStr}${focusMark}`;
        const line2 = `${this.statsAbbrev(chain.stats)}  ${chain.totalCost}g  ${chain.gearCount}⚙`;
        label.setText(`${line1}\n${line2}`);
        label.setColor(isAI ? '#ffbbbb' : '#bbbbff');
        label.setPosition(x - label.width / 2, y - ringRadius - 28);
        label.setVisible(true);
      }
    }
  }

  // ─── HUD panel drawing ───────────────────────────────────────────────────────

  private drawHud(states: AIDebugState[]): void {
    const sw = this.scene.scale.width;
    const sh = this.scene.scale.height;
    // Phaser zooms setScrollFactor(0) objects around the camera's center (midX, midY).
    // To place an object at desired screen position sx:
    //   worldX = (sx - midX) * invZ + midX
    // and setScale(invZ) so the rendered size stays constant.
    const zoom = this.scene.cameras.main.zoom;
    const invZ = 1 / zoom;
    const midX = sw / 2;
    const midY = sh / 2;

    const lines: string[] = [];

    lines.push('╔═ AI DEBUG (D to toggle) ══════════════════');
    lines.push('║');

    for (const s of states) {
      const ownerTag = s.owner === 'ai' ? '▶ AI' : '◀ Player';
      lines.push(`║ ${ownerTag} [${s.profile.toUpperCase()}]  personality: ${s.personality}`);
      lines.push(`║ threat=${s.threat}  gold=${s.gold.toFixed(0)}g  chains=${s.chainCount}`);

      // Chain breakdown
      for (const c of s.chainSummaries) {
        const phStr    = (PHASE_SHORT[c.phase] ?? c.phase).padEnd(4);
        const roleStr  = (ROLE_LABEL[c.role] ?? c.role.toUpperCase()).padEnd(6);
        const abbrev   = this.statsAbbrev(c.stats);
        const costStr  = `${c.totalCost}g`.padStart(5);
        const gearStr  = `${c.gearCount}⚙`.padStart(3);
        const marker   = c.isFocus ? '★' : '·';
        lines.push(`║  ${marker} ${roleStr} ${phStr} ${abbrev}  ${costStr}  ${gearStr}`);
      }

      if (s.researchGoal) {
        lines.push(`║ research: ${s.researchGoal}`);
      }

      // Last decision + reason
      if (s.lastDecisionType !== 'idle' || s.lastDecisionReason) {
        lines.push(`║ action: ${s.lastDecisionType}`);
        if (s.lastDecisionReason) {
          const chunks = this.wrap(s.lastDecisionReason, 40);
          lines.push(`║   why: ${chunks[0]}`);
          for (let i = 1; i < chunks.length; i++) lines.push(`║        ${chunks[i]}`);
        }
      }

      // Abilities
      if (s.abilities.length > 0) {
        const abStr = s.abilities.map(a => {
          const cd = a.cooldownRemaining > 0
            ? `${(a.cooldownRemaining / 1000).toFixed(0)}s`
            : 'ready';
          return `${a.id}(${cd})`;
        }).join('  ');
        lines.push(`║ abilities: ${abStr}`);
      }

      lines.push('║');
    }

    lines.push('╚══════════════════════════════════════════');

    const panelH = lines.length * LINE_H + PANEL_PAD * 2;
    const totalW = PANEL_W + PANEL_PAD * 2;

    // Desired screen-space top-left of the panel box
    const screenX = sw - totalW - PANEL_PAD;
    const screenY = PANEL_PAD;

    // Phaser zooms around the camera center (midX, midY).
    // World position for a desired screen position sx:  (sx - midX) * invZ + midX
    const toWorld = (sx: number, sy: number): [number, number] => [
      (sx - midX) * invZ + midX,
      (sy - midY) * invZ + midY,
    ];

    this.hudBg.setScale(invZ);
    this.hudBg.setPosition(...toWorld(screenX, screenY));
    this.hudBg.clear();
    this.hudBg.fillStyle(0x000814, 0.85);
    this.hudBg.fillRoundedRect(0, 0, totalW, panelH, 5);
    this.hudBg.lineStyle(1, 0x44ff88, 0.4);
    this.hudBg.strokeRoundedRect(0, 0, totalW, panelH, 5);

    this.hudText.setScale(invZ);
    this.hudText.setPosition(...toWorld(screenX + PANEL_PAD, screenY + PANEL_PAD));
    this.hudText.setText(lines.join('\n'));
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private worldLabel(idx: number): Phaser.GameObjects.Text {
    if (idx < this.worldLabels.length) return this.worldLabels[idx];
    // Grow pool if needed (shouldn't happen normally)
    const t = this.scene.add.text(0, 0, '', {
      fontSize: '10px', fontFamily: 'monospace',
      color: '#ffffff', backgroundColor: '#000000cc',
      padding: { x: 3, y: 2 },
    }).setDepth(261);
    this.worldLabels.push(t);
    return t;
  }

  private setAllVisible(v: boolean): void {
    this.worldGfx.setVisible(v);
    this.hudBg.setVisible(v);
    this.hudText.setVisible(v);
    if (!v) for (const t of this.worldLabels) t.setVisible(false);
  }

  /** Tint a color towards blue for player-side AI labelling */
  private blendBlue(color: number): number {
    const r = ((color >> 16) & 0xff) >> 1;
    const g = ((color >> 8)  & 0xff) >> 1;
    const b = Math.min(0xff, ((color) & 0xff) + 0x88);
    return (r << 16) | (g << 8) | b;
  }

  /** One-line stats abbreviation: "2M 1A 1Sp" */
  private statsAbbrev(s: AIDebugState['chainSummaries'][0]['stats']): string {
    const parts: string[] = [];
    if (s.motorCount)          parts.push(`${s.motorCount}M`);
    if (s.amplifierCount)      parts.push(`${s.amplifierCount}A`);
    if (s.capacitorCount)      parts.push(`${s.capacitorCount}C`);
    if (s.spawnerTypes.length) parts.push(`${s.spawnerTypes.length}Sp`);
    if (s.researcherCount)     parts.push(`${s.researcherCount}R`);
    if (s.minerCount)          parts.push(`${s.minerCount}Mi`);
    if (s.healerCount)         parts.push(`${s.healerCount}H`);
    if (s.armoredCount)        parts.push(`${s.armoredCount}Ar`);
    if (s.spikedCount)         parts.push(`${s.spikedCount}Sp!`);
    if (s.overclockCount)      parts.push(`${s.overclockCount}OC`);
    if (s.turretCount)         parts.push(`${s.turretCount}T`);
    return parts.length ? `[${parts.join(' ')}]` : '[]';
  }

  /** Split string into chunks of at most maxLen characters */
  private wrap(s: string, maxLen: number): string[] {
    const chunks: string[] = [];
    let i = 0;
    while (i < s.length) {
      chunks.push(s.slice(i, i + maxLen));
      i += maxLen;
    }
    return chunks.length ? chunks : [''];
  }
}
