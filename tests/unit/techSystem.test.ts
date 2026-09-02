import { describe, it, expect } from 'vitest';
import { TechSystem } from '../../src/systems/TechSystem';
import { GameClock } from '../../src/systems/GameClock';
import type { EventBus } from '../../src/systems/EventBus';
import type { TechState } from '../../src/types/tech.types';
import { TECH_NODES } from '../../src/constants/tech.constants';

interface Emitted { event: string; payload: any }

function makeBus() {
  const emitted: Emitted[] = [];
  const bus = {
    emit: (event: string, payload: unknown) => { emitted.push({ event, payload }); },
    on: () => {}, once: () => {}, off: () => {},
    removeAllListeners: () => {}, destroy: () => {},
  };
  return { bus: bus as unknown as EventBus, emitted };
}

function emptyTech(): TechState {
  return { researched: new Set(), queue: [], unlockedTeeth: [10] };
}

/** A node with no prereqs and a plain economy effect, so stubs suffice. */
const NODE = 'gold_mining_1';
const RESEARCH_TIME = TECH_NODES[NODE].researchTime;

function makeRig() {
  const { bus, emitted } = makeBus();
  const clock = new GameClock();
  const playerTech = emptyTech();
  const aiTech = emptyTech();

  const goldSpent: number[] = [];
  const economy = {
    canAffordGold: () => true,
    spendGold: (_o: string, amount: number) => { goldSpent.push(amount); return true; },
    earnGold: () => {},
    applyGoldBonus: () => {},
  };
  const unitSystem = {
    unlockUnitType: () => {},
    applyHpBonus: () => {}, applySpeedBonus: () => {}, applyDamageBonus: () => {},
  };
  const rotationPhysics = { setPowerBonusPct: () => {}, setCapacitorBurstMultiplier: () => {} };
  const winSystem = { addMaxHp: () => {} };

  const system = new TechSystem(
    bus,
    economy as any,
    unitSystem as any,
    rotationPhysics as any,
    winSystem as any,
    playerTech,
    aiTech,
    clock,
  );

  return {
    system, clock, playerTech, aiTech, goldSpent, emitted,
    events: (name: string) => emitted.filter(e => e.event === name),
  };
}

describe('TechSystem', () => {
  describe('research timing follows game time, not the wall clock', () => {
    it('completes only after the full research time has elapsed', () => {
      const r = makeRig();
      expect(r.system.startResearch(NODE, 'player')).toBe(true);

      r.clock.advance(RESEARCH_TIME - 1);
      r.system.update(r.clock.now);
      expect(r.playerTech.researched.has(NODE)).toBe(false);

      r.clock.advance(2);
      r.system.update(r.clock.now);
      expect(r.playerTech.researched.has(NODE)).toBe(true);
      expect(r.events('tech:research_complete')).toHaveLength(1);
    });

    it('a pause does not advance research', () => {
      const r = makeRig();
      r.system.startResearch(NODE, 'player');

      // Pause and let a long stretch of real time go by. The clock ignores it,
      // so on resume the node must still be in progress -- this used to
      // complete the node and its whole queue the instant you unpaused.
      r.clock.setPaused(true);
      r.clock.advance(RESEARCH_TIME * 10);
      r.system.update(r.clock.now);

      expect(r.playerTech.researched.has(NODE)).toBe(false);
      expect(r.playerTech.inProgress).toBe(NODE);

      r.clock.setPaused(false);
      r.clock.advance(RESEARCH_TIME + 1);
      r.system.update(r.clock.now);
      expect(r.playerTech.researched.has(NODE)).toBe(true);
    });

    it('the progress bar does not creep forward while paused', () => {
      const r = makeRig();
      r.system.startResearch(NODE, 'player');

      r.clock.advance(RESEARCH_TIME / 2);
      const midway = r.system.getResearchProgress('player')!;
      expect(midway.nodeId).toBe(NODE);
      expect(midway.progress).toBeGreaterThan(0.4);
      expect(midway.progress).toBeLessThan(0.6);

      r.clock.setPaused(true);
      r.clock.advance(RESEARCH_TIME * 5);
      expect(r.system.getResearchProgress('player')!.progress).toBeCloseTo(midway.progress, 6);
    });

    it('game speed scales research along with the simulation', () => {
      const normal = makeRig();
      normal.system.startResearch(NODE, 'player');
      normal.clock.advance(RESEARCH_TIME / 2, 1);
      normal.system.update(normal.clock.now);
      expect(normal.playerTech.researched.has(NODE)).toBe(false);

      // Same wall-clock delta at 2x speed is twice the game time, so it lands.
      const fast = makeRig();
      fast.system.startResearch(NODE, 'player');
      fast.clock.advance(RESEARCH_TIME / 2, 2);
      fast.clock.advance(1, 2);
      fast.system.update(fast.clock.now);
      expect(fast.playerTech.researched.has(NODE)).toBe(true);
    });
  });

  describe('both sides research independently', () => {
    it('player research does not appear in the AI tech state', () => {
      const r = makeRig();

      r.system.startResearch(NODE, 'player');
      r.clock.advance(RESEARCH_TIME + 1);
      r.system.update(r.clock.now);

      expect(r.playerTech.researched.has(NODE)).toBe(true);
      expect(r.aiTech.researched.has(NODE)).toBe(false);
    });

    it('the AI can research the same node on its own timeline', () => {
      const r = makeRig();

      r.system.startResearch(NODE, 'ai');
      r.clock.advance(RESEARCH_TIME + 1);
      r.system.update(r.clock.now);

      expect(r.aiTech.researched.has(NODE)).toBe(true);
      expect(r.playerTech.researched.has(NODE)).toBe(false);
    });
  });

  describe('queueing', () => {
    it('a second node queues behind the one in progress', () => {
      const r = makeRig();
      r.system.startResearch(NODE, 'player');
      r.system.startResearch('basic_amplifier', 'player');

      expect(r.playerTech.inProgress).toBe(NODE);
      expect(r.playerTech.queue).toEqual(['basic_amplifier']);
    });

    it('the queue advances one node at a time, not all at once', () => {
      const r = makeRig();
      r.system.startResearch(NODE, 'player');
      r.system.startResearch('basic_amplifier', 'player');

      r.clock.advance(RESEARCH_TIME + 1);
      r.system.update(r.clock.now);

      expect(r.playerTech.researched.has(NODE)).toBe(true);
      // The queued node starts now; it must not have completed in the same tick.
      expect(r.playerTech.inProgress).toBe('basic_amplifier');
      expect(r.playerTech.researched.has('basic_amplifier')).toBe(false);
    });
  });
});
