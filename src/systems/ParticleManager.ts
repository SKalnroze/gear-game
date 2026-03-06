import Phaser from 'phaser';
import { EventBus } from './EventBus';
import { World } from '../world/World';
import { gearRadius } from '../constants/gear.constants';

interface Particle {
  graphics: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: number;
  size: number;
}

const POOL_SIZE = 40;

/**
 * ParticleManager: graphics-based particle pool for visual effects.
 * Wires to EventBus events for gear damage, destruction, unit death, and capacitor bursts.
 */
export class ParticleManager {
  private scene: Phaser.Scene;
  private eventBus: EventBus;
  private world: World;
  private pool: Phaser.GameObjects.Graphics[] = [];
  private active: Particle[] = [];
  private ringGraphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, eventBus: EventBus, world: World) {
    this.scene = scene;
    this.eventBus = eventBus;
    this.world = world;

    // Pre-create graphics pool
    for (let i = 0; i < POOL_SIZE; i++) {
      const g = scene.add.graphics();
      g.setDepth(45);
      g.setVisible(false);
      this.pool.push(g);
    }

    // Ring graphics for capacitor burst
    this.ringGraphics = scene.add.graphics();
    this.ringGraphics.setDepth(44);

    this.wireEvents();

    // Update loop
    scene.events.on('update', (_time: number, delta: number) => {
      this.update(delta / 1000);
    });
  }

  private wireEvents(): void {
    this.eventBus.on('gear:damaged', ({ gearId }) => {
      const gear = this.world.getGear(gearId);
      if (!gear) return;
      this.spawnSparks(gear.x, gear.y, 6 + Math.floor(Math.random() * 7), 0xffaa00, 0xff6600, 200);
    });

    this.eventBus.on('gear:destroyed', ({ gearId }) => {
      const gear = this.world.getGear(gearId);
      if (!gear) return;
      const r = gearRadius(gear.teeth);
      // More particles, wider spread
      this.spawnSparks(gear.x, gear.y, 15 + Math.floor(Math.random() * 6), 0xff6600, 0xff2200, 300);
      // Brief white flash at gear position
      this.flashAt(gear.x, gear.y, r);
    });

    this.eventBus.on('unit:died', ({ unitId }) => {
      const unit = this.world.getUnit(unitId);
      if (!unit) return;
      this.spawnPuffs(unit.x, unit.y, 4 + Math.floor(Math.random() * 3), 150);
    });

    this.eventBus.on('power:capacitor_burst', ({ gearId }) => {
      const gear = this.world.getGear(gearId);
      if (!gear) return;
      this.expandingRing(gear.x, gear.y, gearRadius(gear.teeth));
    });
  }

  private getFromPool(): Phaser.GameObjects.Graphics | null {
    return this.pool.pop() ?? null;
  }

  private returnToPool(g: Phaser.GameObjects.Graphics): void {
    g.clear();
    g.setVisible(false);
    g.setAlpha(1);
    if (this.pool.length < POOL_SIZE) {
      this.pool.push(g);
    }
  }

  private spawnSparks(
    x: number, y: number, count: number,
    color1: number, color2: number, lifeMs: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const g = this.getFromPool();
      if (!g) break;

      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 80;
      const color = Math.random() > 0.5 ? color1 : color2;
      const size = 1.5 + Math.random() * 2;

      g.setVisible(true);
      g.clear();
      g.fillStyle(color, 1);
      g.fillCircle(0, 0, size);
      g.setPosition(x, y);

      this.active.push({
        graphics: g,
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: lifeMs / 1000,
        maxLife: lifeMs / 1000,
        color,
        size,
      });
    }
  }

  private spawnPuffs(x: number, y: number, count: number, lifeMs: number): void {
    for (let i = 0; i < count; i++) {
      const g = this.getFromPool();
      if (!g) break;

      const angle = Math.random() * Math.PI * 2;
      const speed = 15 + Math.random() * 30;
      const size = 2 + Math.random() * 3;

      g.setVisible(true);
      g.clear();
      g.fillStyle(0x888888, 0.6);
      g.fillCircle(0, 0, size);
      g.setPosition(x, y);

      this.active.push({
        graphics: g,
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 10,
        life: lifeMs / 1000,
        maxLife: lifeMs / 1000,
        color: 0x888888,
        size,
      });
    }
  }

  private flashAt(x: number, y: number, radius: number): void {
    const g = this.scene.add.graphics();
    g.setDepth(46);
    g.fillStyle(0xffffff, 0.6);
    g.fillCircle(x, y, radius);

    this.scene.tweens.add({
      targets: g,
      alpha: 0,
      duration: 150,
      onComplete: () => g.destroy(),
    });
  }

  private expandingRing(x: number, y: number, startR: number): void {
    const g = this.ringGraphics;
    let r = startR;
    const maxR = startR + 60;
    const duration = 300;
    const startTime = this.scene.time.now;

    const drawRing = () => {
      const elapsed = this.scene.time.now - startTime;
      const t = Math.min(1, elapsed / duration);
      r = startR + (maxR - startR) * t;
      const alpha = 1 - t;

      g.clear();
      g.lineStyle(2, 0x00ffcc, alpha);
      g.strokeCircle(x, y, r);

      if (t < 1) {
        this.scene.time.delayedCall(16, drawRing);
      } else {
        g.clear();
      }
    };
    drawRing();
  }

  private update(deltaSec: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life -= deltaSec;

      if (p.life <= 0) {
        this.returnToPool(p.graphics);
        this.active.splice(i, 1);
        continue;
      }

      p.x += p.vx * deltaSec;
      p.y += p.vy * deltaSec;
      p.vy += 50 * deltaSec; // gravity

      const alpha = p.life / p.maxLife;
      p.graphics.setPosition(p.x, p.y);
      p.graphics.setAlpha(alpha);
    }
  }
}
