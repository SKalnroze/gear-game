import Phaser from 'phaser';
import { NeonUI } from './NeonUI';

// ── Types ─────────────────────────────────────────────────────────────────────

export type NeonTreeNode = {
  key: string;
  label: string;
  children?: NeonTreeNode[];
};

type NeonColumnDef = { key: string; label: string; width: number };

const colorToStr = NeonUI.colorToStr;

// ── 1. neonTable ──────────────────────────────────────────────────────────────

interface NeonTableHandle {
  destroy(): void;
}

/**
 * Data table with header row, alternating row backgrounds, and dividers.
 * Position (x, y) is the top-left corner.
 * Column widths are proportional weights.
 */
export function neonTable(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  columns: NeonColumnDef[],
  rows: Record<string, string>[],
  color: number,
): NeonTableHandle {
  const objs: Phaser.GameObjects.GameObject[] = [];
  const cStr = colorToStr(color);

  const HEADER_H = 28;
  const ROW_H = 24;
  const totalH = HEADER_H + rows.length * ROW_H;

  // Compute proportional column x-offsets
  const totalWeight = columns.reduce((s, c) => s + c.width, 0);
  const colXs: number[] = [];
  let cx = 0;
  for (const col of columns) {
    colXs.push(cx);
    cx += (col.width / totalWeight) * w;
  }
  const colWidths = columns.map((c) => (c.width / totalWeight) * w);

  // Panel background
  const g = scene.add.graphics();
  NeonUI.drawPanel(g, x, y, w, totalH, color);
  objs.push(g);

  // Header labels
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const tx = x + colXs[i] + 6;
    const ty = y + HEADER_H / 2;
    const txt = scene.add
      .text(tx, ty, col.label, NeonUI.neonTextStyle(cStr, 11, true))
      .setOrigin(0, 0.5);
    objs.push(txt);
  }

  // Header divider
  const divG = scene.add.graphics();
  NeonUI.drawDivider(divG, x, y + HEADER_H, x + w, y + HEADER_H, color);
  objs.push(divG);

  // Vertical dividers between columns
  const vDivG = scene.add.graphics();
  for (let i = 1; i < columns.length; i++) {
    const dx = x + colXs[i];
    NeonUI.drawDivider(vDivG, dx, y, dx, y + totalH, color);
  }
  objs.push(vDivG);

  // Data rows
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const ry = y + HEADER_H + r * ROW_H;

    // Alternating subtle background
    if (r % 2 === 1) {
      const rowG = scene.add.graphics();
      rowG.fillStyle(color, 0.04);
      rowG.fillRect(x + 1, ry, w - 2, ROW_H);
      objs.push(rowG);
    }

    for (let c = 0; c < columns.length; c++) {
      const col = columns[c];
      const val = row[col.key] ?? '';
      const tx = x + colXs[c] + 6;
      const ty = ry + ROW_H / 2;
      const txt = scene.add
        .text(tx, ty, val, NeonUI.neonTextStyle(cStr, 10))
        .setOrigin(0, 0.5);
      // Clip text to column width
      txt.setCrop(0, 0, colWidths[c] - 12, ROW_H);
      objs.push(txt);
    }
  }

  return {
    destroy(): void {
      for (const obj of objs) obj.destroy();
    },
  };
}

// ── 2. neonList ───────────────────────────────────────────────────────────────

interface NeonListHandle {
  destroy(): void;
  getSelected(): number;
  setSelected(i: number): void;
}

/**
 * Selectable vertical list with hover/selected highlighting.
 * Position (x, y) is the top-left corner.
 */
export function neonList(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  itemH: number,
  items: string[],
  color: number,
  onSelect?: (index: number) => void,
): NeonListHandle {
  const objs: Phaser.GameObjects.GameObject[] = [];
  const cStr = colorToStr(color);

  let selectedIndex = -1;
  const totalH = items.length * itemH;

  // Panel border
  const panelG = scene.add.graphics();
  NeonUI.drawPanel(panelG, x, y, w, totalH, color);
  objs.push(panelG);

  // Per-item objects
  const itemGraphics: Phaser.GameObjects.Graphics[] = [];
  const itemTexts: Phaser.GameObjects.Text[] = [];
  const itemZones: Phaser.GameObjects.Zone[] = [];

  function drawItem(i: number, hovered: boolean): void {
    const ig = itemGraphics[i];
    const iy = y + i * itemH;
    ig.clear();
    if (i === selectedIndex) {
      ig.fillStyle(color, 0.15);
      ig.fillRect(x + 1, iy, w - 2, itemH);
      ig.lineStyle(1, color, 0.4);
      ig.strokeRect(x + 1, iy, w - 2, itemH);
    }
    if (hovered) {
      ig.fillStyle(color, 0.22);
      ig.fillRect(x + 1, iy, w - 2, itemH);
    }
  }

  function redrawAll(): void {
    for (let i = 0; i < items.length; i++) {
      drawItem(i, false);
      itemTexts[i].setAlpha(i === selectedIndex ? 1.0 : 0.6);
    }
  }

  for (let i = 0; i < items.length; i++) {
    const iy = y + i * itemH;

    const ig = scene.add.graphics();
    itemGraphics.push(ig);
    objs.push(ig);

    const txt = scene.add
      .text(x + 10, iy + itemH / 2, items[i], NeonUI.neonTextStyle(cStr, 11))
      .setOrigin(0, 0.5);
    txt.setCrop(0, 0, w - 20, itemH);
    itemTexts.push(txt);
    objs.push(txt);

    const zone = scene.add
      .zone(x + w / 2, iy + itemH / 2, w, itemH)
      .setInteractive({ useHandCursor: true });
    itemZones.push(zone);
    objs.push(zone);

    zone.on('pointerover', () => drawItem(i, true));
    zone.on('pointerout', () => drawItem(i, false));
    zone.on('pointerdown', () => {
      selectedIndex = i;
      redrawAll();
      if (onSelect) onSelect(i);
    });
  }

  return {
    destroy(): void {
      for (const obj of objs) obj.destroy();
    },
    getSelected(): number {
      return selectedIndex;
    },
    setSelected(i: number): void {
      selectedIndex = i;
      redrawAll();
    },
  };
}

// ── 3. neonTreeView ───────────────────────────────────────────────────────────

interface NeonTreeViewHandle {
  destroy(): void;
  toggle(path: string): void;
}

/**
 * Collapsible tree view with indentation and expand/collapse icons.
 * Position (x, y) is the top-left corner.
 * Initially all nodes are collapsed.
 */
export function neonTreeView(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  tree: NeonTreeNode[],
  color: number,
): NeonTreeViewHandle {
  const cStr = colorToStr(color);
  const ITEM_H = 24;
  const INDENT = 16;

  // Track expanded state by path (e.g. "root.child.grandchild")
  const expandedSet = new Set<string>();

  // All created game objects
  let objs: Phaser.GameObjects.GameObject[] = [];

  function flattenVisible(
    nodes: NeonTreeNode[],
    prefix: string,
    depth: number,
  ): { node: NeonTreeNode; path: string; depth: number; hasChildren: boolean; expanded: boolean }[] {
    const result: {
      node: NeonTreeNode;
      path: string;
      depth: number;
      hasChildren: boolean;
      expanded: boolean;
    }[] = [];
    for (const n of nodes) {
      const path = prefix ? `${prefix}.${n.key}` : n.key;
      const hasChildren = !!(n.children && n.children.length > 0);
      const expanded = expandedSet.has(path);
      result.push({ node: n, path, depth, hasChildren, expanded });
      if (hasChildren && expanded) {
        result.push(...flattenVisible(n.children!, path, depth + 1));
      }
    }
    return result;
  }

  function rebuild(): void {
    // Destroy previous objects (panelG is always in objs, no separate cleanup needed)
    for (const obj of objs) obj.destroy();
    objs = [];

    const visible = flattenVisible(tree, '', 0);
    const totalH = Math.max(visible.length * ITEM_H, ITEM_H);

    // Panel
    const panelG = scene.add.graphics();
    NeonUI.drawPanel(panelG, x, y, w, totalH, color);
    objs.push(panelG);

    for (let i = 0; i < visible.length; i++) {
      const item = visible[i];
      const iy = y + i * ITEM_H;
      const indent = item.depth * INDENT;

      // Item graphics (hover)
      const ig = scene.add.graphics();
      objs.push(ig);

      // Icon prefix
      let prefix: string;
      if (item.hasChildren) {
        prefix = item.expanded ? '\u25BE ' : '\u25B8 ';
      } else {
        prefix = '\u00B7 ';
      }

      const txt = scene.add
        .text(x + 8 + indent, iy + ITEM_H / 2, prefix + item.node.label, NeonUI.neonTextStyle(cStr, 11))
        .setOrigin(0, 0.5);
      txt.setCrop(0, 0, w - 16 - indent, ITEM_H);
      objs.push(txt);

      // Zone for interaction
      const zone = scene.add
        .zone(x + w / 2, iy + ITEM_H / 2, w, ITEM_H)
        .setInteractive({ useHandCursor: item.hasChildren });
      objs.push(zone);

      zone.on('pointerover', () => {
        ig.clear();
        ig.fillStyle(color, 0.15);
        ig.fillRect(x + 1, iy, w - 2, ITEM_H);
      });
      zone.on('pointerout', () => {
        ig.clear();
      });

      if (item.hasChildren) {
        zone.on('pointerdown', () => {
          if (expandedSet.has(item.path)) {
            expandedSet.delete(item.path);
          } else {
            expandedSet.add(item.path);
          }
          rebuild();
        });
      }
    }
  }

  rebuild();

  return {
    destroy(): void {
      for (const obj of objs) obj.destroy();
    },
    toggle(path: string): void {
      if (expandedSet.has(path)) {
        expandedSet.delete(path);
      } else {
        expandedSet.add(path);
      }
      rebuild();
    },
  };
}

// ── 4. neonPropertyInspector ──────────────────────────────────────────────────

interface NeonPropertyInspectorHandle {
  destroy(): void;
}

interface NeonPropertyDef {
  key: string;
  value: string;
  editable?: boolean;
}

/**
 * Two-column property inspector showing key-value pairs.
 * Position (x, y) is the top-left corner.
 */
export function neonPropertyInspector(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  props: NeonPropertyDef[],
  color: number,
): NeonPropertyInspectorHandle {
  const objs: Phaser.GameObjects.GameObject[] = [];
  const cStr = colorToStr(color);

  const ROW_H = 22;
  const totalH = props.length * ROW_H;
  const keyColW = w * 0.4;

  // Panel
  const g = scene.add.graphics();
  NeonUI.drawPanel(g, x, y, w, totalH, color);
  objs.push(g);

  // Vertical divider at 40%
  const divG = scene.add.graphics();
  NeonUI.drawDivider(divG, x + keyColW, y, x + keyColW, y + totalH, color);
  objs.push(divG);

  for (let i = 0; i < props.length; i++) {
    const prop = props[i];
    const ry = y + i * ROW_H;

    // Alternating row bg
    if (i % 2 === 1) {
      const rowG = scene.add.graphics();
      rowG.fillStyle(color, 0.03);
      rowG.fillRect(x + 1, ry, w - 2, ROW_H);
      objs.push(rowG);
    }

    // Key (dim)
    const keyTxt = scene.add
      .text(x + 6, ry + ROW_H / 2, prop.key, {
        fontSize: '11px',
        color: cStr,
        fontFamily: 'monospace',
        alpha: 0.55,
      } as Phaser.Types.GameObjects.Text.TextStyle)
      .setOrigin(0, 0.5)
      .setAlpha(0.55);
    keyTxt.setCrop(0, 0, keyColW - 12, ROW_H);
    objs.push(keyTxt);

    // Value (bright)
    const valTxt = scene.add
      .text(x + keyColW + 6, ry + ROW_H / 2, prop.value, NeonUI.neonTextStyle(cStr, 11))
      .setOrigin(0, 0.5);
    valTxt.setCrop(0, 0, w - keyColW - 12 - (prop.editable ? 16 : 0), ROW_H);
    objs.push(valTxt);

    // Editable indicator
    if (prop.editable) {
      const editTxt = scene.add
        .text(x + w - 18, ry + ROW_H / 2, '\u270E', {
          fontSize: '10px',
          color: cStr,
          fontFamily: 'monospace',
        })
        .setOrigin(0.5, 0.5)
        .setAlpha(0.4);
      objs.push(editTxt);
    }
  }

  return {
    destroy(): void {
      for (const obj of objs) obj.destroy();
    },
  };
}

// ── 5. neonPagination ─────────────────────────────────────────────────────────

interface NeonPaginationHandle {
  destroy(): void;
  getPage(): number;
  setPage(p: number): void;
}

/**
 * Horizontal pagination bar with page buttons and prev/next arrows.
 * Position (x, y) is the top-left corner.
 */
export function neonPagination(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  totalPages: number,
  currentPage: number,
  color: number,
  onChange: (page: number) => void,
): NeonPaginationHandle {
  const cStr = colorToStr(color);
  const BTN_H = 28;

  let page = Phaser.Math.Clamp(currentPage, 1, totalPages);
  let objs: Phaser.GameObjects.GameObject[] = [];

  function rebuild(): void {
    for (const obj of objs) obj.destroy();
    objs = [];

    // Determine which page numbers to show (max 5)
    const pageNums: (number | null)[] = []; // null = ellipsis
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pageNums.push(i);
    } else {
      if (page <= 3) {
        for (let i = 1; i <= 4; i++) pageNums.push(i);
        pageNums.push(null);
        pageNums.push(totalPages);
      } else if (page >= totalPages - 2) {
        pageNums.push(1);
        pageNums.push(null);
        for (let i = totalPages - 3; i <= totalPages; i++) pageNums.push(i);
      } else {
        pageNums.push(1);
        pageNums.push(null);
        pageNums.push(page - 1);
        pageNums.push(page);
        pageNums.push(page + 1);
        pageNums.push(null);
        pageNums.push(totalPages);
      }
    }

    // Total buttons: prev + pageNums + next
    const btnCount = pageNums.length + 2;
    const btnW = Math.min(Math.floor(w / btnCount), 40);
    const totalBtnsW = btnCount * btnW;
    const startX = x + Math.floor((w - totalBtnsW) / 2);

    // Prev button
    drawPageBtn(startX, '<', page > 1, false, () => {
      if (page > 1) {
        page--;
        onChange(page);
        rebuild();
      }
    });

    // Page buttons
    for (let i = 0; i < pageNums.length; i++) {
      const pn = pageNums[i];
      const bx = startX + (i + 1) * btnW;
      if (pn === null) {
        // Ellipsis
        const txt = scene.add
          .text(bx + btnW / 2, y + BTN_H / 2, '...', NeonUI.neonTextStyle(cStr, 10))
          .setOrigin(0.5, 0.5);
        objs.push(txt);
      } else {
        const isActive = pn === page;
        drawPageBtn(bx, String(pn), true, isActive, () => {
          page = pn;
          onChange(page);
          rebuild();
        });
      }
    }

    // Next button
    drawPageBtn(startX + (pageNums.length + 1) * btnW, '>', page < totalPages, false, () => {
      if (page < totalPages) {
        page++;
        onChange(page);
        rebuild();
      }
    });

    function drawPageBtn(
      bx: number,
      label: string,
      enabled: boolean,
      active: boolean,
      onClick: () => void,
    ): void {
      const bg = scene.add.graphics();

      function draw(hovered: boolean): void {
        bg.clear();
        if (active) {
          NeonUI.drawButton(bg, bx, y, btnW, BTN_H, color, true);
        } else {
          NeonUI.drawButton(bg, bx, y, btnW, BTN_H, color, hovered && enabled);
        }
      }
      draw(false);
      objs.push(bg);

      const alpha = enabled ? 1.0 : 0.3;
      const txt = scene.add
        .text(bx + btnW / 2, y + BTN_H / 2, label, NeonUI.neonTextStyle(cStr, 12, active))
        .setOrigin(0.5, 0.5)
        .setAlpha(alpha);
      objs.push(txt);

      const zone = scene.add
        .zone(bx + btnW / 2, y + BTN_H / 2, btnW, BTN_H)
        .setInteractive({ useHandCursor: enabled });
      objs.push(zone);

      zone.on('pointerover', () => draw(true));
      zone.on('pointerout', () => draw(false));
      if (enabled) {
        zone.on('pointerdown', onClick);
      }
    }
  }

  rebuild();

  return {
    destroy(): void {
      for (const obj of objs) obj.destroy();
    },
    getPage(): number {
      return page;
    },
    setPage(p: number): void {
      page = Phaser.Math.Clamp(p, 1, totalPages);
      onChange(page);
      rebuild();
    },
  };
}

// ── 6. neonContextMenu ────────────────────────────────────────────────────────

interface NeonContextMenuHandle {
  destroy(): void;
}

interface NeonContextMenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * Popup context menu at a given position (like right-click menu).
 * Auto-width based on longest label. Depth 700.
 * Click outside or clicking an enabled item closes the menu.
 */
export function neonContextMenu(
  scene: Phaser.Scene,
  x: number,
  y: number,
  items: NeonContextMenuItem[],
  color: number,
): NeonContextMenuHandle {
  const cStr = colorToStr(color);
  const ITEM_H = 30;
  const PAD_X = 14;
  const PAD_Y = 6;
  const DEPTH = 700;

  const objs: Phaser.GameObjects.GameObject[] = [];

  // Measure auto-width from longest label
  const measureTxt = scene.add.text(0, 0, '', { fontSize: '12px', fontFamily: 'monospace' });
  let maxLabelW = 60;
  for (const item of items) {
    measureTxt.setText(item.label);
    maxLabelW = Math.max(maxLabelW, measureTxt.width);
  }
  measureTxt.destroy();

  const menuW = maxLabelW + PAD_X * 2 + 10;
  const menuH = items.length * ITEM_H + PAD_Y * 2;

  // Panel background
  const panelG = scene.add.graphics().setDepth(DEPTH);
  NeonUI.drawPanel(panelG, x, y, menuW, menuH, color);
  objs.push(panelG);

  // Items
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const iy = y + PAD_Y + i * ITEM_H;

    const ig = scene.add.graphics().setDepth(DEPTH + 1);
    objs.push(ig);

    const alpha = item.disabled ? 0.3 : 1.0;
    const txt = scene.add
      .text(x + PAD_X, iy + ITEM_H / 2, item.label, NeonUI.neonTextStyle(cStr, 12))
      .setOrigin(0, 0.5)
      .setAlpha(alpha)
      .setDepth(DEPTH + 2);
    objs.push(txt);

    const zone = scene.add
      .zone(x + menuW / 2, iy + ITEM_H / 2, menuW, ITEM_H)
      .setInteractive({ useHandCursor: !item.disabled })
      .setDepth(DEPTH + 2);
    objs.push(zone);

    zone.on('pointerover', () => {
      if (item.disabled) return;
      ig.clear();
      ig.fillStyle(color, 0.22);
      ig.fillRect(x + 2, iy, menuW - 4, ITEM_H);
    });
    zone.on('pointerout', () => {
      ig.clear();
    });
    zone.on('pointerdown', () => {
      if (item.disabled) return;
      item.onClick();
      closeMenu();
    });
  }

  // Click outside to close
  let outsideHandler: ((p: Phaser.Input.Pointer) => void) | null = null;
  scene.time.delayedCall(0, () => {
    outsideHandler = (pointer: Phaser.Input.Pointer) => {
      const px = pointer.worldX;
      const py = pointer.worldY;
      if (px < x || px > x + menuW || py < y || py > y + menuH) {
        closeMenu();
      }
    };
    scene.input.on('pointerup', outsideHandler);
  });

  function closeMenu(): void {
    for (const obj of objs) obj.destroy();
    objs.length = 0;
    if (outsideHandler) {
      scene.input.off('pointerup', outsideHandler);
      outsideHandler = null;
    }
  }

  scene.events.once('shutdown', closeMenu);

  return {
    destroy(): void {
      closeMenu();
    },
  };
}

// ── 7. neonDropdownMenu ───────────────────────────────────────────────────────

interface NeonDropdownMenuHandle {
  destroy(): void;
}

interface NeonDropdownMenuItem {
  label: string;
  onClick?: () => void;
  submenu?: { label: string; onClick: () => void }[];
}

/**
 * Vertical dropdown menu with optional submenus.
 * Hover on items with submenu shows child menu to the right.
 * Click outside closes everything. Depth 700+.
 */
export function neonDropdownMenu(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  items: NeonDropdownMenuItem[],
  color: number,
): NeonDropdownMenuHandle {
  const cStr = colorToStr(color);
  const ITEM_H = 30;
  const PAD_Y = 4;
  const DEPTH = 700;

  const allObjs: Phaser.GameObjects.GameObject[] = [];
  let activeSubmenuObjs: Phaser.GameObjects.GameObject[] = [];
  let activeSubmenuIndex = -1;

  const menuH = items.length * ITEM_H + PAD_Y * 2;

  // Main panel
  const panelG = scene.add.graphics().setDepth(DEPTH);
  NeonUI.drawPanel(panelG, x, y, w, menuH, color);
  allObjs.push(panelG);

  // Item graphics/zones
  const itemGraphicsList: Phaser.GameObjects.Graphics[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const iy = y + PAD_Y + i * ITEM_H;
    const hasSubmenu = !!(item.submenu && item.submenu.length > 0);

    const ig = scene.add.graphics().setDepth(DEPTH + 1);
    itemGraphicsList.push(ig);
    allObjs.push(ig);

    const txt = scene.add
      .text(x + 12, iy + ITEM_H / 2, item.label, NeonUI.neonTextStyle(cStr, 12))
      .setOrigin(0, 0.5)
      .setDepth(DEPTH + 2);
    allObjs.push(txt);

    // Submenu arrow indicator
    if (hasSubmenu) {
      const arrowTxt = scene.add
        .text(x + w - 16, iy + ITEM_H / 2, '\u25B8', NeonUI.neonTextStyle(cStr, 11))
        .setOrigin(0.5, 0.5)
        .setDepth(DEPTH + 2);
      allObjs.push(arrowTxt);
    }

    const zone = scene.add
      .zone(x + w / 2, iy + ITEM_H / 2, w, ITEM_H)
      .setInteractive({ useHandCursor: true })
      .setDepth(DEPTH + 2);
    allObjs.push(zone);

    zone.on('pointerover', () => {
      // Clear other highlights
      for (let j = 0; j < itemGraphicsList.length; j++) {
        if (j !== i) itemGraphicsList[j].clear();
      }
      ig.clear();
      ig.fillStyle(color, 0.22);
      ig.fillRect(x + 2, iy, w - 4, ITEM_H);

      // Show submenu if this item has one
      if (hasSubmenu && activeSubmenuIndex !== i) {
        closeSubmenu();
        activeSubmenuIndex = i;
        openSubmenu(x + w, iy, item.submenu!);
      } else if (!hasSubmenu) {
        closeSubmenu();
      }
    });

    zone.on('pointerout', () => {
      if (activeSubmenuIndex !== i) {
        ig.clear();
      }
    });

    zone.on('pointerdown', () => {
      if (item.onClick) {
        item.onClick();
        closeAll();
      }
    });
  }

  function openSubmenu(sx: number, sy: number, subItems: { label: string; onClick: () => void }[]): void {
    closeSubmenu();

    const subH = subItems.length * ITEM_H + PAD_Y * 2;

    // Measure sub width
    const measureTxt = scene.add.text(0, 0, '', { fontSize: '12px', fontFamily: 'monospace' });
    let maxW = 80;
    for (const si of subItems) {
      measureTxt.setText(si.label);
      maxW = Math.max(maxW, measureTxt.width);
    }
    measureTxt.destroy();

    const finalSubW = maxW + 24;

    const subPanelG = scene.add.graphics().setDepth(DEPTH + 3);
    NeonUI.drawPanel(subPanelG, sx, sy, finalSubW, subH, color);
    activeSubmenuObjs.push(subPanelG);

    for (let j = 0; j < subItems.length; j++) {
      const si = subItems[j];
      const siy = sy + PAD_Y + j * ITEM_H;

      const sig = scene.add.graphics().setDepth(DEPTH + 4);
      activeSubmenuObjs.push(sig);

      const stxt = scene.add
        .text(sx + 12, siy + ITEM_H / 2, si.label, NeonUI.neonTextStyle(cStr, 12))
        .setOrigin(0, 0.5)
        .setDepth(DEPTH + 5);
      activeSubmenuObjs.push(stxt);

      const szone = scene.add
        .zone(sx + finalSubW / 2, siy + ITEM_H / 2, finalSubW, ITEM_H)
        .setInteractive({ useHandCursor: true })
        .setDepth(DEPTH + 5);
      activeSubmenuObjs.push(szone);

      szone.on('pointerover', () => {
        sig.clear();
        sig.fillStyle(color, 0.22);
        sig.fillRect(sx + 2, siy, finalSubW - 4, ITEM_H);
      });
      szone.on('pointerout', () => {
        sig.clear();
      });
      szone.on('pointerdown', () => {
        si.onClick();
        closeAll();
      });
    }
  }

  function closeSubmenu(): void {
    for (const obj of activeSubmenuObjs) obj.destroy();
    activeSubmenuObjs = [];
    activeSubmenuIndex = -1;
  }

  function closeAll(): void {
    closeSubmenu();
    for (const obj of allObjs) obj.destroy();
    allObjs.length = 0;
    if (outsideHandler) {
      scene.input.off('pointerup', outsideHandler);
      outsideHandler = null;
    }
  }

  // Click outside to close
  let outsideHandler: ((p: Phaser.Input.Pointer) => void) | null = null;
  scene.time.delayedCall(0, () => {
    outsideHandler = (pointer: Phaser.Input.Pointer) => {
      const px = pointer.worldX;
      const py = pointer.worldY;
      const inMain = px >= x && px <= x + w && py >= y && py <= y + menuH;
      // Check submenu bounds loosely — submenu could be anywhere to the right
      let inSub = false;
      if (activeSubmenuObjs.length > 0) {
        // Approximate: submenu starts at x+w and extends right
        inSub = px >= x + w && py >= y && py <= y + menuH + 200;
      }
      if (!inMain && !inSub) {
        closeAll();
      }
    };
    scene.input.on('pointerup', outsideHandler);
  });

  scene.events.once('shutdown', closeAll);

  return {
    destroy(): void {
      closeAll();
    },
  };
}
