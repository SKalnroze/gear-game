import { test, expect } from '@playwright/test';
import { bootGame, startScene, DEFAULT_MATCH } from './helpers';

/**
 * End-to-end coverage for the electrical grid.
 *
 * The pure solve and the wiring rules are unit-tested; what only a real match
 * can prove is that the graph, the systems and the scene agree with each other
 * -- above all that a wire survives (or correctly does not survive) a gear
 * being moved, which is the desync class that motivated keeping wires out of
 * GearState entirely.
 *
 * These drive the systems through the scene rather than through mouse
 * positions, because a canvas gives Playwright nothing to select and clicking
 * fixed fractions is how four earlier snapshots ended up capturing the wrong
 * scene.
 */

/**
 * Place a gear directly through GearSystem and return its id.
 *
 * Throws rather than returning null: a refused placement (overlap, zone) would
 * otherwise surface much later as an undefined dereference inside PowerGraph,
 * which says nothing about the actual mistake. Gear radius is tier x 2.5 x
 * teeth, so tier-5 gears need 200px between centres.
 */
async function place(page: import('@playwright/test').Page, type: string, tier: number, x: number, y: number) {
  const id = await page.evaluate(([t, ti, px, py]) => {
    const scene = (window as any).game.scene.getScene('GameScene');
    const gear = scene.gearSystem.tryPlace(t, ti, px, py, 'player', true);
    return gear ? gear.id : null;
  }, [type, tier, x, y] as const);
  if (!id) throw new Error(`could not place ${type} T${tier} at (${x}, ${y}) -- overlap or zone`);
  return id;
}

interface GridReadout {
  owner: string; generation: number; demand: number; stored: number;
  sold: number; overflow: number; satisfaction: number; size: number;
}

async function grids(page: import('@playwright/test').Page): Promise<GridReadout[]> {
  return page.evaluate(() => {
    const scene = (window as any).game.scene.getScene('GameScene');
    return scene.powerSystem.getGrids().map((g: any) => ({
      owner: g.owner, generation: g.generation, demand: g.demand,
      stored: g.stored, sold: g.sold, overflow: g.overflow,
      satisfaction: g.satisfaction, size: g.gearIds.length,
    }));
  });
}

/**
 * Wait until the game's own clock has advanced `ms` of SIMULATED time.
 *
 * Headless Chromium throttles rAF hard -- five wall-clock seconds can be under
 * one second of game time here -- so a fixed `waitForTimeout` makes any
 * assertion about accumulated production flaky for reasons that have nothing to
 * do with the code under test.
 */
async function advanceGameMs(page: import('@playwright/test').Page, ms: number) {
  const start = await page.evaluate(() =>
    (window as any).game.scene.getScene('GameScene').gameClock.now);
  await page.waitForFunction(
    ([from, span]) =>
      (window as any).game.scene.getScene('GameScene').gameClock.now - from >= span,
    [start, ms] as const,
    { timeout: 60000 },
  );
}

async function wire(page: import('@playwright/test').Page, a: string, b: string) {
  return page.evaluate(([idA, idB]) => {
    const scene = (window as any).game.scene.getScene('GameScene');
    const ga = scene.world.getGear(idA);
    const gb = scene.world.getGear(idB);
    const result = scene.powerGraph.addWire(ga, gb);
    scene.powerSystem.markGraphDirty();
    return result;
  }, [a, b] as const);
}

test.describe('electrical grid', () => {
  test.beforeEach(async ({ page }) => {
    await bootGame(page);
    await startScene(page, 'GameScene', DEFAULT_MATCH);
  });

  test('each side starts with a grid tie at its base, and it cannot be sold', async ({ page }) => {
    const ties = await page.evaluate(() => {
      const scene = (window as any).game.scene.getScene('GameScene');
      return [...scene.world.getAllGears().values()]
        .filter((g: any) => g.type === 'grid_tie')
        .map((g: any) => ({ id: g.id, owner: g.owner }));
    });
    expect(ties).toHaveLength(2);
    expect(new Set(ties.map((t: any) => t.owner))).toEqual(new Set(['player', 'ai']));

    const refund = await page.evaluate((id) => {
      const scene = (window as any).game.scene.getScene('GameScene');
      return scene.gearSystem.sellGear(id);
    }, ties[0].id);
    expect(refund).toBeNull();
  });

  test('a solar panel wired to a motor powers it', async ({ page }) => {
    const solar = await place(page, 'solar_panel', 1, 300, 700);
    const motor = await place(page, 'motor', 1, 380, 700);
    expect(await wire(page, solar, motor)).toBe('ok');
    await page.waitForTimeout(500);

    const grid = (await grids(page)).find((g) => g.size === 2 && g.generation > 0);
    expect(grid).toBeDefined();
    expect(grid!.demand).toBeGreaterThan(0);
    expect(grid!.satisfaction).toBeGreaterThan(0);
  });

  test('a battery stores surplus instead of letting it overload', async ({ page }) => {
    const solar = await place(page, 'solar_panel', 3, 300, 700);
    const battery = await place(page, 'battery', 1, 380, 700);
    await wire(page, solar, battery);
    await page.waitForTimeout(800);

    const stored = await page.evaluate((id) => {
      const scene = (window as any).game.scene.getScene('GameScene');
      return scene.world.getGear(id).charge;
    }, battery);
    expect(stored).toBeGreaterThan(0);
  });

  test('generation with no tie and no storage overloads', async ({ page }) => {
    // Tier-5 radius is 100, so centres must clear 200px to not overlap; wire
    // reach is 140, so 250 apart needs a pole in between.
    const a = await place(page, 'solar_panel', 5, 300, 620);
    const pole = await place(page, 'power_pole', 1, 300, 800);
    const b = await place(page, 'solar_panel', 5, 300, 980);
    await wire(page, a, pole);
    await wire(page, pole, b);
    await page.waitForTimeout(600);

    const grid = (await grids(page)).find((g) => g.size === 3);
    expect(grid).toBeDefined();
    expect(grid!.overflow).toBeGreaterThan(0);
    expect(grid!.sold).toBe(0);
  });

  /**
   * The whole reason selling is a built thing: reaching the buyer is what turns
   * a self-cooking surplus into income.
   */
  test('wiring that same surplus to the grid tie turns overload into gold', async ({ page }) => {
    const tie = await page.evaluate(() => {
      const scene = (window as any).game.scene.getScene('GameScene');
      const t = [...scene.world.getAllGears().values()]
        .find((g: any) => g.type === 'grid_tie' && g.owner === 'player') as any;
      // Park the panel within the tie's reach so one wire connects them.
      return { id: t.id, x: t.x, y: t.y };
    });

    // Clear of the tie's own radius, and well inside the tie's pole-class reach.
    const solar = await place(page, 'solar_panel', 5, tie.x + 160, tie.y);
    expect(await wire(page, solar, tie.id)).toBe('ok');
    await page.waitForTimeout(800);

    const sold = (await grids(page)).reduce((sum, g) => sum + g.sold, 0);
    expect(sold).toBeGreaterThan(0);
  });

  /**
   * Wires are authored facts rather than consequences of geometry, so they have
   * to survive a move -- or be cut and reported. Only an end-to-end run proves
   * GearSystem, PowerSystem and PowerGraph agree about that.
   */
  test('repositioning a gear out of range cuts its wire', async ({ page }) => {
    const solar = await place(page, 'solar_panel', 1, 300, 700);
    const motor = await place(page, 'motor', 1, 380, 700);
    await wire(page, solar, motor);

    const cut = await page.evaluate(([solarId, motorId]) => {
      const scene = (window as any).game.scene.getScene('GameScene');
      const before = scene.powerGraph.hasWire(solarId, motorId);
      // Emit the same event GearSystem.repositionGear emits, after moving it
      // far beyond wire reach.
      const gear = scene.world.getGear(motorId);
      gear.x = 900;
      scene.world.updateGear(gear);
      (window as any).game.registry;
      scene.powerSystem['onGearRepositioned']({ gearId: motorId });
      return { before, after: scene.powerGraph.hasWire(solarId, motorId) };
    }, [solar, motor] as const);

    expect(cut.before).toBe(true);
    expect(cut.after).toBe(false);
  });

  test('a wire stays put when the move keeps it in range', async ({ page }) => {
    const solar = await place(page, 'solar_panel', 1, 300, 700);
    const motor = await place(page, 'motor', 1, 380, 700);
    await wire(page, solar, motor);

    const still = await page.evaluate(([solarId, motorId]) => {
      const scene = (window as any).game.scene.getScene('GameScene');
      const gear = scene.world.getGear(motorId);
      gear.x = 400;
      scene.world.updateGear(gear);
      scene.powerSystem['onGearRepositioned']({ gearId: motorId });
      return scene.powerGraph.hasWire(solarId, motorId);
    }, [solar, motor] as const);

    expect(still).toBe(true);
  });

  test('selling a wired gear takes its wires with it', async ({ page }) => {
    const solar = await place(page, 'solar_panel', 1, 300, 700);
    const motor = await place(page, 'motor', 1, 380, 700);
    await wire(page, solar, motor);

    const after = await page.evaluate(([solarId, motorId]) => {
      const scene = (window as any).game.scene.getScene('GameScene');
      scene.gearSystem.sellGear(motorId);
      return scene.powerGraph.wireCount(solarId);
    }, [solar, motor] as const);

    expect(after).toBe(0);
  });

  test('a powered coal miner fills the coal stock', async ({ page }) => {
    // The whole loop in one test: electricity turns the motor, the motor turns
    // the miner, the miner produces. Tier 1 keeps the chain light so it gets
    // through a full rotation quickly.
    const motor = await place(page, 'motor', 1, 300, 700);
    await place(page, 'coal_miner', 1, 340, 700);
    const solar = await place(page, 'solar_panel', 1, 300, 790);
    expect(await wire(page, solar, motor)).toBe('ok');

    // Coal only accrues on a COMPLETED rotation, so wait on simulated time.
    await advanceGameMs(page, 6000);

    const coal = await page.evaluate(() => {
      const scene = (window as any).game.scene.getScene('GameScene');
      return scene.economySystem.getResources('player').coal;
    });
    expect(coal).toBeGreaterThan(0);
  });

  /**
   * The core trade of the redesign, end to end: electricity buys speed. An
   * unwired motor still turns -- under-power is safe -- but slowly enough that
   * building a grid is obviously worth it.
   */
  test('an unwired motor turns far slower than a wired one', async ({ page }) => {
    const wiredMotor = await place(page, 'motor', 1, 300, 700);
    const solar = await place(page, 'solar_panel', 1, 300, 790);
    await wire(page, solar, wiredMotor);
    // Well clear of the free starting defenses, which sit mid-lane around x=700.
    const loneMotor = await place(page, 'motor', 1, 250, 1050);

    await advanceGameMs(page, 2000);

    const speeds = await page.evaluate(([a, b]) => {
      const scene = (window as any).game.scene.getScene('GameScene');
      return {
        wired: Math.abs(scene.world.getGear(a).angularVelocity),
        lone: Math.abs(scene.world.getGear(b).angularVelocity),
      };
    }, [wiredMotor, loneMotor] as const);

    expect(speeds.lone).toBeGreaterThan(0);          // idling, not bricked
    expect(speeds.wired / speeds.lone).toBeGreaterThan(3);
  });

  test('a match with electrical gears runs without page errors', async ({ page }) => {
    const errors = await bootGame(page);
    await startScene(page, 'GameScene', DEFAULT_MATCH);
    const solar = await place(page, 'solar_panel', 2, 300, 700);
    const battery = await place(page, 'battery', 2, 380, 700);
    const crank = await place(page, 'crank', 1, 300, 820);
    await wire(page, solar, battery);
    await page.waitForTimeout(2500);
    expect(errors).toEqual([]);
  });

  /**
   * The heat failure pipeline end to end: a gear driven hot seizes, the chain
   * behind it stops, and it recovers rather than being lost -- "recoverable if
   * the player reacts" is the whole design of the band, not just a nice value.
   */
  test('an overheated gear seizes, stops the chain, then recovers when it cools', async ({ page }) => {
    const motor = await place(page, 'motor', 1, 300, 700);
    // A driven gear, not a second motor: a motor has torque of its own and
    // should keep turning regardless of what happens to its neighbour.
    const driven = await place(page, 'armored', 1, 340, 700);

    const seized = await page.evaluate(([hotId, otherId]) => {
      const scene = (window as any).game.scene.getScene('GameScene');
      const gear = scene.world.getGear(hotId);
      // Drive it well past its threshold, as a fast unoiled chain would.
      gear.heat = 10_000;
      scene.world.updateGear(gear);
      scene.rotationPhysics.update(0.016);
      return {
        hot: scene.world.getGear(hotId).isSeized === true,
        hotOmega: scene.world.getGear(hotId).angularVelocity,
        otherOmega: scene.world.getGear(otherId).angularVelocity,
      };
    }, [motor, driven] as const);

    expect(seized.hot).toBe(true);
    expect(seized.hotOmega).toBe(0);
    expect(seized.otherOmega).toBe(0);   // the chain stops, not just the gear

    const recovered = await page.evaluate((hotId) => {
      const scene = (window as any).game.scene.getScene('GameScene');
      const gear = scene.world.getGear(hotId);
      gear.heat = 0;
      scene.world.updateGear(gear);
      scene.rotationPhysics.update(0.016);
      return {
        stillSeized: scene.world.getGear(hotId).isSeized === true,
        omega: Math.abs(scene.world.getGear(hotId).angularVelocity),
      };
    }, motor);

    expect(recovered.stillSeized).toBe(false);
    expect(recovered.omega).toBeGreaterThan(0);
  });

  test('an oiler makes oil from coal and it spreads to meshed neighbours', async ({ page }) => {
    const oiler = await place(page, 'oiler', 1, 300, 700);
    const neighbour = await place(page, 'motor', 1, 340, 700);
    // Power the motor, or it idles at MOTOR_BASELINE and never completes the
    // rotation the oiler needs to produce anything.
    const solar = await place(page, 'solar_panel', 1, 340, 790);
    await wire(page, solar, neighbour);

    await page.evaluate(() => {
      const scene = (window as any).game.scene.getScene('GameScene');
      scene.economySystem.earnResource('player', 'coal', 50);
    });
    await advanceGameMs(page, 8000);

    const oil = await page.evaluate(([oilerId, otherId]) => {
      const scene = (window as any).game.scene.getScene('GameScene');
      return {
        oiler: scene.world.getGear(oilerId).oil ?? 0,
        neighbour: scene.world.getGear(otherId).oil ?? 0,
      };
    }, [oiler, neighbour] as const);

    expect(oil.oiler).toBeGreaterThan(0);
    // Oil rides the teeth, so a meshed neighbour gets wet without any wiring.
    expect(oil.neighbour).toBeGreaterThan(0);
  });

});