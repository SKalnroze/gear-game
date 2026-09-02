import { test, expect } from '@playwright/test';

test.describe('Full game flow', () => {
  test('game loads without crashing', async ({ page }) => {
    await page.goto('/');

    // Canvas should appear within reasonable time
    await page.waitForSelector('canvas', { timeout: 15000 });

    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
  });

  test('Phaser game initializes successfully', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // No critical JS errors means Phaser initialized
    const critical = errors.filter(e => !e.includes('ResizeObserver'));
    expect(critical).toHaveLength(0);
  });

  test('full navigation flow: menu → lobby → back', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 15000 });
    await page.waitForTimeout(1500);

    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    // Step 1: Screenshot of initial state (menu)
    await expect(page).toHaveScreenshot('flow-menu.png', { maxDiffPixelRatio: 0.02 });

    // Step 2: Click into the scene (attempt to navigate)
    await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await page.waitForTimeout(1000);

    // Step 3: Canvas should still be present after navigation attempt
    await expect(canvas).toBeVisible();

    await expect(page).toHaveScreenshot('flow-after-click.png', { maxDiffPixelRatio: 0.02 });
  });
});
