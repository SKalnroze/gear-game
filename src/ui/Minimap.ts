import Phaser from 'phaser';
import { World } from '../world/World';
import { WORLD_WIDTH, WORLD_HEIGHT, PLAYER_ZONE_MAX_X, AI_ZONE_MIN_X, CANVAS_HEIGHT, PANEL_COLLAPSED_H } from '../constants/world.constants';
import { RESOURCE_COLORS } from '../types/resource.types';
import { GearType } from '../types/gear.types';
import { NEON } from '../constants/ui.constants';
import { eventBus } from '../systems/EventBus';

const GEAR_DOT_COLORS: Record<GearType, number> = {
  motor: 0x44ff88,
  amplifier: 0x4488ff,
  capacitor: 0xff00aa,
  overclock: 0xff2244,
  spiked: 0xff2266,
  armored: 0x778899,
  iron_miner: RESOURCE_COLORS.iron,
  crystal_miner: RESOURCE_COLORS.crystal,
  aether_miner: RESOURCE_COLORS.aether,
  infantry_spawner: 0x44ff88,
  artillery_spawner: 0x4488ff,
  cavalry_spawner: 0xff8800,
  iron_guard_spawner: RESOURCE_COLORS.iron,
  crystal_sentinel_spawner: RESOURCE_COLORS.crystal,
  aether_phantom_spawner: RESOURCE_COLORS.aether,
  researcher: 0x88ffee,
  iron_converter: 0xdd8844,
  crystal_converter: 0x44ddff,
  aether_converter: 0xdd44ff,
  crossbow_turret: 0xffdd00,
  artillery_turret: 0xff6600,
  healer: 0x44ff88,
};

/**
 * Minimap — dynamic size, neon border, click/drag to pan camera.
 */
export class Minimap {
  private scene: Phaser.Scene;
  private world: World;
  private camera: Phaser.Cameras.Scene2D.Camera;
  private graphics: Phaser.GameObjects.Graphics;
  private hitZone: Phaser.GameObjects.Zone;
  private originX: number;
  private originY: number;
  private mapW: number;
  private mapH: number;
  private scaleX: number;
  private scaleY: number;

  private isPointerDown: boolean = false;

  constructor(
    scene: Phaser.Scene,
    world: World,
    camera: Phaser.Cameras.Scene2D.Camera,
    x: number,
    y: number,
    mapW: number = 280,
    mapH: number = 52,
  ) {
    this.scene = scene;
    this.world = world;
    this.camera = camera;
    this.originX = x;
    this.originY = y;
    this.mapW = mapW;
    this.mapH = mapH;
    this.scaleX = mapW / WORLD_WIDTH;
    this.scaleY = mapH / WORLD_HEIGHT;

    this.graphics = scene.add.graphics();

    this.hitZone = scene.add.zone(x + mapW / 2, y + mapH / 2, mapW, mapH)
      .setInteractive({ cursor: 'crosshair' });

    this.hitZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.isPointerDown = true;
      this.panCameraToPointer(pointer);
    });
    this.hitZone.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.isPointerDown) this.panCameraToPointer(pointer);
    });
    this.hitZone.on('pointerup', () => { this.isPointerDown = false; });
    this.hitZone.on('pointerout', () => { this.isPointerDown = false; });

    // Listen for panel height changes to reposition minimap
    eventBus.on('ui:panel_height_changed', ({ topY, totalH }) => {
      // Position minimap at bottom-right above panel: x = canvasW - minimapW - 10, y = topY - minimapH - 4
      const newX = scene.scale.width - mapW - 10;
      const newY = topY - mapH - 4;
      this.reposition(newX, newY, mapW, mapH);
    });
  }

  reposition(x: number, y: number, mapW: number, mapH: number): void {
    this.originX = x;
    this.originY = y;
    this.mapW = mapW;
    this.mapH = mapH;
    this.scaleX = mapW / WORLD_WIDTH;
    this.scaleY = mapH / WORLD_HEIGHT;
    this.hitZone.setPosition(x + mapW / 2, y + mapH / 2);
    this.hitZone.setSize(mapW, mapH);
  }

  private panCameraToPointer(pointer: Phaser.Input.Pointer): void {
    const vw = this.scene.scale.width;
    const vh = this.scene.scale.height - PANEL_COLLAPSED_H;
    const localX = pointer.x - this.originX;
    const localY = pointer.y - this.originY;
    const worldX = localX / this.scaleX;
    const worldY = localY / this.scaleY;
    const newScrollX = Math.max(0, Math.min(WORLD_WIDTH - vw, worldX - vw / 2));
    const newScrollY = Math.max(0, Math.min(WORLD_HEIGHT - vh, worldY - vh / 2));
    this.camera.scrollX = newScrollX;
    this.camera.scrollY = newScrollY;
  }

  update(): void {
    this.draw();
  }

  private draw(): void {
    const g = this.graphics;
    g.clear();

    const ox = this.originX;
    const oy = this.originY;
    const mw = this.mapW;
    const mh = this.mapH;
    const sx = this.scaleX;
    const sy = this.scaleY;

    // Background
    g.fillStyle(0x050510, 1);
    g.fillRect(ox, oy, mw, mh);

    // Zone shading – flip if player is on the right
    const playerRight = this.world.isPlayerOnRight();
    if (!playerRight) {
      g.fillStyle(0x0d1b2a, 0.8);
      g.fillRect(ox, oy, PLAYER_ZONE_MAX_X * sx, mh);

      g.fillStyle(0x2a0d0d, 0.8);
      g.fillRect(ox + AI_ZONE_MIN_X * sx, oy, (WORLD_WIDTH - AI_ZONE_MIN_X) * sx, mh);
    } else {
      // AI zone on left, player zone on right
      g.fillStyle(0x2a0d0d, 0.8);
      g.fillRect(ox, oy, PLAYER_ZONE_MAX_X * sx, mh);

      g.fillStyle(0x0d1b2a, 0.8);
      g.fillRect(ox + AI_ZONE_MIN_X * sx, oy, (WORLD_WIDTH - AI_ZONE_MIN_X) * sx, mh);
    }

    // Base markers – colour flips as well
    if (!playerRight) {
      g.fillStyle(0x0055ff, 1);
      g.fillRect(ox, oy, 2, mh);
      g.fillStyle(0xff2200, 1);
      g.fillRect(ox + mw - 2, oy, 2, mh);
    } else {
      g.fillStyle(0xff2200, 1);
      g.fillRect(ox, oy, 2, mh);
      g.fillStyle(0x0055ff, 1);
      g.fillRect(ox + mw - 2, oy, 2, mh);
    }

    // Gears as dots (larger radius)
    for (const [, gear] of this.world.getAllGears()) {
      const dotX = ox + gear.x * sx;
      const dotY = oy + gear.y * sy;
      const color = GEAR_DOT_COLORS[gear.type] ?? 0x888888;
      g.fillStyle(color, gear.owner === 'player' ? 1.0 : 0.7);
      g.fillCircle(dotX, dotY, 3.5);
    }

    // Units as dots (larger radius)
    for (const [, unit] of this.world.getAllUnits()) {
      const dotX = ox + unit.x * sx;
      const dotY = oy + unit.y * sy;
      g.fillStyle(unit.owner === 'player' ? 0x00aaff : 0xff3300, 0.9);
      g.fillCircle(dotX, dotY, 2.5);
    }

    // Viewport rectangle (zoom-aware, 2D) with subtle fill
    const vpX = ox + this.camera.scrollX * sx;
    const vpW = (this.scene.scale.width / this.camera.zoom) * sx;
    const vpY = oy + this.camera.scrollY * sy;
    const vpH = Math.min(mh, (this.scene.scale.height / this.camera.zoom) * sy);
    g.fillStyle(0xffffff, 0.05);
    g.fillRect(vpX, vpY, vpW, vpH);
    g.lineStyle(1, 0xffffff, 0.8);
    g.strokeRect(vpX, vpY, vpW, vpH);

    // Neon border
    g.lineStyle(1, NEON.cyan, 0.7);
    g.strokeRect(ox, oy, mw, mh);
  }
}
