import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '../../src/world/World';
import type { GearState } from '../../src/types/gear.types';
import { gearRadius, GEAR_MESH_TOLERANCE } from '../../src/constants/gear.constants';
import { PLAYER_ZONE_MAX_X, AI_ZONE_MIN_X, LANE_Y_MIN, LANE_Y_MAX } from '../../src/constants/world.constants';

// Helper to build a minimal GearState
function makeGear(id: string, x: number, y: number, teeth: number, owner: 'player' | 'ai'): GearState {
  return {
    id,
    definitionKey: 'motor',
    type: 'motor',
    teeth,
    x,
    y,
    owner,
    angularVelocity: 0,
    currentAngle: 0,
    accumulatedAngle: 0,
    frictionLoad: 0,
    torqueOutput: 0,
    isSpinning: false,
    isBurntOut: false,
    hp: gearRadius(teeth) * 2,
    maxHp: gearRadius(teeth) * 2,
    isJammed: false,
    crackLevel: 0,
    jamStress: 0,
  };
}

describe('World', () => {
  let world: World;

  beforeEach(() => {
    world = new World();
  });

  // ── canPlace ───────────────────────────────────────────────────────────────

  describe('canPlace — zone checks (playerOnRight=false default)', () => {
    it('player gear within player zone → allowed', () => {
      expect(world.canPlace(500, 700, 10, 'player')).toBe(true);
    });

    it('player gear beyond PLAYER_ZONE_MAX_X → blocked', () => {
      expect(world.canPlace(PLAYER_ZONE_MAX_X + 1, 700, 10, 'player')).toBe(false);
    });

    it('player gear exactly at PLAYER_ZONE_MAX_X → allowed', () => {
      expect(world.canPlace(PLAYER_ZONE_MAX_X, 700, 10, 'player')).toBe(true);
    });

    it('AI gear within AI zone → allowed', () => {
      expect(world.canPlace(2000, 700, 10, 'ai')).toBe(true);
    });

    it('AI gear below AI_ZONE_MIN_X → blocked', () => {
      expect(world.canPlace(AI_ZONE_MIN_X - 1, 700, 10, 'ai')).toBe(false);
    });

    it('AI gear exactly at AI_ZONE_MIN_X → allowed', () => {
      expect(world.canPlace(AI_ZONE_MIN_X, 700, 10, 'ai')).toBe(true);
    });
  });

  describe('canPlace — zone checks (playerOnRight=true)', () => {
    beforeEach(() => { world.setPlayerOnRight(true); });

    it('player gear below AI_ZONE_MIN_X → blocked', () => {
      expect(world.canPlace(AI_ZONE_MIN_X - 1, 700, 10, 'player')).toBe(false);
    });

    it('player gear above AI_ZONE_MIN_X → allowed', () => {
      expect(world.canPlace(AI_ZONE_MIN_X + 100, 700, 10, 'player')).toBe(true);
    });

    it('AI gear above PLAYER_ZONE_MAX_X → blocked', () => {
      expect(world.canPlace(PLAYER_ZONE_MAX_X + 1, 700, 10, 'ai')).toBe(false);
    });

    it('AI gear at or below PLAYER_ZONE_MAX_X → allowed', () => {
      expect(world.canPlace(PLAYER_ZONE_MAX_X, 700, 10, 'ai')).toBe(true);
    });
  });

  describe('canPlace — overlap checks', () => {
    beforeEach(() => {
      // Place a 10-tooth player gear at (300, 700) — radius=25
      world.placeGear(makeGear('g1', 300, 700, 10, 'player'));
    });

    it('gear exactly at meshing distance → allowed (meshing contact)', () => {
      // New gear radius=25, existing radius=25; meshing distance = 50; tolerance=4
      // Place at (350, 700): d = 50, which is NOT < (50 - 4) = 46, so allowed
      expect(world.canPlace(350, 700, 10, 'player')).toBe(true);
    });

    it('gear overlapping within tolerance → blocked', () => {
      // Place at (345, 700): d = 45 < 46 → blocked
      expect(world.canPlace(345, 700, 10, 'player')).toBe(false);
    });

    it('gear far away → allowed', () => {
      expect(world.canPlace(500, 700, 10, 'player')).toBe(true);
    });
  });

  // ── getGearsNear ──────────────────────────────────────────────────────────

  describe('getGearsNear', () => {
    beforeEach(() => {
      world.placeGear(makeGear('a', 0, 0, 10, 'player'));
      world.placeGear(makeGear('b', 50, 0, 10, 'player'));
      world.placeGear(makeGear('c', 200, 0, 10, 'player'));
    });

    it('returns all gears within radius', () => {
      const result = world.getGearsNear(0, 0, 60);
      const ids = result.map(g => g.id).sort();
      expect(ids).toEqual(['a', 'b']);
    });

    it('boundary point at exactly radius → included (<=)', () => {
      // dist from (0,0) to (50,0) = 50; radius=50 → included
      const result = world.getGearsNear(0, 0, 50);
      expect(result.map(g => g.id)).toContain('b');
    });

    it('returns none when radius is too small', () => {
      const result = world.getGearsNear(0, 0, 10);
      expect(result).toHaveLength(1); // only gear 'a' at (0,0) has d=0
    });

    it('returns all gears when radius is huge', () => {
      const result = world.getGearsNear(0, 0, 1000);
      expect(result).toHaveLength(3);
    });
  });

  // ── getGearsOverlappingCircle ─────────────────────────────────────────────

  describe('getGearsOverlappingCircle', () => {
    beforeEach(() => {
      // gear at (100, 0) with radius=25
      world.placeGear(makeGear('g', 100, 0, 10, 'player'));
    });

    it('query circle overlapping gear → included', () => {
      // circle center (60,0) radius=20; dist to gear center=40; gearR=25; 40 < 45 → true
      expect(world.getGearsOverlappingCircle(60, 0, 20)).toHaveLength(1);
    });

    it('query circle exactly touching gear → NOT included (strict <)', () => {
      // circle center (45,0) radius=30; dist=55; gearR=25; 55 < 55 → false
      expect(world.getGearsOverlappingCircle(45, 0, 30)).toHaveLength(0);
    });

    it('query circle far away → empty', () => {
      expect(world.getGearsOverlappingCircle(400, 0, 20)).toHaveLength(0);
    });
  });

  // ── getNearestGear ────────────────────────────────────────────────────────

  describe('getNearestGear', () => {
    beforeEach(() => {
      world.placeGear(makeGear('near', 100, 0, 10, 'player'));
      world.placeGear(makeGear('far', 500, 0, 10, 'player'));
    });

    it('returns closest gear', () => {
      expect(world.getNearestGear(0, 0)?.id).toBe('near');
    });

    it('excludeId skips the specified gear', () => {
      expect(world.getNearestGear(0, 0, 'near')?.id).toBe('far');
    });

    it('returns undefined when world is empty', () => {
      const w = new World();
      expect(w.getNearestGear(0, 0)).toBeUndefined();
    });
  });

  // ── getGearsOwnedBy ───────────────────────────────────────────────────────

  describe('getGearsOwnedBy', () => {
    beforeEach(() => {
      world.placeGear(makeGear('p1', 200, 700, 10, 'player'));
      world.placeGear(makeGear('p2', 300, 700, 10, 'player'));
      world.placeGear(makeGear('a1', 2000, 700, 10, 'ai'));
    });

    it('returns only player gears', () => {
      const result = world.getGearsOwnedBy('player');
      expect(result.map(g => g.id).sort()).toEqual(['p1', 'p2']);
    });

    it('returns only ai gears', () => {
      const result = world.getGearsOwnedBy('ai');
      expect(result.map(g => g.id)).toEqual(['a1']);
    });

    it('returns empty array when owner has no gears', () => {
      const w = new World();
      expect(w.getGearsOwnedBy('player')).toHaveLength(0);
    });
  });

  // ── removeGear ────────────────────────────────────────────────────────────

  describe('removeGear', () => {
    it('removes gear and returns it', () => {
      const g = makeGear('r1', 200, 700, 10, 'player');
      world.placeGear(g);
      const removed = world.removeGear('r1');
      expect(removed?.id).toBe('r1');
      expect(world.getGear('r1')).toBeUndefined();
    });

    it('returns undefined for unknown id', () => {
      expect(world.removeGear('nonexistent')).toBeUndefined();
    });
  });

  // ── clear ─────────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('removes all gears and units', () => {
      world.placeGear(makeGear('x', 200, 700, 10, 'player'));
      world.clear();
      expect([...world.getAllGears()]).toHaveLength(0);
      expect([...world.getAllUnits()]).toHaveLength(0);
    });
  });
});
