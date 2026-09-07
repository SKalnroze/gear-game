import { describe, it, expect } from 'vitest';
import {
  getNodeVisualState, getUnmetPrereqs, getNodeIcon, generateDefaultLayout,
  allEdgePairs, edgeKey, branchOf, ROOT_NODE_ID,
} from '../../src/ui/techTreeLayout';
import { TECH_NODES } from '../../src/constants/tech.constants';

describe('getNodeVisualState', () => {
  const noTech = { researched: new Set<string>(), queue: [], inProgress: undefined };

  it('a node with no prereqs is available from the start', () => {
    const rootNode = Object.values(TECH_NODES).find(n => !n.prereqs?.length)!;
    expect(getNodeVisualState(rootNode.id, noTech)).toBe('available');
  });

  it('a node whose every prereq is untouched is distant', () => {
    const child = Object.values(TECH_NODES).find(n => n.prereqs?.length === 1)!;
    expect(getNodeVisualState(child.id, noTech)).toBe('distant');
  });

  it('a node with one of several prereqs touched is next, not distant', () => {
    const multi = Object.values(TECH_NODES).find(n => (n.prereqs?.length ?? 0) >= 2)!;
    const tech = { researched: new Set([multi.prereqs![0]]), queue: [], inProgress: undefined };
    expect(getNodeVisualState(multi.id, tech)).toBe('next');
  });

  it('reflects researched / researching / queued directly', () => {
    const id = Object.keys(TECH_NODES)[0];
    expect(getNodeVisualState(id, { researched: new Set([id]), queue: [], inProgress: undefined })).toBe('researched');
    expect(getNodeVisualState(id, { researched: new Set(), queue: [], inProgress: id })).toBe('researching');
    expect(getNodeVisualState(id, { researched: new Set(), queue: [id], inProgress: undefined })).toBe('queued');
  });

  it('getUnmetPrereqs lists only the prereqs not yet touched', () => {
    const multi = Object.values(TECH_NODES).find(n => (n.prereqs?.length ?? 0) >= 2)!;
    const tech = { researched: new Set([multi.prereqs![0]]), queue: [], inProgress: undefined };
    expect(getUnmetPrereqs(multi.id, tech)).toEqual(multi.prereqs!.slice(1));
  });
});

describe('getNodeIcon', () => {
  it('gives every tech node a real icon, not a bare fallback', () => {
    for (const id of Object.keys(TECH_NODES)) {
      const icon = getNodeIcon(id);
      expect(icon.glyph).toBeTruthy();
    }
  });

  it('a tiered family (e.g. gold_mining_1/2/3) shares one glyph with distinct numerals', () => {
    const tiers = Object.keys(TECH_NODES).filter(id => /^gold_mining_\d+$/.test(id)).sort();
    expect(tiers.length).toBeGreaterThan(1);
    const glyphs = tiers.map(id => getNodeIcon(id).glyph);
    const numerals = tiers.map(id => getNodeIcon(id).numeral);
    expect(new Set(glyphs).size).toBe(1);
    expect(new Set(numerals).size).toBe(numerals.length);
  });
});

describe('generateDefaultLayout', () => {
  const layout = generateDefaultLayout();

  it('places every tech node and the root hub', () => {
    expect(layout.nodes[ROOT_NODE_ID]).toBeDefined();
    for (const id of Object.keys(TECH_NODES)) {
      expect(layout.nodes[id]).toBeDefined();
      expect(Number.isFinite(layout.nodes[id].x)).toBe(true);
      expect(Number.isFinite(layout.nodes[id].y)).toBe(true);
    }
  });

  it('gives every prereq edge (including root spokes) a bead entry', () => {
    for (const { fromId, toId } of allEdgePairs()) {
      expect(layout.edges[edgeKey(fromId, toId)]).toBeDefined();
    }
  });

  it('places a deeper node further from the root than a shallower one on the same branch', () => {
    // gear_precision_1 (depth 1) vs gear_precision_5 (depth 5), same branch.
    const shallow = layout.nodes['gear_precision_1'];
    const deep = layout.nodes['gear_precision_5'];
    expect(branchOf('gear_precision_1')).toBe(branchOf('gear_precision_5'));
    const distShallow = Math.hypot(shallow.x, shallow.y);
    const distDeep = Math.hypot(deep.x, deep.y);
    expect(distDeep).toBeGreaterThan(distShallow);
  });
});
