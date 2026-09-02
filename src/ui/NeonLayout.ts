import Phaser from 'phaser';
import { NeonUI } from './NeonUI';
import { NEON } from '../constants/ui.constants';

const colorToStr = NeonUI.colorToStr;

// ── 1. neonTitledPanel ──────────────────────────────────────────────────

interface TitledPanelHandle {
  destroy(): void;
}

/**
 * Panel with a title embedded in the top border.
 * Position (x, y) is the top-left corner.
 */
export function neonTitledPanel(
  scene: Phaser.Scene,
  x: number, y: number, w: number, h: number,
  title: string, color: number,
): TitledPanelHandle {
  const g = scene.add.graphics();
  NeonUI.drawPanel(g, x, y, w, h, color);

  const padX = 12;
  const titleTxt = scene.add.text(
    x + padX, y,
    title,
    NeonUI.neonTextStyle(colorToStr(color), 12, true),
  ).setOrigin(0, 0.5);

  // Draw a small dark rect behind the title to "cut" the border
  const titleW = titleTxt.width + 8;
  const bgG = scene.add.graphics();
  bgG.fillStyle(0x0a0f1a, 1);
  bgG.fillRect(x + padX - 4, y - 7, titleW, 14);
  // Redraw title on top
  titleTxt.setDepth(titleTxt.depth + 1);

  return {
    destroy(): void {
      g.destroy();
      bgG.destroy();
      titleTxt.destroy();
    },
  };
}

// ── 2. neonCard ─────────────────────────────────────────────────────────

interface CardHandle {
  destroy(): void;
}

/**
 * Panel with title, divider, and word-wrapped body text.
 * Height is auto-calculated from content.
 */
export function neonCard(
  scene: Phaser.Scene,
  x: number, y: number, w: number,
  title: string, body: string, color: number,
): CardHandle {
  const padX = 10;
  const padY = 10;
  const cStr = colorToStr(color);

  // Title text (bold, 13px)
  const titleTxt = scene.add.text(
    x + padX, y + padY,
    title,
    NeonUI.neonTextStyle(cStr, 13, true),
  ).setOrigin(0, 0);

  const dividerY = y + padY + titleTxt.height + 6;

  // Body text (11px, word-wrapped)
  const bodyTxt = scene.add.text(
    x + padX, dividerY + 8,
    body,
    {
      ...NeonUI.neonTextStyle(cStr, 11),
      wordWrap: { width: w - padX * 2 },
    },
  ).setOrigin(0, 0);

  const totalH = padY + titleTxt.height + 6 + 8 + bodyTxt.height + padY;

  // Panel background
  const g = scene.add.graphics();
  NeonUI.drawPanel(g, x, y, w, totalH, color);

  // Divider
  const divG = scene.add.graphics();
  NeonUI.drawDivider(divG, x + padX, dividerY, x + w - padX, dividerY, color);

  // Ensure text is above panel
  titleTxt.setDepth(1);
  bodyTxt.setDepth(1);
  divG.setDepth(1);

  return {
    destroy(): void {
      g.destroy();
      divG.destroy();
      titleTxt.destroy();
      bodyTxt.destroy();
    },
  };
}

// ── 3. neonTabs ─────────────────────────────────────────────────────────

interface TabsHandle {
  destroy(): void;
  getActiveTab(): string;
  setActiveTab(key: string): void;
}

/**
 * Horizontal tab strip. Active tab has bright border+fill; inactive is dim.
 * Returns only the tab bar; content area is up to the caller.
 */
export function neonTabs(
  scene: Phaser.Scene,
  x: number, y: number, w: number, tabH: number,
  tabs: { key: string; label: string }[],
  color: number,
  onChange: (key: string) => void,
): TabsHandle {
  let activeKey = tabs.length > 0 ? tabs[0].key : '';
  const cStr = colorToStr(color);
  const tabW = Math.floor(w / tabs.length);

  const gfx = scene.add.graphics();
  const texts: Phaser.GameObjects.Text[] = [];
  const zones: Phaser.GameObjects.Zone[] = [];

  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];
    const tx = x + i * tabW;

    const txt = scene.add.text(
      tx + tabW / 2, y + tabH / 2,
      tab.label,
      NeonUI.neonTextStyle(cStr, 12, false),
    ).setOrigin(0.5, 0.5);
    texts.push(txt);

    const zone = scene.add.zone(tx + tabW / 2, y + tabH / 2, tabW, tabH)
      .setInteractive({ useHandCursor: true });

    zone.on('pointerdown', () => {
      activeKey = tab.key;
      redraw();
      onChange(tab.key);
    });

    zones.push(zone);
  }

  function redraw(): void {
    gfx.clear();
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      const tx = x + i * tabW;
      const isActive = tab.key === activeKey;

      if (isActive) {
        // Bright fill + border
        gfx.fillStyle(color, 0.15);
        gfx.fillRect(tx, y, tabW, tabH);
        gfx.lineStyle(2, color, 1);
        gfx.strokeRect(tx, y, tabW, tabH);
      } else {
        // Dim fill + border
        gfx.fillStyle(0x0a0f1a, 0.9);
        gfx.fillRect(tx, y, tabW, tabH);
        gfx.lineStyle(1, color, 0.3);
        gfx.strokeRect(tx, y, tabW, tabH);
      }

      texts[i].setAlpha(isActive ? 1.0 : 0.5);
    }
  }

  redraw();

  return {
    destroy(): void {
      gfx.destroy();
      for (const t of texts) t.destroy();
      for (const z of zones) z.destroy();
    },
    getActiveTab(): string {
      return activeKey;
    },
    setActiveTab(key: string): void {
      activeKey = key;
      redraw();
    },
  };
}

// ── 4. neonAccordion ────────────────────────────────────────────────────

interface AccordionHandle {
  destroy(): void;
  toggle(key: string): void;
}

/**
 * Vertical list of collapsible sections.
 * Each header is 32px high with a clickable toggle arrow.
 */
export function neonAccordion(
  scene: Phaser.Scene,
  x: number, y: number, w: number,
  sections: { key: string; title: string; contentH: number }[],
  color: number,
): AccordionHandle {
  const HEADER_H = 32;
  const cStr = colorToStr(color);

  const expanded = new Set<string>();
  const gfx = scene.add.graphics();
  const texts: Phaser.GameObjects.Text[] = [];
  const zones: Phaser.GameObjects.Zone[] = [];

  function redraw(): void {
    gfx.clear();
    // Destroy old texts and zones
    for (const t of texts) t.destroy();
    for (const z of zones) z.destroy();
    texts.length = 0;
    zones.length = 0;

    let cy = y;
    for (const sec of sections) {
      const isExpanded = expanded.has(sec.key);
      const arrow = isExpanded ? '\u25BE' : '\u25B8'; // ▾ or ▸

      // Header bar
      NeonUI.drawButton(gfx, x, cy, w, HEADER_H, color, false);

      const txt = scene.add.text(
        x + 10, cy + HEADER_H / 2,
        `${arrow} ${sec.title}`,
        NeonUI.neonTextStyle(cStr, 12, true),
      ).setOrigin(0, 0.5);
      texts.push(txt);

      const zone = scene.add.zone(x + w / 2, cy + HEADER_H / 2, w, HEADER_H)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        if (expanded.has(sec.key)) {
          expanded.delete(sec.key);
        } else {
          expanded.add(sec.key);
        }
        redraw();
      });
      zones.push(zone);

      cy += HEADER_H;

      if (isExpanded) {
        // Content area background
        NeonUI.drawPanel(gfx, x, cy, w, sec.contentH, color, 0.7);
        cy += sec.contentH;
      }
    }
  }

  redraw();

  return {
    destroy(): void {
      gfx.destroy();
      for (const t of texts) t.destroy();
      for (const z of zones) z.destroy();
    },
    toggle(key: string): void {
      if (expanded.has(key)) {
        expanded.delete(key);
      } else {
        expanded.add(key);
      }
      redraw();
    },
  };
}

// ── 5. neonScrollContainer ──────────────────────────────────────────────

interface ScrollContainerHandle {
  destroy(): void;
  getScrollY(): number;
  setScrollY(y: number): void;
}

/**
 * Scroll tracking container with a visual scrollbar.
 * Does NOT mask content -- just provides scroll position and a thumb.
 */
export function neonScrollContainer(
  scene: Phaser.Scene,
  x: number, y: number, w: number, h: number,
  contentH: number, color: number,
): ScrollContainerHandle {
  const TRACK_W = 8;
  let scrollY = 0;
  const maxScroll = Math.max(0, contentH - h);

  const gfx = scene.add.graphics();

  function redraw(): void {
    gfx.clear();

    // Panel border
    NeonUI.drawPanel(gfx, x, y, w, h, color);

    if (contentH <= h) return; // No scrollbar needed

    // Scrollbar track
    const trackX = x + w - TRACK_W - 2;
    const trackY = y + 2;
    const trackH = h - 4;

    gfx.fillStyle(0x0a0f1a, 0.8);
    gfx.fillRect(trackX, trackY, TRACK_W, trackH);
    gfx.lineStyle(1, color, 0.2);
    gfx.strokeRect(trackX, trackY, TRACK_W, trackH);

    // Thumb
    const thumbRatio = h / contentH;
    const thumbH = Math.max(20, trackH * thumbRatio);
    const scrollRatio = maxScroll > 0 ? scrollY / maxScroll : 0;
    const thumbY = trackY + scrollRatio * (trackH - thumbH);

    gfx.fillStyle(color, 0.5);
    gfx.fillRect(trackX, thumbY, TRACK_W, thumbH);
    gfx.lineStyle(1, color, 0.7);
    gfx.strokeRect(trackX, thumbY, TRACK_W, thumbH);
  }

  redraw();

  // Hit zone for wheel events
  const zone = scene.add.zone(x + w / 2, y + h / 2, w, h)
    .setInteractive();

  zone.on('wheel', (_pointer: Phaser.Input.Pointer, _dx: number, dy: number) => {
    if (maxScroll <= 0) return;
    scrollY = Phaser.Math.Clamp(scrollY + dy * 0.5, 0, maxScroll);
    redraw();
  });

  return {
    destroy(): void {
      gfx.destroy();
      zone.destroy();
    },
    getScrollY(): number {
      return scrollY;
    },
    setScrollY(val: number): void {
      scrollY = Phaser.Math.Clamp(val, 0, maxScroll);
      redraw();
    },
  };
}

// ── 6. neonToolbar ──────────────────────────────────────────────────────

interface ToolbarHandle {
  destroy(): void;
}

/**
 * Horizontal toolbar with icon buttons evenly spaced.
 * Shows a tooltip above the bar on hover.
 */
export function neonToolbar(
  scene: Phaser.Scene,
  x: number, y: number, w: number, h: number,
  buttons: { icon: string; tooltip?: string; onClick: () => void }[],
  color: number,
): ToolbarHandle {
  const cStr = colorToStr(color);
  const gfx = scene.add.graphics();
  const zones: Phaser.GameObjects.Zone[] = [];
  const texts: Phaser.GameObjects.Text[] = [];
  let tooltipTxt: Phaser.GameObjects.Text | null = null;

  // Background bar
  NeonUI.drawPanel(gfx, x, y, w, h, color);

  const btnCount = buttons.length;
  const btnSize = Math.min(h - 8, (w - 8) / btnCount - 4);
  const totalBtnsW = btnCount * btnSize + (btnCount - 1) * 4;
  const startX = x + (w - totalBtnsW) / 2;

  const btnGfx = scene.add.graphics();

  function drawButtons(hoveredIdx: number): void {
    btnGfx.clear();
    for (let i = 0; i < btnCount; i++) {
      const bx = startX + i * (btnSize + 4);
      const by = y + (h - btnSize) / 2;
      NeonUI.drawButton(btnGfx, bx, by, btnSize, btnSize, color, i === hoveredIdx);
    }
  }

  drawButtons(-1);

  for (let i = 0; i < btnCount; i++) {
    const btn = buttons[i];
    const bx = startX + i * (btnSize + 4);
    const by = y + (h - btnSize) / 2;

    // Icon text centered in button
    const iconTxt = scene.add.text(
      bx + btnSize / 2, by + btnSize / 2,
      btn.icon,
      NeonUI.neonTextStyle(cStr, 14, false),
    ).setOrigin(0.5, 0.5);
    texts.push(iconTxt);

    const zone = scene.add.zone(bx + btnSize / 2, by + btnSize / 2, btnSize, btnSize)
      .setInteractive({ useHandCursor: true });

    zone.on('pointerover', () => {
      drawButtons(i);
      if (btn.tooltip) {
        tooltipTxt = scene.add.text(
          bx + btnSize / 2, y - 6,
          btn.tooltip,
          NeonUI.neonTextStyle(cStr, 10, false),
        ).setOrigin(0.5, 1);
      }
    });
    zone.on('pointerout', () => {
      drawButtons(-1);
      if (tooltipTxt) {
        tooltipTxt.destroy();
        tooltipTxt = null;
      }
    });
    zone.on('pointerdown', btn.onClick);

    zones.push(zone);
  }

  return {
    destroy(): void {
      gfx.destroy();
      btnGfx.destroy();
      for (const t of texts) t.destroy();
      for (const z of zones) z.destroy();
      if (tooltipTxt) tooltipTxt.destroy();
    },
  };
}

// ── 7. neonDividerH ────────────────────────────────────────────────────

interface DividerHandle {
  destroy(): void;
}

/**
 * Horizontal divider line.
 */
export function neonDividerH(
  scene: Phaser.Scene,
  x: number, y: number, w: number, color: number,
): DividerHandle {
  const g = scene.add.graphics();
  NeonUI.drawDivider(g, x, y, x + w, y, color);
  return {
    destroy(): void {
      g.destroy();
    },
  };
}

// ── 8. neonDividerV ────────────────────────────────────────────────────

/**
 * Vertical divider line.
 */
export function neonDividerV(
  scene: Phaser.Scene,
  x: number, y: number, h: number, color: number,
): DividerHandle {
  const g = scene.add.graphics();
  NeonUI.drawDivider(g, x, y, x, y + h, color);
  return {
    destroy(): void {
      g.destroy();
    },
  };
}

// ── 9. neonSplitPane ───────────────────────────────────────────────────

interface SplitPaneHandle {
  destroy(): void;
  getSplitRatio(): number;
}

/**
 * Two panels with a draggable divider between them.
 * isVertical=false: side by side (left|right).
 * isVertical=true: top/bottom.
 */
export function neonSplitPane(
  scene: Phaser.Scene,
  x: number, y: number, w: number, h: number,
  splitRatio: number, isVertical: boolean, color: number,
): SplitPaneHandle {
  const DIVIDER_SIZE = 4;
  let ratio = Phaser.Math.Clamp(splitRatio, 0.05, 0.95);
  let dragging = false;

  const gfx = scene.add.graphics();
  // Use a non-zero initial size — Phaser skips hitArea setup for 0×0 zones,
  // leaving hitAreaCallback undefined. redraw() will update position/size.
  const divZone = scene.add.zone(1, 1, 1, 1).setInteractive({ useHandCursor: true });

  function redraw(): void {
    gfx.clear();

    if (isVertical) {
      // Top panel
      const topH = Math.floor(h * ratio) - DIVIDER_SIZE / 2;
      NeonUI.drawPanel(gfx, x, y, w, topH, color);
      // Bottom panel
      const botY = y + topH + DIVIDER_SIZE;
      const botH = h - topH - DIVIDER_SIZE;
      NeonUI.drawPanel(gfx, x, botY, w, botH, color);
      // Divider
      NeonUI.drawDivider(gfx, x, y + topH + DIVIDER_SIZE / 2, x + w, y + topH + DIVIDER_SIZE / 2, color);
      // Zone
      divZone.setPosition(x + w / 2, y + topH + DIVIDER_SIZE / 2);
      divZone.setSize(w, DIVIDER_SIZE + 8);
    } else {
      // Left panel
      const leftW = Math.floor(w * ratio) - DIVIDER_SIZE / 2;
      NeonUI.drawPanel(gfx, x, y, leftW, h, color);
      // Right panel
      const rightX = x + leftW + DIVIDER_SIZE;
      const rightW = w - leftW - DIVIDER_SIZE;
      NeonUI.drawPanel(gfx, rightX, y, rightW, h, color);
      // Divider
      NeonUI.drawDivider(gfx, x + leftW + DIVIDER_SIZE / 2, y, x + leftW + DIVIDER_SIZE / 2, y + h, color);
      // Zone
      divZone.setPosition(x + leftW + DIVIDER_SIZE / 2, y + h / 2);
      divZone.setSize(DIVIDER_SIZE + 8, h);
    }
  }

  redraw();

  divZone.on('pointerdown', () => { dragging = true; });

  const onMove = (pointer: Phaser.Input.Pointer) => {
    if (!dragging) return;
    if (isVertical) {
      ratio = Phaser.Math.Clamp((pointer.worldY - y) / h, 0.05, 0.95);
    } else {
      ratio = Phaser.Math.Clamp((pointer.worldX - x) / w, 0.05, 0.95);
    }
    redraw();
  };
  const onUp = () => { dragging = false; };

  scene.input.on('pointermove', onMove);
  scene.input.on('pointerup', onUp);

  scene.events.once('shutdown', () => {
    scene.input.off('pointermove', onMove);
    scene.input.off('pointerup', onUp);
  });

  return {
    destroy(): void {
      scene.input.off('pointermove', onMove);
      scene.input.off('pointerup', onUp);
      gfx.destroy();
      divZone.destroy();
    },
    getSplitRatio(): number {
      return ratio;
    },
  };
}

// ── 10. neonResizablePanel ──────────────────────────────────────────────

interface ResizablePanelHandle {
  destroy(): void;
  getSize(): { w: number; h: number };
}

/**
 * Panel with a drag handle at the bottom-right corner for resizing.
 */
export function neonResizablePanel(
  scene: Phaser.Scene,
  x: number, y: number, w: number, h: number,
  minW: number, minH: number, color: number,
): ResizablePanelHandle {
  const HANDLE_SIZE = 14;
  let curW = w;
  let curH = h;
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let startW = w;
  let startH = h;

  const gfx = scene.add.graphics();
  // Non-zero initial size to ensure Phaser sets up hitAreaCallback correctly.
  const handleZone = scene.add.zone(1, 1, 1, 1).setInteractive({ useHandCursor: true });

  function redraw(): void {
    gfx.clear();
    NeonUI.drawPanel(gfx, x, y, curW, curH, color);

    // Resize handle triangle at bottom-right
    const hx = x + curW;
    const hy = y + curH;
    gfx.fillStyle(color, 0.4);
    gfx.fillTriangle(
      hx, hy,
      hx - HANDLE_SIZE, hy,
      hx, hy - HANDLE_SIZE,
    );
    gfx.lineStyle(1, color, 0.7);
    gfx.beginPath();
    gfx.moveTo(hx - HANDLE_SIZE, hy);
    gfx.lineTo(hx, hy - HANDLE_SIZE);
    gfx.strokePath();

    // Update handle zone position
    handleZone.setPosition(hx - HANDLE_SIZE / 2, hy - HANDLE_SIZE / 2);
    handleZone.setSize(HANDLE_SIZE + 6, HANDLE_SIZE + 6);
  }

  redraw();

  handleZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    dragging = true;
    dragStartX = pointer.worldX;
    dragStartY = pointer.worldY;
    startW = curW;
    startH = curH;
  });

  const onMove = (pointer: Phaser.Input.Pointer) => {
    if (!dragging) return;
    const dx = pointer.worldX - dragStartX;
    const dy = pointer.worldY - dragStartY;
    curW = Math.max(minW, startW + dx);
    curH = Math.max(minH, startH + dy);
    redraw();
  };
  const onUp = () => { dragging = false; };

  scene.input.on('pointermove', onMove);
  scene.input.on('pointerup', onUp);

  scene.events.once('shutdown', () => {
    scene.input.off('pointermove', onMove);
    scene.input.off('pointerup', onUp);
  });

  return {
    destroy(): void {
      scene.input.off('pointermove', onMove);
      scene.input.off('pointerup', onUp);
      gfx.destroy();
      handleZone.destroy();
    },
    getSize(): { w: number; h: number } {
      return { w: curW, h: curH };
    },
  };
}

// ── 11. neonGridLayout ──────────────────────────────────────────────────

interface GridLayoutHandle {
  destroy(): void;
  getCellPosition(index: number): { x: number; y: number; w: number; h: number };
}

/**
 * Draws grid lines for a cols x rows grid.
 * Returns positions for the caller to place content.
 */
export function neonGridLayout(
  scene: Phaser.Scene,
  x: number, y: number, w: number,
  cols: number, cellH: number, count: number, color: number,
): GridLayoutHandle {
  const cellW = Math.floor(w / cols);
  const rows = Math.ceil(count / cols);
  const totalH = rows * cellH;

  const gfx = scene.add.graphics();

  // Outer border
  NeonUI.drawPanel(gfx, x, y, w, totalH, color);

  // Grid lines
  gfx.lineStyle(1, color, 0.2);

  // Vertical lines (inner)
  for (let c = 1; c < cols; c++) {
    const lx = x + c * cellW;
    gfx.beginPath();
    gfx.moveTo(lx, y);
    gfx.lineTo(lx, y + totalH);
    gfx.strokePath();
  }

  // Horizontal lines (inner)
  for (let r = 1; r < rows; r++) {
    const ly = y + r * cellH;
    gfx.beginPath();
    gfx.moveTo(x, ly);
    gfx.lineTo(x + w, ly);
    gfx.strokePath();
  }

  return {
    destroy(): void {
      gfx.destroy();
    },
    getCellPosition(index: number): { x: number; y: number; w: number; h: number } {
      const col = index % cols;
      const row = Math.floor(index / cols);
      return {
        x: x + col * cellW,
        y: y + row * cellH,
        w: cellW,
        h: cellH,
      };
    },
  };
}

// ── 12. neonFlexRow ─────────────────────────────────────────────────────

interface FlexRowHandle {
  destroy(): void;
  getPositions(): { x: number; y: number }[];
}

/**
 * Horizontal layout helper. Draws panel backgrounds for each item
 * and returns positions for content placement.
 */
export function neonFlexRow(
  scene: Phaser.Scene,
  x: number, y: number, h: number,
  items: { w: number }[],
  gap: number, color: number,
): FlexRowHandle {
  const gfx = scene.add.graphics();
  const positions: { x: number; y: number }[] = [];

  let cx = x;
  for (const item of items) {
    NeonUI.drawPanel(gfx, cx, y, item.w, h, color);
    positions.push({ x: cx, y });
    cx += item.w + gap;
  }

  return {
    destroy(): void {
      gfx.destroy();
    },
    getPositions(): { x: number; y: number }[] {
      return positions.slice();
    },
  };
}

// ── 13. neonFlexColumn ──────────────────────────────────────────────────

interface FlexColumnHandle {
  destroy(): void;
  getPositions(): { x: number; y: number }[];
}

/**
 * Vertical layout helper. Draws panel backgrounds for each item
 * and returns positions for content placement.
 */
export function neonFlexColumn(
  scene: Phaser.Scene,
  x: number, y: number, w: number,
  items: { h: number }[],
  gap: number, color: number,
): FlexColumnHandle {
  const gfx = scene.add.graphics();
  const positions: { x: number; y: number }[] = [];

  let cy = y;
  for (const item of items) {
    NeonUI.drawPanel(gfx, x, cy, w, item.h, color);
    positions.push({ x, y: cy });
    cy += item.h + gap;
  }

  return {
    destroy(): void {
      gfx.destroy();
    },
    getPositions(): { x: number; y: number }[] {
      return positions.slice();
    },
  };
}
