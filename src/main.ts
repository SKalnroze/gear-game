import Phaser from 'phaser';
import { GameConfig } from './config';

// Every Text object rasterizes to its own internal canvas at `style.resolution`
// (Phaser defaults this to 1 whenever it isn't set) before being drawn onto the
// game canvas. At 1 on a HiDPI/scaled display, that already-lower-res bitmap
// then gets upscaled by the browser to fill the physical pixels -- this is the
// actual source of blurry text. Phaser 3 has no game-wide DPR-aware canvas
// resolution setting, but patching the factory here gives every piece of text
// in the game a sane default without touching every call site that builds one.
const dpr = window.devicePixelRatio || 1;
const originalTextFactory = Phaser.GameObjects.GameObjectFactory.prototype.text;
Phaser.GameObjects.GameObjectFactory.prototype.text = function (
  this: Phaser.GameObjects.GameObjectFactory,
  x: number,
  y: number,
  text: string | string[],
  style?: Phaser.Types.GameObjects.Text.TextStyle,
) {
  return originalTextFactory.call(this, x, y, text, { resolution: dpr, ...style });
};

// Boot the game
const game = new Phaser.Game(GameConfig);

// Disable context menu on canvas to allow right-click camera panning
game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Expose for debugging
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).game = game;
}
