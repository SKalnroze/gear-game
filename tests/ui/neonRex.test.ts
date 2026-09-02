import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock phaser before importing anything that depends on it
vi.mock('phaser', async () => {
  const mock = await import('./__mocks__/phaser');
  return { default: mock.default };
});

vi.mock('../../src/constants/ui.constants', () => ({
  BG: { panel: 0x020614 },
  NEON: { cyan: 0x00ffcc },
  NEON_STR: { cyan: '#00ffcc' },
}));

import { neonBtn, neonDropdown } from '../../src/ui/NeonRex';
import type { NeonDropdownOption } from '../../src/ui/NeonRex';
import { Scene } from './__mocks__/phaser';
import type { Label } from './__mocks__/phaser';

// ─── neonBtn ──────────────────────────────────────────────────────────────────

describe('neonBtn', () => {
  let scene: Scene;
  let onClick: ReturnType<typeof vi.fn>;
  let btn: Label;

  beforeEach(() => {
    scene = new Scene();
    onClick = vi.fn();
    btn = neonBtn(scene as unknown as Phaser.Scene, 0, 0, 100, 40, 0x00ffcc, '#00ffcc', 'TEST', 14, onClick) as unknown as Label;
  });

  it('onClick fires on pointerdown', () => {
    (btn as unknown as { emit(e: string): void }).emit('pointerdown');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('onClick does not fire before pointerdown', () => {
    expect(onClick).not.toHaveBeenCalled();
  });

  it('destroy() does not throw', () => {
    expect(() => btn.destroy()).not.toThrow();
  });

  it('multiple pointerdown events fire onClick each time', () => {
    const b = btn as unknown as { emit(e: string): void };
    b.emit('pointerdown');
    b.emit('pointerdown');
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});

// ─── neonDropdown ─────────────────────────────────────────────────────────────

describe('neonDropdown', () => {
  const options: NeonDropdownOption[] = [
    { key: 'a', label: 'Option A' },
    { key: 'b', label: 'Option B' },
    { key: 'c', label: 'Option C' },
  ];

  let scene: Scene;
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scene = new Scene();
    onChange = vi.fn();
  });

  it('getValue() returns initialKey immediately', () => {
    const handle = neonDropdown(
      scene as unknown as Phaser.Scene,
      0, 0, 150, options, 'b', onChange,
    );
    expect(handle.getValue()).toBe('b');
  });

  it('getValue() works for first option as initial key', () => {
    const handle = neonDropdown(
      scene as unknown as Phaser.Scene,
      0, 0, 150, options, 'a', onChange,
    );
    expect(handle.getValue()).toBe('a');
  });

  it('destroy() does not throw', () => {
    const handle = neonDropdown(
      scene as unknown as Phaser.Scene,
      0, 0, 150, options, 'a', onChange,
    );
    expect(() => handle.destroy()).not.toThrow();
  });

  it('onChange is not called on construction', () => {
    neonDropdown(scene as unknown as Phaser.Scene, 0, 0, 150, options, 'a', onChange);
    expect(onChange).not.toHaveBeenCalled();
  });
});
