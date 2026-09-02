import { test, expect } from '@playwright/test';
import { bootGame, activeScenes, waitForScene, startScene, clickLabel, DEFAULT_MATCH } from './helpers';

/**
 * Scenes here are shut down and restarted, never destroyed, and Phaser does not
 * clear a scene's event emitter on shutdown. Handlers registered in create()
 * therefore used to accumulate one copy per session, so onShutdown ran N times
 * on the Nth teardown and each restart left another orphaned per-frame loop.
 */
test.describe('restart cycles', () => {
  test('three matches in a row leave no growing listener stack', async ({ page }) => {
    const errors = await bootGame(page);

    for (let i = 0; i < 3; i++) {
      await startScene(page, 'GameScene', DEFAULT_MATCH);
      expect(await activeScenes(page)).toContain('GameScene');

      await startScene(page, 'MenuScene');
      await waitForScene(page, 'MenuScene');
    }

    // One registration per scene, not one per session.
    const counts = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const game = (window as any).game;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const countFor = (key: string, event: string) => {
        const scene = game.scene.getScene(key);
        return scene?.events?.listenerCount?.(event) ?? 0;
      };
      return {
        gameShutdown: countFor('GameScene', 'shutdown'),
        uiShutdown: countFor('UIScene', 'shutdown'),
        uiUpdate: countFor('UIScene', 'update'),
      };
    });

    expect(counts.gameShutdown).toBeLessThanOrEqual(1);
    expect(counts.uiShutdown).toBeLessThanOrEqual(1);
    expect(counts.uiUpdate).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test('a match still plays after several restarts', async ({ page }) => {
    const errors = await bootGame(page);

    for (let i = 0; i < 3; i++) {
      await startScene(page, 'GameScene', DEFAULT_MATCH);
      await startScene(page, 'MenuScene');
    }

    await startScene(page, 'GameScene', DEFAULT_MATCH);
    await page.waitForTimeout(3000);

    const active = await activeScenes(page);
    expect(active).toContain('GameScene');
    expect(active).toContain('UIScene');
    expect(errors).toEqual([]);
  });

  test('menu → match → menu → match through the UI stays clean', async ({ page }) => {
    const errors = await bootGame(page);

    for (let i = 0; i < 2; i++) {
      await waitForScene(page, 'MenuScene');
      await clickLabel(page, 'SINGLEPLAYER');
      await waitForScene(page, 'LobbyScene');
      await clickLabel(page, 'START GAME');
      await waitForScene(page, 'GameScene');
      await page.waitForTimeout(1000);

      await startScene(page, 'MenuScene');
    }

    expect(errors).toEqual([]);
  });
});
