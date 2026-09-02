import { test, expect } from '@playwright/test';
import { bootGame, activeScenes, waitForScene, clickLabel } from './helpers';

test.describe('Full game flow', () => {
  test('menu → lobby → back → menu', async ({ page }) => {
    const errors = await bootGame(page);
    await waitForScene(page, 'MenuScene');

    await clickLabel(page, 'SINGLEPLAYER');
    await waitForScene(page, 'LobbyScene');

    await clickLabel(page, '< BACK');
    await waitForScene(page, 'MenuScene');

    expect(await activeScenes(page)).toEqual(['MenuScene']);
    expect(errors).toEqual([]);
  });

  test('menu → lobby → match, entirely through the UI', async ({ page }) => {
    const errors = await bootGame(page);
    await waitForScene(page, 'MenuScene');

    await clickLabel(page, 'SINGLEPLAYER');
    await waitForScene(page, 'LobbyScene');

    await clickLabel(page, 'START GAME');
    await waitForScene(page, 'GameScene');
    await waitForScene(page, 'UIScene');

    expect(errors).toEqual([]);
  });

  test('settings → back → menu', async ({ page }) => {
    await bootGame(page);
    await waitForScene(page, 'MenuScene');

    await clickLabel(page, 'SETTINGS');
    await waitForScene(page, 'SettingsScene');

    await clickLabel(page, '< BACK');
    await waitForScene(page, 'MenuScene');

    expect(await activeScenes(page)).toEqual(['MenuScene']);
  });
});
