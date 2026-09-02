import Phaser from 'phaser';
import { NeonUI } from './NeonUI';
import { neonBtn } from './NeonRex';
import { NEON, NEON_STR, BG, LAYOUT } from '../constants/ui.constants';

/**
 * Abstract base class for menu/settings/info scenes.
 *
 * Subclasses:
 * 1. Call `super({ key: 'MyScene' })` in constructor.
 * 2. In `create()`, call `this.buildPage(title, backScene)`.
 * 3. Use `this.reg()` / `this.h()` to register all game objects/handles for cleanup.
 * 4. At end of `create()`, call `this.enableScroll(finalContentY)`.
 */
export abstract class NeonSceneBase extends Phaser.Scene {
  protected camY = 0;
  protected totalH = 0;
  private _sceneObjs: Phaser.GameObjects.GameObject[] = [];
  private _sceneHandles: { destroy(): void }[] = [];

  // ── Computed layout properties ──────────────────────────────────────

  /** Horizontal center of the viewport. */
  protected get cx(): number { return this.scale.width / 2; }

  /** Width of the main content panel, clamped to viewport. */
  protected panelWidth(max = 560, margin = 60): number {
    return Math.min(max, this.scale.width - margin);
  }

  /** Left X of a centred panel of given width. */
  protected panelX(w: number): number {
    return Math.floor((this.scale.width - w) / 2);
  }

  // ── Lifecycle helpers ───────────────────────────────────────────────

  /** Register a game object for scene cleanup. Returns the object for chaining. */
  protected reg<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this._sceneObjs.push(obj);
    return obj;
  }

  /** Register a handle (anything with destroy()) for scene cleanup. Returns the handle. */
  protected h<T extends { destroy(): void }>(handle: T): T {
    this._sceneHandles.push(handle);
    return handle;
  }

  protected clearScene(): void {
    this._sceneObjs.forEach(o => o.destroy()); this._sceneObjs = [];
    this._sceneHandles.forEach(hh => hh.destroy()); this._sceneHandles = [];
  }

  // ── Standard page scaffold ──────────────────────────────────────────

  /**
   * Sets up background, fixed title, back button, and scroll hint.
   * Call at the start of `create()`.
   */
  protected buildPage(title: string, backScene: string): void {
    const { width, height } = this.scale;

    const bg = this.add.graphics();
    bg.fillGradientStyle(BG.deep, BG.deep, BG.mid, BG.mid, 1);
    bg.fillRect(0, 0, width, 5000);
    bg.setScrollFactor(0);

    this.add.text(this.cx, LAYOUT.PAGE_TITLE_Y, title,
      NeonUI.neonTextStyle(NEON_STR.cyan, LAYOUT.FONT_TITLE, true))
      .setOrigin(0.5).setScrollFactor(0);

    this.h(neonBtn(this, LAYOUT.BACK_BTN_X, LAYOUT.BACK_BTN_Y,
      LAYOUT.BACK_BTN_W, LAYOUT.BACK_BTN_H,
      NEON.cyan, NEON_STR.cyan, '< BACK', 11,
      () => this.scene.start(backScene),
    )).setScrollFactor(0);

    this.add.text(this.cx, height - 11, '▲ ▼  scroll to see more',
      { fontSize: '9px', color: '#334455', fontFamily: 'monospace' })
      .setOrigin(0.5, 1).setScrollFactor(0);
  }

  /**
   * Wire mouse-wheel scrolling. Call at the end of `create()` with the final content Y.
   */
  protected enableScroll(contentBottomY: number): void {
    const { height } = this.scale;
    this.totalH = contentBottomY + 60;
    this.camY = 0;
    this.cameras.main.setScroll(0, 0);
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      this.camY = Phaser.Math.Clamp(
        this.camY + dy * 0.8,
        0,
        Math.max(0, this.totalH - height),
      );
      this.cameras.main.setScroll(0, this.camY);
    });
  }
}
