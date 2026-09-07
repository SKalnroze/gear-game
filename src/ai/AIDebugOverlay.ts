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

const PANEL_W   = 460;
const PANEL_PAD = 8;
const LINE_H    = 13;
// Two world labels per chain (header + stats), plus a small margin
const WORLD_LABEL_POOL = 48;

/** How often (ms) the full debug state is dumped to the console as formatted JSON. */
const JSON_LOG_INTERVAL_MS = 1000;

// ─── AIDebugOverlay ────────────────────────────────────────────────────────────

/**
 * Renders an AI debug overlay onto the game scene.
 *
 * World-space layer (follows camera):
 *   • Coloured ring at each chain's origin point
 *   • Two-line label: role/phase/focus on line 1, stats + next-gear want on line 2
 *
 * Screen-space HUD (fixed, top-right corner):
 *   • Threat, gold + income, posture (economy/defense/offense weights + capacity)
 *   • Action budget (APM pool) and match clock
 *   • Chain summary with costs, focus marker, and what each chain wants to build next
 *   • What role the AI would give its NEXT chain, and why
 *   • Research: current goal, in-progress flag, and the next few queued nodes
 *   • What it has read about the opponent's unit composition
 *   • Last decision + reasoning, active abilities with cooldowns
 *   • Works for one or two AIs (spectate mode shows both)
 *
 * Toggle via setEnabled(). Press 'D' in GameScene to toggle.
 * Practice mode enables the overlay automatically.
 *
 * While enabled, the full state passed to update() is also dumped to the browser
 * console as formatted JSON once a second -- a machine-readable feed of "what is
 * the AI thinking" alongside the human-readable HUD, for anyone digging deeper
 * than the panel shows.
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
  private lastJsonLogAt = 0;

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
    } else {
      this.lastJsonLogAt = 0; // log immediately on the next update() after enabling
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
    this.maybeLogJson(states);
  }

  destroy(): void {
    this.worldGfx.destroy();
    this.hudBg.destroy();
    this.hudText.destroy();
    for (const t of this.worldLabels) t.destroy();
  }

  // ─── Console JSON feed ────────────────────────────────────────────────────────

  /** Dumps the full debug state to the console as formatted JSON, throttled to once a second. */
  private maybeLogJson(states: AIDebugState[]): void {
    const now = Date.now();
    if (now - this.lastJsonLogAt < JSON_LOG_INTERVAL_MS) return;
    this.lastJsonLogAt = now;
    console.log(
      '%c[AI DEBUG STATE]',
      'color:#44ff88;font-weight:bold',
      JSON.stringify(states, null, 2),
    );
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
        const wantStr = chain.nextGear ? `  →${chain.nextGear}` : '';
        const line2 = `${this.statsAbbrev(chain.stats)}  ${chain.totalCost}g  ${chain.gearCount}⚙${wantStr}`;
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

    lines.push('╔═ AI DEBUG (D to toggle) ══════════════════════════════════');
    lines.push('║');

    for (const s of states) {
      const ownerTag = s.owner === 'ai' ? '▶ AI' : '◀ Player';
      const elapsedS = (s.matchElapsedMs / 1000).toFixed(0);
      lines.push(`║ ${ownerTag} [${s.profile.toUpperCase()}]  personality: ${s.personality}  t=${elapsedS}s`);
      lines.push(`║ threat=${s.threat}${s.recentlyThreatened ? '(recent)' : ''}  gold=${s.gold.toFixed(0)}g (+${s.goldPerSec.toFixed(1)}/s)  chains=${s.chainCount}`);

      // Posture: economy/defense/offense weights + chain capacity
      const p = s.posture;
      lines.push(`║ posture: eco=${(p.economy * 100).toFixed(0)}% def=${(p.defense * 100).toFixed(0)}% off=${(p.offense * 100).toFixed(0)}%  capacity=${p.capacity}`);

      // Action budget — the real difficulty axis
      const ab = s.actionBudget;
      lines.push(`║ budget: ${ab.points.toFixed(1)}/${ab.capacity} pts  (${ab.apm} apm)`);

      // Opponent read
      lines.push(`║ opponent: dominant=${s.opponent.dominantUnit}  (${s.opponent.sampleCount} seen, 45s window)`);

      // Chain breakdown, including what each chain wants to build next
      for (const c of s.chainSummaries) {
        const phStr    = (PHASE_SHORT[c.phase] ?? c.phase).padEnd(4);
        const roleStr  = (ROLE_LABEL[c.role] ?? c.role.toUpperCase()).padEnd(6);
        const abbrev   = this.statsAbbrev(c.stats);
        const costStr  = `${c.totalCost}g`.padStart(5);
        const gearStr  = `${c.gearCount}⚙`.padStart(3);
        const marker   = c.isFocus ? '★' : '·';
        const wantStr  = c.nextGear ? `  wants: ${c.nextGear}` : '  (full)';
        lines.push(`║  ${marker} ${roleStr} ${phStr} ${abbrev}  ${costStr}  ${gearStr}${wantStr}`);
      }

      // What role the AI would give its next chain, and why
      lines.push(`║ next chain: ${ROLE_LABEL[s.nextChainRole] ?? s.nextChainRole}`);
      this.pushWrapped(lines, 'why', s.nextChainRoleReason);

      // Research: current goal + upcoming queue (compact, one line)
      const progressTag = s.researchInProgress ? ' (researching...)' : '';
      lines.push(`║ research goal: ${s.researchGoal}${progressTag}`);
      if (s.researchQueue.length > 0) {
        const queueStr = s.researchQueue.slice(0, 4).map(q => `${q.name}(${q.goldCost}g)`).join(', ');
        this.pushWrapped(lines, 'next up', queueStr);
      }

      // Last decision + reason
      if (s.lastDecisionType !== 'idle' || s.lastDecisionReason) {
        lines.push(`║ action: ${s.lastDecisionType}`);
        if (s.lastDecisionReason) this.pushWrapped(lines, 'why', s.lastDecisionReason);
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

    lines.push('╚══════════════════════════════════════════════════════════');

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
    if (s.converterCount)      parts.push(`${s.converterCount}Cv`);
    if (s.healerCount)         parts.push(`${s.healerCount}H`);
    if (s.armoredCount)        parts.push(`${s.armoredCount}Ar`);
    if (s.spikedCount)         parts.push(`${s.spikedCount}Sp!`);
    if (s.overclockCount)      parts.push(`${s.overclockCount}OC`);
    if (s.turretCount)         parts.push(`${s.turretCount}T`);
    if (s.minelayerCount)      parts.push(`${s.minelayerCount}Mn`);
    if (s.sentryGearCount)     parts.push(`${s.sentryGearCount}Sn`);
    if (s.reliefValveCount)    parts.push(`${s.reliefValveCount}RV`);
    return parts.length ? `[${parts.join(' ')}]` : '[]';
  }

  /**
   * Push a labelled, word-wrapped line (e.g. "why: ...") onto `lines`, indenting
   * continuation lines to align under the label instead of re-prefixing it.
   */
  private pushWrapped(lines: string[], label: string, text: string, maxLen = 56): void {
    const chunks = this.wrap(text, maxLen);
    const indent = ' '.repeat(label.length + 2);
    lines.push(`║   ${label}: ${chunks[0]}`);
    for (let i = 1; i < chunks.length; i++) lines.push(`║   ${indent}${chunks[i]}`);
  }

  /** Split string into chunks of at most maxLen characters, breaking on spaces where possible */
  private wrap(s: string, maxLen: number): string[] {
    const words = s.split(' ');
    const chunks: string[] = [];
    let cur = '';
    for (const w of words) {
      if (cur.length > 0 && cur.length + 1 + w.length > maxLen) {
        chunks.push(cur);
        cur = w;
      } else {
        cur = cur.length === 0 ? w : `${cur} ${w}`;
      }
    }
    if (cur.length > 0) chunks.push(cur);
    return chunks.length ? chunks : [''];
  }

}
