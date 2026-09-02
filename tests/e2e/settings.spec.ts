import { test, expect } from '@playwright/test';

test.describe('SettingsScene', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 15000 });
    await page.waitForTimeout(1500);
  });

  test('settings screenshot from menu', async ({ page }) => {
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    // Click where Settings button typically appears (lower area of menu)
    await canvas.click({ position: { x: box.width / 2, y: box.height * 0.7 } });
    await page.waitForTimeout(800);

    await expect(page).toHaveScreenshot('settings.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('canvas remains visible throughout settings navigation', async ({ page }) => {
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();

    // Navigate around
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    await canvas.click({ position: { x: box.width / 2, y: box.height * 0.7 } });
    await page.waitForTimeout(500);

    await expect(canvas).toBeVisible();
  });
});
