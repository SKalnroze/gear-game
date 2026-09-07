import Phaser from 'phaser';
import { eventBus } from '../systems/EventBus';
import { GearType } from '../types/gear.types';
import { TechState } from '../types/tech.types';
import { GEAR_DEFINITIONS, DEFAULT_TEETH } from '../constants/gear.constants';
import { tierForTeeth } from '../constants/tier.constants';
import { gearPlacementCost } from '../constants/balance.constants';
import { NEON, NEON_STR } from '../constants/ui.constants';
import { TECH_NODES } from '../constants/tech.constants';
import { panelState } from './SlidingPanel';

const TILE_W = 148;
const TILE_H = 96;
const MIN_COLS = 3;
const MAX_COLS = 5;
const PADDING = 8;
const TEETH_BAR_H = 46;

const TYPE_COLORS: Record<GearType, number> = {
  motor: NEON.green,
  amplifier: NEON.blue,
  capacitor: NEON.magenta,
  overclock: NEON.red,
  spiked: NEON.red,
  armored: 0x8899aa,
  iron_miner: 0xcc9966,
  crystal_miner: 0x66ccff,
  aether_miner: 0xcc66ff,
  infantry_spawner: NEON.green,
  artillery_spawner: NEON.blue,
  cavalry_spawner: NEON.orange,
  slime_spawner: 0x999999,
  iron_guard_spawner: 0xcc9966,
  crystal_sentinel_spawner: 0x66ccff,
  aether_phantom_spawner: 0xcc66ff,
  researcher: 0x88ffee,
  iron_converter: 0xdd8844,
  crystal_converter: 0x44ddff,
  aether_converter: 0xdd44ff,
  crossbow_turret: 0xffdd00,
  artillery_turret: 0xff6600,
  minelayer: 0xaa3355,
  healer: 0x44ff88,
  crossbow_spawner: 0xffcc44,
  sentry_spawner: 0x66ffcc,
  sentry_gear: 0x66ffcc,
  relief_valve: 0xffaa22,
  sapper_spawner: 0xaa8866,
  skirmish_diver_spawner: 0xff5577,
  saboteur_spawner: 0x884499,
  raider_spawner: 0xffaa33,
  field_medic_spawner: 0x44ffaa,
};

/** Short display name for gear types that are too long */
export function gearDisplayName(type: GearType): string {
  const map: Partial<Record<GearType, string>> = {
    iron_miner: 'IRON MINER',
    crystal_miner: 'CRYSTAL MINER',
    aether_miner: 'AETHER MINER',
    infantry_spawner: 'INF SPAWNER',
    artillery_spawner: 'ART SPAWNER',
    cavalry_spawner: 'CAV SPAWNER',
    iron_guard_spawner: 'IRON GUARD',
    crystal_sentinel_spawner: 'CRYS SENT.',
    aether_phantom_spawner: 'AETHER PH.',
    crossbow_spawner: 'XBOW SPAWNER',
    sentry_spawner: 'SENTRY SPWN',
    sapper_spawner: 'SAPPER SPWN',
    skirmish_diver_spawner: 'DIVER SPWN',
    saboteur_spawner: 'SABOTEUR SPWN',
    raider_spawner: 'RAIDER SPWN',
    field_medic_spawner: 'MEDIC SPWN',
  };
  return map[type] ?? type.replace(/_/g, ' ').toUpperCase();
}

/**
 * GearGridSection: gear selection grid with bigger tiles and readable fonts
 * - 132×84px tiles, 5 columns
 * - Colored top stripe per type, 11px+ text
 * - Hover border glow
 */
export class GearGridSection {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private playerTech: TechState;
  private readonly: boolean;
  private selectedTeeth: number = DEFAULT_TEETH;

  private teethText!: Phaser.GameObjects.Text;
  private tiles: Map<GearType, Phaser.GameObjects.Container> = new Map();
  private tileGraphics: Map<GearType, { border: Phaser.GameObjects.Graphics; isLocked: boolean }> = new Map();
  private costTexts: Map<GearType, Phaser.GameObjects.Text> = new Map();
  private scrollY: number = 0;
  private contentHeight: number = 0;
  private maxScrollY: number = 0;
  private visibleH: number = 0;
  private tilesContainer!: Phaser.GameObjects.Container;
  private hitZones: Map<GearType, Phaser.GameObjects.Zone> = new Map();
  private rowY: Map<GearType, number> = new Map();
  private cols: number = MAX_COLS;
  private barBg!: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, playerTech: TechState, readonly: boolean = false) {
    this.scene = scene;
    this.playerTech = playerTech;
    this.readonly = readonly;
    this.cols = this.computeCols(scene.scale.width);
    this.container = scene.add.container(8, 8);

    this.buildGrid();
    if (!readonly) {
      this.setupInputHandlers();
    }
  }

  private computeCols(canvasW: number): number {
    return Phaser.Math.Clamp(Math.floor(canvasW / (TILE_W + PADDING)), MIN_COLS, MAX_COLS);
  }

  private buildGrid(): void {
    // ── Gear tiles grid (added FIRST so teeth bar renders on top) ──
    this.tilesContainer = this.scene.add.container(0, TEETH_BAR_H);
    this.container.add(this.tilesContainer);

    for (const gearType of Object.keys(GEAR_DEFINITIONS) as GearType[]) {
      const tile = this.createTile(gearType);
      this.tilesContainer.add(tile);
      this.tiles.set(gearType, tile);
    }

    this.layoutTiles();

    // Mouse wheel scrolling
    this.scene.input.on('wheel', (_ptr: Phaser.Input.Pointer, _objs: unknown, _dx: number, dy: number) => {
      this.applyScroll(dy > 0 ? 30 : -30);
    });

    // Re-clip hit areas whenever the panel slides (expand/collapse/resize),
    // since scrolled tiles can otherwise stay clickable outside the visible
    // panel body -- e.g. overlapping the tab bar once the panel is closed.
    eventBus.on('ui:panel_height_changed', this.handlePanelHeightChanged);
    this.updateTileInputVisibility();

    // ── Teeth picker bar (added AFTER tiles so it renders on top) ──
    this.barBg = this.scene.add.rectangle(
      (this.cols * (TILE_W + PADDING)) / 2 - PADDING / 2, TEETH_BAR_H / 2,
      this.cols * (TILE_W + PADDING) - PADDING, TEETH_BAR_H - 4,
      0x0a1020, 1,
    );
    this.container.add(this.barBg);

    const teethLabel = this.scene.add.text(8, TEETH_BAR_H / 2 - 8, 'GEAR TIER', {
      fontSize: '13px', color: '#667788', fontFamily: 'monospace', fontStyle: 'bold',
    });
    this.container.add(teethLabel);

    const prevBtn = this.scene.add.text(120, TEETH_BAR_H / 2 - 9, '◀', {
      fontSize: '18px', color: this.readonly ? '#334455' : NEON_STR.cyan, fontFamily: 'monospace',
    });
    if (!this.readonly) {
      prevBtn.setInteractive({ useHandCursor: true });
      prevBtn.on('pointerdown', () => { if (!panelState.isAnimating) this.changeTeethe(-1); });
    }
    this.container.add(prevBtn);

    this.teethText = this.scene.add.text(144, TEETH_BAR_H / 2 - 9, this.tierLabel(), {
      fontSize: '18px', color: NEON_STR.yellow, fontFamily: 'monospace', fontStyle: 'bold',
    });
    this.container.add(this.teethText);

    const nextBtn = this.scene.add.text(178, TEETH_BAR_H / 2 - 9, '▶', {
      fontSize: '18px', color: this.readonly ? '#334455' : NEON_STR.cyan, fontFamily: 'monospace',
    });
    if (!this.readonly) {
      nextBtn.setInteractive({ useHandCursor: true });
      nextBtn.on('pointerdown', () => { if (!panelState.isAnimating) this.changeTeethe(1); });
    }
    this.container.add(nextBtn);
  }

  /** Positions all tiles for the current column count and recomputes scroll limits. */
  private layoutTiles(): void {
    let x = 0;
    let y = 0;
    let col = 0;
    for (const gearType of this.tiles.keys()) {
      const tile = this.tiles.get(gearType)!;
      tile.setPosition(x, y);
      this.rowY.set(gearType, y);

      col++;
      if (col >= this.cols) {
        col = 0;
        x = 0;
        y += TILE_H + PADDING;
      } else {
        x += TILE_W + PADDING;
      }
    }

    const rows = Math.ceil(this.tiles.size / this.cols);
    this.contentHeight = rows * (TILE_H + PADDING);
    this.visibleH = 380 - 8 - TEETH_BAR_H;
    this.maxScrollY = Math.max(0, this.contentHeight - this.visibleH);
    this.scrollY = Phaser.Math.Clamp(this.scrollY, 0, this.maxScrollY);
    this.tilesContainer.setY(TEETH_BAR_H - this.scrollY);
  }

  /** Recomputes column count for the given canvas width and re-lays-out the grid if it changed. */
  public resize(canvasW: number): void {
    const newCols = this.computeCols(canvasW);
    if (newCols === this.cols) return;
    this.cols = newCols;
    this.layoutTiles();
    if (this.barBg) {
      this.barBg.setPosition((this.cols * (TILE_W + PADDING)) / 2 - PADDING / 2, TEETH_BAR_H / 2);
      this.barBg.setSize(this.cols * (TILE_W + PADDING) - PADDING, TEETH_BAR_H - 4);
    }
    this.updateTileInputVisibility();
  }

  private applyScroll(delta: number): void {
    this.scrollY = Phaser.Math.Clamp(this.scrollY + delta, 0, this.maxScrollY);
    this.tilesContainer.setY(TEETH_BAR_H - this.scrollY);
    this.updateTileInputVisibility();
  }

  private readonly handlePanelHeightChanged = (): void => {
    this.updateTileInputVisibility();
  };

  /**
   * Enables/disables each tile's hit zone based on whether it's actually
   * inside the currently visible panel body -- scroll offset can otherwise
   * leave tiles clickable while they're masked out of view (e.g. shifted up
   * under the tab bar, or entirely off-screen while the panel is collapsed).
   */
  private updateTileInputVisibility(): void {
    if (!panelState.isExpanded) {
      for (const [, zone] of this.hitZones) {
        if (zone.input) zone.input.enabled = false;
      }
      return;
    }
    for (const [gearType, zone] of this.hitZones) {
      const y = this.rowY.get(gearType) ?? 0;
      const visible = y + TILE_H > this.scrollY && y < this.scrollY + this.visibleH;
      if (zone.input) zone.input.enabled = visible;
    }
  }

  private createTile(gearType: GearType): Phaser.GameObjects.Container {
    const tile = this.scene.add.container(0, 0);
    const typeColor = TYPE_COLORS[gearType];
    const def = GEAR_DEFINITIONS[gearType];
    const isUnlocked = !def?.unlockNode || this.playerTech.researched.has(def.unlockNode);

    // ── Background ──
    const bg = this.scene.add.rectangle(
      TILE_W / 2, TILE_H / 2,
      TILE_W - 2, TILE_H - 2,
      0x08101a, 0.95,
    );
    tile.add(bg);

    // ── Top color stripe (5px) ──
    const stripe = this.scene.add.rectangle(
      TILE_W / 2, 3,
      TILE_W - 2, 5,
      typeColor, isUnlocked ? 0.9 : 0.3,
    );
    tile.add(stripe);

    // ── Border (graphics for hover support) ──
    const border = this.scene.add.graphics();
    this.drawBorder(border, typeColor, isUnlocked ? 0.45 : 0.15);
    tile.add(border);

    // ── Gear name ──
    const nameText = this.scene.add.text(8, 13, gearDisplayName(gearType), {
      fontSize: '13px',
      color: isUnlocked ? '#cce0ff' : '#445566',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      wordWrap: { width: TILE_W - 16 },
    });
    tile.add(nameText);

    // ── Gold placement cost ──
    const cost = gearPlacementCost(this.selectedTeeth);
    const costText = this.scene.add.text(TILE_W - 8, TILE_H - 17, `G ${cost}`, {
      fontSize: '13px',
      color: isUnlocked ? NEON_STR.yellow : '#334455',
      fontFamily: 'monospace',
      align: 'right',
    }).setOrigin(1, 0);
    tile.add(costText);

    // Store cost text for live updates
    this.costTexts.set(gearType, costText);

    // ── Lock overlay ──
    if (!isUnlocked) {
      const lockBg = this.scene.add.rectangle(
        TILE_W / 2, TILE_H / 2,
        TILE_W - 2, TILE_H - 2,
        0x000000, 0.6,
      );
      tile.add(lockBg);
      const lockIcon = this.scene.add.text(TILE_W / 2, TILE_H / 2 + 4, '🔒', {
        fontSize: '20px',
      }).setOrigin(0.5);
      tile.add(lockIcon);
    }

    // ── Hit zone + hover ──
    const hitZone = this.scene.add.zone(TILE_W / 2, TILE_H / 2, TILE_W - 2, TILE_H - 2);
    hitZone.setInteractive({ useHandCursor: isUnlocked });

    // Mini procedural gear icon (12px radius, type-colored)
    const miniGearG = this.scene.add.graphics();
    const miniR = 7;
    const miniTeeth = 6;
    miniGearG.fillStyle(typeColor, isUnlocked ? 0.5 : 0.15);
    miniGearG.beginPath();
    for (let i = 0; i <= miniTeeth * 2; i++) {
      const angle = (i / (miniTeeth * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? miniR : miniR - 2.5;
      const gx = TILE_W - 20 + Math.cos(angle) * r;
      const gy = 20 + Math.sin(angle) * r;
      if (i === 0) miniGearG.moveTo(gx, gy);
      else miniGearG.lineTo(gx, gy);
    }
    miniGearG.closePath();
    miniGearG.fillPath();
    miniGearG.fillStyle(typeColor, isUnlocked ? 0.3 : 0.1);
    miniGearG.fillCircle(TILE_W - 20, 20, miniR * 0.4);
    tile.add(miniGearG);

    if (isUnlocked && !this.readonly) {
      hitZone.on('pointerover', () => {
        bg.setFillStyle(0x0d1e30, 1);
        this.drawBorder(border, typeColor, 1.0);
        stripe.setAlpha(1);
        this.scene.tweens.add({
          targets: tile,
          scaleX: 1.03,
          scaleY: 1.03,
          duration: 80,
          ease: 'Quad.Out',
        });
        const pointer = this.scene.input.activePointer;
        const costVal = gearPlacementCost(this.selectedTeeth);
        const desc = def?.description ?? '';
        const tooltipLines = [gearDisplayName(gearType)];
        if (desc) tooltipLines.push(desc);
        tooltipLines.push(`G Cost: ${costVal}`);
        eventBus.emit('ui:tooltip_show', { text: tooltipLines.join('\n'), x: pointer.x + 14, y: pointer.y - 24 });
      });
      hitZone.on('pointerout', () => {
        bg.setFillStyle(0x08101a, 0.95);
        this.drawBorder(border, typeColor, 0.45);
        stripe.setAlpha(0.9);
        this.scene.tweens.add({
          targets: tile,
          scaleX: 1,
          scaleY: 1,
          duration: 80,
          ease: 'Quad.Out',
        });
        eventBus.emit('ui:tooltip_hide', {});
      });
      hitZone.on('pointerdown', () => {
        if (panelState.isAnimating || !panelState.isExpanded) return;
        eventBus.emit('ui:gear_drag_start', { gearType, teeth: this.selectedTeeth });
      });
    } else if (!isUnlocked) {
      // Show locked tooltip with unlock requirement, via the shared TooltipManager
      hitZone.on('pointerover', () => {
        const unlockNode = Object.values(TECH_NODES).find(n =>
          n.effects.some(e => e.kind === 'unlock_gear' && (e as { kind: string; gearType: string }).gearType === gearType)
        );
        const msg = unlockNode ? `Requires: ${unlockNode.name}` : 'Locked';
        const pointer = this.scene.input.activePointer;
        eventBus.emit('ui:tooltip_show', { text: msg, x: pointer.x + 14, y: pointer.y - 24 });
      });
      hitZone.on('pointerout', () => {
        eventBus.emit('ui:tooltip_hide', {});
      });
    }
    tile.add(hitZone);

    this.hitZones.set(gearType, hitZone);
    this.tileGraphics.set(gearType, { border, isLocked: !isUnlocked });
    return tile;
  }

  private drawBorder(g: Phaser.GameObjects.Graphics, color: number, alpha: number): void {
    g.clear();
    g.lineStyle(1.5, color, alpha);
    g.strokeRect(1, 1, TILE_W - 3, TILE_H - 3);
  }

  /** e.g. "T2 · 12t" -- tier is what the player chooses, teeth is the silhouette. */
  private tierLabel(): string {
    return `T${tierForTeeth(this.selectedTeeth)} · ${this.selectedTeeth}t`;
  }

  private changeTeethe(delta: number): void {
    const validTeeth = this.playerTech.unlockedTeeth || [DEFAULT_TEETH];
    const currentIdx = validTeeth.indexOf(this.selectedTeeth);
    const newIdx = Phaser.Math.Clamp(currentIdx + delta, 0, validTeeth.length - 1);
    this.selectedTeeth = validTeeth[newIdx];
    this.teethText.setText(this.tierLabel());
    eventBus.emit('ui:teeth_changed', { teeth: this.selectedTeeth });

    // Update all cost texts to reflect new teeth size
    const goldCost = gearPlacementCost(this.selectedTeeth);
    for (const [, costText] of this.costTexts) {
      costText.setText(`G ${goldCost}`);
    }
  }

  private readonly handleResearchComplete = (): void => {
    this.rebuildGrid();
  };

  private setupInputHandlers(): void {
    eventBus.on('tech:research_complete', this.handleResearchComplete);
    eventBus.on('ui:teeth_wheel_delta', this.handleTeethWheelDelta);
  }

  private readonly handleTeethWheelDelta = ({ delta }: { delta: number }): void => {
    if (panelState.isAnimating) return;
    this.changeTeethe(delta);
  };

  private rebuildGrid(): void {
    for (const [gearType, tile] of this.tiles) {
      const wasLocked = this.tileGraphics.get(gearType)?.isLocked ?? true;
      const gearDef = GEAR_DEFINITIONS[gearType];
      const isNowUnlocked = !gearDef?.unlockNode || this.playerTech.researched.has(gearDef.unlockNode);
      if (wasLocked && isNowUnlocked) {
        // Rebuild this tile
        const tilePos = { x: tile.x, y: tile.y };
        tile.destroy();
        const newTile = this.createTile(gearType);
        newTile.setPosition(tilePos.x, tilePos.y);
        this.tilesContainer.add(newTile);
        this.tiles.set(gearType, newTile);
        this.rowY.set(gearType, tilePos.y);
      }
    }
    this.updateTileInputVisibility();
  }

  public getContainer(): Phaser.GameObjects.Container {
    return this.container;
  }

  public destroy(): void {
    eventBus.off('tech:research_complete', this.handleResearchComplete);
    eventBus.off('ui:panel_height_changed', this.handlePanelHeightChanged);
    eventBus.off('ui:teeth_wheel_delta', this.handleTeethWheelDelta);
  }

  public reposition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }
}
