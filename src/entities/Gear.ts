import Phaser from 'phaser';
import { GearState, GearType } from '../types/gear.types';
import { gearRadius } from '../constants/gear.constants';
import { REPOSITION_COOLDOWN_MS } from '../constants/balance.constants';
import { RESOURCE_COLORS } from '../types/resource.types';
import { GEAR_VISUALS } from '../constants/visuals.constants';
import { jamSeverity } from '../constants/balance.constants';

const GEAR_COLORS: Record<GearType, number> = {
  motor: 0x22cc55,
  amplifier: 0x2255ff,
  capacitor: 0xaa22cc,
  overclock: 0xff4400,
  spiked: 0xff2266,
  armored: 0x778899,
  iron_miner: RESOURCE_COLORS.iron,
  crystal_miner: RESOURCE_COLORS.crystal,
  aether_miner: RESOURCE_COLORS.aether,
  infantry_spawner: 0x44ff88,
  artillery_spawner: 0x4488ff,
  cavalry_spawner: 0xff8800,
  slime_spawner: 0x999999,
  iron_guard_spawner: RESOURCE_COLORS.iron,
  crystal_sentinel_spawner: RESOURCE_COLORS.crystal,
  aether_phantom_spawner: RESOURCE_COLORS.aether,
  researcher: 0x88ffee,
  iron_converter: 0xdd8844,
  crystal_converter: 0x44ddff,
  aether_converter: 0xdd44ff,
  crossbow_turret: 0xffdd00,
  artillery_turret: 0xff6600,
  minelayer: 0xaa3355,
  healer: 0x44ff88,
  crossbow_spawner: 0xffcc44,
  sentry_spawner: 0x66ffcc,
  sentry_gear: 0x66ffcc,
  relief_valve: 0xffaa22,
  sapper_spawner: 0xaa8866,
  skirmish_diver_spawner: 0xff5577,
  saboteur_spawner: 0x884499,
  raider_spawner: 0xffaa33,
  field_medic_spawner: 0x44ffaa,
  // Electrical -- a warm amber family, distinct from the cool economy gears.
  crank:       0xffaa44,
  solar_panel: 0xffdd66,
  burner:      0xff6622,
  battery:     0x44ddaa,
  power_pole:  0x998866,
  grid_tie:    0x66ffdd,
  coal_miner:  0x776655,
};

const GEAR_LABELS: Record<GearType, string> = {
  motor: 'M',
  amplifier: 'AMP',
  capacitor: 'CAP',
  overclock: 'OC',
  spiked: 'SPK',
  armored: 'ARM',
  iron_miner: 'Fe',
  crystal_miner: 'Cr',
  aether_miner: 'Ae',
  infantry_spawner: 'INF',
  artillery_spawner: 'ART',
  cavalry_spawner: 'CAV',
  slime_spawner: 'SLM',
  iron_guard_spawner: 'IG',
  crystal_sentinel_spawner: 'CS',
  aether_phantom_spawner: 'AP',
  researcher: 'RES',
  iron_converter: 'Fe\u2192G',
  crystal_converter: 'Cr\u2192G',
  aether_converter: 'Ae\u2192G',
  crossbow_turret: 'XBow',
  artillery_turret: 'ATur',
  minelayer: 'Mine',
  healer: 'HEAL',
  crossbow_spawner: 'XBW',
  sentry_spawner: 'SNTS',
  sentry_gear: 'SNT',
  relief_valve: 'RLF',
  sapper_spawner: 'SAP',
  skirmish_diver_spawner: 'DIV',
  saboteur_spawner: 'SAB',
  raider_spawner: 'RDR',
  field_medic_spawner: 'MED',
  crank:       'CRNK',
  solar_panel: 'SOL',
  burner:      'BURN',
  battery:     'BATT',
  power_pole:  'POLE',
  grid_tie:    'TIE',
  coal_miner:  'COAL',
};

/**
 * Phaser GameObject representing a gear on the world.
 * Position is read from gear.x / gear.y directly (no grid conversion).
 * Radius computed from gear.teeth via gearRadius().
 */
export class GearEntity extends Phaser.GameObjects.Container {
  private gearGraphics: Phaser.GameObjects.Graphics;
  private labelText: Phaser.GameObjects.Text;
  private frictionIndicator: Phaser.GameObjects.Graphics;
  private hpBar: Phaser.GameObjects.Graphics;
  private cooldownArc: Phaser.GameObjects.Graphics;
  public gearState: GearState;

  // Dirty-flag state for HP bar
  private lastDrawnHp: number = -1;
  private lastDrawnMaxHp: number = -1;
  // Throttle for cooldown arc
  private lastCooldownDrawTime: number = 0;
  // Jam ring tween alpha (driven by Phaser tween)
  private jamRingAlpha: number = 0.6;
  private jamTween: Phaser.Tweens.Tween | null = null;
  /** The same GameClock GearSystem stamps lastRepositionedAt from -- Date.now() would compare an epoch timestamp against a match-relative one. */
  private clock: { now: number };

  constructor(scene: Phaser.Scene, state: GearState, clock: { now: number }) {
    super(scene, state.x, state.y);

    this.gearState = state;
    this.clock = clock;

    this.gearGraphics = scene.add.graphics();
    this.add(this.gearGraphics);

    this.frictionIndicator = scene.add.graphics();
    this.add(this.frictionIndicator);

    // HP bar is NOT part of the container so it doesn't rotate
    this.hpBar = scene.add.graphics();

    this.cooldownArc = scene.add.graphics();
    this.add(this.cooldownArc);

    const radius = gearRadius(state.teeth);
    const fontSize = radius < 20 ? '9px' : radius < 35 ? '10px' : radius < 60 ? '11px' : '12px';
    // Use single-char labels on very small gears
    const fullLabel = GEAR_LABELS[state.type] ?? '?';
    const label = radius < 18 ? fullLabel.charAt(0) : fullLabel;
    this.labelText = scene.add.text(0, 0, label, {
      fontSize,
      color: '#ffffff',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 2,
    });
    this.labelText.setOrigin(0.5, 0.5);
    this.add(this.labelText);

    this.drawGear(state);
    scene.add.existing(this);
  }

  private drawGear(state: GearState): void {
    const g = this.gearGraphics;
    g.clear();

    const color = GEAR_COLORS[state.type] ?? 0x888888;
    const alpha = state.isBurntOut ? 0.3 : 1.0;
    const outerR = gearRadius(state.teeth);
    const innerR = outerR * 0.72;
    const toothCount = state.teeth;

    if (state.type === 'spiked') {
      this.drawSpikedGear(g, outerR, innerR, toothCount, alpha, state);
      return;
    }

    const toothDepth = Math.max(
      GEAR_VISUALS.TOOTH_DEPTH_MIN,
      Math.min(GEAR_VISUALS.TOOTH_DEPTH_MAX, outerR * GEAR_VISUALS.TOOTH_DEPTH_FACTOR),
    );

    // Mining gear: special fill color
    const isMiner = state.type === 'iron_miner' || state.type === 'crystal_miner' || state.type === 'aether_miner';

    // Draw tooth profile
    g.fillStyle(color, alpha * 0.85);
    g.lineStyle(1.5, 0xffffff, alpha * 0.4);
    g.beginPath();

    const totalSegments = toothCount * 2;
    for (let i = 0; i <= totalSegments; i++) {
      const angle = (i / totalSegments) * Math.PI * 2;
      const isOuter = i % 2 === 0;
      const r = isOuter ? outerR : outerR - toothDepth;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fillPath();
    g.strokePath();

    // Armored gear: metallic thick outline
    if (state.type === 'armored') {
      g.lineStyle(4, 0xaabbcc, alpha * 0.9);
      g.strokeCircle(0, 0, outerR);
    }

    // Mining gears: resource-colored inner fill with pick icon (cross lines)
    if (isMiner) {
      g.fillStyle(color, alpha * 0.7);
      g.fillCircle(0, 0, innerR);
      g.lineStyle(2, 0xffffff, alpha * 0.8);
      g.beginPath();
      g.moveTo(-innerR * 0.3, -innerR * 0.3);
      g.lineTo(innerR * 0.3, innerR * 0.3);
      g.moveTo(innerR * 0.3, -innerR * 0.3);
      g.lineTo(-innerR * 0.3, innerR * 0.3);
      g.strokePath();
    } else {
      // Inner circle
      g.fillStyle(color, alpha * 0.5);
      g.fillCircle(0, 0, innerR);
    }

    // Center hub
    g.fillStyle(0x111111, 0.9);
    g.fillCircle(0, 0, outerR * 0.15);

    // Hub cross
    g.lineStyle(2, 0x444444, 0.8);
    g.beginPath();
    g.moveTo(-innerR * 0.4, 0);
    g.lineTo(innerR * 0.4, 0);
    g.moveTo(0, -innerR * 0.4);
    g.lineTo(0, innerR * 0.4);
    g.strokePath();

    // Owner indicator ring
    const ownerColor = state.owner === 'player' ? 0x00aaff : 0xff3300;
    g.lineStyle(4, ownerColor, 0.8);
    g.strokeCircle(0, 0, innerR * 0.85);

    // Spinning indicator dot
    if (state.isSpinning) {
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(0, -innerR * 0.5, 3);
    }

    // Burnt out X
    if (state.isBurntOut) {
      const xSize = outerR * 0.4;
      g.lineStyle(2, 0xff0000, 0.8);
      g.beginPath();
      g.moveTo(-xSize, -xSize); g.lineTo(xSize, xSize);
      g.moveTo(xSize, -xSize); g.lineTo(-xSize, xSize);
      g.strokePath();
    }

    // Cracks for damage
    if (state.crackLevel > 0) {
      this.drawCracks(state);
    }
  }

  private drawCracks(state: GearState): void {
    const g = this.gearGraphics;
    if (state.crackLevel <= 0) return;

    const outerR = gearRadius(state.teeth);
    const crackCount = state.crackLevel * 2;
    const alpha = 0.4 + state.crackLevel * 0.1;
    g.lineStyle(1, 0xdddddd, alpha);

    // Seed random angles per gear ID for deterministic cracks
    const seed = state.id.charCodeAt(0) || 0;
    for (let i = 0; i < crackCount; i++) {
      const angle = ((i * 137.5 + seed) % 360) * (Math.PI / 180);
      const midOffsetPct = 0.5 + ((seed + i) % 10) / 10 * 0.3;
      const endOffsetPct = 0.3 + ((seed + i * 2) % 10) / 10 * 0.5;

      const midR = outerR * midOffsetPct;
      const endR = outerR * endOffsetPct;

      const startX = 0;
      const startY = 0;
      const midX = Math.cos(angle) * midR;
      const midY = Math.sin(angle) * midR;
      const endX = Math.cos(angle + 0.3) * endR;
      const endY = Math.sin(angle + 0.3) * endR;

      g.beginPath();
      g.moveTo(startX, startY);
      g.lineTo(midX, midY);
      g.lineTo(endX, endY);
      g.strokePath();
    }
  }

  /**
   * Draw a spiked gear as an iron saw with rusted, spiky blades.
   * Replaces the standard tooth profile entirely.
   */
  private drawSpikedGear(
    g: Phaser.GameObjects.Graphics,
    outerR: number,
    innerR: number,
    toothCount: number,
    alpha: number,
    state: GearState,
  ): void {
    // ── Rust/iron colour palette ────────────────────────────────────────
    const BODY_DARK   = 0x2A1005;   // dark rust-iron body
    const RUST_MID    = 0x6B2800;   // mid rust body
    const BLADE_FACE  = 0xA84010;   // blade face colour (orange-rust)
    const BLADE_TIP   = 0xD8861A;   // metallic blade edge
    const RUST_GRAIN  = 0x7A3508;   // rust grain / texture

    // ── 1. Dark iron base disk ───────────────────────────────────────────
    g.fillStyle(BODY_DARK, alpha);
    g.fillCircle(0, 0, innerR);

    // ── 2. Saw teeth — sharp asymmetric triangles ────────────────────────
    // Each tooth: steep leading edge, shallow trailing slope (handsaw profile)
    const toothArc = (Math.PI * 2) / toothCount;
    const spikeExtra = Math.max(4, outerR * 0.2); // blade extends beyond outerR

    g.fillStyle(BLADE_FACE, alpha * 0.9);
    g.lineStyle(1, 0x000000, alpha * 0.5);
    g.beginPath();
    for (let i = 0; i < toothCount; i++) {
      const base = (i / toothCount) * Math.PI * 2;
      // tooth points: root1 → sharp_tip → shoulder → root2
      const tipAngle      = base + toothArc * 0.18;  // tip close to leading edge
      const shoulderAngle = base + toothArc * 0.35;
      const root2Angle    = base + toothArc;
      const r1 = innerR;
      const rTip = outerR + spikeExtra;
      const rShoulder = outerR * 0.8;
      const r2 = innerR;
      const root1X = Math.cos(base) * r1;
      const root1Y = Math.sin(base) * r1;
      const tipX   = Math.cos(tipAngle) * rTip;
      const tipY   = Math.sin(tipAngle) * rTip;
      const shX    = Math.cos(shoulderAngle) * rShoulder;
      const shY    = Math.sin(shoulderAngle) * rShoulder;
      const root2X = Math.cos(root2Angle) * r2;
      const root2Y = Math.sin(root2Angle) * r2;
      if (i === 0) g.moveTo(root1X, root1Y);
      else         g.lineTo(root1X, root1Y);
      g.lineTo(tipX, tipY);
      g.lineTo(shX, shY);
      g.lineTo(root2X, root2Y);
    }
    g.closePath();
    g.fillPath();
    g.strokePath();

    // ── 3. Metallic highlights on leading blade edges ─────────────────────
    g.lineStyle(2, BLADE_TIP, alpha * 0.85);
    g.beginPath();
    for (let i = 0; i < toothCount; i++) {
      const base     = (i / toothCount) * Math.PI * 2;
      const tipAngle = base + toothArc * 0.18;
      g.moveTo(Math.cos(base) * innerR,    Math.sin(base) * innerR);
      g.lineTo(Math.cos(tipAngle) * (outerR + spikeExtra), Math.sin(tipAngle) * (outerR + spikeExtra));
    }
    g.strokePath();

    // ── 4. Rust-grain texture rings ────────────────────────────────────────
    g.lineStyle(1.5, RUST_GRAIN, alpha * 0.5);
    g.strokeCircle(0, 0, innerR * 0.78);
    g.lineStyle(1, RUST_MID, alpha * 0.4);
    g.strokeCircle(0, 0, innerR * 0.55);

    // Radial rust streaks
    g.lineStyle(1, RUST_MID, alpha * 0.35);
    const seed = state.id.charCodeAt(0) ?? 0;
    for (let i = 0; i < 6; i++) {
      const a = ((i * 60 + seed * 7) % 360) * (Math.PI / 180);
      g.beginPath();
      g.moveTo(Math.cos(a) * innerR * 0.3, Math.sin(a) * innerR * 0.3);
      g.lineTo(Math.cos(a) * innerR * 0.8, Math.sin(a) * innerR * 0.8);
      g.strokePath();
    }

    // ── 5. Center rivet ─────────────────────────────────────────────────
    g.fillStyle(0x111111, 0.9);
    g.fillCircle(0, 0, outerR * 0.13);
    g.lineStyle(1, 0x555555, 0.7);
    g.strokeCircle(0, 0, outerR * 0.13);

    // ── 6. Owner indicator ring ──────────────────────────────────────────
    const ownerColor = state.owner === 'player' ? 0x00aaff : 0xff3300;
    g.lineStyle(3, ownerColor, 0.75);
    g.strokeCircle(0, 0, innerR * 0.72);

    // ── 7. Spinning indicator dot ────────────────────────────────────────
    if (state.isSpinning) {
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(0, -innerR * 0.45, 2.5);
    }

    // ── 8. Burnt-out X ───────────────────────────────────────────────────
    if (state.isBurntOut) {
      const xSize = outerR * 0.4;
      g.lineStyle(2, 0xff0000, 0.8);
      g.beginPath();
      g.moveTo(-xSize, -xSize); g.lineTo(xSize, xSize);
      g.moveTo(xSize, -xSize);  g.lineTo(-xSize, xSize);
      g.strokePath();
    }

    // ── 9. Cracks ────────────────────────────────────────────────────────
    if (state.crackLevel > 0) {
      this.drawCracks(state);
    }
  }

  private drawJamIndicator(state: GearState): void {
    const g = this.frictionIndicator;
    g.clear();
    if (!state.isJammed) return;

    const radius = gearRadius(state.teeth);
    const alpha = this.jamRingAlpha;
    const severity = jamSeverity(state.jamStress);
    const width = 3 + severity * 4; // 3px light grind -> 7px severe crush

    // Outer red ring
    g.lineStyle(width, 0xff2200, alpha);
    g.strokeCircle(0, 0, radius + 6);

    // Inner orange ring
    g.lineStyle(width * 0.5, 0xff6600, alpha);
    g.strokeCircle(0, 0, radius + 4);
  }

  /**
   * severity (0-1, from jamSeverity(jamStress)) reads as the crush force
   * behind the jam -- a light grind pulses slow and dim, a severe crush
   * pulses fast and bright, so the visual answers "how hard is this jam"
   * at a glance instead of a flat on/off ring.
   */
  private startJamTween(severity: number = 0.5): void {
    if (this.jamTween) return;
    this.jamRingAlpha = 0.6;
    this.jamTween = this.scene.tweens.add({
      targets: this,
      jamRingAlpha: { from: 0.15 + severity * 0.25, to: 0.55 + severity * 0.45 },
      duration: 500 - severity * 300, // 500ms light grind -> 200ms severe crush
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private stopJamTween(): void {
    if (this.jamTween) {
      this.jamTween.stop();
      this.jamTween = null;
    }
  }

  updateFromState(state: GearState): void {
    const wasSpinning = this.gearState.isSpinning;
    const wasBurntOut = this.gearState.isBurntOut;
    const prevFriction = this.gearState.frictionLoad;
    const prevCrackLevel = this.gearState.crackLevel;
    const prevIsJammed = this.gearState.isJammed;
    this.gearState = state;

    this.setPosition(state.x, state.y);
    this.setRotation(state.currentAngle);

    // Redraw gear if state significantly changed
    if (state.isBurntOut !== wasBurntOut || state.isSpinning !== wasSpinning || state.crackLevel !== prevCrackLevel) {
      this.drawGear(state);
    }

    this.labelText.setRotation(-state.currentAngle);

    // Handle friction and jam indicators
    if (state.isJammed !== prevIsJammed) {
      if (state.isJammed) {
        this.startJamTween(jamSeverity(state.jamStress));
        this.drawJamIndicator(state);
      } else {
        this.stopJamTween();
        this.frictionIndicator.clear();
      }
    } else if (state.isJammed) {
      // Tween drives jamRingAlpha; just redraw with current alpha
      this.drawJamIndicator(state);
    } else if (state.frictionLoad > 0) {
      this.drawFrictionIndicator(state.frictionLoad, state.teeth);
    } else if (prevFriction > 0) {
      this.frictionIndicator.clear();
    }

    // Universal HP bar for all gears
    this.drawHpBar(state);

    this.drawCooldownArc(state);
  }

  private drawFrictionIndicator(frictionLoad: number, teeth: number): void {
    const g = this.frictionIndicator;
    g.clear();
    const radius = gearRadius(teeth);
    const intensity = Math.min(1, frictionLoad / 100);
    const pulseAlpha = Math.sin(this.scene.time.now / 300) * 0.3 + 0.55;
    g.lineStyle(3, 0xff8800, pulseAlpha * intensity);
    g.strokeCircle(0, 0, radius + 4);
  }

  private drawHpBar(state: GearState): void {
    // Only show HP bar when gear has taken damage (hp < maxHp)
    if (state.hp >= state.maxHp) {
      if (this.lastDrawnHp !== state.hp || this.lastDrawnMaxHp !== state.maxHp) {
        this.hpBar.clear();
        this.hpBar.setVisible(false);
        this.lastDrawnHp = state.hp;
        this.lastDrawnMaxHp = state.maxHp;
      }
      return;
    }

    // Skip redraw if nothing changed
    if (state.hp === this.lastDrawnHp && state.maxHp === this.lastDrawnMaxHp) return;

    this.hpBar.setVisible(true);
    const g = this.hpBar;
    g.clear();

    const radius = gearRadius(state.teeth);
    const pct = Math.max(0, state.hp / state.maxHp);
    const barW = radius * 2;
    const barH = 4;
    // Position bar in world coordinates, below the gear
    const barX = state.x - radius;
    const barY = state.y + radius + 4;

    // Color based on health percentage
    let hpColor = 0x22dd55; // green
    if (pct <= 0.25) hpColor = 0xff2200;    // red
    else if (pct <= 0.5) hpColor = 0xff8800; // orange
    else if (pct <= 0.75) hpColor = 0xffdd00; // yellow

    g.fillStyle(0x333333, 1);
    g.fillRect(barX, barY, barW, barH);
    g.fillStyle(hpColor, 1);
    g.fillRect(barX, barY, barW * pct, barH);
    g.lineStyle(1, 0xaaaaaa, 0.6);
    g.strokeRect(barX, barY, barW, barH);

    this.lastDrawnHp = state.hp;
    this.lastDrawnMaxHp = state.maxHp;
  }

  private drawCooldownArc(state: GearState): void {
    if (!state.lastRepositionedAt) {
      if (this.lastCooldownDrawTime !== 0) {
        this.cooldownArc.clear();
        this.lastCooldownDrawTime = 0;
      }
      return;
    }
    const now = this.clock.now;
    const elapsed = now - state.lastRepositionedAt;
    if (elapsed >= REPOSITION_COOLDOWN_MS) {
      if (this.lastCooldownDrawTime !== 0) {
        this.cooldownArc.clear();
        this.lastCooldownDrawTime = 0;
      }
      return;
    }
    // Throttle: only redraw every 100ms
    if (now - this.lastCooldownDrawTime < 100) return;
    this.lastCooldownDrawTime = now;

    const g = this.cooldownArc;
    g.clear();

    const remaining = 1 - elapsed / REPOSITION_COOLDOWN_MS; // 1 → 0
    const radius = gearRadius(state.teeth);
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + remaining * Math.PI * 2;

    g.fillStyle(0x888888, 0.35);
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, radius + 2, startAngle, endAngle, false);
    g.lineTo(0, 0);
    g.closePath();
    g.fillPath();
  }

  redraw(state: GearState): void {
    this.gearState = state;
    this.drawGear(state);
  }

  destroy(fromScene?: boolean): void {
    this.stopJamTween();
    this.hpBar.destroy();
    super.destroy(fromScene);
  }
}
