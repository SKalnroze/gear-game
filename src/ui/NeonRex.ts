import Phaser from 'phaser';
import { NeonUI } from './NeonUI';
import { NEON, NEON_STR } from '../constants/ui.constants';

type RexScene = Phaser.Scene & { rexUI: any };

export type NeonDropdownOption = { key: string; label: string };

// ── CSS injection (runs once) ─────────────────────────────────────────────

let cssInjected = false;
function injectNeonCSS(): void {
  if (cssInjected) return;
  cssInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .neon-input {
      background: rgba(2, 6, 20, 0.97);
      border: 1.5px solid rgba(0, 255, 255, 0.75);
      color: #00ffff;
      font-family: monospace;
      font-size: 13px;
      padding: 5px 10px;
      outline: none;
      box-sizing: border-box;
      box-shadow: 0 0 8px rgba(0,255,255,0.25), inset 0 0 4px rgba(0,255,255,0.08);
      border-radius: 0;
      caret-color: #00ffff;
    }
    .neon-input:focus {
      border-color: #00ffff;
      box-shadow: 0 0 14px rgba(0,255,255,0.55), inset 0 0 6px rgba(0,255,255,0.14);
    }
    input[type="color"].neon-input { padding: 2px 4px; cursor: pointer; }
    input[type="date"].neon-input  { color-scheme: dark; }
    input[type="number"].neon-input::-webkit-inner-spin-button { filter: invert(1); }
  `;
  document.head.appendChild(style);
}

// ── neonBtn ────────────────────────────────────────────────────────────────

/**
 * Rex Label acting as a neon-styled button.
 * Position (x, y) is top-left corner.
 */
export function neonBtn(
  scene: Phaser.Scene,
  x: number, y: number,
  w: number, h: number,
  color: number, colorStr: string,
  text: string, fontSize: number,
  onClick: () => void,
): any {
  const rexScene = scene as RexScene;
  const g = scene.add.graphics();

  const redraw = (hovered: boolean) => {
    g.clear();
    NeonUI.drawButton(g, -w / 2, -h / 2, w, h, color, hovered);
  };
  redraw(false);

  const label = rexScene.rexUI.add.label({
    x: x + w / 2,
    y: y + h / 2,
    background: g,
    text: scene.add.text(0, 0, text, {
      fontSize: `${fontSize}px`,
      color: colorStr,
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }),
    align: 'center',
    width: w,
    height: h,
  }).layout();

  label.setInteractive({ useHandCursor: true })
    .on('pointerover',  () => redraw(true))
    .on('pointerout',   () => redraw(false))
    .on('pointerdown',  onClick);

  return label;
}

// ── neonDropdown ──────────────────────────────────────────────────────────

const DD_H    = 36;
const ITEM_H  = 34;
const DD_PAD  = 4;

interface DropdownHandle {
  destroy(): void;
  getValue(): string;
}

/**
 * Fully scene-level neon dropdown.
 * Returns a handle with destroy() / getValue().
 */
export function neonDropdown(
  scene: Phaser.Scene,
  x: number, y: number, w: number,
  options: NeonDropdownOption[],
  initialKey: string,
  onChange: (key: string) => void,
): DropdownHandle {
  let selectedKey = initialKey;
  let isOpen      = false;
  let popupObjs: Phaser.GameObjects.GameObject[] = [];
  let outsideHandler: ((p: Phaser.Input.Pointer) => void) | null = null;

  // ── Header ─────────────────────────────────────────────────────────────
  const hdrG   = scene.add.graphics();
  const hdrTxt = scene.add.text(x + 14, y + DD_H / 2, labelFor(selectedKey), {
    fontSize: '14px', color: NEON_STR.cyan, fontFamily: 'monospace',
  }).setOrigin(0, 0.5);

  function labelFor(key: string): string {
    return options.find(o => o.key === key)?.label ?? '';
  }

  function drawHeader(hovered: boolean): void {
    hdrG.clear();
    // Panel fill + glow
    hdrG.fillStyle(NEON.cyan, hovered ? 0.12 : 0.05);
    hdrG.fillRect(x - 3, y - 3, w + 6, DD_H + 6);
    hdrG.fillStyle(0x020614, 0.97);
    hdrG.fillRect(x, y, w, DD_H);
    // Border
    hdrG.lineStyle(hovered || isOpen ? 2 : 1.5, NEON.cyan, hovered || isOpen ? 1.0 : 0.75);
    hdrG.strokeRect(x, y, w, DD_H);
    // Arrow (right = closed, down = open)
    hdrG.fillStyle(NEON.cyan, 1);
    const ax = x + w - 16;
    const ay = y + DD_H / 2;
    if (isOpen) {
      // Down arrow ▾
      hdrG.fillTriangle(ax - 5, ay - 3, ax + 5, ay - 3, ax, ay + 5);
    } else {
      // Right arrow ▸
      hdrG.fillTriangle(ax - 3, ay - 5, ax + 5, ay, ax - 3, ay + 5);
    }
  }
  drawHeader(false);

  const hdrZone = scene.add.zone(x + w / 2, y + DD_H / 2, w, DD_H)
    .setInteractive({ useHandCursor: true });
  hdrZone.on('pointerover', () => drawHeader(true));
  hdrZone.on('pointerout',  () => drawHeader(false));
  hdrZone.on('pointerdown', () => {
    if (isOpen) closePopup(); else openPopup();
  });

  // ── Popup ──────────────────────────────────────────────────────────────
  function openPopup(): void {
    if (isOpen) return;
    isOpen = true;
    drawHeader(false);

    const listH = options.length * ITEM_H + DD_PAD * 2;
    const lx    = x;
    const ly    = y + DD_H;

    const DD_DEPTH = 9000;

    // Outer panel background
    const bgG = scene.add.graphics().setDepth(DD_DEPTH);
    bgG.fillStyle(NEON.cyan, 0.06);
    bgG.fillRect(lx - 4, ly - 4, w + 8, listH + 8);
    bgG.fillStyle(0x010510, 0.97);
    bgG.fillRect(lx, ly, w, listH);
    bgG.lineStyle(1.5, NEON.cyan, 0.85);
    bgG.strokeRect(lx, ly, w, listH);
    popupObjs.push(bgG);

    options.forEach((opt, i) => {
      const iy       = ly + DD_PAD + i * ITEM_H;
      const selected = opt.key === selectedKey;

      const ig = scene.add.graphics().setDepth(DD_DEPTH + 1);
      const itxt = scene.add.text(lx + 14, iy + ITEM_H / 2, opt.label, {
        fontSize: '14px', color: NEON_STR.cyan, fontFamily: 'monospace',
      }).setOrigin(0, 0.5).setDepth(DD_DEPTH + 2);

      function drawItem(hovered: boolean): void {
        ig.clear();
        if (hovered) {
          ig.fillStyle(NEON.cyan, 0.22);
          ig.fillRect(lx + 2, iy + 1, w - 4, ITEM_H - 2);
        } else if (selected) {
          ig.fillStyle(NEON.cyan, 0.10);
          ig.fillRect(lx + 2, iy + 1, w - 4, ITEM_H - 2);
          ig.lineStyle(1, NEON.cyan, 0.5);
          ig.strokeRect(lx + 2, iy + 1, w - 4, ITEM_H - 2);
        }
      }
      drawItem(false);

      const iz = scene.add.zone(lx + w / 2, iy + ITEM_H / 2, w, ITEM_H)
        .setInteractive({ useHandCursor: true }).setDepth(DD_DEPTH + 2);

      iz.on('pointerover', () => {
        drawItem(true);
        itxt.setColor('#001a22');
        itxt.setStroke(NEON_STR.cyan, 0.5);
      });
      iz.on('pointerout', () => {
        drawItem(false);
        itxt.setColor(NEON_STR.cyan);
        itxt.setStroke('#000000', 0);
      });
      iz.on('pointerdown', () => {
        selectedKey = opt.key;
        hdrTxt.setText(opt.label);
        onChange(opt.key);
        closePopup();
      });

      popupObjs.push(ig, itxt, iz);
    });

    // Close on outside click (delayed so the opening click's pointerup doesn't immediately close)
    scene.time.delayedCall(0, () => {
    outsideHandler = (pointer: Phaser.Input.Pointer) => {
      const px = pointer.worldX;
      const py = pointer.worldY;
      const inHeader = px >= x && px <= x + w && py >= y && py <= y + DD_H;
      const inPopup  = px >= lx && px <= lx + w && py >= ly && py <= ly + listH;
      if (!inHeader && !inPopup) closePopup();
    };
    scene.input.on('pointerup', outsideHandler);
    });
  }

  function closePopup(): void {
    if (!isOpen) return;
    isOpen = false;
    for (const obj of popupObjs) obj.destroy();
    popupObjs = [];
    if (outsideHandler) {
      scene.input.off('pointerup', outsideHandler);
      outsideHandler = null;
    }
    drawHeader(false);
  }

  scene.events.once('shutdown', closePopup);

  return {
    destroy(): void {
      closePopup();
      hdrG.destroy();
      hdrTxt.destroy();
      hdrZone.destroy();
    },
    getValue(): string { return selectedKey; },
  } as unknown as DropdownHandle;
}

// ── neonSlider ────────────────────────────────────────────────────────────

interface SliderHandle {
  destroy(): void;
  getValue(): number;
}

/**
 * Canvas-drawn horizontal slider.
 * Returns a handle with destroy() / getValue().
 */
export function neonSlider(
  scene: Phaser.Scene,
  x: number, y: number, w: number,
  min: number, max: number, initValue: number,
  color: number, colorStr: string,
  onChange: (v: number) => void,
): SliderHandle {
  const CY     = y + 17;
  const TRACK  = 6;
  const RADIUS = 9;

  let value    = Phaser.Math.Clamp(initValue, min, max);
  let dragging = false;

  const trackG = scene.add.graphics();
  const thumbG = scene.add.graphics();

  const getNorm = () => (value - min) / (max - min);

  function redraw(hovered: boolean): void {
    const norm = getNorm();
    const tx   = x + norm * w;

    trackG.clear();
    // Track
    trackG.fillStyle(0x020614, 0.95);
    trackG.fillRect(x, CY - TRACK / 2, w, TRACK);
    trackG.lineStyle(1, color, 0.35);
    trackG.strokeRect(x, CY - TRACK / 2, w, TRACK);
    // Fill
    if (norm > 0) {
      trackG.fillStyle(color, 0.55);
      trackG.fillRect(x, CY - TRACK / 2, norm * w, TRACK);
      trackG.lineStyle(1, color, 0.8);
      trackG.strokeRect(x, CY - TRACK / 2, norm * w, TRACK);
    }

    thumbG.clear();
    const glow = hovered || dragging ? 0.3 : 0.15;
    thumbG.fillStyle(color, glow);
    thumbG.fillCircle(tx, CY, RADIUS + 4);
    thumbG.fillStyle(0x020614, 1);
    thumbG.fillCircle(tx, CY, RADIUS);
    thumbG.fillStyle(color, hovered || dragging ? 1 : 0.8);
    thumbG.fillCircle(tx, CY, 4);
    thumbG.lineStyle(2, color, hovered || dragging ? 1 : 0.7);
    thumbG.strokeCircle(tx, CY, RADIUS);
  }

  const valTxt = scene.add.text(x + w + 14, CY, fmtVal(value), {
    fontSize: '12px', color: colorStr, fontFamily: 'monospace',
  }).setOrigin(0, 0.5);

  function fmtVal(v: number): string {
    return Number.isInteger(min) && Number.isInteger(max) ? String(Math.round(v)) : v.toFixed(2);
  }

  function applyX(px: number): void {
    const norm = Phaser.Math.Clamp((px - x) / w, 0, 1);
    value = min + norm * (max - min);
    redraw(true);
    valTxt.setText(fmtVal(value));
    onChange(value);
  }

  redraw(false);

  const zone = scene.add.zone(x + w / 2, CY, w + RADIUS * 2, RADIUS * 3)
    .setInteractive({ useHandCursor: true });

  zone.on('pointerover',  () => redraw(true));
  zone.on('pointerout',   () => { if (!dragging) redraw(false); });
  zone.on('pointerdown',  (p: Phaser.Input.Pointer) => { dragging = true; applyX(p.worldX); });

  const onMove = (p: Phaser.Input.Pointer) => { if (dragging) applyX(p.worldX); };
  const onUp   = () => { if (dragging) { dragging = false; redraw(false); } };
  scene.input.on('pointermove', onMove);
  scene.input.on('pointerup',   onUp);

  scene.events.once('shutdown', () => {
    scene.input.off('pointermove', onMove);
    scene.input.off('pointerup', onUp);
  });

  return {
    destroy(): void {
      scene.input.off('pointermove', onMove);
      scene.input.off('pointerup', onUp);
      trackG.destroy();
      thumbG.destroy();
      zone.destroy();
      valTxt.destroy();
    },
    getValue(): number { return value; },
  };
}

// ── neonTextInput ─────────────────────────────────────────────────────────

/**
 * Neon-styled DOM text/number input.
 * Returns the DOMElement (call .destroy() to remove).
 */
export function neonTextInput(
  scene: Phaser.Scene,
  x: number, y: number, w: number, h: number,
  type: 'text' | 'number',
  placeholder: string,
  initValue: string,
  onChange: (v: string) => void,
): Phaser.GameObjects.DOMElement {
  injectNeonCSS();
  const input = document.createElement('input');
  input.type        = type;
  input.value       = initValue;
  input.placeholder = placeholder;
  input.className   = 'neon-input';
  input.style.width  = `${w}px`;
  input.style.height = `${h}px`;
  input.addEventListener('input', () => onChange(input.value));

  const el = scene.add.dom(x + w / 2, y + h / 2, input);
  el.setOrigin(0.5);
  return el;
}

// ── neonColorPicker ────────────────────────────────────────────────────────

export function neonColorPicker(
  scene: Phaser.Scene,
  x: number, y: number, w: number, h: number,
  initValue: string,
  onChange: (hex: string) => void,
): Phaser.GameObjects.DOMElement {
  injectNeonCSS();
  const input    = document.createElement('input');
  input.type     = 'color';
  input.value    = initValue;
  input.className = 'neon-input';
  input.style.width  = `${w}px`;
  input.style.height = `${h}px`;
  input.addEventListener('input', () => onChange(input.value));

  const el = scene.add.dom(x + w / 2, y + h / 2, input);
  el.setOrigin(0.5);
  return el;
}

// ── neonDatePicker ────────────────────────────────────────────────────────

export function neonDatePicker(
  scene: Phaser.Scene,
  x: number, y: number, w: number, h: number,
  initValue: string,
  onChange: (v: string) => void,
): Phaser.GameObjects.DOMElement {
  injectNeonCSS();
  const input    = document.createElement('input');
  input.type     = 'date';
  input.value    = initValue;
  input.className = 'neon-input';
  input.style.width  = `${w}px`;
  input.style.height = `${h}px`;
  input.addEventListener('change', () => onChange(input.value));

  const el = scene.add.dom(x + w / 2, y + h / 2, input);
  el.setOrigin(0.5);
  return el;
}

// ── neonTwoSlider (2D pad) ────────────────────────────────────────────────

interface TwoSliderHandle {
  destroy(): void;
  getValues(): { x: number; y: number };
}

/**
 * 2D pad — click/drag anywhere to set two values in [0,1]×[0,1].
 */
export function neonTwoSlider(
  scene: Phaser.Scene,
  x: number, y: number, w: number, h: number,
  color: number,
  initX: number, initY: number,
  onChange: (nx: number, ny: number) => void,
): TwoSliderHandle {
  let nx = Phaser.Math.Clamp(initX, 0, 1);
  let ny = Phaser.Math.Clamp(initY, 0, 1);
  let dragging = false;

  const bgG     = scene.add.graphics();
  const cursorG = scene.add.graphics();

  function drawBg(): void {
    bgG.clear();
    bgG.fillStyle(0x010510, 0.95);
    bgG.fillRect(x, y, w, h);
    // Crosshair guide lines
    bgG.lineStyle(1, color, 0.12);
    bgG.lineBetween(x + w / 2, y + 2, x + w / 2, y + h - 2);
    bgG.lineBetween(x + 2, y + h / 2, x + w - 2, y + h / 2);
    // Border
    bgG.lineStyle(1.5, color, 0.75);
    bgG.strokeRect(x, y, w, h);
  }

  function drawCursor(hov: boolean): void {
    const cx = x + nx * w;
    const cy = y + ny * h;
    cursorG.clear();
    // Crosshair inside pad
    cursorG.lineStyle(1, color, 0.4);
    cursorG.lineBetween(x, cy, x + w, cy);
    cursorG.lineBetween(cx, y, cx, y + h);
    // Cursor dot
    cursorG.fillStyle(color, hov || dragging ? 0.25 : 0.15);
    cursorG.fillCircle(cx, cy, 10);
    cursorG.fillStyle(0x010510, 1);
    cursorG.fillCircle(cx, cy, 6);
    cursorG.fillStyle(color, 1);
    cursorG.fillCircle(cx, cy, 3);
    cursorG.lineStyle(2, color, hov || dragging ? 1 : 0.7);
    cursorG.strokeCircle(cx, cy, 8);
  }

  drawBg();
  drawCursor(false);

  function applyPointer(px: number, py: number): void {
    nx = Phaser.Math.Clamp((px - x) / w, 0, 1);
    ny = Phaser.Math.Clamp((py - y) / h, 0, 1);
    drawCursor(true);
    onChange(nx, ny);
  }

  const zone = scene.add.zone(x + w / 2, y + h / 2, w, h)
    .setInteractive({ useHandCursor: true });

  zone.on('pointerover', () => drawCursor(true));
  zone.on('pointerout',  () => { if (!dragging) drawCursor(false); });
  zone.on('pointerdown', (p: Phaser.Input.Pointer) => { dragging = true; applyPointer(p.worldX, p.worldY); });

  const onMove = (p: Phaser.Input.Pointer) => { if (dragging) applyPointer(p.worldX, p.worldY); };
  const onUp   = () => { if (dragging) { dragging = false; drawCursor(false); } };
  scene.input.on('pointermove', onMove);
  scene.input.on('pointerup',   onUp);

  scene.events.once('shutdown', () => {
    scene.input.off('pointermove', onMove);
    scene.input.off('pointerup', onUp);
  });

  return {
    destroy(): void {
      scene.input.off('pointermove', onMove);
      scene.input.off('pointerup', onUp);
      bgG.destroy();
      cursorG.destroy();
      zone.destroy();
    },
    getValues(): { x: number; y: number } { return { x: nx, y: ny }; },
  };
}
