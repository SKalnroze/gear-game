import Phaser from 'phaser';
import { GameConfig } from './config';

// Boot the game
const game = new Phaser.Game(GameConfig);

// Disable context menu on canvas to allow right-click camera panning
game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Expose for debugging
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).game = game;
}
