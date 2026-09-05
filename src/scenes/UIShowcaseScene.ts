import Phaser from 'phaser';
import { NeonUI } from '../ui/NeonUI';
import { neonBtn, neonDropdown, neonSlider, neonTextInput, neonColorPicker, neonTwoSlider } from '../ui/NeonRex';
import {
  neonCheckbox, neonToggle, neonRadioGroup, neonTextarea,
  neonKeybindInput, neonIconBtn, neonBtnGroup, neonFilePicker,
  neonFormGroup, neonValidationMsg, neonDisabledOverlay,
} from '../ui/NeonForm';
import {
  neonTitledPanel, neonCard, neonTabs, neonAccordion,
  neonScrollContainer, neonToolbar, neonDividerH, neonDividerV,
  neonSplitPane, neonResizablePanel, neonGridLayout,
  neonFlexRow, neonFlexColumn,
} from '../ui/NeonLayout';
import {
  neonModal, neonToast, neonProgressBar, neonSpinner,
  neonBadge, neonAlert, neonStatusMsg,
} from '../ui/NeonFeedback';
import {
  neonTable, neonList, neonTreeView, type NeonTreeNode,
  neonPropertyInspector, neonPagination, neonContextMenu, neonDropdownMenu,
} from '../ui/NeonData';
import {
  neonHealthBar, neonResourceBar, neonInventoryGrid, neonItemSlot,
  neonSkillBar, neonHotkeyBar, neonTimeline, neonCombatLog,
} from '../ui/NeonGame';
import { NEON, NEON_STR, BG } from '../constants/ui.constants';
import { GearEntity } from '../entities/Gear';
import { UnitEntity } from '../entities/Unit';
import { GEAR_DEFINITIONS } from '../constants/gear.constants';
import { UNIT_DEFINITIONS } from '../constants/unit.constants';
import type { GearState, GearType } from '../types/gear.types';
import type { UnitState, UnitType } from '../types/unit.types';

// ── Constants ─────────────────────────────────────────────────────────────

const HEADER_H    = 92;
const CONTENT_PAD = 20;
const SECTION_GAP = 18;
const LBL_COLOR   = '#557799';

type Category = 'form' | 'layout' | 'feedback' | 'data' | 'game' | 'entities';

const CATS: { key: Category; label: string; color: number; cStr: string }[] = [
  { key: 'form',     label: 'FORM',     color: NEON.cyan,    cStr: NEON_STR.cyan },
  { key: 'layout',   label: 'LAYOUT',   color: NEON.blue,    cStr: NEON_STR.blue },
  { key: 'feedback', label: 'FEEDBACK', color: NEON.magenta, cStr: NEON_STR.magenta },
  { key: 'data',     label: 'DATA',     color: NEON.orange,  cStr: NEON_STR.orange },
  { key: 'game',     label: 'GAME UI',  color: NEON.green,   cStr: NEON_STR.green },
  { key: 'entities', label: 'ENTITIES', color: NEON.yellow,  cStr: NEON_STR.yellow },
];

/** Readable label from a snake_case type key, e.g. 'crystal_miner' -> 'CRYSTAL MINER'. */
function typeLabel(type: string): string {
  return type.replace(/_/g, ' ').toUpperCase();
}

// ── Scene ─────────────────────────────────────────────────────────────────

export class UIShowcaseScene extends Phaser.Scene {
  private camY = 0;
  private totalH = 0;
  private active: Category = 'form';
  private cObjs: Phaser.GameObjects.GameObject[] = [];
  private cHandles: { destroy(): void }[] = [];
  private catGs: Phaser.GameObjects.Graphics[] = [];
  private catTs: Phaser.GameObjects.Text[] = [];
  private catBtnData: { x: number; y: number; w: number; h: number }[] = [];
  private scrollHintTxt!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'UIShowcaseScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    const cx = width / 2;

    // Background
    const bg = this.add.graphics();
    bg.fillGradientStyle(BG.deep, BG.deep, BG.mid, BG.mid, 1);
    bg.fillRect(0, 0, width, 5000);
    bg.setScrollFactor(0);

    // Title
    this.add.text(cx, 22, 'UI COMPONENTS SHOWCASE',
      NeonUI.neonTextStyle(NEON_STR.cyan, 16, true))
      .setOrigin(0.5).setScrollFactor(0);

    // Back button
    this.track(neonBtn(this, 14, 8, 90, 30, NEON.cyan, NEON_STR.cyan, '< BACK', 11, () =>
      this.scene.start('SettingsScene')
    ).setScrollFactor(0));

    // Category tabs
    const catBtnH = 30;
    const catBtnW = Math.min(Math.floor((width - 40) / CATS.length), 120);
    const catGap   = 3;
    const totalCatW = CATS.length * catBtnW + (CATS.length - 1) * catGap;
    const catStartX = cx - totalCatW / 2;
    const catBtnY   = 52;

    CATS.forEach((cat, i) => {
      const bx = catStartX + i * (catBtnW + catGap);
      this.catBtnData[i] = { x: bx, y: catBtnY, w: catBtnW, h: catBtnH };

      const g = this.add.graphics().setScrollFactor(0);
      this.catGs.push(g);

      const t = this.add.text(bx + catBtnW / 2, catBtnY + catBtnH / 2, cat.label, {
        fontSize: '10px', color: cat.cStr, fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5).setScrollFactor(0);
      this.catTs.push(t);

      const z = this.add.zone(bx + catBtnW / 2, catBtnY + catBtnH / 2, catBtnW, catBtnH)
        .setInteractive({ useHandCursor: true }).setScrollFactor(0);
      z.on('pointerdown', () => {
        this.active = cat.key;
        this.redrawCatBtns();
        this.clearContent();
        this.buildContent(width);
      });
    });

    // Scroll hint
    this.scrollHintTxt = this.add.text(cx, height - 11, '▲ ▼  scroll', {
      fontSize: '9px', color: '#334455', fontFamily: 'monospace',
    }).setOrigin(0.5, 1).setScrollFactor(0);

    this.redrawCatBtns();
    this.buildContent(width);

    // Wheel scroll
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      this.camY = Phaser.Math.Clamp(this.camY + dy * 0.8, 0, Math.max(0, this.totalH - height));
      this.cameras.main.setScroll(0, this.camY);
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  /** Track a game object for content cleanup */
  private reg<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.cObjs.push(obj);
    return obj;
  }

  /** Track a destroyable handle (rex labels / non-typed) */
  private track(obj: { destroy(): void }): void {
    this.cHandles.push(obj);
  }

  /** Track a handle for content cleanup and return it */
  private h<T extends { destroy(): void }>(handle: T): T {
    this.cHandles.push(handle);
    return handle;
  }

  private redrawCatBtns(): void {
    CATS.forEach((cat, i) => {
      const d = this.catBtnData[i];
      const isActive = cat.key === this.active;
      this.catGs[i].clear();
      NeonUI.drawButton(this.catGs[i], d.x, d.y, d.w, d.h, cat.color, isActive);
      this.catTs[i].setAlpha(isActive ? 1 : 0.5);
    });
  }

  private clearContent(): void {
    this.cObjs.forEach(o => o.destroy());
    this.cObjs = [];
    this.cHandles.forEach(h => h.destroy());
    this.cHandles = [];
    this.camY = 0;
    this.cameras.main.setScroll(0, 0);
  }

  private buildContent(width: number): void {
    const panelW = Math.min(780, width - CONTENT_PAD * 2);
    const px = Math.floor((width - panelW) / 2);

    /** Section label: places text at ly, returns ly + 18 */
    const sLabel = (ly: number, text: string, color = LBL_COLOR): number => {
      this.reg(this.add.text(px, ly, text, {
        fontSize: '11px', color, fontFamily: 'monospace', fontStyle: 'bold',
      }));
      return ly + 18;
    };

    /** Right-side annotation label placed just above ly */
    const rLabel = (lx: number, ly: number, text: string) =>
      this.reg(this.add.text(lx, ly - 2, text, {
        fontSize: '9px', color: '#445566', fontFamily: 'monospace',
      }).setOrigin(0, 1));

    const col2W  = Math.floor((panelW - 20) / 2);
    const col2   = px + col2W + 20;

    let y = HEADER_H + 10;
    switch (this.active) {
      case 'form':     y = this.buildForm(px, y, panelW, col2W, col2, sLabel, rLabel); break;
      case 'layout':   y = this.buildLayout(px, y, panelW, col2W, col2, sLabel, rLabel); break;
      case 'feedback': y = this.buildFeedback(px, y, panelW, col2W, col2, sLabel); break;
      case 'data':     y = this.buildData(px, y, panelW, col2W, col2, sLabel); break;
      case 'game':     y = this.buildGame(px, y, panelW, col2W, sLabel, rLabel); break;
      case 'entities': y = this.buildEntities(px, y, panelW, sLabel); break;
    }

    this.totalH = y + 60;
  }

  // ── FORM ──────────────────────────────────────────────────────────────

  private buildForm(
    px: number, startY: number, panelW: number, col2W: number, col2: number,
    sLabel: (ly: number, t: string, c?: string) => number,
    rLabel: (lx: number, ly: number, t: string) => void,
  ): number {
    let y = startY;
    const gap = SECTION_GAP;
    const c = NEON.cyan; const cStr = NEON_STR.cyan;

    // Checkbox & Toggle
    y = sLabel(y, 'CHECKBOXES  &  TOGGLES');
    this.h(neonCheckbox(this, px, y, 18, 'Enable feature', true, c, () => {}));
    this.h(neonCheckbox(this, px + 180, y, 18, 'Dark mode', false, NEON.magenta, () => {}));
    rLabel(col2, y, 'TOGGLE');
    this.h(neonToggle(this, col2, y + 1, 56, 20, true, c, () => {}));
    this.h(neonToggle(this, col2 + 70, y + 1, 56, 20, false, NEON.orange, () => {}));
    y += 22 + gap;

    // Radio group + btn group
    y = sLabel(y, 'RADIO GROUP');
    this.h(neonRadioGroup(this, px, y,
      [{ key: 'a', label: 'Option Alpha' }, { key: 'b', label: 'Option Beta' }, { key: 'c', label: 'Option Gamma' }],
      'a', c, () => {}));
    rLabel(col2, y, 'BUTTON GROUP');
    this.h(neonBtnGroup(this, col2, y, 70, 28,
      [{ key: 'sm', label: 'SM' }, { key: 'md', label: 'MD' }, { key: 'lg', label: 'LG' }],
      'md', NEON.blue, () => {}));
    y += 3 * 28 + gap;

    // Icon buttons
    y = sLabel(y, 'ICON BUTTONS');
    const icons   = ['✦', '⚙', '★', '⟳', '✕', '♦', '◈', '⟡'];
    const iColors = [NEON.cyan, NEON.orange, NEON.yellow, NEON.green, NEON.red, NEON.magenta, NEON.blue, NEON.cyan];
    const iStrs   = [NEON_STR.cyan, NEON_STR.orange, NEON_STR.yellow, NEON_STR.green, NEON_STR.red, NEON_STR.magenta, NEON_STR.blue, NEON_STR.cyan];
    icons.forEach((icon, i) => {
      const lbl = neonIconBtn(this, px + i * 40, y, 34, icon, iColors[i], iStrs[i], () => {});
      this.cObjs.push(lbl);
    });
    y += 34 + gap;

    // Keybind
    y = sLabel(y, 'KEYBIND INPUT  (click box to rebind)');
    this.h(neonKeybindInput(this, px, y, 120, 30, 'Space', c, () => {}));
    this.h(neonKeybindInput(this, px + 140, y, 120, 30, 'Ctrl+Z', NEON.orange, () => {}));
    this.h(neonKeybindInput(this, px + 280, y, 120, 30, 'F5', NEON.green, () => {}));
    y += 30 + gap;

    // Textarea
    y = sLabel(y, 'TEXTAREA  (DOM)');
    this.reg(neonTextarea(this, px, y, panelW, 70, 'Type something here…', '', () => {}));
    y += 70 + gap;

    // Text input + slider
    y = sLabel(y, 'TEXT INPUT  &  SLIDER');
    this.reg(neonTextInput(this, px, y, col2W, 30, 'text', 'Search…', '', () => {}));
    this.h(neonSlider(this, col2, y + 4, col2W, 0, 100, 60, c, cStr, () => {}));
    y += 30 + gap;

    // Dropdown + color picker
    y = sLabel(y, 'DROPDOWN  &  COLOR PICKER');
    this.h(neonDropdown(this, px, y, 220,
      [{ key: 'a', label: 'Alpha' }, { key: 'b', label: 'Beta' }, { key: 'g', label: 'Gamma' }, { key: 'd', label: 'Delta' }],
      'a', () => {}));
    rLabel(col2, y, 'COLOR PICKER (DOM)');
    this.reg(neonColorPicker(this, col2, y, 60, 34, '#00ffcc', () => {}));
    y += 36 + gap;

    // File picker
    y = sLabel(y, 'FILE PICKER  (DOM)');
    this.reg(neonFilePicker(this, px, y, 280, 30, '*', () => {}));
    y += 30 + gap;

    // Form group
    y = sLabel(y, 'FORM GROUP  (fieldset style)');
    const fgH = 90;
    this.h(neonFormGroup(this, px, y, panelW, fgH, 'Notification Settings', c));
    this.h(neonCheckbox(this, px + 16, y + 22, 16, 'Enable desktop notifications', true, c, () => {}));
    this.h(neonCheckbox(this, px + 16, y + 50, 16, 'Send usage telemetry', false, NEON.magenta, () => {}));
    this.h(neonToggle(this, px + panelW - 80, y + 30, 54, 20, true, NEON.green, () => {}));
    y += fgH + gap;

    // Validation
    y = sLabel(y, 'FIELD VALIDATION MESSAGES');
    this.h(neonValidationMsg(this, px,       y, 'This field is required', 'error'));
    this.h(neonValidationMsg(this, px + 210, y, 'Must be 8+ characters', 'warning'));
    this.h(neonValidationMsg(this, px + 430, y, 'Looks good!', 'success'));
    y += 18 + gap;

    // Disabled overlay
    y = sLabel(y, 'DISABLED STATE WRAPPER');
    const demoW = Math.floor(panelW / 2) - 10;
    const demoH = 48;
    const g1 = this.reg(this.add.graphics());
    NeonUI.drawPanel(g1, px, y, demoW, demoH, NEON.red);
    this.reg(this.add.text(px + demoW / 2, y + demoH / 2, 'Disabled (blocked)', {
      fontSize: '11px', color: NEON_STR.red, fontFamily: 'monospace',
    }).setOrigin(0.5));
    const overlay1 = this.h(neonDisabledOverlay(this, px, y, demoW, demoH));
    overlay1.setEnabled(false);
    const g2 = this.reg(this.add.graphics());
    NeonUI.drawPanel(g2, col2, y, demoW, demoH, NEON.green);
    this.reg(this.add.text(col2 + demoW / 2, y + demoH / 2, 'Enabled (click OK)', {
      fontSize: '11px', color: NEON_STR.green, fontFamily: 'monospace',
    }).setOrigin(0.5));
    y += demoH + gap;

    // 2D slider
    y = sLabel(y, '2D XY SLIDER');
    this.h(neonTwoSlider(this, px, y, panelW, 150, c, 0.5, 0.5, () => {}));
    y += 150 + gap;

    return y;
  }

  // ── LAYOUT ────────────────────────────────────────────────────────────

  private buildLayout(
    px: number, startY: number, panelW: number, col2W: number, col2: number,
    sLabel: (ly: number, t: string, c?: string) => number,
    rLabel: (lx: number, ly: number, t: string) => void,
  ): number {
    let y = startY;
    const gap = SECTION_GAP;
    const c = NEON.blue; const cStr = NEON_STR.blue;

    // Titled panel
    y = sLabel(y, 'TITLED PANEL', cStr);
    this.h(neonTitledPanel(this, px, y, panelW, 52, 'Configuration Panel', c));
    this.reg(this.add.text(px + 14, y + 22, 'Panel content area — children go here.', {
      fontSize: '11px', color: '#667788', fontFamily: 'monospace',
    }));
    y += 52 + gap;

    // Cards
    y = sLabel(y, 'CARDS', cStr);
    this.h(neonCard(this, px, y, col2W, 'System Status', 'All services are running normally. Last check: 12s ago.', c));
    this.h(neonCard(this, col2, y, col2W, 'Warning', 'Gear #7 cooldown active — spawning paused until 00:03.', NEON.orange));
    y += 85 + gap;

    // Tabs
    y = sLabel(y, 'TABS', cStr);
    const tabsH = 32;
    this.h(neonTabs(this, px, y, panelW, tabsH,
      [{ key: 'a', label: 'Overview' }, { key: 'b', label: 'Details' }, { key: 'c', label: 'History' }, { key: 'd', label: 'Config' }],
      c, () => {}));
    const tg = this.reg(this.add.graphics());
    NeonUI.drawPanel(tg, px, y + tabsH, panelW, 44, c, 0.4);
    this.reg(this.add.text(px + 14, y + tabsH + 14, 'Tab content area (caller renders below tab strip)', {
      fontSize: '11px', color: '#667788', fontFamily: 'monospace',
    }));
    y += tabsH + 44 + gap;

    // Accordion
    y = sLabel(y, 'ACCORDION', cStr);
    this.h(neonAccordion(this, px, y, panelW,
      [
        { key: 'a', title: 'General Settings', contentH: 60 },
        { key: 'b', title: 'Advanced Options', contentH: 80 },
        { key: 'c', title: 'Debug Information', contentH: 40 },
      ], c));
    y += 3 * 32 + gap;

    // Scroll container
    y = sLabel(y, 'SCROLL CONTAINER  (with scrollbar indicator)', cStr);
    this.h(neonScrollContainer(this, px, y, panelW, 90, 400, c));
    this.reg(this.add.text(px + 14, y + 14, 'Content is taller than container → scrollbar appears on right.\nWheel over this area to see thumb track.', {
      fontSize: '11px', color: '#667788', fontFamily: 'monospace',
    }));
    y += 90 + gap;

    // Toolbar
    y = sLabel(y, 'TOOLBAR', cStr);
    this.h(neonToolbar(this, px, y, panelW, 38,
      [
        { icon: '✦', tooltip: 'New',   onClick: () => {} },
        { icon: '📂', tooltip: 'Open',  onClick: () => {} },
        { icon: '💾', tooltip: 'Save',  onClick: () => {} },
        { icon: '✂',  tooltip: 'Cut',   onClick: () => {} },
        { icon: '📋', tooltip: 'Paste', onClick: () => {} },
        { icon: '↩',  tooltip: 'Undo',  onClick: () => {} },
        { icon: '↪',  tooltip: 'Redo',  onClick: () => {} },
        { icon: '⚙',  tooltip: 'Prefs', onClick: () => {} },
      ], c));
    y += 38 + gap;

    // Dividers
    y = sLabel(y, 'DIVIDERS', cStr);
    this.h(neonDividerH(this, px, y + 6, panelW, c));
    this.reg(this.add.text(px, y, '── Horizontal ──', { fontSize: '10px', color: '#556677', fontFamily: 'monospace' }));
    y += 22;
    this.h(neonDividerV(this, px + panelW / 2, y, 36, NEON.magenta));
    this.reg(this.add.text(px + panelW / 2 - 60, y + 10, 'Left', { fontSize: '10px', color: '#556677', fontFamily: 'monospace' }));
    this.reg(this.add.text(px + panelW / 2 + 12, y + 10, 'Right', { fontSize: '10px', color: '#556677', fontFamily: 'monospace' }));
    y += 44 + gap;

    // Split pane
    y = sLabel(y, 'SPLIT PANE  (drag divider)', cStr);
    this.h(neonSplitPane(this, px, y, panelW, 80, 0.45, false, c));
    this.reg(this.add.text(px + 14, y + 18, 'Left panel', { fontSize: '11px', color: '#667788', fontFamily: 'monospace' }));
    this.reg(this.add.text(px + Math.floor(panelW * 0.45) + 12, y + 18, 'Right panel', { fontSize: '11px', color: '#667788', fontFamily: 'monospace' }));
    y += 80 + gap;

    // Resizable panel
    y = sLabel(y, 'RESIZABLE PANEL  (drag triangle corner)', cStr);
    this.h(neonResizablePanel(this, px, y, 220, 80, 80, 40, c));
    this.reg(this.add.text(px + 14, y + 22, 'Drag ▿', { fontSize: '11px', color: '#667788', fontFamily: 'monospace' }));
    y += 100 + gap;

    // Grid layout
    y = sLabel(y, 'GRID LAYOUT  (4 columns)', cStr);
    const grid = this.h(neonGridLayout(this, px, y, panelW, 4, 36, 8, c));
    for (let i = 0; i < 8; i++) {
      const pos = grid.getCellPosition(i);
      this.reg(this.add.text(pos.x + pos.w / 2, pos.y + pos.h / 2, `[${i}]`, {
        fontSize: '10px', color: '#667788', fontFamily: 'monospace',
      }).setOrigin(0.5));
    }
    y += Math.ceil(8 / 4) * 36 + gap;

    // Flex row & column
    y = sLabel(y, 'FLEX ROW  (panel-backed items)', cStr);
    const fr = this.h(neonFlexRow(this, px, y, 34, [{ w: 90 }, { w: 130 }, { w: 90 }, { w: 70 }], 6, c));
    fr.getPositions().forEach((pos, i) => {
      this.reg(this.add.text(pos.x + 8, pos.y + 9, `Item ${i + 1}`, { fontSize: '10px', color: '#667788', fontFamily: 'monospace' }));
    });
    y += 34 + 10;
    rLabel(px, y, 'FLEX COLUMN');
    y += 2;
    const fc = this.h(neonFlexColumn(this, px, y, 160, [{ h: 28 }, { h: 28 }, { h: 28 }], 4, NEON.magenta));
    fc.getPositions().forEach((pos, i) => {
      this.reg(this.add.text(pos.x + 8, pos.y + 7, `Row ${i + 1}`, { fontSize: '10px', color: NEON_STR.magenta, fontFamily: 'monospace' }));
    });
    y += 3 * 28 + 2 * 4 + gap;

    return y;
  }

  // ── FEEDBACK ──────────────────────────────────────────────────────────

  private buildFeedback(
    px: number, startY: number, panelW: number, col2W: number, col2: number,
    sLabel: (ly: number, t: string, c?: string) => number,
  ): number {
    let y = startY;
    const gap = SECTION_GAP;
    const c = NEON.magenta; const cStr = NEON_STR.magenta;

    // Modal
    y = sLabel(y, 'MODAL DIALOG', cStr);
    const mb = neonBtn(this, px, y, 170, 34, c, cStr, 'OPEN MODAL', 12, () => {
      neonModal(this, 420, 230, 'Confirm Action',
        'Are you sure you want to proceed? This action cannot be undone.',
        [
          { label: 'CANCEL',  color: NEON.red,   onClick: () => {} },
          { label: 'CONFIRM', color: NEON.green, onClick: () => {} },
        ], NEON.cyan);
    });
    this.cHandles.push(mb);
    y += 34 + gap;

    // Toast
    y = sLabel(y, 'NOTIFICATION TOAST', cStr);
    const tb1 = neonBtn(this, px, y, 170, 32, NEON.green, NEON_STR.green, '✓ SUCCESS TOAST', 11, () => {
      neonToast(this, '✓ Changes saved successfully!', NEON.green, NEON_STR.green);
    });
    this.cHandles.push(tb1);
    const tb2 = neonBtn(this, px + 186, y, 160, 32, NEON.red, NEON_STR.red, '✗ ERROR TOAST', 11, () => {
      neonToast(this, '✗ Network error — retry?', NEON.red, NEON_STR.red);
    });
    this.cHandles.push(tb2);
    const tb3 = neonBtn(this, px + 362, y, 160, 32, NEON.orange, NEON_STR.orange, '⚠ WARNING TOAST', 11, () => {
      neonToast(this, '⚠ Gear cooldown active', NEON.orange, NEON_STR.orange);
    });
    this.cHandles.push(tb3);
    y += 32 + gap;

    // Progress bars
    y = sLabel(y, 'PROGRESS BARS', cStr);
    this.h(neonProgressBar(this, px, y, panelW, 22, 100, 100, NEON.green));
    y += 22 + 6;
    this.h(neonProgressBar(this, px, y, panelW, 22, 65, 100, c));
    y += 22 + 6;
    this.h(neonProgressBar(this, px, y, panelW, 22, 28, 100, NEON.orange));
    y += 22 + 6;
    this.h(neonProgressBar(this, px, y, panelW, 22, 8, 100, NEON.red));
    y += 22 + gap;

    // Spinners
    y = sLabel(y, 'SPINNERS  /  LOADING INDICATORS', cStr);
    this.h(neonSpinner(this, px,       y, 36, c));
    this.h(neonSpinner(this, px + 50,  y, 36, NEON.orange));
    this.h(neonSpinner(this, px + 100, y, 36, NEON.green));
    this.h(neonSpinner(this, px + 150, y, 36, NEON.blue));
    this.reg(this.add.text(px + 210, y + 10, 'Loading resources…', {
      fontSize: '11px', color: '#667788', fontFamily: 'monospace',
    }));
    y += 40 + gap;

    // Badges
    y = sLabel(y, 'BADGES', cStr);
    const badgeData = [
      { label: 'NEW',  color: c },
      { label: 'BETA', color: NEON.orange },
      { label: '99+',  color: NEON.red },
      { label: 'v2.1', color: NEON.green },
      { label: 'PRO',  color: NEON.yellow },
      { label: 'LIVE', color: NEON.cyan },
    ];
    let bx = px;
    badgeData.forEach(bd => {
      this.h(neonBadge(this, bx, y, bd.label, bd.color));
      bx += bd.label.length * 7 + 22;
    });
    y += 24 + gap;

    // Alerts
    y = sLabel(y, 'ALERTS', cStr);
    this.h(neonAlert(this, px, y, panelW, 'System operating normally. All services are online.', 'info'));
    y += 44 + 5;
    this.h(neonAlert(this, px, y, panelW, 'Warning: Your session expires in 5 minutes.', 'warning'));
    y += 44 + 5;
    this.h(neonAlert(this, px, y, panelW, 'Error: Connection lost. Please check your network.', 'error'));
    y += 44 + 5;
    this.h(neonAlert(this, px, y, panelW, 'Success: Profile saved. Changes take effect immediately.', 'success'));
    y += 44 + gap;

    // Status messages
    y = sLabel(y, 'STATUS MESSAGES', cStr);
    [
      { text: '● Online',       color: NEON_STR.green },
      { text: '● Syncing…',     color: NEON_STR.cyan },
      { text: '● Processing',   color: NEON_STR.orange },
      { text: '● Offline',      color: NEON_STR.red },
      { text: '● Idle',         color: '#667788' },
    ].forEach((sm, i) => {
      this.h(neonStatusMsg(this, px + i * 140, y, sm.text, sm.color));
    });
    y += 20 + gap;

    return y;
  }

  // ── DATA ──────────────────────────────────────────────────────────────

  private buildData(
    px: number, startY: number, panelW: number, col2W: number, col2: number,
    sLabel: (ly: number, t: string, c?: string) => number,
  ): number {
    let y = startY;
    const gap = SECTION_GAP;
    const c = NEON.orange; const cStr = NEON_STR.orange;

    // Table
    y = sLabel(y, 'TABLE', cStr);
    this.h(neonTable(this, px, y, panelW,
      [
        { key: 'name',   label: 'Name',   width: 3 },
        { key: 'type',   label: 'Type',   width: 2 },
        { key: 'value',  label: 'Value',  width: 1 },
        { key: 'status', label: 'Status', width: 2 },
      ],
      [
        { name: 'Gear Alpha',   type: 'Spawner',   value: '120', status: 'Active' },
        { name: 'Gear Beta',    type: 'Combatant', value: '80',  status: 'Idle' },
        { name: 'Gear Gamma',   type: 'Defense',   value: '200', status: 'Active' },
        { name: 'Gear Delta',   type: 'Support',   value: '60',  status: 'Cooldown' },
        { name: 'Gear Epsilon', type: 'Spawner',   value: '140', status: 'Active' },
      ], c));
    y += 28 + 5 * 24 + gap;

    // List + Tree side by side
    y = sLabel(y, 'LIST  &  TREE VIEW', cStr);
    this.h(neonList(this, px, y, col2W, 26,
      ['Alpha Protocol', 'Beta Initiative', 'Gamma Project', 'Delta Operation', 'Epsilon Task', 'Zeta Mission'],
      c, () => {}));
    const tree: NeonTreeNode[] = [{
      key: 'root', label: 'Scene Graph', children: [
        { key: 'gears', label: 'Gears', children: [
          { key: 'g1', label: 'Spawner Gear #1' },
          { key: 'g2', label: 'Combat Gear #2' },
          { key: 'g3', label: 'Support Gear #3' },
        ]},
        { key: 'units', label: 'Units', children: [
          { key: 'u1', label: 'Infantry #001' },
          { key: 'u2', label: 'Tank #002' },
        ]},
        { key: 'terrain', label: 'Terrain' },
      ],
    }];
    this.h(neonTreeView(this, col2, y, col2W, tree, NEON.blue));
    y += 6 * 26 + gap;

    // Property inspector
    y = sLabel(y, 'PROPERTY INSPECTOR', cStr);
    this.h(neonPropertyInspector(this, px, y, panelW,
      [
        { key: 'entity.id',       value: 'gear_042' },
        { key: 'entity.type',     value: 'SpawnerGear',    editable: true },
        { key: 'transform.pos',   value: '(320, 240)' },
        { key: 'transform.angle', value: '45.0°',          editable: true },
        { key: 'physics.radius',  value: '32px' },
        { key: 'health.current',  value: '100 / 100',      editable: true },
        { key: 'mesh.count',      value: '3 connections' },
        { key: 'cooldown',        value: '2.4s remaining' },
      ], c));
    y += 8 * 22 + gap;

    // Pagination
    y = sLabel(y, 'PAGINATION', cStr);
    this.h(neonPagination(this, px, y, panelW, 15, 3, c, () => {}));
    y += 28 + gap;

    // Context menu
    y = sLabel(y, 'CONTEXT MENU  (right-click style)', cStr);
    const cmb = neonBtn(this, px, y, 190, 32, c, cStr, 'RIGHT-CLICK MENU', 11, () => {
      neonContextMenu(this, px, y - 36,
        [
          { label: 'Copy',      onClick: () => {} },
          { label: 'Paste',     onClick: () => {} },
          { label: 'Rename…',   onClick: () => {} },
          { label: 'Duplicate', onClick: () => {} },
          { label: 'Delete (disabled)', onClick: () => {}, disabled: true },
        ], c);
    });
    this.cHandles.push(cmb);
    y += 32 + gap;

    // Dropdown menu
    y = sLabel(y, 'DROPDOWN MENU  (with submenu ▸)', cStr);
    const dmb = neonBtn(this, px, y, 190, 32, NEON.blue, NEON_STR.blue, 'OPEN MENU', 11, () => {
      neonDropdownMenu(this, px, y - 36, 170,
        [
          { label: 'New File',    onClick: () => {} },
          { label: 'Open Recent', submenu: [
            { label: 'project_alpha.json', onClick: () => {} },
            { label: 'save_beta.json',     onClick: () => {} },
            { label: 'backup_v3.json',     onClick: () => {} },
          ]},
          { label: 'Save',       onClick: () => {} },
          { label: 'Export As…', submenu: [
            { label: 'PNG Image', onClick: () => {} },
            { label: 'JSON Data', onClick: () => {} },
            { label: 'CSV Table', onClick: () => {} },
          ]},
          { label: 'Close',      onClick: () => {} },
        ], NEON.blue);
    });
    this.cHandles.push(dmb);
    y += 32 + gap;

    return y;
  }

  // ── GAME UI ───────────────────────────────────────────────────────────

  private buildGame(
    px: number, startY: number, panelW: number, _col2W: number,
    sLabel: (ly: number, t: string, c?: string) => number,
    rLabel: (lx: number, ly: number, t: string) => void,
  ): number {
    let y = startY;
    const gap = SECTION_GAP;
    const c = NEON.green; const cStr = NEON_STR.green;

    // Health bars
    y = sLabel(y, 'HEALTH BAR  (color shifts green → yellow → red)', cStr);
    rLabel(px, y, 'Full (100/100)');
    this.h(neonHealthBar(this, px, y, panelW, 22, 100, 100, c));
    y += 22 + 6;
    rLabel(px, y, 'Medium (55/100)');
    this.h(neonHealthBar(this, px, y, panelW, 22, 55, 100, c));
    y += 22 + 6;
    rLabel(px, y, 'Critical (12/100)');
    this.h(neonHealthBar(this, px, y, panelW, 22, 12, 100, c));
    y += 22 + gap;

    // Resource bars
    y = sLabel(y, 'RESOURCE BARS', cStr);
    this.h(neonResourceBar(this, px, y, panelW, 20, 80, 100, 'MANA  ',   NEON.blue));
    y += 20 + 6;
    this.h(neonResourceBar(this, px, y, panelW, 20, 45, 100, 'ENERGY',   NEON.yellow));
    y += 20 + 6;
    this.h(neonResourceBar(this, px, y, panelW, 20, 15, 100, 'SHIELD',   NEON.cyan));
    y += 20 + gap;

    // Inventory grid
    y = sLabel(y, 'INVENTORY GRID  (hover cells)', cStr);
    const inv = this.h(neonInventoryGrid(this, px, y, 8, 3, 44, c));
    const items = [['⚔', 1], ['🛡', 1], ['⚗', 5], ['💎', 3], ['', 0], ['🗝', 2], ['💣', 4], ['', 0]] as [string, number][];
    items.forEach(([icon, count], i) => {
      if (icon) inv.setItem(i % 8, Math.floor(i / 8), icon, count);
    });
    inv.setItem(2, 1, '🔮', 2);
    inv.setItem(5, 2, '🏆', 1);
    y += 3 * (44 + 2) + 2 + gap;

    // Item slots
    y = sLabel(y, 'ITEM SLOTS', cStr);
    const slotData = ['⚔', '🛡', '⚗', '💎', '🗝', '', '🔮', ''];
    slotData.forEach((icon, i) => {
      const slot = this.h(neonItemSlot(this, px + i * 52, y, 46, c));
      if (icon) {
        slot.setIcon(icon);
        if (i === 2) slot.setCount(5);
        if (i === 3) slot.setCount(3);
      }
    });
    y += 46 + gap;

    // Skill bar
    y = sLabel(y, 'SKILL BAR  (slots 2, 4 on cooldown)', cStr);
    const sb = this.h(neonSkillBar(this, px, y, 10, 44, c));
    const skills: [string, number][] = [['🔥',0],['❄️',3.5],['⚡',0],['💥',7.2],['🛡',0],['💫',0],['⟳',2.1],['✦',0],['⚔',0],['',0]];
    skills.forEach(([icon, cd], i) => { if (icon) sb.setSkill(i, icon, cd); });
    y += 44 + gap;

    // Hotkey bar
    y = sLabel(y, 'HOTKEY BAR', cStr);
    const hkb = this.h(neonHotkeyBar(this, px, y, ['1','2','3','4','5','6','7','8','Q','W','E','R'], 44, NEON.yellow));
    [['🔥','Q'],['❄️','W'],['⚡','E'],['💥','R']].forEach(([icon], i) => hkb.setSlot(i + 8, icon));
    [['⚔','1'],['🛡','2']].forEach(([icon], i) => hkb.setSlot(i, icon));
    y += 44 + 18 + gap;

    // Timeline
    y = sLabel(y, 'TIMELINE  (animated indicator)', cStr);
    const tl = this.h(neonTimeline(this, px, y, panelW, 52,
      [
        { time: 0,  label: 'Start',       color: NEON.green },
        { time: 10, label: 'Phase 1',     color: NEON.cyan },
        { time: 25, label: 'Boss Spawn',  color: NEON.red },
        { time: 40, label: 'Phase 2' },
        { time: 55, label: 'Final Push',  color: NEON.orange },
        { time: 60, label: 'Victory',     color: NEON.yellow },
      ], 60, c));
    let tlTime = 0;
    const tlTimer = this.time.addEvent({
      delay: 80, loop: true,
      callback: () => { tlTime = (tlTime + 0.3) % 60; tl.setCurrentTime(tlTime); },
    });
    this.cHandles.push({ destroy: () => tlTimer.destroy() });
    y += 62 + gap;

    // Combat log
    y = sLabel(y, 'COMBAT LOG  (auto-populates)', cStr);
    const log = this.h(neonCombatLog(this, px, y, panelW, 150, c));
    [
      ['Game started — all systems nominal',         NEON_STR.green ],
      ['Gear Alpha spawned at position (320, 240)',  undefined       ],
      ['Unit #001 created by Gear Alpha',            undefined       ],
      ['Unit #001 attacked enemy for 25 damage',     NEON_STR.orange ],
      ['Enemy unit #002 destroyed!',                 NEON_STR.red    ],
      ['Gear Beta mesh connected (+2 bonus)',         NEON_STR.cyan   ],
    ].forEach(([msg, clr]) => log.addEntry(msg as string, clr));

    const logMsgs = [
      () => `Unit attacks for ${Phaser.Math.Between(10, 45)} damage`,
      () => `Shield absorbed ${Phaser.Math.Between(5, 20)} damage`,
      () => `Gear rotation: ${Phaser.Math.Between(0, 359)}°`,
      () => `Squad ${Phaser.Math.Between(1, 5)} enemy incoming!`,
    ];
    const logTimer = this.time.addEvent({
      delay: 1800, loop: true,
      callback: () => log.addEntry(logMsgs[Phaser.Math.Between(0, 3)]()),
    });
    this.cHandles.push({ destroy: () => logTimer.destroy() });
    y += 150 + gap;

    return y;
  }

  // ── ENTITIES ──────────────────────────────────────────────────────────
  // Static previews of real GearEntity/UnitEntity instances (and the two
  // projectile shapes), grouped by definition table so every gear/unit/
  // projectile added to the game shows up here automatically.

  private buildEntities(
    px: number, startY: number, panelW: number,
    sLabel: (ly: number, t: string, c?: string) => number,
  ): number {
    let y = startY;
    const gap = SECTION_GAP;
    const cStr = NEON_STR.yellow;

    /** Lays out a row of preview cells, invoking `draw(cx, cy, key)` for each, label below. */
    const grid = <T extends string>(
      keys: T[], cellW: number, cellH: number, labelY: number,
      draw: (cx: number, cy: number, key: T) => void,
    ): number => {
      const cols = Math.max(1, Math.floor(panelW / cellW));
      const rows = Math.ceil(keys.length / cols);
      keys.forEach((key, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cx = px + col * cellW + cellW / 2;
        const cellTop = y + row * cellH;
        const cy = cellTop + labelY - 14;
        draw(cx, cy, key);
        this.reg(this.add.text(cx, cellTop + labelY, typeLabel(key), {
          fontSize: '7px', color: '#7788aa', fontFamily: 'monospace', align: 'center',
          wordWrap: { width: cellW - 6, useAdvancedWrap: true },
        }).setOrigin(0.5, 0));
      });
      return rows * cellH;
    };

    // Gears — one GearEntity per defined GearType, fixed at DEFAULT_TEETH
    // so every preview renders at the same size regardless of balance values.
    y = sLabel(y, `GEARS  (${Object.keys(GEAR_DEFINITIONS).length} types, real GearEntity render)`, cStr);
    const gearTypes = Object.keys(GEAR_DEFINITIONS) as GearType[];
    y += grid(gearTypes, 110, 96, 56, (cx, cy, type) => {
      const state: GearState = {
        id: `showcase_${type}`, type, teeth: 10, x: cx, y: cy,
        owner: 'player', angularVelocity: 0, currentAngle: 0, accumulatedAngle: 0,
        frictionLoad: 0, torqueOutput: 0, isSpinning: false, isBurntOut: false,
        hp: 100, maxHp: 100, isJammed: false, crackLevel: 0, jamStress: 0,
      };
      this.reg(new GearEntity(this, state, { now: 0 }));
    });
    y += gap;

    // Units — one UnitEntity per defined UnitType, size 0 so it falls back
    // to that type's default visual size.
    y = sLabel(y, `UNITS  (${Object.keys(UNIT_DEFINITIONS).length} types, real UnitEntity render)`, cStr);
    const unitTypes = Object.keys(UNIT_DEFINITIONS) as UnitType[];
    y += grid(unitTypes, 110, 88, 50, (cx, cy, type) => {
      const def = UNIT_DEFINITIONS[type];
      const state: UnitState = {
        id: `showcase_${type}`, type, hp: def.hp, maxHp: def.hp, x: cx, y: cy,
        owner: 'player', speed: def.speed, baseDamage: def.baseDamage,
        inCombat: false, reachedBase: false, damage: def.damage,
        frictionValue: def.frictionValue ?? 0,
        size: 0, attackRange: 50, mass: 1,
        vx: 0, vy: 0, knockbackVx: 0, knockbackVy: 0,
        behaviorState: 'marching', lastAttackTime: 0, chargeAccum: 0, retreatTimer: 0,
        slowTimer: 0, slowFactor: 1, shieldTimer: 0, shieldFactor: 1,
      };
      this.reg(new UnitEntity(this, state));
    });
    y += gap;

    // Projectiles — only 2 types exist; drawn with the same shapes GameScene
    // uses in renderProjectiles(), since that logic isn't exported.
    y = sLabel(y, 'PROJECTILES', cStr);
    const projG = this.reg(this.add.graphics());
    const shellX = px + 40, shellY = y + 24;
    projG.fillStyle(0xff6600, 1);
    projG.fillCircle(shellX, shellY, 8);
    projG.lineStyle(1, 0xffaa00, 1);
    projG.strokeCircle(shellX, shellY, 8);
    projG.fillStyle(0xffdd00, 0.4);
    projG.fillCircle(shellX, shellY, 12.8);
    this.reg(this.add.text(shellX, y + 44, 'ARTILLERY SHELL', {
      fontSize: '8px', color: '#7788aa', fontFamily: 'monospace',
    }).setOrigin(0.5, 0));

    const shardX = px + 140, shardY = y + 24, s = 8;
    projG.fillStyle(0x44ffff, 0.9);
    projG.beginPath();
    projG.moveTo(shardX, shardY - s);
    projG.lineTo(shardX + s * 0.6, shardY);
    projG.lineTo(shardX, shardY + s);
    projG.lineTo(shardX - s * 0.6, shardY);
    projG.closePath();
    projG.fillPath();
    projG.lineStyle(1, 0xffffff, 0.7);
    projG.strokePath();
    this.reg(this.add.text(shardX, y + 44, 'CRYSTAL SHARD', {
      fontSize: '8px', color: '#7788aa', fontFamily: 'monospace',
    }).setOrigin(0.5, 0));
    y += 60 + gap;

    return y;
  }
}
