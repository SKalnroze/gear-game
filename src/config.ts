import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { DifficultySelectScene } from './scenes/DifficultySelectScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { GameOverScene } from './scenes/GameOverScene';
import { SettingsScene } from './scenes/SettingsScene';
import { AboutScene } from './scenes/AboutScene';

export const GameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  backgroundColor: '#05050f',
  scene: [BootScene, MenuScene, DifficultySelectScene, GameScene, UIScene, GameOverScene, SettingsScene, AboutScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: '100%',
    height: '100%',
  },
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: true,
  },
};
