import Phaser from 'phaser';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../constants/world.constants';
import { HUD_MIN_H, TOOLBAR_H, BP_SMALL, BP_MEDIUM } from '../constants/ui.constants';

export type Breakpoint = 'small' | 'medium' | 'large';

export interface LayoutState {
  canvasW: number;
  canvasH: number;
  viewportW: number;
  hudY: number;
  hudH: number;
  breakpoint: Breakpoint;
  toolbarY: number;
  contentY: number;

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

    let breakpoint: Breakpoint = 'large';
    if (canvasW < BP_SMALL) breakpoint = 'small';
    else if (canvasW < BP_MEDIUM) breakpoint = 'medium';

    const minimapW = Math.min(280, canvasW - 20);
    const minimapH = Math.round(minimapW * WORLD_HEIGHT / WORLD_WIDTH);
    const minimap = {
      x: canvasW - minimapW - 10,
      y: canvasH - minimapH - 6,
      w: minimapW,
      h: minimapH,
    };

    this._state = {
      canvasW, canvasH, viewportW,
      hudY, hudH, breakpoint,
      toolbarY, contentY,
      minimap,
    };
  }
}
