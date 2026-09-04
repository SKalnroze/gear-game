import { GearState } from '../types/gear.types';
import { UnitState } from '../types/unit.types';
import { World } from '../world/World';
import { EventBus } from './EventBus';
import { ProjectileSystem } from './ProjectileSystem';
import { distance } from '../utils/MathUtils';
import { computeDamage } from '../constants/unit.constants';
import { minelayerFireZoneRange, mineRadius, mineDamage, crackLevelFor } from '../constants/gear.constants';
import { marchDirection } from './unit.utils';
import { LANE_Y_MIN, LANE_Y_MAX } from '../constants/world.constants';

const MINELAYER_COOLDOWN_MS = 3000;
/** Arm delay after landing -- visible while arming, hidden from the enemy afterward. */
const MINE_ARM_DELAY_S = 1.5;
/** How long a sentry pulse keeps a revealed mine visible to the enemy. */
const SENTRY_REVEAL_DURATION_MS = 3000;
/** How close an enemy unit must walk to trip a mine (its physical footprint, not its blast radius). */
const MINE_TRIGGER_RADIUS = 14;
/** A candidate drop point is valid only if no same-owner mine sits within radius * this factor. */
const MINE_SPACING_FACTOR = 1.5;
const MAX_LOCATION_ATTEMPTS = 8;

export interface MineState {
  id: string;
  x: number;
  y: number;
  owner: 'player' | 'ai';
  radius: number;
  damage: number;
  armed: boolean;
  age: number; // seconds since landing
  /** game-clock ms until which a Sentry pulse has revealed this mine to its enemy, if hidden. */
  revealedUntil?: number;
}

let _nextMineId = 1;
function nextMineId(): string {
  return `mine_${_nextMineId++}`;
}

/**
 * Minelayer gears: fire a mine shell into a zone ahead of them (ammo/cooldown
 * fed the same way turrets are), and the resulting mines arm after a short
 * delay, then hide from the enemy, and detonate on enemy contact or when
 * caught in another explosion's blast (aoe:explosion, emitted by
 * ProjectileSystem/UnitSystem's own AoE sources).
 */
export class MinelayerSystem {
  private world: World;
  private eventBus: EventBus;
  private mines: Map<string, MineState> = new Map();
  private lastFireTime: Map<string, number> = new Map();

  private readonly onMineLanded = ({ x, y, owner, radius, damage }: {
    x: number; y: number; owner: 'player' | 'ai'; radius: number; damage: number;
  }) => {
    const mine: MineState = { id: nextMineId(), x, y, owner, radius, damage, armed: false, age: 0 };
    this.mines.set(mine.id, mine);
    this.eventBus.emit('mine:created', { id: mine.id, x, y, owner });
  };

  private readonly onAoeExplosion = ({ x, y, radius }: { x: number; y: number; radius: number }) => {
    for (const [, mine] of this.mines) {
      if (distance(x, y, mine.x, mine.y) <= radius + mine.radius) {
        this.detonate(mine);
      }
    }
  };

  private readonly onGearRemoved = ({ gearId }: { gearId: string }): void => {
    this.lastFireTime.delete(gearId);
  };

  /** Queued until the next update() call, which is where `now` (game clock) is available. */
  private pendingSentryPulses: Array<{ owner: 'player' | 'ai'; x: number; y: number; radius: number }> = [];
  private readonly onSentryPulse = (pulse: { owner: 'player' | 'ai'; x: number; y: number; radius: number }): void => {
    this.pendingSentryPulses.push(pulse);
  };

  constructor(world: World, eventBus: EventBus) {
    this.world = world;
    this.eventBus = eventBus;
    this.eventBus.on('mine:landed', this.onMineLanded);
    this.eventBus.on('aoe:explosion', this.onAoeExplosion);
    this.eventBus.on('gear:removed', this.onGearRemoved);
    this.eventBus.on('sentry:pulse', this.onSentryPulse);
  }

  destroy(): void {
    this.eventBus.off('mine:landed', this.onMineLanded);
    this.eventBus.off('aoe:explosion', this.onAoeExplosion);
    this.eventBus.off('gear:removed', this.onGearRemoved);
    this.eventBus.off('sentry:pulse', this.onSentryPulse);
    this.mines.clear();
    this.lastFireTime.clear();
    this.pendingSentryPulses = [];
  }

  getMines(): Map<string, MineState> {
    return this.mines;
  }

  update(
    deltaSec: number,
    now: number,
    allUnits: Map<string, UnitState>,
    projectileSystem: ProjectileSystem,
  ): void {
    this.applySentryPulses(now);
    this.updateFiring(now, projectileSystem);
    this.updateArming(deltaSec);
    this.updateContactDetonation(allUnits);
  }

  /**
   * A Sentry pulse (gear or unit) reveals any enemy mine caught in its
   * radius for SENTRY_REVEAL_DURATION_MS -- the counter to a Minelayer's
   * per-owner hidden mines, "mines are the stealth layer" per design.
   */
  private applySentryPulses(now: number): void {
    if (this.pendingSentryPulses.length === 0) return;
    for (const pulse of this.pendingSentryPulses) {
      for (const [, mine] of this.mines) {
        if (mine.owner === pulse.owner) continue; // only reveals the enemy's hidden mines
        if (distance(pulse.x, pulse.y, mine.x, mine.y) <= pulse.radius) {
          mine.revealedUntil = now + SENTRY_REVEAL_DURATION_MS;
        }
      }
    }
    this.pendingSentryPulses = [];
  }

  private updateFiring(now: number, projectileSystem: ProjectileSystem): void {
    for (const [, gear] of this.world.getAllGears()) {
      if (gear.type !== 'minelayer') continue;
      if (!gear.ammo || gear.ammo <= 0) continue;

      const last = this.lastFireTime.get(gear.id) ?? 0;
      if (now - last < MINELAYER_COOLDOWN_MS) continue;

      const spot = this.findValidDropPoint(gear);
      if (!spot) continue; // zone too crowded this tick -- keep the ammo banked, try again next tick

      gear.ammo = Math.max(0, gear.ammo - 1);
      this.world.updateGear(gear);
      this.lastFireTime.set(gear.id, now);

      const fakeUnit = {
        id: gear.id, owner: gear.owner, x: gear.x, y: gear.y,
        size: Math.max(6, Math.round(gear.teeth * 1.0)),
      } as unknown as UnitState;
      projectileSystem.fireMineShell(fakeUnit, spot.x, spot.y, mineRadius(gear.teeth), mineDamage(gear.teeth));

      this.eventBus.emit('projectile:fired', {
        id: gear.id, type: 'artillery_shell', owner: gear.owner, x: gear.x, y: gear.y,
      });
    }
  }

  /** Random point in the zone ahead of the gear, far enough from this owner's existing mines. */
  private findValidDropPoint(gear: GearState): { x: number; y: number } | null {
    const playerRight = this.world.isPlayerOnRight();
    const dir = marchDirection(gear.owner, playerRight);
    const range = minelayerFireZoneRange(gear.teeth);
    const minGap = range * 0.25;
    const halfHeight = range * 0.4;
    const radius = mineRadius(gear.teeth);
    const minSpacing = radius * MINE_SPACING_FACTOR;

    for (let attempt = 0; attempt < MAX_LOCATION_ATTEMPTS; attempt++) {
      const dist = minGap + Math.random() * (range - minGap);
      const x = gear.x + dir * dist;
      const y = Math.max(LANE_Y_MIN, Math.min(LANE_Y_MAX, gear.y + (Math.random() * 2 - 1) * halfHeight));

      let clear = true;
      for (const [, mine] of this.mines) {
        if (mine.owner !== gear.owner) continue;
        if (distance(x, y, mine.x, mine.y) < minSpacing) { clear = false; break; }
      }
      if (clear) return { x, y };
    }
    return null;
  }

  private updateArming(deltaSec: number): void {
    for (const [, mine] of this.mines) {
      if (mine.armed) continue;
      mine.age += deltaSec;
      if (mine.age >= MINE_ARM_DELAY_S) {
        mine.armed = true;
        this.eventBus.emit('mine:armed', { id: mine.id });
      }
    }
  }

  private updateContactDetonation(allUnits: Map<string, UnitState>): void {
    for (const [, mine] of this.mines) {
      if (!mine.armed) continue;
      for (const [, unit] of allUnits) {
        if (unit.owner === mine.owner) continue;
        if (unit.reachedBase) continue;
        const d = distance(unit.x, unit.y, mine.x, mine.y);
        if (d <= unit.size + MINE_TRIGGER_RADIUS) {
          this.detonate(mine, allUnits);
          break;
        }
      }
    }
  }

  /** Artillery-style falloff-by-distance AoE against enemy units and gears, then remove the mine. */
  private detonate(mine: MineState, allUnits?: Map<string, UnitState>): void {
    if (!this.mines.has(mine.id)) return; // already gone (e.g. chain-detonated twice in one pass)
    this.mines.delete(mine.id);

    const units = allUnits ?? this.world.getAllUnits();
    for (const [, unit] of units) {
      if (unit.owner === mine.owner) continue;
      if (unit.reachedBase) continue;
      const d = distance(unit.x, unit.y, mine.x, mine.y);
      if (d <= mine.radius) {
        const falloff = mine.damage * (1 - d / (mine.radius * 1.5));
        const dealt = computeDamage(undefined, unit, Math.max(1, falloff));
        unit.hp -= dealt;
        this.eventBus.emit('unit:damaged', { unitId: unit.id, damage: dealt, x: unit.x, y: unit.y });
        if (unit.hp <= 0) {
          unit.hp = 0;
          this.eventBus.emit('unit:died', { unitId: unit.id, owner: unit.owner });
        }
      }
    }

    for (const [, gear] of this.world.getAllGears()) {
      if (gear.owner === mine.owner) continue;
      const d = distance(gear.x, gear.y, mine.x, mine.y);
      if (d <= mine.radius) {
        const falloff = mine.damage * (1 - d / (mine.radius * 1.5));
        const dealt = Math.max(1, falloff);
        const wasAlive = gear.hp > 0;
        gear.hp = Math.max(0, gear.hp - dealt);
        gear.crackLevel = crackLevelFor(gear.hp, gear.maxHp);
        this.world.updateGear(gear);
        this.eventBus.emit('gear:damaged', { gearId: gear.id, damage: dealt, remainingHp: gear.hp, source: 'combat' });
        if (wasAlive && gear.hp <= 0) {
          this.eventBus.emit('gear:destroyed', { gearId: gear.id, owner: gear.owner, cause: 'combat' });
        }
      }
    }

    this.eventBus.emit('mine:detonated', { id: mine.id, x: mine.x, y: mine.y, radius: mine.radius, owner: mine.owner });
  }
}
