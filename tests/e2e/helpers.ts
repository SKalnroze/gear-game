import type { Page } from '@playwright/test';

/**
 * Shared driving helpers for the e2e specs.
 *
 * The game is a single canvas, so there is nothing for Playwright to select.
 * The previous specs worked around that by clicking fixed fractions of the
 * canvas and hoping a button was there — which is why four of their snapshots
 * captured the wrong scene entirely (canvas centre is the *disabled*
 * MULTIPLAYER button, and 70% height is ABOUT, not SETTINGS).
 *
 * Instead we drive the game through the Phaser instance `main.ts` exposes on
 * `window.game` in dev builds, and locate buttons by their label text rather
 * than by position, so layout changes cannot silently redirect a test.
 */

/** Scenes that run alongside an owner scene rather than replacing it. */
const PARALLEL: Record<string, string[]> = {
  GameScene: ['UIScene'],
};

/** A match config equivalent to what LobbyScene hands GameScene by default. */
export const DEFAULT_MATCH = {
  left: { kind: 'human' },
  right: { kind: 'ai', difficulty: 'medium', personality: 'random' },
};

/**
 * Load the page and wait until Phaser has booted and BootScene has handed off.
 * Returns a live array that collects any uncaught page errors.
 */
export async function bootGame(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/');
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.waitForFunction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => (window as any).game?.scene?.scenes?.length > 0,
    undefined,
    { timeout: 15000 },
  );
  // BootScene hands off to MenuScene on a 600ms delayedCall; starting a scene
  // before that fires would be stomped by it.
  await page.waitForFunction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => !(window as any).game.scene.getScene('BootScene')?.scene.isActive(),
    undefined,
    { timeout: 15000 },
  );
  return errors;
}

/** Keys of every currently active scene. */
export function activeScenes(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).game.scene.scenes
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((s: any) => s.scene.isActive())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((s: any) => s.scene.key),
  );
}

/** Wait until `key` is the/an active scene. */
export async function waitForScene(page: Page, key: string, timeout = 10000): Promise<void> {
  await page.waitForFunction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (k) => (window as any).game.scene.getScene(k)?.scene.isActive() === true,
    key,
    { timeout },
  );
}

/**
 * Start a scene directly, bringing up any parallel scenes it normally runs
 * with. Mirrors LobbyScene.startGame(): start the owner, then its companions,
 * so they pick up the `systems_ready` the owner emits.
 */
export async function startScene(
  page: Page,
  key: string,
  data?: unknown,
): Promise<void> {
  const launch = PARALLEL[key] ?? [];
  await page.evaluate(
    ({ key, launch, data }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const game = (window as any).game;
      const keep = new Set([key, ...launch]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const s of game.scene.scenes) {
        if (s.scene.isActive() && !keep.has(s.scene.key)) s.scene.stop();
      }
      // game.scene is the SceneManager: its start() runs a scene alongside the
      // others rather than replacing them (launch() is scene-plugin only).
      game.scene.start(key, data ?? undefined);
      for (const extra of launch) {
        game.scene.stop(extra);
        game.scene.start(extra);
      }
    },
    { key, launch, data },
  );
  await waitForScene(page, key);
  for (const extra of launch) await waitForScene(page, extra);
  await page.waitForTimeout(1200);
}

/**
 * Click a button by its visible label, resolving its position from the live
 * display list. Throws with the available labels if there is no match, so a
 * renamed button fails loudly instead of silently clicking empty canvas.
 */
export async function clickLabel(page: Page, text: string): Promise<void> {
  const box = await page.evaluate((wanted) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const game = (window as any).game;
    const seen: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const scene of game.scene.scenes) {
      if (!scene.scene.isActive()) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const obj of scene.children.list) {
        const label = obj?.text;
        if (typeof label !== 'string' || label.length === 0) continue;
        seen.push(label);
        if (label !== wanted) continue;
        if (typeof obj.getBounds !== 'function') continue;
        const b = obj.getBounds();
        const cam = scene.cameras.main;
        return {
          x: (b.x + b.width / 2 - cam.scrollX) * cam.zoom,
          y: (b.y + b.height / 2 - cam.scrollY) * cam.zoom,
          seen,
        };
      }
    }
    return { x: -1, y: -1, seen };
  }, text);

  if (box.x < 0) {
    throw new Error(
      `No clickable label "${text}". Visible labels: ${box.seen.join(', ') || '(none)'}`,
    );
  }

  const canvas = await page.locator('canvas').boundingBox();
  if (!canvas) throw new Error('canvas has no bounding box');
  await page.mouse.click(canvas.x + box.x, canvas.y + box.y);
  await page.waitForTimeout(600);
}
