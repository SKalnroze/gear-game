import { describe, it, expect } from 'vitest';
import { AbilitySystem } from '../../src/systems/AbilitySystem';
import { GameClock } from '../../src/systems/GameClock';
import type { EventBus } from '../../src/systems/EventBus';
import type { EconomySystem } from '../../src/systems/EconomySystem';

/**
 * AbilitySystem had no test coverage at all before this. Worth locking in
 * now: the ActionsSection button used to bypass this class entirely (it
 * emitted `ability:activated` directly onto the event bus), so Gold Surge
 * granted no gold, recorded no cooldown, and ignored whether it was even
 * unlocked. The fix routes the button through `activate()` -- these tests
 * cover the contract that fix now depends on.
 */

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

function makeEconomyStub() {
  const earned: Record<'player' | 'ai', number> = { player: 0, ai: 0 };
  const stub = {
    earnGold: (owner: 'player' | 'ai', amount: number) => { earned[owner] += amount; },
  };
  return { stub: stub as unknown as EconomySystem, earned };
}

function makeRig(owner: 'player' | 'ai' = 'player') {
  const { bus, emitted } = makeBus();
  const { stub, earned } = makeEconomyStub();
  const clock = new GameClock();
  const system = new AbilitySystem(bus, stub, clock, owner);
  return { system, clock, emitted, earned, events: (name: string) => emitted.filter(e => e.event === name) };
}

describe('AbilitySystem', () => {
  describe('unlock gating', () => {
    it('a locked ability cannot be activated', () => {
      const r = makeRig();
      expect(r.system.canActivate('power_surge')).toBe(false);
      expect(r.system.activate('power_surge')).toBe(false);
      expect(r.earned.player).toBe(0);
    });

    it('unlocking makes it activatable', () => {
      const r = makeRig();
      r.system.unlock('power_surge');
      expect(r.system.canActivate('power_surge')).toBe(true);
      expect(r.events('ability:unlocked')).toHaveLength(1);
    });
  });

  describe('activation', () => {
    it('Gold Surge grants exactly 30 gold to the player', () => {
      const r = makeRig();
      r.system.unlock('power_surge');

      const ok = r.system.activate('power_surge');

      expect(ok).toBe(true);
      expect(r.earned.player).toBe(30);
      expect(r.earned.ai).toBe(0);
      expect(r.events('ability:activated')).toHaveLength(1);
      expect(r.events('ability:activated')[0].payload.id).toBe('power_surge');
    });

    it('an "ai"-owned instance credits gold to "ai", not "player" -- each side has its own real instance', () => {
      const r = makeRig('ai');
      r.system.unlock('power_surge');

      r.system.activate('power_surge');

      expect(r.earned.ai).toBe(30);
      expect(r.earned.player).toBe(0);
      expect(r.events('ability:activated')[0].payload.owner).toBe('ai');
    });

    it('a passive ability cannot be activated at all', () => {
      const r = makeRig();
      r.system.unlock('counter_intel');
      expect(r.system.canActivate('counter_intel')).toBe(false);
      expect(r.system.activate('counter_intel')).toBe(false);
    });

    it('activating an unknown-state ability without unlocking is a no-op, not a crash', () => {
      const r = makeRig();
      expect(() => r.system.activate('overclock_no_burnout')).not.toThrow();
      expect(r.system.activate('overclock_no_burnout')).toBe(false);
    });
  });

  describe('cooldown', () => {
    it('cannot reactivate before the cooldown elapses', () => {
      const r = makeRig();
      r.system.unlock('power_surge');
      r.system.activate('power_surge');

      r.clock.advance(59_999);
      expect(r.system.canActivate('power_surge')).toBe(false);
      expect(r.system.activate('power_surge')).toBe(false);
      expect(r.earned.player).toBe(30); // unchanged -- the second call did nothing

      r.clock.advance(2);
      expect(r.system.canActivate('power_surge')).toBe(true);
      expect(r.system.activate('power_surge')).toBe(true);
      expect(r.earned.player).toBe(60);
    });

    it('getCooldownRemaining counts down to zero, not below', () => {
      const r = makeRig();
      r.system.unlock('power_surge');
      r.system.activate('power_surge');

      expect(r.system.getCooldownRemaining('power_surge')).toBeCloseTo(60_000, 0);
      r.clock.advance(60_000);
      expect(r.system.getCooldownRemaining('power_surge')).toBe(0);
    });

    it('the cooldown is on game time, not wall time -- a pause freezes it', () => {
      const r = makeRig();
      r.system.unlock('power_surge');
      r.system.activate('power_surge');

      r.clock.setPaused(true);
      r.clock.advance(120_000);
      expect(r.system.canActivate('power_surge')).toBe(false);
      expect(r.system.getCooldownRemaining('power_surge')).toBeCloseTo(60_000, 0);
    });

    it('a never-used ability with no cooldown set is immediately usable once unlocked', () => {
      // Regression guard for the game-clock-starts-at-zero trap: lastUsedAt
      // must default to a sentinel in the past, not 0 (which would read as
      // "used at t=0" and could wrongly gate activation at match start).
      const r = makeRig();
      r.system.unlock('power_surge');
      expect(r.system.canActivate('power_surge')).toBe(true);
    });
  });
});
