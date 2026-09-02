import { test, expect } from '@playwright/test';
import { bootGame, activeScenes, waitForScene, startScene, clickLabel } from './helpers';

test.describe('LobbyScene', () => {
  test('reachable from the menu', async ({ page }) => {
    const errors = await bootGame(page);
    await waitForScene(page, 'MenuScene');

    await clickLabel(page, 'SINGLEPLAYER');
    await waitForScene(page, 'LobbyScene');

    expect(await activeScenes(page)).toEqual(['LobbyScene']);
    expect(errors).toEqual([]);
  });

  test('lobby screenshot', async ({ page }) => {
    await bootGame(page);
    await startScene(page, 'LobbyScene');

    // Guard against the previous suite's failure mode, where this snapshot was
    // silently a picture of the menu.
    expect(await activeScenes(page)).toContain('LobbyScene');
    await expect(page).toHaveScreenshot('lobby.png', { maxDiffPixelRatio: 0.02 });
  });

  test('starting a match brings up GameScene and UIScene together', async ({ page }) => {
    await bootGame(page);
    await startScene(page, 'LobbyScene');

    await clickLabel(page, 'START GAME');
    await waitForScene(page, 'GameScene');
    await waitForScene(page, 'UIScene');

    const active = await activeScenes(page);
    expect(active).toContain('GameScene');
    expect(active).toContain('UIScene');
    expect(active).not.toContain('LobbyScene');
  });
});
