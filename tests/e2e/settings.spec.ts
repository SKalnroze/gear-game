import { test, expect } from '@playwright/test';
import { bootGame, activeScenes, waitForScene, startScene, clickLabel } from './helpers';

test.describe('SettingsScene', () => {
  test('reachable from the menu', async ({ page }) => {
    const errors = await bootGame(page);
    await waitForScene(page, 'MenuScene');

    await clickLabel(page, 'SETTINGS');
    await waitForScene(page, 'SettingsScene');

    expect(await activeScenes(page)).toEqual(['SettingsScene']);
    expect(errors).toEqual([]);
  });

  test('settings screenshot', async ({ page }) => {
    await bootGame(page);
    await startScene(page, 'SettingsScene');

    // The previous baseline under this name was actually AboutScene, reached by
    // clicking a guessed canvas fraction.
    const active = await activeScenes(page);
    expect(active).toContain('SettingsScene');
    expect(active).not.toContain('AboutScene');

    await expect(page).toHaveScreenshot('settings.png', { maxDiffPixelRatio: 0.02 });
  });
});

test.describe('AboutScene', () => {
  test('about screenshot', async ({ page }) => {
    await bootGame(page);
    await startScene(page, 'AboutScene');

    expect(await activeScenes(page)).toContain('AboutScene');
    await expect(page).toHaveScreenshot('about.png', { maxDiffPixelRatio: 0.02 });
  });
});
