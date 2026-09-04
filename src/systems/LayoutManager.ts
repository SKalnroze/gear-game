import Phaser from 'phaser';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../constants/world.constants';
import { HUD_MIN_H, TOOLBAR_H, BP_SMALL, BP_MEDIUM } from '../constants/ui.constants';

export type Breakpoint = 'small' | 'medium' | 'large';

export interface PanelRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutState {
  canvasW: number;
  canvasH: number;
  viewportW: number;
  hudY: number;
  hudH: number;
  breakpoint: Breakpoint;
  toolbarY: number;
  contentY: number;

  // Panel regions in HUD area
  leftPanel: PanelRegion;
  centerPanel: PanelRegion;
  rightPanel: PanelRegion;

  // Component slots
  palette: { x: number; y: number; maxH: number };
  resources: { x: number; y: number; w: number };
  units: { x: number; y: number; btnW: number };
  abilities: { x: number; y: number };
  minimap: { x: number; y: number; w: number; h: number };
}

/**
 * Central layout authority — computes LayoutState from canvas dimensions on every resize.
 * Subscribe to onResize for updates.
 */
export class LayoutManager {
  private scene: Phaser.Scene;
  private _state!: LayoutState;
  private _onResize: ((state: LayoutState) => void) | null = null;
  private readonly handleResize = (): void => {
    this.compute();
    if (this._onResize) this._onResize(this._state);
  };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.compute();

    scene.scale.on('resize', this.handleResize);
  }

  destroy(): void {
    this.scene.scale.off('resize', this.handleResize);
    this._onResize = null;
  }

  get state(): LayoutState {
    return this._state;
  }

  set onResize(cb: ((state: LayoutState) => void) | null) {
    this._onResize = cb;
  }

  private compute(): void {
    const canvasW = this.scene.scale.width;
    const canvasH = this.scene.scale.height;
    const viewportW = canvasW;
    const hudY = WORLD_HEIGHT;
    const hudH = Math.max(HUD_MIN_H, canvasH - WORLD_HEIGHT);
    const toolbarY = hudY;
    const contentY = hudY + TOOLBAR_H;
    const contentH = hudH - TOOLBAR_H;

    let breakpoint: Breakpoint = 'large';
    if (canvasW < BP_SMALL) breakpoint = 'small';
    else if (canvasW < BP_MEDIUM) breakpoint = 'medium';

    // Panel widths based on breakpoint
    const leftW = breakpoint === 'small' ? 180 : breakpoint === 'medium' ? 200 : 220;
    const rightW = breakpoint === 'small' ? 260 : breakpoint === 'medium' ? 300 : 340;
    const centerW = Math.max(200, canvasW - leftW - rightW);

    const leftPanel: PanelRegion = { x: 0, y: contentY, w: leftW, h: contentH };
    const centerPanel: PanelRegion = { x: leftW, y: contentY, w: centerW, h: contentH };
    const rightPanel: PanelRegion = { x: leftW + centerW, y: contentY, w: rightW, h: contentH };

    // Component slots
    const palette = {
      x: leftPanel.x + 6,
      y: leftPanel.y + 4,
      maxH: leftPanel.h - 8,
    };

    const resources = {
      x: centerPanel.x + 8,
      y: centerPanel.y + 4,
      w: centerPanel.w - 16,
    };

    const gap = 8;
    const maxBtnW = 220;
    const minBtnW = 80;
    const unitBtnW = Math.max(minBtnW, Math.min(maxBtnW, Math.floor((centerPanel.w - 3 * gap) / 4)));

    const units = {
      x: centerPanel.x + 8,
      y: centerPanel.y + 38,
      btnW: unitBtnW,
    };

    const abilities = {
      x: rightPanel.x + 8,
      y: rightPanel.y + 4,
    };

    const minimapW = Math.min(280, rightPanel.w - 20);
    const minimapH = Math.round(minimapW * WORLD_HEIGHT / WORLD_WIDTH);
    const minimap = {
      x: rightPanel.x + rightPanel.w - minimapW - 10,
      y: rightPanel.y + rightPanel.h - minimapH - 6,
      w: minimapW,
      h: minimapH,
    };

    this._state = {
      canvasW, canvasH, viewportW,
      hudY, hudH, breakpoint,
      toolbarY, contentY,
      leftPanel, centerPanel, rightPanel,
      palette, resources, units, abilities, minimap,
    };
  }
}
