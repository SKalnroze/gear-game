import Phaser from 'phaser';
import UIPlugin from 'phaser3-rex-plugins/templates/ui/ui-plugin.js';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { LobbyScene } from './scenes/LobbyScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { GameOverScene } from './scenes/GameOverScene';
import { SettingsScene } from './scenes/SettingsScene';
import { UIShowcaseScene } from './scenes/UIShowcaseScene';
import { AboutScene } from './scenes/AboutScene';
import { AudioShowcaseScene } from './scenes/AudioShowcaseScene';
import { TechLayoutEditorScene } from './scenes/TechLayoutEditorScene';

export const GameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: document.body,
  backgroundColor: '#05050f',
  scene: [BootScene, MenuScene, LobbyScene, GameScene, UIScene, GameOverScene, SettingsScene, UIShowcaseScene, AboutScene, AudioShowcaseScene, TechLayoutEditorScene],
  plugins: {
    scene: [
      { key: 'rexUI', plugin: UIPlugin, mapping: 'rexUI' },
    ],
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: '100%',
    height: '100%',
  },
  dom: {
    createContainer: true,
  },
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: true,
  },
};
