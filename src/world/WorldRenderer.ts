import Phaser from 'phaser';
import {
  WORLD_WIDTH, WORLD_HEIGHT,
  LANE_Y_MIN, LANE_Y_MAX,
  PLAYER_ZONE_MAX_X, AI_ZONE_MIN_X,
  PLAYER_BASE_X, AI_BASE_X, BASE_WIDTH,
} from '../constants/world.constants';
import type { PowerGraph } from './PowerGraph';
import { GearMeshGraph } from './GearMeshGraph';
import { GearState } from '../types/gear.types';
import { gearRadius } from '../constants/gear.constants';
import { RESOURCE_COLORS } from '../types/resource.types';

const COLOR_PLAYER_ZONE = 0x0d1b2a;
const COLOR_AI_ZONE = 0x2a0d0d;
const COLOR_LANE = 0x0d1a0d;
const COLOR_LANE_BORDER = 0x1a3a1a;
const COLOR_SNAP_VALID = 0x00ff88;
const COLOR_SNAP_INVALID = 0xff3333;
const COLOR_SNAP_RING = 0xffdd00;
const COLOR_MESH_ARC = 0xffcc00;
// Wires read cyan-white against the mesh arcs' amber, so the two layers never
// get confused; overload takes the same hot orange as the heat visuals, since
// they are the same failure escalating through one pipeline.
const COLOR_WIRE = 0x66ddff;
const COLOR_WIRE_OVERLOAD = 0xff6622;
const COLOR_WIRE_OK = 0x66ff99;
const COLOR_WIRE_BAD = 0xff4444;
const COLOR_PLAYER_BASE = 0x0055ff;
const COLOR_AI_BASE = 0xff2200;

export class WorldRenderer {
  private scene: Phaser.Scene;
  private worldGraphics: Phaser.GameObjects.Graphics;
  private overlayGraphics: Phaser.GameObjects.Graphics;
  private snapPreviewGraphics: Phaser.GameObjects.Graphics;
  private meshArcGraphics: Phaser.GameObjects.Graphics;
  private wireGraphics: Phaser.GameObjects.Graphics;
  private ghostGearGraphics: Phaser.GameObjects.Graphics;
  private flashGraphics: Phaser.GameObjects.Graphics;

  private labelPlayerZone!: Phaser.GameObjects.Text;
  private labelAiZone!: Phaser.GameObjects.Text;
  private labelLane!: Phaser.GameObjects.Text;

  // orientation state mirrors World.playerOnRight so renderer can flip
  private playerOnRight: boolean = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.worldGraphics = scene.add.graphics().setDepth(-50);
    this.overlayGraphics = scene.add.graphics();
    this.snapPreviewGraphics = scene.add.graphics();
    this.meshArcGraphics = scene.add.graphics();
    // Above the mesh arcs: an overloading wire is the highest-priority thing on
    // screen and must never be occluded by the gear train it is feeding.
    this.wireGraphics = scene.add.graphics().setDepth(2);
    this.ghostGearGraphics = scene.add.graphics();
    this.flashGraphics = scene.add.graphics();
    this.flashGraphics.setDepth(50);

    this.drawWorld();

    const labelStyle = { fontSize: '11px', color: '#445566', fontFamily: 'monospace' };
    this.labelPlayerZone = scene.add.text(10, 8, 'PLAYER ZONE', labelStyle);
    this.labelAiZone = scene.add.text(AI_ZONE_MIN_X + 10, 8, 'AI ZONE', {
      fontSize: '11px', color: '#664444', fontFamily: 'monospace',
    });
    this.labelLane = scene.add.text(
      PLAYER_ZONE_MAX_X + (AI_ZONE_MIN_X - PLAYER_ZONE_MAX_X) / 2 - 20,
      8, 'LANE',
      { fontSize: '11px', color: '#446644', fontFamily: 'monospace' },
    );

    this.redrawLabels();
  }

  /**
   * Notify the renderer that the player side has been flipped.
   */
  setPlayerOnRight(v: boolean): void {
    if (this.playerOnRight === v) return;
    this.playerOnRight = v;
    this.drawWorld();
    this.redrawLabels();
  }

  private redrawLabels(): void {
    if (!this.playerOnRight) {
      this.labelPlayerZone.setText('PLAYER ZONE').setPosition(10, 8);
      this.labelAiZone.setText('AI ZONE').setPosition(AI_ZONE_MIN_X + 10, 8);
    } else {
      this.labelPlayerZone.setText('AI ZONE').setPosition(10, 8);
      this.labelAiZone.setText('PLAYER ZONE').setPosition(AI_ZONE_MIN_X + 10, 8);
    }
    // lane label remains centered
    this.labelLane.setPosition(
      PLAYER_ZONE_MAX_X + (AI_ZONE_MIN_X - PLAYER_ZONE_MAX_X) / 2 - 20,
      8,
    );
  }

  private drawWorld(): void {
    const g = this.worldGraphics;
    g.clear();

    // Zone backgrounds – swapped when player is on the right side
    if (!this.playerOnRight) {
      // Player left, AI right (default)
      g.fillStyle(COLOR_PLAYER_ZONE, 1);
      g.fillRect(0, 0, PLAYER_ZONE_MAX_X, WORLD_HEIGHT);

      g.fillStyle(COLOR_AI_ZONE, 1);
      g.fillRect(AI_ZONE_MIN_X, 0, WORLD_WIDTH - AI_ZONE_MIN_X, WORLD_HEIGHT);

      // Center no-man's land
      g.fillStyle(0x111122, 1);
      g.fillRect(PLAYER_ZONE_MAX_X, 0, AI_ZONE_MIN_X - PLAYER_ZONE_MAX_X, WORLD_HEIGHT);
    } else {
      // Player right, AI left
      g.fillStyle(COLOR_AI_ZONE, 1);
      g.fillRect(0, 0, PLAYER_ZONE_MAX_X, WORLD_HEIGHT);

      g.fillStyle(COLOR_PLAYER_ZONE, 1);
      g.fillRect(AI_ZONE_MIN_X, 0, WORLD_WIDTH - AI_ZONE_MIN_X, WORLD_HEIGHT);

      // center region stays same color
      g.fillStyle(0x111122, 1);
      g.fillRect(PLAYER_ZONE_MAX_X, 0, AI_ZONE_MIN_X - PLAYER_ZONE_MAX_X, WORLD_HEIGHT);
    }

    // Lane band
    g.fillStyle(COLOR_LANE, 0.85);
    g.fillRect(0, LANE_Y_MIN, WORLD_WIDTH, LANE_Y_MAX - LANE_Y_MIN);

    // Lane band borders — subtle neon green
    g.lineStyle(1.5, 0x44ff88, 0.25);
    g.beginPath();
    g.moveTo(0, LANE_Y_MIN);
    g.lineTo(WORLD_WIDTH, LANE_Y_MIN);
    g.strokePath();
    g.beginPath();
    g.moveTo(0, LANE_Y_MAX);
    g.lineTo(WORLD_WIDTH, LANE_Y_MAX);
    g.strokePath();

    // Zone boundary lines — neon
    g.lineStyle(1.5, 0x00ffcc, 0.4);
    g.beginPath();
    g.moveTo(PLAYER_ZONE_MAX_X, 0);
    g.lineTo(PLAYER_ZONE_MAX_X, WORLD_HEIGHT);
    g.strokePath();

    g.lineStyle(1.5, 0xff00aa, 0.4);
    g.beginPath();
    g.moveTo(AI_ZONE_MIN_X, 0);
    g.lineTo(AI_ZONE_MIN_X, WORLD_HEIGHT);
    g.strokePath();

    // Midpoint marker
    g.lineStyle(1, 0x334455, 0.3);
    g.beginPath();
    g.moveTo(WORLD_WIDTH / 2, 0);
    g.lineTo(WORLD_WIDTH / 2, WORLD_HEIGHT);
    g.strokePath();

    // Subtle world grid for spatial reference
    g.lineStyle(1, 0xffffff, 0.02);
    const gridSpacing = 80;
    for (let gx = gridSpacing; gx < WORLD_WIDTH; gx += gridSpacing) {
      g.beginPath();
      g.moveTo(gx, 0);
      g.lineTo(gx, WORLD_HEIGHT);
      g.strokePath();
    }
    for (let gy = gridSpacing; gy < WORLD_HEIGHT; gy += gridSpacing) {
      g.beginPath();
      g.moveTo(0, gy);
      g.lineTo(WORLD_WIDTH, gy);
      g.strokePath();
    }

    this.drawBaseWalls(100, 100, 100, 100);
  }

  private drawBaseWalls(_playerHp: number, _playerMaxHp: number, _aiHp: number, _aiMaxHp: number): void {
    const g = this.overlayGraphics;
    g.clear();

    if (!this.playerOnRight) {
      g.fillStyle(COLOR_PLAYER_BASE, 0.9);
      g.fillRect(PLAYER_BASE_X - BASE_WIDTH / 2, 0, BASE_WIDTH, WORLD_HEIGHT);
      g.lineStyle(5, 0x88bbff, 1);
      g.strokeRect(PLAYER_BASE_X - BASE_WIDTH / 2, 0, BASE_WIDTH, WORLD_HEIGHT);

      g.fillStyle(COLOR_AI_BASE, 0.9);
      g.fillRect(AI_BASE_X - BASE_WIDTH / 2, 0, BASE_WIDTH, WORLD_HEIGHT);
      g.lineStyle(5, 0xff8888, 1);
      g.strokeRect(AI_BASE_X - BASE_WIDTH / 2, 0, BASE_WIDTH, WORLD_HEIGHT);
    } else {
      // swapped colours when player is on right
      g.fillStyle(COLOR_AI_BASE, 0.9);
      g.fillRect(PLAYER_BASE_X - BASE_WIDTH / 2, 0, BASE_WIDTH, WORLD_HEIGHT);
      g.lineStyle(5, 0xff8888, 1);
      g.strokeRect(PLAYER_BASE_X - BASE_WIDTH / 2, 0, BASE_WIDTH, WORLD_HEIGHT);

      g.fillStyle(COLOR_PLAYER_BASE, 0.9);
      g.fillRect(AI_BASE_X - BASE_WIDTH / 2, 0, BASE_WIDTH, WORLD_HEIGHT);
      g.lineStyle(5, 0x88bbff, 1);
      g.strokeRect(AI_BASE_X - BASE_WIDTH / 2, 0, BASE_WIDTH, WORLD_HEIGHT);
    }
  }

  /** Draw a ghost gear following the cursor (during drag placement) */
  drawGhostGear(x: number, y: number, teeth: number, valid: boolean, snapped: boolean): void {
    const g = this.ghostGearGraphics;
    g.clear();

    const radius = gearRadius(teeth);
    const color = valid ? COLOR_SNAP_VALID : COLOR_SNAP_INVALID;
    const ringColor = snapped ? COLOR_SNAP_RING : color;

    g.fillStyle(color, 0.2);
    g.fillCircle(x, y, radius);

    g.lineStyle(snapped ? 3 : 2, ringColor, snapped ? 1.0 : 0.7);
    g.strokeCircle(x, y, radius);

    if (snapped) {
      g.lineStyle(2, COLOR_SNAP_RING, 0.9);
      g.strokeCircle(x, y, radius + 4);
    }
  }

  clearGhostGear(): void {
    this.ghostGearGraphics.clear();
  }

  /** Draw mesh connection lines between meshed gears */
  drawMeshArcs(meshGraph: GearMeshGraph, gears: Map<string, GearState>): void {
    this.meshArcGraphics.clear();
    this.meshArcGraphics.lineStyle(1.5, COLOR_MESH_ARC, 0.65);

    for (const edge of meshGraph.getAllEdges()) {
      const a = gears.get(edge.gearIdA);
      const b = gears.get(edge.gearIdB);
      if (!a || !b) continue;
      this.meshArcGraphics.beginPath();
      this.meshArcGraphics.moveTo(a.x, a.y);
      this.meshArcGraphics.lineTo(b.x, b.y);
      this.meshArcGraphics.strokePath();
    }
  }

  /**
   * Draw the wire network.
   *
   * Wires read as a distinct layer from mesh arcs -- thicker, warmer, and drawn
   * on top -- because they are a different kind of fact: a mesh arc is a
   * consequence of where two gears sit, a wire is something the player
   * deliberately ran. A grid that is overloading pulses hot along every wire in
   * it, so the thing that turns red is the thing the player drew.
   */
  drawPowerWires(
    powerGraph: PowerGraph,
    gears: Map<string, GearState>,
    gridHeat: Map<string, number>,
    now: number,
  ): void {
    this.wireGraphics.clear();

    for (const wire of powerGraph.getAllWires()) {
      const a = gears.get(wire.gearIdA);
      const b = gears.get(wire.gearIdB);
      if (!a || !b) continue;

      // Both ends are always in the same grid, so either key works.
      const overload = gridHeat.get(wire.gearIdA) ?? 0;
      let color = COLOR_WIRE;
      let width = 2;
      let alpha = 0.75;

      if (overload > 0) {
        // Pulse faster the harder it is overloading -- an urgency the player
        // can read at a glance without reading a number.
        const pulse = 0.5 + 0.5 * Math.sin(now * 0.006 * (1 + overload * 2));
        color = COLOR_WIRE_OVERLOAD;
        width = 2 + 2 * Math.min(1, overload);
        alpha = 0.6 + 0.4 * pulse;
      }

      this.wireGraphics.lineStyle(width, color, alpha);
      this.wireGraphics.beginPath();
      this.wireGraphics.moveTo(a.x, a.y);
      this.wireGraphics.lineTo(b.x, b.y);
      this.wireGraphics.strokePath();
    }
  }

  /** Rubber-band preview while the player is drawing a wire. */
  drawWirePreview(from: GearState, toX: number, toY: number, valid: boolean): void {
    this.wireGraphics.lineStyle(2, valid ? COLOR_WIRE_OK : COLOR_WIRE_BAD, 0.9);
    this.wireGraphics.beginPath();
    this.wireGraphics.moveTo(from.x, from.y);
    this.wireGraphics.lineTo(toX, toY);
    this.wireGraphics.strokePath();
  }

  drawBases(playerHp: number, playerMaxHp: number, aiHp: number, aiMaxHp: number): void {
    this.drawBaseWalls(playerHp, playerMaxHp, aiHp, aiMaxHp);
  }

  flashBase(owner: 'player' | 'ai'): void {
    const baseX = owner === 'player' ? PLAYER_BASE_X : AI_BASE_X;

    this.flashGraphics.clear();
    this.flashGraphics.fillStyle(0xffffff, 0.5);
    this.flashGraphics.fillRect(baseX - BASE_WIDTH / 2, 0, BASE_WIDTH, WORLD_HEIGHT);

    this.scene.tweens.add({
      targets: this.flashGraphics,
      alpha: 0,
      duration: 200,
      onComplete: () => {
        this.flashGraphics.clear();
        this.flashGraphics.setAlpha(1);
      },
    });
  }
}
