// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';

// NeonUI.colorToStr and neonTextStyle don't call Phaser at runtime —
// neonTextStyle only uses Phaser as a TypeScript type annotation.
// We mock 'phaser' so the module resolves without error.
vi.mock('phaser', () => ({
  default: {},
}));

// Also mock the BG constant dependency
vi.mock('../../src/constants/ui.constants', () => ({
  BG: { panel: 0x020614 },
  NEON: { cyan: 0x00ffcc },
  NEON_STR: { cyan: '#00ffcc' },
}));

import { NeonUI } from '../../src/ui/NeonUI';

describe('NeonUI.colorToStr', () => {
  it('converts a 6-digit hex color', () => {
    expect(NeonUI.colorToStr(0x00ffcc)).toBe('#00ffcc');
  });

  it('zero-pads short colors', () => {
    expect(NeonUI.colorToStr(0x0000ff)).toBe('#0000ff');
  });

  it('zero → #000000', () => {
    expect(NeonUI.colorToStr(0x000000)).toBe('#000000');
  });

  it('white → #ffffff', () => {
    expect(NeonUI.colorToStr(0xffffff)).toBe('#ffffff');
  });

  it('single digit color is zero-padded to 6 chars', () => {
    expect(NeonUI.colorToStr(0x000001)).toBe('#000001');
  });
});

describe('NeonUI.neonTextStyle', () => {
  it('returns correct fontSize string', () => {
    const style = NeonUI.neonTextStyle('#00ffcc', 16);
    expect(style.fontSize).toBe('16px');
  });

  it('returns correct color', () => {
    const style = NeonUI.neonTextStyle('#ff0000', 12);
    expect(style.color).toBe('#ff0000');
  });

  it('uses monospace font family', () => {
    const style = NeonUI.neonTextStyle('#00ffcc', 14);
    expect(style.fontFamily).toBe('monospace');
  });

  it('bold=false → fontStyle is empty string', () => {
    const style = NeonUI.neonTextStyle('#00ffcc', 14, false);
    expect(style.fontStyle).toBe('');
  });

  it('bold=true → fontStyle is "bold"', () => {
    const style = NeonUI.neonTextStyle('#00ffcc', 14, true);
    expect(style.fontStyle).toBe('bold');
  });

  it('shadow uses same color as text', () => {
    const style = NeonUI.neonTextStyle('#aabbcc', 12);
    expect((style.shadow as { color: string }).color).toBe('#aabbcc');
  });

  it('shadow has blur=8', () => {
    const style = NeonUI.neonTextStyle('#00ffcc', 12);
    expect((style.shadow as { blur: number }).blur).toBe(8);
  });
});
