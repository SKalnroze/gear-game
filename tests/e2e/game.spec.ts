import { test, expect } from '@playwright/test';
import { bootGame, activeScenes, startScene, DEFAULT_MATCH } from './helpers';

test.describe('GameScene', () => {
  test('a match runs with GameScene and UIScene active', async ({ page }) => {
    const errors = await bootGame(page);
    await startScene(page, 'GameScene', DEFAULT_MATCH);

    const active = await activeScenes(page);
    expect(active).toContain('GameScene');
    // Without the parallel UIScene the match renders no HUD at all.
    expect(active).toContain('UIScene');
    expect(errors).toEqual([]);
  });

  test('match screenshot', async ({ page }) => {
    await bootGame(page);
    await startScene(page, 'GameScene', DEFAULT_MATCH);
    await page.waitForTimeout(1500);

    // The previous baseline under this name was a picture of the menu.
    expect(await activeScenes(page)).toContain('GameScene');
    await expect(page).toHaveScreenshot('game-t0.png', { maxDiffPixelRatio: 0.02 });
  });

  test('stays alive and error-free after several seconds of simulation', async ({ page }) => {
    const errors = await bootGame(page);
    await startScene(page, 'GameScene', DEFAULT_MATCH);

    await page.waitForTimeout(5000);

    expect(await activeScenes(page)).toContain('GameScene');
    expect(errors).toEqual([]);
  });

  test('a flipped match (AI left, human right) runs without errors', async ({ page }) => {
    const errors = await bootGame(page);
    await startScene(page, 'GameScene', {
      left: { kind: 'ai', difficulty: 'medium', personality: 'random' },
      right: { kind: 'human' },
    });

    await page.waitForTimeout(5000);

    expect(await activeScenes(page)).toContain('GameScene');
    expect(errors).toEqual([]);
  });

  test('a spectate match (both sides AI) runs without errors', async ({ page }) => {
    const errors = await bootGame(page);
    await startScene(page, 'GameScene', {
      left: { kind: 'ai', difficulty: 'medium', personality: 'random' },
      right: { kind: 'ai', difficulty: 'medium', personality: 'random' },
    });

    await page.waitForTimeout(4000);

    expect(await activeScenes(page)).toContain('GameScene');
    expect(errors).toEqual([]);
  });
});
