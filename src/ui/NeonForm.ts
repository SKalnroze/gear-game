import Phaser from 'phaser';
import { NeonUI } from './NeonUI';
import { NEON, NEON_STR } from '../constants/ui.constants';

// ── CSS injection (runs once) ─────────────────────────────────────────────

let cssInjected = false;
function injectNeonCSS(): void {
  if (cssInjected) return;
  cssInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .neon-textarea {
      background: rgba(2, 6, 20, 0.97);
      border: 1.5px solid rgba(0, 255, 204, 0.75);
      color: #00ffcc;
      font-family: monospace;
      font-size: 13px;
      padding: 6px 10px;
      outline: none;
      box-sizing: border-box;
      box-shadow: 0 0 8px rgba(0,255,204,0.25), inset 0 0 4px rgba(0,255,204,0.08);
      border-radius: 0;
      caret-color: #00ffcc;
      resize: none;
    }
    .neon-textarea::placeholder {
      color: rgba(0,255,204,0.35);
    }
    .neon-textarea:focus {
      border-color: #00ffcc;
      box-shadow: 0 0 14px rgba(0,255,204,0.55), inset 0 0 6px rgba(0,255,204,0.14);
    }
    .neon-file-picker {
      background: rgba(2, 6, 20, 0.97);
      border: 1.5px solid rgba(0, 255, 204, 0.75);
      color: #00ffcc;
      font-family: monospace;
      font-size: 12px;
      padding: 4px 8px;
      outline: none;
      box-sizing: border-box;
      box-shadow: 0 0 8px rgba(0,255,204,0.25), inset 0 0 4px rgba(0,255,204,0.08);
      border-radius: 0;
      cursor: pointer;
    }
    .neon-file-picker::-webkit-file-upload-button {
      background: rgba(0, 255, 204, 0.12);
      border: 1px solid rgba(0, 255, 204, 0.5);
      color: #00ffcc;
      font-family: monospace;
      font-size: 11px;
      padding: 3px 10px;
      cursor: pointer;
      margin-right: 8px;
    }
    .neon-file-picker::-webkit-file-upload-button:hover {
      background: rgba(0, 255, 204, 0.25);
    }
  `;
  document.head.appendChild(style);
}

// ── Types ──────────────────────────────────────────────────────────────────

interface CheckboxHandle {
  destroy(): void;
  getValue(): boolean;
  setValue(v: boolean): void;
}

interface ToggleHandle {
  destroy(): void;
  getValue(): boolean;
  setValue(v: boolean): void;
}

interface RadioGroupHandle {
  destroy(): void;
  getValue(): string;
}

interface KeybindHandle {
  destroy(): void;
  getValue(): string;
}

interface BtnGroupHandle {
  destroy(): void;
  getValue(): string;
}

interface FormGroupHandle {
  destroy(): void;
}

interface ValidationMsgHandle {
  destroy(): void;
  setText(msg: string): void;
  setType(t: 'error' | 'warning' | 'success'): void;
}

interface DisabledOverlayHandle {
  destroy(): void;
  setEnabled(v: boolean): void;
}

// ── 1. neonCheckbox ───────────────────────────────────────────────────────

export function neonCheckbox(
  scene: Phaser.Scene,
  x: number, y: number,
  size: number,
  labelText: string,
  checked: boolean,
  color: number,
  onChange: (v: boolean) => void,
): CheckboxHandle {
  let value = checked;
  const g = scene.add.graphics();

  // Derive a hex string from the color number
  const colorStr = '#' + color.toString(16).padStart(6, '0');

  const label = scene.add.text(x + size + 8, y + size / 2, labelText, {
    fontSize: '12px',
    color: colorStr,
    fontFamily: 'monospace',
  }).setOrigin(0, 0.5);

  function redraw(): void {
    g.clear();
    // Outer glow
    g.fillStyle(color, 0.06);
    g.fillRect(x - 3, y - 3, size + 6, size + 6);
    // Dark fill
    g.fillStyle(0x0a0f1a, 0.95);
    g.fillRect(x, y, size, size);
    // Border
    g.lineStyle(1.5, color, 0.8);
    g.strokeRect(x, y, size, size);

    if (value) {
      // Inner filled square (inset by 4px)
      const inset = Math.max(3, size * 0.22);
      g.fillStyle(color, 0.9);
      g.fillRect(x + inset, y + inset, size - inset * 2, size - inset * 2);
      // Checkmark shape
      g.lineStyle(2, 0x0a0f1a, 1);
      const cx = x + size / 2;
      const cy = y + size / 2;
      const s = size * 0.2;
      g.beginPath();
      g.moveTo(cx - s, cy);
      g.lineTo(cx - s * 0.3, cy + s * 0.8);
      g.lineTo(cx + s, cy - s * 0.6);
      g.strokePath();
    }
  }

  redraw();

  const zone = scene.add.zone(
    x + size / 2, y + size / 2, size + label.width + 12, size,
  ).setInteractive({ useHandCursor: true });
  // Shift zone origin so it covers both box and label
  zone.setPosition(x + (size + label.width + 8) / 2, y + size / 2);

  zone.on('pointerdown', () => {
    value = !value;
    redraw();
    onChange(value);
  });

  return {
    destroy(): void {
      g.destroy();
      label.destroy();
      zone.destroy();
    },
    getValue(): boolean { return value; },
    setValue(v: boolean): void {
      value = v;
      redraw();
    },
  };
}

// ── 2. neonToggle ─────────────────────────────────────────────────────────

export function neonToggle(
  scene: Phaser.Scene,
  x: number, y: number,
  w: number, h: number,
  on: boolean,
  color: number,
  onChange: (v: boolean) => void,
): ToggleHandle {
  let value = on;
  const g = scene.add.graphics();
  const radius = h / 2;
  const thumbR = radius - 3;

  function redraw(hovered: boolean): void {
    g.clear();

    // Track (pill shape via two half-circles + rect)
    const trackAlpha = value ? 0.55 : 0.15;
    const trackColor = value ? color : 0x333344;
    const borderAlpha = value ? (hovered ? 1 : 0.85) : (hovered ? 0.5 : 0.35);

    // Outer glow when on
    if (value) {
      g.fillStyle(color, hovered ? 0.15 : 0.08);
      g.fillRoundedRect(x - 3, y - 3, w + 6, h + 6, radius + 3);
    }

    // Track background
    g.fillStyle(0x0a0f1a, 0.95);
    g.fillRoundedRect(x, y, w, h, radius);

    // Track fill
    g.fillStyle(trackColor, trackAlpha);
    g.fillRoundedRect(x, y, w, h, radius);

    // Track border
    g.lineStyle(1.5, value ? color : 0x555566, borderAlpha);
    g.strokeRoundedRect(x, y, w, h, radius);

    // Thumb position
    const thumbX = value ? x + w - radius : x + radius;
    const thumbY = y + radius;

    // Thumb glow
    if (value) {
      g.fillStyle(color, 0.2);
      g.fillCircle(thumbX, thumbY, thumbR + 3);
    }

    // Thumb
    g.fillStyle(value ? color : 0x555566, value ? 1 : 0.6);
    g.fillCircle(thumbX, thumbY, thumbR);
    g.lineStyle(1, value ? color : 0x666677, value ? 1 : 0.5);
    g.strokeCircle(thumbX, thumbY, thumbR);
  }

  redraw(false);

  const zone = scene.add.zone(x + w / 2, y + h / 2, w, h)
    .setInteractive({ useHandCursor: true });

  zone.on('pointerover', () => redraw(true));
  zone.on('pointerout', () => redraw(false));
  zone.on('pointerdown', () => {
    value = !value;
    redraw(true);
    onChange(value);
  });

  return {
    destroy(): void {
      g.destroy();
      zone.destroy();
    },
    getValue(): boolean { return value; },
    setValue(v: boolean): void {
      value = v;
      redraw(false);
    },
  };
}

// ── 3. neonRadioGroup ─────────────────────────────────────────────────────

export function neonRadioGroup(
  scene: Phaser.Scene,
  x: number, y: number,
  options: { key: string; label: string }[],
  selectedKey: string,
  color: number,
  onChange: (key: string) => void,
): RadioGroupHandle {
  const SPACING = 28;
  const CIRCLE_R = 7;
  const DOT_R = 3;
  let selected = selectedKey;

  const colorStr = '#' + color.toString(16).padStart(6, '0');

  const graphics: Phaser.GameObjects.Graphics[] = [];
  const labels: Phaser.GameObjects.Text[] = [];
  const zones: Phaser.GameObjects.Zone[] = [];

  function redrawAll(): void {
    options.forEach((opt, i) => {
      const iy = y + i * SPACING;
      const cx = x + CIRCLE_R;
      const cy = iy + CIRCLE_R;
      const g = graphics[i];
      const isSel = opt.key === selected;

      g.clear();
      // Outer glow
      g.fillStyle(color, isSel ? 0.1 : 0.03);
      g.fillCircle(cx, cy, CIRCLE_R + 3);
      // Circle background
      g.fillStyle(0x0a0f1a, 0.95);
      g.fillCircle(cx, cy, CIRCLE_R);
      // Border
      g.lineStyle(1.5, color, isSel ? 1 : 0.5);
      g.strokeCircle(cx, cy, CIRCLE_R);
      // Inner dot when selected
      if (isSel) {
        g.fillStyle(color, 1);
        g.fillCircle(cx, cy, DOT_R);
      }

      labels[i].setAlpha(isSel ? 1 : 0.6);
    });
  }

  options.forEach((opt, i) => {
    const iy = y + i * SPACING;

    const g = scene.add.graphics();
    graphics.push(g);

    const lbl = scene.add.text(x + CIRCLE_R * 2 + 10, iy + CIRCLE_R, opt.label, {
      fontSize: '12px',
      color: colorStr,
      fontFamily: 'monospace',
    }).setOrigin(0, 0.5);
    labels.push(lbl);

    const zoneW = CIRCLE_R * 2 + 10 + lbl.width + 8;
    const zoneH = SPACING - 2;
    const z = scene.add.zone(x + zoneW / 2, iy + CIRCLE_R, zoneW, zoneH)
      .setInteractive({ useHandCursor: true });
    zones.push(z);

    z.on('pointerdown', () => {
      if (selected !== opt.key) {
        selected = opt.key;
        redrawAll();
        onChange(opt.key);
      }
    });
  });

  redrawAll();

  return {
    destroy(): void {
      graphics.forEach(g => g.destroy());
      labels.forEach(l => l.destroy());
      zones.forEach(z => z.destroy());
    },
    getValue(): string { return selected; },
  };
}

// ── 4. neonTextarea ───────────────────────────────────────────────────────

export function neonTextarea(
  scene: Phaser.Scene,
  x: number, y: number,
  w: number, h: number,
  placeholder: string,
  initValue: string,
  onChange: (v: string) => void,
): Phaser.GameObjects.DOMElement {
  injectNeonCSS();
  const textarea = document.createElement('textarea');
  textarea.value = initValue;
  textarea.placeholder = placeholder;
  textarea.className = 'neon-textarea';
  textarea.style.width = `${w}px`;
  textarea.style.height = `${h}px`;
  textarea.addEventListener('input', () => onChange(textarea.value));

  const el = scene.add.dom(x + w / 2, y + h / 2, textarea);
  el.setOrigin(0.5);
  return el;
}

// ── 5. neonKeybindInput ───────────────────────────────────────────────────

export function neonKeybindInput(
  scene: Phaser.Scene,
  x: number, y: number,
  w: number, h: number,
  initKey: string,
  color: number,
  onChange: (key: string) => void,
): KeybindHandle {
  let currentKey = initKey;
  let listening = false;
  let pulseTimer: Phaser.Time.TimerEvent | null = null;
  let pulsePhase = 0;

  const colorStr = '#' + color.toString(16).padStart(6, '0');
  const g = scene.add.graphics();

  const keyText = scene.add.text(x + w / 2, y + h / 2, currentKey, {
    fontSize: '13px',
    color: colorStr,
    fontFamily: 'monospace',
    fontStyle: 'bold',
  }).setOrigin(0.5);

  function redraw(): void {
    g.clear();
    if (listening) {
      // Pulsing glow when listening
      const pulseAlpha = 0.15 + Math.sin(pulsePhase) * 0.1;
      g.fillStyle(color, pulseAlpha);
      g.fillRect(x - 4, y - 4, w + 8, h + 8);
      g.fillStyle(0x0a0f1a, 0.95);
      g.fillRect(x, y, w, h);
      g.lineStyle(2, color, 0.8 + Math.sin(pulsePhase) * 0.2);
      g.strokeRect(x, y, w, h);
      keyText.setText('...');
    } else {
      g.fillStyle(color, 0.04);
      g.fillRect(x - 3, y - 3, w + 6, h + 6);
      g.fillStyle(0x0a0f1a, 0.95);
      g.fillRect(x, y, w, h);
      g.lineStyle(1.5, color, 0.7);
      g.strokeRect(x, y, w, h);
      keyText.setText(currentKey);
    }
  }

  redraw();

  const zone = scene.add.zone(x + w / 2, y + h / 2, w, h)
    .setInteractive({ useHandCursor: true });

  function startListening(): void {
    listening = true;
    pulsePhase = 0;
    pulseTimer = scene.time.addEvent({
      delay: 50,
      loop: true,
      callback: () => {
        pulsePhase += 0.15;
        redraw();
      },
    });
    redraw();
  }

  function stopListening(): void {
    listening = false;
    if (pulseTimer) {
      pulseTimer.destroy();
      pulseTimer = null;
    }
    redraw();
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!listening) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      stopListening();
      return;
    }
    currentKey = event.key.length === 1 ? event.key.toUpperCase() : event.key;
    stopListening();
    onChange(currentKey);
  };

  zone.on('pointerdown', () => {
    if (listening) {
      stopListening();
    } else {
      startListening();
    }
  });

  scene.input.keyboard!.on('keydown', onKeyDown);

  scene.events.once('shutdown', () => {
    scene.input.keyboard!.off('keydown', onKeyDown);
    if (pulseTimer) pulseTimer.destroy();
  });

  return {
    destroy(): void {
      scene.input.keyboard!.off('keydown', onKeyDown);
      if (pulseTimer) pulseTimer.destroy();
      g.destroy();
      keyText.destroy();
      zone.destroy();
    },
    getValue(): string { return currentKey; },
  };
}

// ── 6. neonIconBtn ────────────────────────────────────────────────────────

export function neonIconBtn(
  scene: Phaser.Scene,
  x: number, y: number,
  size: number,
  icon: string,
  color: number,
  colorStr: string,
  onClick: () => void,
): Phaser.GameObjects.Text {
  const g = scene.add.graphics();

  function redraw(hovered: boolean): void {
    g.clear();
    NeonUI.drawButton(g, x, y, size, size, color, hovered);
  }

  redraw(false);

  const label = scene.add.text(x + size / 2, y + size / 2, icon, {
    fontSize: '14px',
    color: colorStr,
    fontFamily: 'monospace',
    fontStyle: 'bold',
  }).setOrigin(0.5);

  const zone = scene.add.zone(x + size / 2, y + size / 2, size, size)
    .setInteractive({ useHandCursor: true });

  zone.on('pointerover', () => redraw(true));
  zone.on('pointerout', () => redraw(false));
  zone.on('pointerdown', onClick);

  // Attach cleanup references so the caller can destroy everything via the label
  const origDestroy = label.destroy.bind(label);
  label.destroy = function (fromScene?: boolean): void {
    g.destroy();
    zone.destroy();
    origDestroy(fromScene);
  };

  return label;
}

// ── 7. neonBtnGroup ───────────────────────────────────────────────────────

export function neonBtnGroup(
  scene: Phaser.Scene,
  x: number, y: number,
  btnW: number, btnH: number,
  options: { key: string; label: string }[],
  selectedKey: string,
  color: number,
  onChange: (key: string) => void,
): BtnGroupHandle {
  let selected = selectedKey;
  const colorStr = '#' + color.toString(16).padStart(6, '0');

  const btnGraphics: Phaser.GameObjects.Graphics[] = [];
  const btnTexts: Phaser.GameObjects.Text[] = [];
  const btnZones: Phaser.GameObjects.Zone[] = [];

  function redrawAll(): void {
    options.forEach((opt, i) => {
      const bx = x + i * btnW;
      const g = btnGraphics[i];
      const isActive = opt.key === selected;

      g.clear();
      if (isActive) {
        // Bright active state
        g.fillStyle(color, 0.12);
        g.fillRect(bx - 2, y - 2, btnW + 4, btnH + 4);
        g.fillStyle(0x0a0f1a, 0.92);
        g.fillRect(bx, y, btnW, btnH);
        g.fillStyle(color, 0.18);
        g.fillRect(bx, y, btnW, btnH);
        g.lineStyle(2, color, 1);
        g.strokeRect(bx, y, btnW, btnH);
      } else {
        // Dim inactive state
        g.fillStyle(0x0a0f1a, 0.92);
        g.fillRect(bx, y, btnW, btnH);
        g.lineStyle(1, color, 0.3);
        g.strokeRect(bx, y, btnW, btnH);
      }

      btnTexts[i].setAlpha(isActive ? 1 : 0.45);
    });
  }

  options.forEach((opt, i) => {
    const bx = x + i * btnW;

    const g = scene.add.graphics();
    btnGraphics.push(g);

    const txt = scene.add.text(bx + btnW / 2, y + btnH / 2, opt.label, {
      fontSize: '12px',
      color: colorStr,
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    btnTexts.push(txt);

    const z = scene.add.zone(bx + btnW / 2, y + btnH / 2, btnW, btnH)
      .setInteractive({ useHandCursor: true });
    btnZones.push(z);

    z.on('pointerover', () => {
      if (opt.key !== selected) {
        const g2 = btnGraphics[i];
        g2.clear();
        g2.fillStyle(0x0a0f1a, 0.92);
        g2.fillRect(bx, y, btnW, btnH);
        g2.fillStyle(color, 0.08);
        g2.fillRect(bx, y, btnW, btnH);
        g2.lineStyle(1.5, color, 0.6);
        g2.strokeRect(bx, y, btnW, btnH);
        btnTexts[i].setAlpha(0.7);
      }
    });
    z.on('pointerout', () => {
      redrawAll();
    });
    z.on('pointerdown', () => {
      if (selected !== opt.key) {
        selected = opt.key;
        redrawAll();
        onChange(opt.key);
      }
    });
  });

  redrawAll();

  return {
    destroy(): void {
      btnGraphics.forEach(g => g.destroy());
      btnTexts.forEach(t => t.destroy());
      btnZones.forEach(z => z.destroy());
    },
    getValue(): string { return selected; },
  };
}

// ── 8. neonFilePicker ─────────────────────────────────────────────────────

export function neonFilePicker(
  scene: Phaser.Scene,
  x: number, y: number,
  w: number, h: number,
  accept: string,
  onChange: (file: File) => void,
): Phaser.GameObjects.DOMElement {
  injectNeonCSS();
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.className = 'neon-file-picker';
  input.style.width = `${w}px`;
  input.style.height = `${h}px`;
  input.addEventListener('change', () => {
    if (input.files && input.files.length > 0) {
      onChange(input.files[0]);
    }
  });

  const el = scene.add.dom(x + w / 2, y + h / 2, input);
  el.setOrigin(0.5);
  return el;
}

// ── 9. neonFormGroup ──────────────────────────────────────────────────────

export function neonFormGroup(
  scene: Phaser.Scene,
  x: number, y: number,
  w: number, h: number,
  label: string,
  color: number,
): FormGroupHandle {
  const colorStr = '#' + color.toString(16).padStart(6, '0');
  const g = scene.add.graphics();

  // Measure label for the gap in the top border
  const labelPadX = 12;
  const labelFontSize = 11;

  // Label text positioned at top-left with offset
  const labelObj = scene.add.text(x + labelPadX, y, label, {
    fontSize: `${labelFontSize}px`,
    color: colorStr,
    fontFamily: 'monospace',
    fontStyle: 'bold',
  }).setOrigin(0, 0.5);

  const labelWidth = labelObj.width + 8;

  // Draw the fieldset-like border with gap for label
  g.lineStyle(1.5, color, 0.6);

  // Top-left segment (before label)
  g.beginPath();
  g.moveTo(x, y + h);
  g.lineTo(x, y);
  g.lineTo(x + labelPadX - 4, y);
  g.strokePath();

  // Top-right segment (after label)
  g.beginPath();
  g.moveTo(x + labelPadX + labelWidth, y);
  g.lineTo(x + w, y);
  g.lineTo(x + w, y + h);
  g.lineTo(x, y + h);
  g.strokePath();

  // Corner glow accents
  g.fillStyle(color, 0.08);
  g.fillRect(x - 2, y - 2, 6, 6);
  g.fillRect(x + w - 4, y - 2, 6, 6);
  g.fillRect(x - 2, y + h - 4, 6, 6);
  g.fillRect(x + w - 4, y + h - 4, 6, 6);

  return {
    destroy(): void {
      g.destroy();
      labelObj.destroy();
    },
  };
}

// ── 10. neonValidationMsg ─────────────────────────────────────────────────

export function neonValidationMsg(
  scene: Phaser.Scene,
  x: number, y: number,
  message: string,
  type: 'error' | 'warning' | 'success',
): ValidationMsgHandle {
  const typeConfig: Record<string, { icon: string; color: string; neonColor: number }> = {
    error:   { icon: '\u2717', color: NEON_STR.red,    neonColor: NEON.red },
    warning: { icon: '\u26A0', color: NEON_STR.orange, neonColor: NEON.orange },
    success: { icon: '\u2713', color: NEON_STR.green,  neonColor: NEON.green },
  };

  let currentType = type;
  let cfg = typeConfig[currentType];

  const textObj = scene.add.text(x, y, `${cfg.icon} ${message}`, {
    fontSize: '10px',
    color: cfg.color,
    fontFamily: 'monospace',
    shadow: {
      offsetX: 0,
      offsetY: 0,
      color: cfg.color,
      blur: 6,
      fill: true,
      stroke: true,
    },
  });

  let currentMessage = message;

  function updateDisplay(): void {
    cfg = typeConfig[currentType];
    textObj.setText(`${cfg.icon} ${currentMessage}`);
    textObj.setColor(cfg.color);
    textObj.setShadow(0, 0, cfg.color, 6, true, true);
  }

  return {
    destroy(): void {
      textObj.destroy();
    },
    setText(msg: string): void {
      currentMessage = msg;
      updateDisplay();
    },
    setType(t: 'error' | 'warning' | 'success'): void {
      currentType = t;
      updateDisplay();
    },
  };
}

// ── 11. neonDisabledOverlay ───────────────────────────────────────────────

export function neonDisabledOverlay(
  scene: Phaser.Scene,
  x: number, y: number,
  w: number, h: number,
): DisabledOverlayHandle {
  const g = scene.add.graphics();

  // Use a rectangle game object as the hit area — always interactive,
  // visibility controlled via alpha/depth. Never toggle setInteractive.
  const blocker = scene.add.rectangle(x + w / 2, y + h / 2, w, h)
    .setInteractive()
    .setDepth(999)
    .setAlpha(0); // invisible but blocks input when depth is high

  let blocking = false;

  blocker.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    if (blocking) pointer.event.stopPropagation();
  });

  function redraw(): void {
    g.clear();
    if (blocking) {
      g.setDepth(998);
      g.fillStyle(0x010510, 0.55);
      g.fillRect(x, y, w, h);
      g.lineStyle(1, 0x333344, 0.4);
      g.strokeRect(x, y, w, h);
      blocker.setDepth(999);
    } else {
      g.setDepth(-1);
      blocker.setDepth(-2); // sink below content so clicks pass through
    }
  }

  // Start in enabled state (area usable)
  blocker.setDepth(-2);
  g.setDepth(-1);

  return {
    destroy(): void {
      g.destroy();
      blocker.destroy();
    },
    setEnabled(v: boolean): void {
      blocking = !v; // enabled=true means NOT blocking
      redraw();
    },
  };
}
