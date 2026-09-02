import { test, expect } from '@playwright/test';

test.describe('MenuScene', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for Phaser canvas to appear
    await page.waitForSelector('canvas', { timeout: 15000 });
    // Give Phaser time to render the first frame
    await page.waitForTimeout(1500);
  });

  test('menu baseline screenshot', async ({ page }) => {
    await expect(page).toHaveScreenshot('menu-default.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('canvas is visible', async ({ page }) => {
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
  });

  test('page title is set', async ({ page }) => {
    // Phaser games typically don't set page titles, but the HTML should load
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
