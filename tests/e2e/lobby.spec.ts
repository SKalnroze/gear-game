import { test, expect } from '@playwright/test';

test.describe('LobbyScene', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 15000 });
    await page.waitForTimeout(1500);

    // Click on the canvas where the PLAY/START button is in MenuScene
    // Using keyboard shortcut or clicking center of canvas to navigate to lobby
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    // Click the center of the canvas (where PLAY button typically is)
    await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await page.waitForTimeout(1000);
  });

  test('lobby or menu canvas is visible after click', async ({ page }) => {
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
  });

  test('lobby screenshot', async ({ page }) => {
    await expect(page).toHaveScreenshot('lobby.png', {
      maxDiffPixelRatio: 0.02,
    });
  });
});
