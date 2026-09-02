import { test, expect } from '@playwright/test';

test.describe('GameScene', () => {
  test('canvas loads and remains stable', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 15000 });
    await page.waitForTimeout(1500);

    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();

    // Screenshot at t=0
    await expect(page).toHaveScreenshot('game-t0.png', {
      maxDiffPixelRatio: 0.02,
    });

    // Wait 3 seconds and check canvas is still present and stable
    await page.waitForTimeout(3000);
    const stillVisible = await canvas.isVisible();
    expect(stillVisible).toBe(true);
  });

  test('no JavaScript errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Filter out known non-critical warnings if any
    const criticalErrors = errors.filter(e =>
      !e.includes('Warning:') && !e.includes('ResizeObserver'),
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
