import { test, expect } from '@playwright/test';
import { bootGame, activeScenes, waitForScene, clickLabel } from './helpers';

test.describe('MenuScene', () => {
  test('boots into the menu with no page errors', async ({ page }) => {
    const errors = await bootGame(page);
    await waitForScene(page, 'MenuScene');

    expect(await activeScenes(page)).toContain('MenuScene');
    expect(errors).toEqual([]);
  });

  test('page title is set', async ({ page }) => {
    await bootGame(page);
    await expect(page).toHaveTitle('Gear Game');
  });

  test('menu baseline screenshot', async ({ page }) => {
    await bootGame(page);
    await waitForScene(page, 'MenuScene');
    await expect(page).toHaveScreenshot('menu-default.png', { maxDiffPixelRatio: 0.02 });
  });

  test('SINGLEPLAYER opens the lobby', async ({ page }) => {
    await bootGame(page);
    await waitForScene(page, 'MenuScene');

    await clickLabel(page, 'SINGLEPLAYER');
    await waitForScene(page, 'LobbyScene');

    expect(await activeScenes(page)).toContain('LobbyScene');
  });

  test('SETTINGS opens settings, not about', async ({ page }) => {
    await bootGame(page);
    await waitForScene(page, 'MenuScene');

    await clickLabel(page, 'SETTINGS');
    await waitForScene(page, 'SettingsScene');

    const active = await activeScenes(page);
    expect(active).toContain('SettingsScene');
    expect(active).not.toContain('AboutScene');
  });

  test('ABOUT opens about', async ({ page }) => {
    await bootGame(page);
    await waitForScene(page, 'MenuScene');

    await clickLabel(page, 'ABOUT');
    await waitForScene(page, 'AboutScene');

    expect(await activeScenes(page)).toContain('AboutScene');
  });

  test('MULTIPLAYER is disabled and navigates nowhere', async ({ page }) => {
    await bootGame(page);
    await waitForScene(page, 'MenuScene');

    // Dimmed buttons are drawn as plain graphics with no interactive Label, so
    // clickLabel cannot find one. Click its position directly to prove the
    // click is inert rather than merely unreachable.
    const canvas = await page.locator('canvas').boundingBox();
    if (!canvas) throw new Error('canvas has no bounding box');
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await page.waitForTimeout(800);

    expect(await activeScenes(page)).toContain('MenuScene');
  });
});
