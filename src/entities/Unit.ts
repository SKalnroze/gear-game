import Phaser from 'phaser';
import { UnitState, UnitType } from '../types/unit.types';

const UNIT_COLORS: Record<UnitType, number> = {
  // Gold-based units
  infantry: 0x44aaff,
  artillery: 0xffaa00,
  cavalry: 0xaa44ff,
  mixed: 0x44ffaa,
  elite_infantry: 0x0055ff,
  elite_artillery: 0xff6600,
  elite_cavalry: 0x7700ff,
  // Resource-based units
  iron_guard: 0x888888,
  crystal_sentinel: 0x44ddff,
  aether_phantom: 0xdd44ff,
  // Special
  wrench: 0xffdd55,
};

/** Per-type size map fallback if state.size is not set */
const UNIT_SIZES: Record<UnitType, number> = {
  infantry: 9,
  artillery: 10,
  cavalry: 12,
  mixed: 10,
  elite_infantry: 10,
  elite_artillery: 11,
  elite_cavalry: 13,
  iron_guard: 11,
  crystal_sentinel: 10,
  aether_phantom: 10,
  wrench: 8,
};

/**
 * Phaser sprite representing a marching/combat unit.
 * Each type has a unique visual; physics state drives animation.
 */
export class UnitEntity extends Phaser.GameObjects.Container {
  private unitGraphics: Phaser.GameObjects.Graphics;
  private turretG: Phaser.GameObjects.Graphics;  // artillery barrel (rotates independently)
  private sweepG: Phaser.GameObjects.Graphics;   // infantry attack sweep arc
  private trailG: Phaser.GameObjects.Graphics;   // cavalry velocity trail
  private hpBar: Phaser.GameObjects.Graphics;
  public unitState: UnitState;

  // HP bar dirty flag
  private lastDrawnHp: number = -1;
  private lastDrawnMaxHp: number = -1;

  // For aether phantom pulsing
  private phantomPhase: number = 0;

  // Cavalry direction tracking: redraw when moving direction flips
  private lastCavalryDir: 'forward' | 'backward' = 'forward';

  // Cavalry trail history (world positions)
  private trailPositions: { x: number; y: number }[] = [];

  // Infantry attack animation
  private lastKnownAttackTime: number = -1;
  private sweepTimer: number = 0; // ms remaining in sweep

  constructor(scene: Phaser.Scene, state: UnitState) {
    super(scene, state.x, state.y);
    this.unitState = state;

    this.trailG = scene.add.graphics();
    this.unitGraphics = scene.add.graphics();
    this.sweepG = scene.add.graphics();
    this.turretG = scene.add.graphics();
    this.hpBar = scene.add.graphics();
    this.add(this.trailG);
    this.add(this.unitGraphics);
    this.add(this.sweepG);
    this.add(this.turretG);
    this.add(this.hpBar);

    // Derive a stable phase offset from the unit id for aether phantom
    this.phantomPhase = this.stableHashPhase(state.id);

    this.drawUnit(state);

    // Initialize artillery turret barrel
    if (state.type === 'artillery' || state.type === 'elite_artillery') {
      const size = state.size > 0 ? state.size : (UNIT_SIZES[state.type] ?? 10);
      this.drawArtilleryTurret(size);
      this.turretG.setRotation(state.owner === 'player' ? 0 : Math.PI);
    }

    scene.add.existing(this);
  }

  /** Derive a 0..2π phase from a string id (stable across frames) */
  private stableHashPhase(id: string): number {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
    }
    return (hash & 0xffff) / 0xffff * Math.PI * 2;
  }

  private drawUnit(state: UnitState): void {
    const g = this.unitGraphics;
    g.clear();
    const color = UNIT_COLORS[state.type];
    const isElite = state.type.startsWith('elite_');
    const size = state.size > 0 ? state.size : (UNIT_SIZES[state.type] ?? 10);

    // Owner tint color
    const ownerColor = state.owner === 'player' ? 0x004488 : 0x880000;

    switch (state.type) {
      case 'infantry':
      case 'elite_infantry':
      case 'mixed':
        this.drawInfantry(g, color, ownerColor, size, isElite);
        break;
      case 'cavalry':
      case 'elite_cavalry':
        this.drawCavalry(g, color, ownerColor, size, state.owner, this.lastCavalryDir);
        break;
      case 'artillery':
      case 'elite_artillery':
        this.drawArtillery(g, color, ownerColor, size, state.owner);
        break;
      case 'iron_guard':
        this.drawIronGuard(g, color, ownerColor, size);
        break;
      case 'aether_phantom':
        this.drawAetherPhantom(g, color, ownerColor, size);
        break;
      case 'crystal_sentinel':
        this.drawCrystalSentinel(g, color, size);
        break;
      case 'wrench':
        this.drawWrench(g, color, ownerColor, size);
        break;
      default:
        this.drawGeneric(g, color, ownerColor, size);
        break;
    }

    // Direction indicator: small triangle ahead of unit
    const dirX = state.owner === 'player' ? size + 5 : -(size + 5);
    const triSize = 5;
    g.fillStyle(color, 0.8);
    if (state.owner === 'player') {
      g.fillTriangle(dirX, 0, dirX - triSize, -triSize / 2, dirX - triSize, triSize / 2);
    } else {
      g.fillTriangle(dirX, 0, dirX + triSize, -triSize / 2, dirX + triSize, triSize / 2);
    }
  }

  private drawInfantry(
    g: Phaser.GameObjects.Graphics,
    color: number,
    ownerColor: number,
    size: number,
    isElite: boolean,
  ): void {
    // Circle body
    g.fillStyle(color, 1);
    g.lineStyle(isElite ? 2 : 1, 0xffffff, 0.8);
    g.fillCircle(0, 0, size);
    g.strokeCircle(0, 0, size);

    // Owner tint
    g.fillStyle(ownerColor, 0.3);
    g.fillCircle(0, 0, size);

    // Sword: line from center-top to center-right (size*0.6 long)
    const swordLen = size * 0.6;
    g.lineStyle(2, 0xffffff, 0.9);
    g.beginPath();
    g.moveTo(0, -size * 0.3);
    g.lineTo(swordLen, size * 0.3);
    g.strokePath();

    // Shield: filled arc on left side
    g.fillStyle(0xcccccc, 0.7);
    g.beginPath();
    g.arc(-size * 0.5, 0, size * 0.4, -Math.PI / 2, Math.PI / 2, false);
    g.closePath();
    g.fillPath();
  }

  private drawCavalry(
    g: Phaser.GameObjects.Graphics,
    color: number,
    ownerColor: number,
    size: number,
    owner: 'player' | 'ai',
    dir: 'forward' | 'backward' = 'forward',
  ): void {
    // Triangle body points in the current movement direction
    const facingRight = (owner === 'player') === (dir === 'forward');
    const tipX = facingRight ? size : -size;
    const baseX = facingRight ? -size * 0.5 : size * 0.5;

    g.fillStyle(color, 1);
    g.lineStyle(1, 0xffffff, 0.8);
    g.fillTriangle(tipX, 0, baseX, -size, baseX, size);
    g.strokeTriangle(tipX, 0, baseX, -size, baseX, size);

    // Owner tint
    g.fillStyle(ownerColor, 0.3);
    g.fillTriangle(tipX, 0, baseX, -size, baseX, size);

    // Lance line extending size*1.2 forward from tip
    const lanceLen = size * 1.2;
    const lanceEndX = facingRight ? tipX + lanceLen : tipX - lanceLen;
    g.lineStyle(2, 0xdddddd, 1.0);
    g.beginPath();
    g.moveTo(tipX, 0);
    g.lineTo(lanceEndX, 0);
    g.strokePath();
  }

  private drawArtillery(
    g: Phaser.GameObjects.Graphics,
    color: number,
    ownerColor: number,
    size: number,
    _owner: 'player' | 'ai',
  ): void {
    // Turret base circle
    g.fillStyle(0x666666, 1);
    g.fillCircle(0, 0, size * 0.55);

    // Body: hexagonal turret ring
    const bodyW = size * 1.5;
    const bodyH = size * 1.1;
    g.fillStyle(color, 1);
    g.lineStyle(1.5, 0xffffff, 0.8);
    g.fillRect(-bodyW / 2, -bodyH / 2, bodyW, bodyH);
    g.strokeRect(-bodyW / 2, -bodyH / 2, bodyW, bodyH);

    // Owner tint
    g.fillStyle(ownerColor, 0.3);
    g.fillRect(-bodyW / 2, -bodyH / 2, bodyW, bodyH);

    // Turret ring indicator (center pivot for barrel)
    g.fillStyle(0x555555, 1);
    g.fillCircle(0, 0, size * 0.45);
    g.lineStyle(1, 0xaaaaaa, 0.7);
    g.strokeCircle(0, 0, size * 0.45);
  }

  /** Draw the artillery barrel in turretG, pointing right (+x). Rotated independently. */
  private drawArtilleryTurret(size: number): void {
    const g = this.turretG;
    g.clear();
    const barrelW = size * 0.42;
    const barrelLen = size * 1.4;
    // Barrel from center outward (along +x)
    g.fillStyle(0x888888, 1);
    g.fillRect(size * 0.2, -barrelW / 2, barrelLen, barrelW);
    g.lineStyle(1.5, 0xdddddd, 0.7);
    g.strokeRect(size * 0.2, -barrelW / 2, barrelLen, barrelW);
    // Muzzle cap
    g.fillStyle(0xaaaaaa, 1);
    g.fillRect(size * 0.2 + barrelLen - barrelW * 0.6, -barrelW * 0.7, barrelW * 1.2, barrelW * 1.4);
  }

  private drawIronGuard(
    g: Phaser.GameObjects.Graphics,
    color: number,
    ownerColor: number,
    size: number,
  ): void {
    // Heavy outer square
    const outerSize = size * 2;
    g.fillStyle(color, 1);
    g.lineStyle(2, 0xffffff, 0.8);
    g.fillRect(-size, -size, outerSize, outerSize);
    g.strokeRect(-size, -size, outerSize, outerSize);

    // Owner tint
    g.fillStyle(ownerColor, 0.3);
    g.fillRect(-size, -size, outerSize, outerSize);

    // Inner armor plate (smaller square)
    const innerSize = size * 1.2;
    g.fillStyle(0xaaaaaa, 0.5);
    g.fillRect(-innerSize / 2, -innerSize / 2, innerSize, innerSize);

    // Corner bolts (4 small circles)
    g.fillStyle(0xffffff, 0.7);
    const boltR = Math.max(1.5, size * 0.15);
    const offsets = [
      [-size + boltR * 2, -size + boltR * 2],
      [size - boltR * 2, -size + boltR * 2],
      [-size + boltR * 2, size - boltR * 2],
      [size - boltR * 2, size - boltR * 2],
    ];
    for (const [ox, oy] of offsets) {
      g.fillCircle(ox, oy, boltR);
    }
  }

  private drawAetherPhantom(
    g: Phaser.GameObjects.Graphics,
    color: number,
    ownerColor: number,
    size: number,
  ): void {
    // Octagonal ghost shape — ghostly, ethereal, no legs
    const sides = 8;

    // Outer glow ring
    g.fillStyle(color, 0.18);
    g.beginPath();
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2 - Math.PI / sides;
      const r = size * 1.35;
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fillPath();

    // Main octagon body (semi-transparent)
    g.fillStyle(color, 0.62);
    g.lineStyle(1.5, 0xffffff, 0.55);
    g.beginPath();
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2 - Math.PI / sides;
      const r = size;
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fillPath();
    g.strokePath();

    // Owner tint overlay
    g.fillStyle(ownerColor, 0.18);
    g.beginPath();
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2 - Math.PI / sides;
      const r = size;
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fillPath();

    // Inner glowing core
    g.fillStyle(0xffffff, 0.3);
    g.fillCircle(0, 0, size * 0.3);

    // Ethereal inner ring
    g.lineStyle(1, color, 0.8);
    g.beginPath();
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2 - Math.PI / sides;
      const r = size * 0.55;
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.strokePath();
  }

  private drawCrystalSentinel(
    g: Phaser.GameObjects.Graphics,
    color: number,
    size: number,
  ): void {
    // Hexagonal crystal shape (6-point, size radius)
    const points6 = this.hexPoints(0, 0, size);
    g.fillStyle(color, 1);
    g.lineStyle(1.5, 0xffffff, 0.9);
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const p = points6[i];
      if (i === 0) g.moveTo(p.x, p.y);
      else g.lineTo(p.x, p.y);
    }
    g.closePath();
    g.fillPath();
    g.strokePath();

    // Inner smaller hexagon of lighter color
    const innerPoints = this.hexPoints(0, 0, size * 0.55);
    const lighterColor = this.lightenColor(color, 0.4);
    g.fillStyle(lighterColor, 0.8);
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const p = innerPoints[i];
      if (i === 0) g.moveTo(p.x, p.y);
      else g.lineTo(p.x, p.y);
    }
    g.closePath();
    g.fillPath();
  }

  private hexPoints(cx: number, cy: number, r: number): { x: number; y: number }[] {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3 - Math.PI / 6;
      pts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    }
    return pts;
  }

  private lightenColor(color: number, amount: number): number {
    const r = Math.min(255, ((color >> 16) & 0xff) + Math.round(255 * amount));
    const green = Math.min(255, ((color >> 8) & 0xff) + Math.round(255 * amount));
    const b = Math.min(255, (color & 0xff) + Math.round(255 * amount));
    return (r << 16) | (green << 8) | b;
  }

  private drawWrench(
    g: Phaser.GameObjects.Graphics,
    color: number,
    ownerColor: number,
    size: number,
  ): void {
    g.fillStyle(color, 1);
    g.lineStyle(1, 0xffffff, 0.8);
    g.fillRect(-size, -size, size * 2, size * 2);
    g.strokeRect(-size, -size, size * 2, size * 2);

    g.fillStyle(ownerColor, 0.3);
    g.fillRect(-size, -size, size * 2, size * 2);

    // Wrench icon: two small circles at top and bottom with a bar
    g.fillStyle(0xffffff, 0.8);
    g.fillCircle(0, -size * 0.4, size * 0.25);
    g.fillCircle(0, size * 0.4, size * 0.25);
    g.fillRect(-size * 0.1, -size * 0.4, size * 0.2, size * 0.8);
  }

  private drawGeneric(
    g: Phaser.GameObjects.Graphics,
    color: number,
    ownerColor: number,
    size: number,
  ): void {
    g.fillStyle(color, 1);
    g.lineStyle(1, 0xffffff, 0.8);
    g.fillCircle(0, 0, size);
    g.strokeCircle(0, 0, size);
    g.fillStyle(ownerColor, 0.3);
    g.fillCircle(0, 0, size);
  }

  private drawHpBar(state: UnitState): void {
    // Skip redraw if HP unchanged
    if (state.hp === this.lastDrawnHp && state.maxHp === this.lastDrawnMaxHp) return;

    const h = this.hpBar;
    h.clear();
    const size = state.size > 0 ? state.size : (UNIT_SIZES[state.type] ?? 10);
    const w = size * 2;
    const barH = 3;
    const x = -size;
    const y = size + 2;
    const pct = state.hp / state.maxHp;

    h.fillStyle(0x333333, 0.8);
    h.fillRect(x, y, w, barH);
    h.fillStyle(pct > 0.5 ? 0x00cc44 : pct > 0.25 ? 0xffaa00 : 0xff2200, 1);
    h.fillRect(x, y, w * pct, barH);

    this.lastDrawnHp = state.hp;
    this.lastDrawnMaxHp = state.maxHp;
  }

  updateFromState(state: UnitState, gameTime?: number): void {
    this.unitState = state;
    this.setPosition(state.x, state.y);
    this.drawHpBar(state);

    // Artillery: rotate turret toward target angle
    if (state.type === 'artillery' || state.type === 'elite_artillery') {
      const targetAngle = state.turretAngle ?? (state.owner === 'player' ? 0 : Math.PI);
      // Smooth rotation: lerp 20% per frame toward target
      const cur = this.turretG.rotation;
      let diff = targetAngle - cur;
      while (diff > Math.PI)  diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      this.turretG.setRotation(cur + diff * 0.2);
    }

    // Cavalry: direction change redraw + velocity trail
    if (state.type === 'cavalry' || state.type === 'elite_cavalry') {
      const newDir: 'forward' | 'backward' = state.behaviorState === 'retreating' ? 'backward' : 'forward';
      if (newDir !== this.lastCavalryDir) {
        this.lastCavalryDir = newDir;
        this.drawUnit(state);
        this.trailPositions = []; // clear trail on direction change
      }
      // Record position for trail when charging fast
      const speed = Math.sqrt(state.vx * state.vx + state.vy * state.vy);
      if (state.behaviorState === 'charging' && speed > state.speed * 1.1) {
        this.trailPositions.push({ x: state.x, y: state.y });
        if (this.trailPositions.length > 14) this.trailPositions.shift();
      } else if (speed < state.speed * 0.5) {
        this.trailPositions = [];
      }
      this.drawCavalryTrail(state);
    } else {
      this.trailG.clear();
    }

    // Infantry: sword sweep animation on new attack
    if (state.type === 'infantry' || state.type === 'elite_infantry' || state.type === 'mixed') {
      if (state.lastAttackTime !== this.lastKnownAttackTime && state.lastAttackTime > 0) {
        this.lastKnownAttackTime = state.lastAttackTime;
        this.sweepTimer = 320; // ms
      }
      const now = gameTime ?? Date.now();
      if (this.sweepTimer > 0) {
        this.sweepTimer -= 16; // approximate ~60fps tick
        this.drawSwordSweep(state, this.sweepTimer);
      } else {
        this.sweepG.clear();
      }
    }

    if (state.type === 'aether_phantom') {
      // Pulsing alpha for aether phantom
      const t = (gameTime ?? Date.now()) * 0.002;
      const pulse = 0.45 + 0.25 * Math.sin(t + this.phantomPhase);
      this.setAlpha(pulse);
    } else if (state.inCombat && state.behaviorState === 'attacking') {
      // Flash when actively attacking
      this.setAlpha(0.75 + Math.sin(Date.now() * 0.015) * 0.25);
    } else {
      this.setAlpha(1);
    }
  }

  private drawCavalryTrail(state: UnitState): void {
    this.trailG.clear();
    if (this.trailPositions.length < 2) return;
    const color = UNIT_COLORS[state.type];
    for (let i = 1; i < this.trailPositions.length; i++) {
      const t = i / this.trailPositions.length;
      const alpha = t * 0.55;
      const width = Math.max(1, t * state.size * 0.9);
      const lx1 = this.trailPositions[i - 1].x - state.x;
      const ly1 = this.trailPositions[i - 1].y - state.y;
      const lx2 = this.trailPositions[i].x - state.x;
      const ly2 = this.trailPositions[i].y - state.y;
      this.trailG.lineStyle(width, color, alpha);
      this.trailG.beginPath();
      this.trailG.moveTo(lx1, ly1);
      this.trailG.lineTo(lx2, ly2);
      this.trailG.strokePath();
    }
  }

  private drawSwordSweep(state: UnitState, timerRemaining: number): void {
    const g = this.sweepG;
    g.clear();
    const size = state.size > 0 ? state.size : (UNIT_SIZES[state.type] ?? 10);
    const progress = 1 - timerRemaining / 320; // 0 → 1 as sweep completes
    const alpha = (1 - progress) * 0.85;
    if (alpha <= 0) return;

    // Sweep arc direction: forward from the unit
    const facingDir = state.owner === 'player' ? 0 : Math.PI;
    const sweepHalf = (Math.PI / 2.5) * progress; // arc expands as it sweeps
    const r = size * 1.6;

    g.lineStyle(size * 0.35 * (1 - progress * 0.5), 0xffffff, alpha);
    g.beginPath();
    g.arc(0, 0, r, facingDir - sweepHalf, facingDir + sweepHalf, false);
    g.strokePath();

    // Tip flash
    if (progress < 0.4) {
      const tipX = Math.cos(facingDir) * r;
      const tipY = Math.sin(facingDir) * r;
      g.fillStyle(0xffffff, alpha * 0.9);
      g.fillCircle(tipX, tipY, size * 0.2);
    }
  }
}
