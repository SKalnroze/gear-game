import { describe, it, expect } from 'vitest';
import { byPhase, assessThreatLevel } from '../../src/ai/ai.utils';
import type { AIChainPlan } from '../../src/ai/AIChainPlanner';

// Helper to build a minimal AIChainPlan
function makePlan(phase: string, role: 'combat' | 'economy' | 'defense'): AIChainPlan {
  return {
    id: `${phase}-${role}`,
    phase: phase as AIChainPlan['phase'],
    role,
    originGearId: 'g0',
    gearIds: [],
    stats: {
      motorCount: 0, amplifierCount: 0, capacitorCount: 0,
      researcherCount: 0, minerCount: 0, converterCount: 0,
      healerCount: 0, spikedCount: 0, armoredCount: 0,
      overclockCount: 0, turretCount: 0,
    },
    spawnerType: null,
    totalCost: 0,
  } as AIChainPlan;
}

// ─── byPhase ─────────────────────────────────────────────────────────────────

describe('byPhase', () => {
  it('bootstrap < spawn < amplify (ascending order)', () => {
    const a = makePlan('bootstrap', 'combat');
    const b = makePlan('spawn', 'combat');
    const c = makePlan('amplify', 'combat');

    expect(byPhase(a, b)).toBeLessThan(0);
    expect(byPhase(b, c)).toBeLessThan(0);
    expect(byPhase(a, c)).toBeLessThan(0);
  });

  it('same phase: combat < economy (0 < 0.5)', () => {
    const combat  = makePlan('spawn', 'combat');
    const economy = makePlan('spawn', 'economy');
    expect(byPhase(combat, economy)).toBeLessThan(0);
  });

  it('same phase: combat < defense', () => {
    const combat  = makePlan('spawn', 'combat');
    const defense = makePlan('spawn', 'defense');
    expect(byPhase(combat, defense)).toBeLessThan(0);
  });

  it('equal phase and role → 0', () => {
    const a = makePlan('amplify', 'combat');
    const b = makePlan('amplify', 'combat');
    expect(byPhase(a, b)).toBe(0);
  });

  it('economy and defense have same offset', () => {
    const eco = makePlan('spawn', 'economy');
    const def = makePlan('spawn', 'defense');
    expect(byPhase(eco, def)).toBe(0);
  });

  it('unknown phase gets priority 99 (treated as last)', () => {
    const full = makePlan('full', 'combat');
    const unknown = makePlan('nonexistent', 'combat');
    expect(byPhase(full, unknown)).toBeLessThan(0);
  });
});

// ─── assessThreatLevel ───────────────────────────────────────────────────────

describe('assessThreatLevel', () => {
  it('myPct < 30% → critical', () => {
    expect(assessThreatLevel(29, 100, 80, 100)).toBe('critical');
  });

  it('myPct = 29% → critical', () => {
    expect(assessThreatLevel(29, 100, 80, 100)).toBe('critical');
  });

  it('myPct = 30% → danger (not critical; 30 is not < 30)', () => {
    expect(assessThreatLevel(30, 100, 80, 100)).toBe('danger');
  });

  it('myPct < 55% → danger', () => {
    expect(assessThreatLevel(54, 100, 80, 100)).toBe('danger');
  });

  it('myPct = 55% → NOT danger (55 is not < 55)', () => {
    // 55/100 = 0.55, oppPct = 80% → normal
    expect(assessThreatLevel(55, 100, 80, 100)).toBe('normal');
  });

  it('oppPct < 50% → winning', () => {
    expect(assessThreatLevel(70, 100, 49, 100)).toBe('winning');
  });

  it('oppPct = 50% → not winning (50 is not < 50)', () => {
    expect(assessThreatLevel(70, 100, 50, 100)).toBe('normal');
  });

  it('healthy both sides → normal', () => {
    expect(assessThreatLevel(70, 100, 60, 100)).toBe('normal');
  });

  it('myMaxHp=0 → treats myPct as 0 → critical', () => {
    expect(assessThreatLevel(0, 0, 80, 100)).toBe('critical');
  });

  it('oppMaxHp=0 → treats oppPct as 1 → normal (not winning)', () => {
    expect(assessThreatLevel(70, 100, 0, 0)).toBe('normal');
  });

  it('works with non-round numbers', () => {
    // 30/100 = 0.3 is NOT < 0.30, so danger (0.3 < 0.55)
    expect(assessThreatLevel(30, 100, 80, 100)).toBe('danger');
  });
});
