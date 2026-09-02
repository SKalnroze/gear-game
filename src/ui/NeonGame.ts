import Phaser from 'phaser';
import { NeonUI } from './NeonUI';
import { NEON, NEON_STR } from '../constants/ui.constants';

// ── Types ─────────────────────────────────────────────────────────────────

interface HealthBarHandle {
  destroy(): void;
  setValue(v: number): void;
  getValue(): number;
}

interface ResourceBarHandle {
  destroy(): void;
  setValue(v: number): void;
}

interface InventoryGridHandle {
  destroy(): void;
  setItem(col: number, row: number, icon: string, count?: number): void;
  clearItem(col: number, row: number): void;
}

interface ItemSlotHandle {
  destroy(): void;
  setIcon(icon: string): void;
  setCount(n: number): void;
  clear(): void;
}

interface SkillBarHandle {
  destroy(): void;
  setSkill(index: number, icon: string, cooldown?: number): void;
  clearSkill(index: number): void;
}

interface HotkeyBarHandle {
  destroy(): void;
  setSlot(index: number, icon: string): void;
  clearSlot(index: number): void;
}

interface TimelineEvent {
  time: number;
  label: string;
  color?: number;
}

interface TimelineHandle {
  destroy(): void;
  setCurrentTime(t: number): void;
}

interface CombatLogHandle {
  destroy(): void;
  addEntry(text: string, entryColor?: string): void;
  clear(): void;
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Pick a health-bar color based on the fraction remaining. */
function healthColor(fraction: number): { hex: number; str: string } {
  if (fraction > 0.6) return { hex: NEON.green, str: NEON_STR.green };
  if (fraction > 0.35) return { hex: NEON.yellow, str: NEON_STR.yellow };
  if (fraction > 0.15) return { hex: NEON.orange, str: NEON_STR.orange };
  return { hex: NEON.red, str: NEON_STR.red };
}

/** Resolve a hex number color to its '#rrggbb' string. */
function hexStr(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

// ── 1. neonHealthBar ──────────────────────────────────────────────────────

export function neonHealthBar(
  scene: Phaser.Scene,
  x: number, y: number,
  w: number, h: number,
  value: number, maxValue: number,
  _color: number,
): HealthBarHandle {
  let current = value;
  let activeTween: Phaser.Tweens.Tween | null = null;
  const g = scene.add.graphics();
  const txt = scene.add.text(
    x + w / 2, y + h / 2, `${current} / ${maxValue}`,
    NeonUI.neonTextStyle('#ffffff', 10, true),
  ).setOrigin(0.5);

  function draw(): void {
    g.clear();
    const frac = Phaser.Math.Clamp(current / maxValue, 0, 1);
    const hc = healthColor(frac);

    // Dark track
    g.fillStyle(0x0a0f1a, 0.95);
    g.fillRect(x, y, w, h);

    // Neon border around track
    g.lineStyle(1.5, hc.hex, 0.7);
    g.strokeRect(x, y, w, h);

    // Outer glow
    g.fillStyle(hc.hex, 0.04);
    g.fillRect(x - 3, y - 3, w + 6, h + 6);

    // Filled portion
    if (frac > 0) {
      g.fillStyle(hc.hex, 0.55);
      g.fillRect(x + 1, y + 1, (w - 2) * frac, h - 2);
      // Bright top edge highlight
      g.fillStyle(hc.hex, 0.25);
      g.fillRect(x + 1, y + 1, (w - 2) * frac, 2);
    }

    txt.setText(`${Math.round(current)} / ${maxValue}`);
    txt.setColor(hc.str);
  }

  draw();

  return {
    destroy(): void {
      g.destroy();
      txt.destroy();
    },
    setValue(v: number): void {
      const target = Phaser.Math.Clamp(v, 0, maxValue);
      // Cancel any in-flight tween before starting a new one to avoid stacking.
      if (activeTween) {
        activeTween.stop();
        activeTween = null;
      }
      const tweenObj = { val: current };
      activeTween = scene.tweens.add({
        targets: tweenObj,
        val: target,
        duration: 300,
        ease: 'Power2',
        onUpdate() {
          current = tweenObj.val;
          draw();
        },
        onComplete() {
          current = target;
          activeTween = null;
          draw();
        },
      });
    },
    getValue(): number {
      return current;
    },
  };
}

// ── 2. neonResourceBar ────────────────────────────────────────────────────

export function neonResourceBar(
  scene: Phaser.Scene,
  x: number, y: number,
  w: number, h: number,
  value: number, maxValue: number,
  label: string, color: number,
): ResourceBarHandle {
  let current = value;
  const colorStr = hexStr(color);

  const labelTxt = scene.add.text(
    x, y + h / 2, label,
    NeonUI.neonTextStyle(colorStr, 10, true),
  ).setOrigin(0, 0.5);

  const labelW = labelTxt.width + 6;
  const barX = x + labelW;
  const barW = w - labelW;

  const g = scene.add.graphics();
  const valTxt = scene.add.text(
    barX + barW / 2, y + h / 2,
    `${Math.round(current)} / ${maxValue}`,
    NeonUI.neonTextStyle('#ffffff', 10, false),
  ).setOrigin(0.5);

  function draw(): void {
    g.clear();
    const frac = Phaser.Math.Clamp(current / maxValue, 0, 1);

    // Dark track
    g.fillStyle(0x0a0f1a, 0.95);
    g.fillRect(barX, y, barW, h);

    // Border
    g.lineStyle(1.5, color, 0.7);
    g.strokeRect(barX, y, barW, h);

    // Outer glow
    g.fillStyle(color, 0.04);
    g.fillRect(barX - 3, y - 3, barW + 6, h + 6);

    // Fill
    if (frac > 0) {
      g.fillStyle(color, 0.5);
      g.fillRect(barX + 1, y + 1, (barW - 2) * frac, h - 2);
      g.fillStyle(color, 0.2);
      g.fillRect(barX + 1, y + 1, (barW - 2) * frac, 2);
    }

    valTxt.setText(`${Math.round(current)} / ${maxValue}`);
  }

  draw();

  return {
    destroy(): void {
      g.destroy();
      labelTxt.destroy();
      valTxt.destroy();
    },
    setValue(v: number): void {
      current = Phaser.Math.Clamp(v, 0, maxValue);
      draw();
    },
  };
}

// ── 3. neonInventoryGrid ──────────────────────────────────────────────────

interface CellData {
  icon: string;
  count: number;
  iconTxt: Phaser.GameObjects.Text | null;
  countTxt: Phaser.GameObjects.Text | null;
}

export function neonInventoryGrid(
  scene: Phaser.Scene,
  x: number, y: number,
  cols: number, rows: number,
  cellSize: number, color: number,
): InventoryGridHandle {
  const pad = 2;
  const gridW = cols * (cellSize + pad) + pad;
  const gridH = rows * (cellSize + pad) + pad;
  const colorStr = hexStr(color);

  const bgG = scene.add.graphics();
  const cellG = scene.add.graphics();

  const cells: CellData[][] = [];
  const zones: Phaser.GameObjects.Zone[] = [];
  const hoveredCell = { col: -1, row: -1 };

  // Init cell data
  for (let r = 0; r < rows; r++) {
    cells[r] = [];
    for (let c = 0; c < cols; c++) {
      cells[r][c] = { icon: '', count: 0, iconTxt: null, countTxt: null };
    }
  }

  function cellX(col: number): number { return x + pad + col * (cellSize + pad); }
  function cellY(row: number): number { return y + pad + row * (cellSize + pad); }

  function draw(): void {
    bgG.clear();
    NeonUI.drawPanel(bgG, x, y, gridW, gridH, color, 0.85);

    cellG.clear();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = cellX(c);
        const cy = cellY(r);
        const hovered = hoveredCell.col === c && hoveredCell.row === r;

        // Cell background
        cellG.fillStyle(0x010510, 0.9);
        cellG.fillRect(cx, cy, cellSize, cellSize);

        if (hovered) {
          cellG.fillStyle(color, 0.15);
          cellG.fillRect(cx, cy, cellSize, cellSize);
          cellG.lineStyle(1.5, color, 1.0);
        } else {
          cellG.lineStyle(1, color, 0.35);
        }
        cellG.strokeRect(cx, cy, cellSize, cellSize);
      }
    }
  }

  draw();

  // Create zones for hover
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = cellX(c) + cellSize / 2;
      const cy = cellY(r) + cellSize / 2;
      const zone = scene.add.zone(cx, cy, cellSize, cellSize).setInteractive();
      const col = c;
      const row = r;
      zone.on('pointerover', () => { hoveredCell.col = col; hoveredCell.row = row; draw(); });
      zone.on('pointerout', () => { hoveredCell.col = -1; hoveredCell.row = -1; draw(); });
      zones.push(zone);
    }
  }

  return {
    destroy(): void {
      bgG.destroy();
      cellG.destroy();
      for (const z of zones) z.destroy();
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          cells[r][c].iconTxt?.destroy();
          cells[r][c].countTxt?.destroy();
        }
      }
    },
    setItem(col: number, row: number, icon: string, count?: number): void {
      if (row < 0 || row >= rows || col < 0 || col >= cols) return;
      const cell = cells[row][col];
      cell.icon = icon;
      cell.count = count ?? 0;

      // Icon text
      if (!cell.iconTxt) {
        cell.iconTxt = scene.add.text(
          cellX(col) + cellSize / 2,
          cellY(row) + cellSize / 2,
          icon,
          NeonUI.neonTextStyle(colorStr, 14, false),
        ).setOrigin(0.5);
      } else {
        cell.iconTxt.setText(icon);
      }

      // Count badge
      if (cell.count > 0) {
        if (!cell.countTxt) {
          cell.countTxt = scene.add.text(
            cellX(col) + cellSize - 4,
            cellY(row) + cellSize - 4,
            String(cell.count),
            NeonUI.neonTextStyle(NEON_STR.cyan, 10, true),
          ).setOrigin(1, 1);
        } else {
          cell.countTxt.setText(String(cell.count));
          cell.countTxt.setVisible(true);
        }
      } else {
        cell.countTxt?.setVisible(false);
      }
    },
    clearItem(col: number, row: number): void {
      if (row < 0 || row >= rows || col < 0 || col >= cols) return;
      const cell = cells[row][col];
      cell.icon = '';
      cell.count = 0;
      cell.iconTxt?.destroy();
      cell.iconTxt = null;
      cell.countTxt?.destroy();
      cell.countTxt = null;
    },
  };
}

// ── 4. neonItemSlot ───────────────────────────────────────────────────────

export function neonItemSlot(
  scene: Phaser.Scene,
  x: number, y: number,
  size: number, color: number,
): ItemSlotHandle {
  const colorStr = hexStr(color);
  const g = scene.add.graphics();
  let hovered = false;

  let iconTxt: Phaser.GameObjects.Text | null = null;
  let countTxt: Phaser.GameObjects.Text | null = null;
  let currentCount = 0;

  function draw(): void {
    g.clear();

    // Outer glow
    if (hovered) {
      g.fillStyle(color, 0.12);
      g.fillRect(x - 4, y - 4, size + 8, size + 8);
    } else {
      g.fillStyle(color, 0.04);
      g.fillRect(x - 3, y - 3, size + 6, size + 6);
    }

    // Dark fill
    g.fillStyle(0x010510, 0.92);
    g.fillRect(x, y, size, size);

    // Border
    g.lineStyle(hovered ? 2 : 1.5, color, hovered ? 1.0 : 0.5);
    g.strokeRect(x, y, size, size);
  }

  draw();

  const zone = scene.add.zone(x + size / 2, y + size / 2, size, size).setInteractive();
  zone.on('pointerover', () => { hovered = true; draw(); });
  zone.on('pointerout', () => { hovered = false; draw(); });

  return {
    destroy(): void {
      g.destroy();
      zone.destroy();
      iconTxt?.destroy();
      countTxt?.destroy();
    },
    setIcon(icon: string): void {
      if (!iconTxt) {
        iconTxt = scene.add.text(
          x + size / 2, y + size / 2, icon,
          NeonUI.neonTextStyle(colorStr, 14, false),
        ).setOrigin(0.5);
      } else {
        iconTxt.setText(icon);
      }
    },
    setCount(n: number): void {
      currentCount = n;
      if (n > 0) {
        if (!countTxt) {
          countTxt = scene.add.text(
            x + size - 4, y + size - 4, String(n),
            NeonUI.neonTextStyle(NEON_STR.cyan, 10, true),
          ).setOrigin(1, 1);
        } else {
          countTxt.setText(String(n));
          countTxt.setVisible(true);
        }
      } else {
        countTxt?.setVisible(false);
      }
    },
    clear(): void {
      iconTxt?.destroy();
      iconTxt = null;
      countTxt?.destroy();
      countTxt = null;
      currentCount = 0;
    },
  };
}

// ── 5. neonSkillBar ───────────────────────────────────────────────────────

interface SkillSlotData {
  icon: string;
  cooldown: number;
  iconTxt: Phaser.GameObjects.Text | null;
  cdOverlayG: Phaser.GameObjects.Graphics | null;
  cdTxt: Phaser.GameObjects.Text | null;
}

export function neonSkillBar(
  scene: Phaser.Scene,
  x: number, y: number,
  slots: number, slotSize: number,
  color: number,
): SkillBarHandle {
  const gap = 4;
  const colorStr = hexStr(color);
  const g = scene.add.graphics();
  const slotData: SkillSlotData[] = [];

  for (let i = 0; i < slots; i++) {
    slotData.push({ icon: '', cooldown: 0, iconTxt: null, cdOverlayG: null, cdTxt: null });
  }

  function slotX(index: number): number { return x + index * (slotSize + gap); }

  function draw(): void {
    g.clear();
    for (let i = 0; i < slots; i++) {
      const sx = slotX(i);

      // Outer glow
      g.fillStyle(color, 0.04);
      g.fillRect(sx - 2, y - 2, slotSize + 4, slotSize + 4);

      // Dark fill
      g.fillStyle(0x010510, 0.92);
      g.fillRect(sx, y, slotSize, slotSize);

      // Border
      g.lineStyle(1.5, color, 0.5);
      g.strokeRect(sx, y, slotSize, slotSize);
    }
  }

  draw();

  function drawCooldown(index: number): void {
    const sd = slotData[index];
    const sx = slotX(index);

    if (sd.cooldown > 0) {
      if (!sd.cdOverlayG) {
        sd.cdOverlayG = scene.add.graphics();
      }
      sd.cdOverlayG.clear();
      sd.cdOverlayG.fillStyle(0x000000, 0.6);
      sd.cdOverlayG.fillRect(sx + 1, y + 1, slotSize - 2, slotSize - 2);

      if (!sd.cdTxt) {
        sd.cdTxt = scene.add.text(
          sx + slotSize / 2, y + slotSize / 2,
          String(Math.ceil(sd.cooldown)),
          NeonUI.neonTextStyle(NEON_STR.red, 12, true),
        ).setOrigin(0.5);
      } else {
        sd.cdTxt.setText(String(Math.ceil(sd.cooldown)));
        sd.cdTxt.setVisible(true);
      }
    } else {
      sd.cdOverlayG?.clear();
      sd.cdTxt?.setVisible(false);
    }
  }

  return {
    destroy(): void {
      g.destroy();
      for (const sd of slotData) {
        sd.iconTxt?.destroy();
        sd.cdOverlayG?.destroy();
        sd.cdTxt?.destroy();
      }
    },
    setSkill(index: number, icon: string, cooldown?: number): void {
      if (index < 0 || index >= slots) return;
      const sd = slotData[index];
      sd.icon = icon;
      sd.cooldown = cooldown ?? 0;

      const sx = slotX(index);
      if (!sd.iconTxt) {
        sd.iconTxt = scene.add.text(
          sx + slotSize / 2, y + slotSize / 2, icon,
          NeonUI.neonTextStyle(colorStr, 14, false),
        ).setOrigin(0.5);
      } else {
        sd.iconTxt.setText(icon);
      }

      drawCooldown(index);
    },
    clearSkill(index: number): void {
      if (index < 0 || index >= slots) return;
      const sd = slotData[index];
      sd.icon = '';
      sd.cooldown = 0;
      sd.iconTxt?.destroy();
      sd.iconTxt = null;
      sd.cdOverlayG?.destroy();
      sd.cdOverlayG = null;
      sd.cdTxt?.destroy();
      sd.cdTxt = null;
    },
  };
}

// ── 6. neonHotkeyBar ─────────────────────────────────────────────────────

export function neonHotkeyBar(
  scene: Phaser.Scene,
  x: number, y: number,
  keys: string[], slotSize: number,
  color: number,
): HotkeyBarHandle {
  const gap = 4;
  const colorStr = hexStr(color);
  const g = scene.add.graphics();

  interface HKSlotData {
    icon: string;
    iconTxt: Phaser.GameObjects.Text | null;
  }

  const slotData: HKSlotData[] = [];
  const keyLabels: Phaser.GameObjects.Text[] = [];

  function slotX(index: number): number { return x + index * (slotSize + gap); }

  for (let i = 0; i < keys.length; i++) {
    slotData.push({ icon: '', iconTxt: null });

    // Key label below slot
    const kTxt = scene.add.text(
      slotX(i) + slotSize / 2, y + slotSize + 3,
      keys[i],
      NeonUI.neonTextStyle(colorStr, 10, true),
    ).setOrigin(0.5, 0);
    keyLabels.push(kTxt);
  }

  function draw(): void {
    g.clear();
    for (let i = 0; i < keys.length; i++) {
      const sx = slotX(i);

      // Outer glow
      g.fillStyle(color, 0.04);
      g.fillRect(sx - 2, y - 2, slotSize + 4, slotSize + 4);

      // Dark fill
      g.fillStyle(0x010510, 0.92);
      g.fillRect(sx, y, slotSize, slotSize);

      // Border
      g.lineStyle(1.5, color, 0.5);
      g.strokeRect(sx, y, slotSize, slotSize);
    }
  }

  draw();

  return {
    destroy(): void {
      g.destroy();
      for (const sd of slotData) sd.iconTxt?.destroy();
      for (const kl of keyLabels) kl.destroy();
    },
    setSlot(index: number, icon: string): void {
      if (index < 0 || index >= keys.length) return;
      const sd = slotData[index];
      sd.icon = icon;
      const sx = slotX(index);

      if (!sd.iconTxt) {
        sd.iconTxt = scene.add.text(
          sx + slotSize / 2, y + slotSize / 2, icon,
          NeonUI.neonTextStyle(colorStr, 14, false),
        ).setOrigin(0.5);
      } else {
        sd.iconTxt.setText(icon);
      }
    },
    clearSlot(index: number): void {
      if (index < 0 || index >= keys.length) return;
      const sd = slotData[index];
      sd.icon = '';
      sd.iconTxt?.destroy();
      sd.iconTxt = null;
    },
  };
}

// ── 7. neonTimeline ───────────────────────────────────────────────────────

export function neonTimeline(
  scene: Phaser.Scene,
  x: number, y: number,
  w: number, h: number,
  events: TimelineEvent[],
  maxTime: number, color: number,
): TimelineHandle {
  const colorStr = hexStr(color);
  let currentTime = 0;

  const g = scene.add.graphics();
  const indicatorG = scene.add.graphics();
  const texts: Phaser.GameObjects.Text[] = [];
  const zones: Phaser.GameObjects.Zone[] = [];
  // Each marker owns its own tooltip ref to avoid cross-marker races.
  const tooltips: (Phaser.GameObjects.Text | null)[] = [];

  const trackY = y + 10;
  const trackH = Math.max(h - 30, 8);

  function draw(): void {
    g.clear();

    // Dark track background
    g.fillStyle(0x0a0f1a, 0.95);
    g.fillRect(x, trackY, w, trackH);

    // Outer glow
    g.fillStyle(color, 0.04);
    g.fillRect(x - 3, trackY - 3, w + 6, trackH + 6);

    // Border
    g.lineStyle(1.5, color, 0.6);
    g.strokeRect(x, trackY, w, trackH);

    // Event markers
    for (const evt of events) {
      const frac = Phaser.Math.Clamp(evt.time / maxTime, 0, 1);
      const ex = x + frac * w;
      const ec = evt.color ?? color;

      // Dot
      g.fillStyle(ec, 0.9);
      g.fillCircle(ex, trackY + trackH / 2, 4);
      g.lineStyle(1, ec, 0.6);
      g.strokeCircle(ex, trackY + trackH / 2, 4);
    }
  }

  function drawIndicator(): void {
    indicatorG.clear();
    const frac = Phaser.Math.Clamp(currentTime / maxTime, 0, 1);
    const ix = x + frac * w;

    // Current time vertical line
    indicatorG.lineStyle(2, NEON.cyan, 0.9);
    indicatorG.beginPath();
    indicatorG.moveTo(ix, trackY - 4);
    indicatorG.lineTo(ix, trackY + trackH + 4);
    indicatorG.strokePath();

    // Small triangle at top
    indicatorG.fillStyle(NEON.cyan, 0.9);
    indicatorG.fillTriangle(ix - 4, trackY - 6, ix + 4, trackY - 6, ix, trackY - 1);
  }

  // Create timestamp texts and hover zones for events
  for (let ei = 0; ei < events.length; ei++) {
    const evt = events[ei];
    const frac = Phaser.Math.Clamp(evt.time / maxTime, 0, 1);
    const ex = x + frac * w;
    const ec = evt.color ?? color;
    const ecStr = hexStr(ec);

    // Timestamp below marker
    const ts = scene.add.text(
      ex, trackY + trackH + 4,
      String(Math.round(evt.time)),
      NeonUI.neonTextStyle(ecStr, 10, false),
    ).setOrigin(0.5, 0);
    texts.push(ts);

    tooltips.push(null);

    // Hover zone for label tooltip — each zone tracks its own tip ref.
    const zone = scene.add.zone(ex, trackY + trackH / 2, 16, trackH + 8).setInteractive();
    zone.on('pointerover', () => {
      tooltips[ei]?.destroy();
      tooltips[ei] = scene.add.text(
        ex, trackY - 16, evt.label,
        NeonUI.neonTextStyle(ecStr, 10, true),
      ).setOrigin(0.5, 1);
    });
    zone.on('pointerout', () => {
      tooltips[ei]?.destroy();
      tooltips[ei] = null;
    });
    zones.push(zone);
  }

  draw();
  drawIndicator();

  return {
    destroy(): void {
      g.destroy();
      indicatorG.destroy();
      for (const t of texts) t.destroy();
      for (const z of zones) z.destroy();
      for (const tip of tooltips) tip?.destroy();
    },
    setCurrentTime(t: number): void {
      currentTime = Phaser.Math.Clamp(t, 0, maxTime);
      drawIndicator();
    },
  };
}

// ── 8. neonCombatLog ──────────────────────────────────────────────────────

export function neonCombatLog(
  scene: Phaser.Scene,
  x: number, y: number,
  w: number, h: number,
  color: number,
): CombatLogHandle {
  const titleH = 20;
  const entryH = 16;
  const padX = 6;
  const padY = 4;
  const contentH = h - titleH - padY;
  const maxEntries = Math.max(Math.floor(contentH / entryH), 1);
  const colorStr = hexStr(color);

  const g = scene.add.graphics();
  const entryTexts: Phaser.GameObjects.Text[] = [];

  // Title
  const titleTxt = scene.add.text(
    x + w / 2, y + titleH / 2, 'COMBAT LOG',
    NeonUI.neonTextStyle(colorStr, 10, true),
  ).setOrigin(0.5);

  function drawPanel(): void {
    g.clear();
    NeonUI.drawPanel(g, x, y, w, h, color, 0.9);
    NeonUI.drawDivider(g, x + 4, y + titleH, x + w - 4, y + titleH, color);
  }

  drawPanel();

  // Mask: create a graphics mask to clip entries to the panel area
  const maskShape = scene.make.graphics({ x: 0, y: 0 });
  maskShape.fillStyle(0xffffff);
  maskShape.fillRect(x, y + titleH + padY, w, contentH);
  const mask = maskShape.createGeometryMask();

  interface LogEntry {
    text: string;
    color: string;
  }

  const entries: LogEntry[] = [];

  function renderEntries(): void {
    // Destroy old texts
    for (const t of entryTexts) t.destroy();
    entryTexts.length = 0;

    // Render visible entries
    const startIdx = Math.max(entries.length - maxEntries, 0);
    const visible = entries.slice(startIdx);

    for (let i = 0; i < visible.length; i++) {
      const ey = y + titleH + padY + i * entryH;
      const t = scene.add.text(
        x + padX, ey, visible[i].text,
        {
          fontSize: '10px',
          color: visible[i].color,
          fontFamily: 'monospace',
          wordWrap: { width: w - padX * 2 },
        },
      ).setMask(mask);
      entryTexts.push(t);
    }
  }

  return {
    destroy(): void {
      g.destroy();
      titleTxt.destroy();
      maskShape.destroy();
      for (const t of entryTexts) t.destroy();
    },
    addEntry(text: string, entryColor?: string): void {
      entries.push({ text, color: entryColor ?? '#88aacc' });
      // Trim oldest entries beyond a reasonable buffer
      if (entries.length > maxEntries * 3) {
        entries.splice(0, entries.length - maxEntries);
      }
      renderEntries();
    },
    clear(): void {
      entries.length = 0;
      renderEntries();
    },
  };
}
