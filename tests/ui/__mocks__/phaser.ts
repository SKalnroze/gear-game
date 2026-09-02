/**
 * Minimal Phaser 3 mock for UI component unit tests.
 * Only stubs what NeonRex/NeonUI actually call.
 */

// ── Event emitter ─────────────────────────────────────────────────────────────

class MockEventEmitter {
  private _events: Map<string, ((...args: unknown[]) => void)[]> = new Map();

  on(event: string, cb: (...args: unknown[]) => void) {
    if (!this._events.has(event)) this._events.set(event, []);
    this._events.get(event)!.push(cb);
    return this;
  }

  once(event: string, cb: (...args: unknown[]) => void) {
    const wrapper = (...args: unknown[]) => {
      cb(...args);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }

  off(event: string, cb: (...args: unknown[]) => void) {
    const list = this._events.get(event) ?? [];
    this._events.set(event, list.filter(h => h !== cb));
    return this;
  }

  emit(event: string, ...args: unknown[]) {
    for (const cb of [...(this._events.get(event) ?? [])]) cb(...args);
    return this;
  }
}

// ── Graphics mock ─────────────────────────────────────────────────────────────

export class Graphics {
  clear() { return this; }
  fillStyle() { return this; }
  fillRect() { return this; }
  lineStyle() { return this; }
  strokeRect() { return this; }
  beginPath() { return this; }
  moveTo() { return this; }
  lineTo() { return this; }
  strokePath() { return this; }
  fillTriangle() { return this; }
  setDepth() { return this; }
  destroy() {}
}

// ── Text mock ─────────────────────────────────────────────────────────────────

export class Text extends MockEventEmitter {
  text = '';
  setText(t: string) { this.text = t; return this; }
  setDepth() { return this; }
  setOrigin() { return this; }
  setColor() { return this; }
  setStroke() { return this; }
  destroy() {}
}

// ── Zone mock ─────────────────────────────────────────────────────────────────

export class Zone extends MockEventEmitter {
  setInteractive() { return this; }
  setDepth() { return this; }
  destroy() {}
}

// ── Label mock (rex plugin label) ─────────────────────────────────────────────

export class Label extends MockEventEmitter {
  layout() { return this; }
  setInteractive() { return this; }
  setDepth() { return this; }
  destroy() {}
}

// ── Scene mock ────────────────────────────────────────────────────────────────

export class Scene {
  events = new MockEventEmitter();

  time = {
    delayedCall: (_delay: number, cb: () => void) => { cb(); },
  };

  input = {
    on:  (_event: string, _cb: unknown) => {},
    off: (_event: string, _cb: unknown) => {},
  };

  add = {
    graphics: () => new Graphics(),

    text: (_x: number, _y: number, text: string, _style?: unknown) => {
      const t = new Text();
      t.text = text;
      return t;
    },

    zone: (_x: number, _y: number, _w: number, _h: number) => new Zone(),

    existing: (go: unknown) => go,
  };

  // rexUI plugin stubbed on the instance
  rexUI = {
    add: {
      label: (_config: unknown) => new Label(),
      sizer: (_config: unknown) => new Label(),
    },
  };
}

// Default export to satisfy `import Phaser from 'phaser'`
const Phaser = {
  Scene,
  GameObjects: { Graphics, Text },
  Math: {
    Clamp: (v: number, min: number, max: number) => Math.max(min, Math.min(max, v)),
  },
};

export default Phaser;
