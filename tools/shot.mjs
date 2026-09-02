#!/usr/bin/env node
/**
 * Screenshot the running game.
 *
 * The editor's preview pane cannot render this game -- its WebGL context fails
 * with "Framebuffer status: Incomplete Attachment" and the Phaser loop dies at
 * the boot splash. Playwright's Chromium renders it fine, so this drives that
 * instead.
 *
 * The game exposes its Phaser instance as window.game in dev builds, so scenes
 * are started by key rather than by guessing where a button is on the canvas.
 *
 *   node tools/shot.mjs                                  # menu
 *   node tools/shot.mjs --scene LobbyScene
 *   node tools/shot.mjs --game                           # GameScene + UIScene, as the lobby starts them
 *   node tools/shot.mjs --scene GameScene --launch UIScene --data '{"left":{"kind":"human"},"right":{"kind":"ai","difficulty":"hard"}}'
 *   node tools/shot.mjs --scene UIShowcaseScene --size 1600x900 --out shots/ui.png
 *   node tools/shot.mjs --click 640,360 --click 640,420  # canvas-relative clicks
 *   node tools/shot.mjs --list                           # scene keys and status
 *
 * Exits non-zero if the page logged an uncaught error, so it doubles as a
 * smoke check.
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const DEFAULTS = {
  url: 'http://localhost:8080',
  out: 'shots/shot.png',
  size: '1280x720',
  wait: 1200,
  scene: null,
  data: null,
  list: false,
  keep: false,
  clicks: [],
  launch: [],
};

/** The lobby starts a match as GameScene + UIScene in parallel; --game mirrors that. */
const GAME_PRESET = {
  scene: 'GameScene',
  launch: ['UIScene'],
  data: {
    left: { kind: 'human' },
    right: { kind: 'ai', difficulty: 'medium', personality: 'random' },
  },
};

function parseArgs(argv) {
  const opts = { ...DEFAULTS, clicks: [], launch: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg} needs a value`);
      return v;
    };
    switch (arg) {
      case '--url': opts.url = next(); break;
      case '--out': opts.out = next(); break;
      case '--size': opts.size = next(); break;
      case '--wait': opts.wait = Number(next()); break;
      case '--scene': opts.scene = next(); break;
      case '--launch': opts.launch.push(next()); break;
      case '--data': opts.data = JSON.parse(next()); break;
      case '--game':
        opts.scene = GAME_PRESET.scene;
        opts.launch.push(...GAME_PRESET.launch);
        if (opts.data === null) opts.data = GAME_PRESET.data;
        break;
      case '--click': {
        const [x, y] = next().split(',').map(Number);
        if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('--click wants x,y');
        opts.clicks.push({ x, y });
        break;
      }
      case '--list': opts.list = true; break;
      case '--keep': opts.keep = true; break;
      case '--help': case '-h': opts.help = true; break;
      default: throw new Error(`unknown option: ${arg}`);
    }
  }
  return opts;
}

const USAGE = `
Usage: node tools/shot.mjs [options]

  --scene KEY     start this scene directly (e.g. MenuScene, GameScene)
  --launch KEY    also launch this scene in parallel; repeatable
  --game          shorthand for a running match: GameScene + UIScene
  --data JSON     data passed to the scene's init()
  --click X,Y     click canvas-relative coords; repeatable, applied in order
  --wait MS       settle time before capture (default ${DEFAULTS.wait})
  --size WxH      viewport (default ${DEFAULTS.size})
  --out PATH      output png (default ${DEFAULTS.out})
  --url URL       dev server (default ${DEFAULTS.url})
  --list          print scene keys and their status, capture nothing
  --keep          leave the browser open until Ctrl-C, for watching it live
`.trimStart();

const opts = parseArgs(process.argv.slice(2));
if (opts.help) {
  console.log(USAGE);
  process.exit(0);
}

const [width, height] = opts.size.split('x').map(Number);
if (!Number.isFinite(width) || !Number.isFinite(height)) {
  console.error(`bad --size: ${opts.size}`);
  process.exit(2);
}

const browser = await chromium.launch({ headless: !opts.keep });
const page = await browser.newPage({ viewport: { width, height } });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

try {
  await page.goto(opts.url, { waitUntil: 'domcontentloaded' });
} catch {
  console.error(`cannot reach ${opts.url} -- is the dev server up? (npm run dev)`);
  await browser.close();
  process.exit(2);
}

await page.waitForSelector('canvas', { timeout: 15000 });
// window.game only exists once Phaser has booted, and only in dev builds.
await page.waitForFunction(() => window.game?.scene?.scenes?.length > 0, { timeout: 15000 });

if (opts.list) {
  const scenes = await page.evaluate(() =>
    window.game.scene.scenes.map((s) => ({
      key: s.scene.key,
      active: s.scene.isActive(),
      visible: s.scene.isVisible(),
    })),
  );
  for (const s of scenes) {
    const flags = [s.active && 'active', s.visible && 'visible'].filter(Boolean).join(' ') || 'stopped';
    console.log(`${s.key.padEnd(22)} ${flags}`);
  }
  await browser.close();
  process.exit(0);
}

if (opts.scene) {
  const wanted = [opts.scene, ...opts.launch];
  const known = await page.evaluate((keys) => {
    const all = window.game.scene.scenes.map((s) => s.scene.key);
    return { missing: keys.filter((k) => !all.includes(k)), all };
  }, wanted);

  if (known.missing.length) {
    console.error(`no such scene: ${known.missing.join(', ')}`);
    console.error(`known scenes: ${known.all.join(', ')}`);
    await browser.close();
    process.exit(2);
  }

  // Let BootScene hand off first, otherwise its delayedCall to MenuScene
  // fires after us and stomps the scene we asked for.
  await page.waitForFunction(
    () => !window.game.scene.getScene('BootScene')?.scene.isActive(),
    { timeout: 15000 },
  );

  await page.evaluate(({ key, launch, data }) => {
    const keep = new Set([key, ...launch]);
    for (const s of window.game.scene.scenes) {
      if (s.scene.isActive() && !keep.has(s.scene.key)) s.scene.stop();
    }
    // Same order the lobby uses: start the owner, then bring up its parallel
    // scenes, so they pick up the systems_ready the owner emits.
    // game.scene is the SceneManager, whose start() runs a scene alongside
    // the others rather than replacing them -- launch() is scene-plugin only.
    window.game.scene.start(key, data ?? undefined);
    for (const extra of launch) {
      window.game.scene.stop(extra);
      window.game.scene.start(extra);
    }
  }, { key: opts.scene, launch: opts.launch, data: opts.data });
}

await page.waitForTimeout(opts.wait);

for (const { x, y } of opts.clicks) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('canvas vanished');
  await page.mouse.click(box.x + x, box.y + y);
  await page.waitForTimeout(400);
}

if (opts.clicks.length) await page.waitForTimeout(opts.wait);

const active = await page.evaluate(() =>
  window.game.scene.scenes.filter((s) => s.scene.isActive()).map((s) => s.scene.key),
);

const outPath = resolve(opts.out);
await mkdir(dirname(outPath), { recursive: true });
await page.screenshot({ path: outPath });

console.log(`${outPath}  [${active.join(' + ') || 'no active scene'}]`);

if (errors.length) {
  console.error(`\n${errors.length} page error(s):`);
  for (const e of errors) console.error(`  ${e}`);
}

if (opts.keep) {
  console.log('\n--keep: browser stays open, Ctrl-C to quit');
  await new Promise(() => {});
}

await browser.close();
process.exit(errors.length ? 1 : 0);
