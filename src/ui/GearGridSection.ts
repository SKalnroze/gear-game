import Phaser from 'phaser';
import { eventBus } from '../systems/EventBus';
import { GearType } from '../types/gear.types';
import { TechState } from '../types/tech.types';
import { GEAR_DEFINITIONS, DEFAULT_TEETH } from '../constants/gear.constants';
import { gearPlacementCost } from '../constants/balance.constants';
import { NEON, NEON_STR } from '../constants/ui.constants';
import { TECH_NODES } from '../constants/tech.constants';
import { panelState } from './SlidingPanel';

const TILE_W = 148;
const TILE_H = 96;
const GRID_COLS = 5;
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
  iron_guard_spawner: 0xcc9966,
  crystal_sentinel_spawner: 0x66ccff,
  aether_phantom_spawner: 0xcc66ff,
  researcher: 0x88ffee,
  iron_converter: 0xdd8844,
  crystal_converter: 0x44ddff,
  aether_converter: 0xdd44ff,
  crossbow_turret: 0xffdd00,
  artillery_turret: 0xff6600,
  healer: 0x44ff88,
};

/** Short display name for gear types that are too long */
function gearDisplayName(type: GearType): string {
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
  private tilesContainer!: Phaser.GameObjects.Container;

  // Shared locked tooltip
  private lockedTooltip!: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, playerTech: TechState, readonly: boolean = false) {
    this.scene = scene;
    this.playerTech = playerTech;
    this.readonly = readonly;
    this.container = scene.add.container(8, 8);

    this.buildGrid();
    this.buildLockedTooltip();
    if (!readonly) {
      this.setupInputHandlers();
    }
  }

  private buildGrid(): void {
    // ── Gear tiles grid (added FIRST so teeth bar renders on top) ──
    this.tilesContainer = this.scene.add.container(0, TEETH_BAR_H);
    this.container.add(this.tilesContainer);

    let x = 0;
    let y = 0;
    let col = 0;

    for (const gearType of Object.keys(GEAR_DEFINITIONS) as GearType[]) {
      const tile = this.createTile(gearType);
      tile.setPosition(x, y);
      this.tilesContainer.add(tile);
      this.tiles.set(gearType, tile);

      col++;
      if (col >= GRID_COLS) {
        col = 0;
        x = 0;
        y += TILE_H + PADDING;
      } else {
        x += TILE_W + PADDING;
      }
    }

    // Compute scroll limits (panel body = 380px, minus container offset of 8)
    const rows = Math.ceil(Object.keys(GEAR_DEFINITIONS).length / GRID_COLS);
    this.contentHeight = rows * (TILE_H + PADDING);
    const visibleH = 380 - 8 - TEETH_BAR_H;
    this.maxScrollY = Math.max(0, this.contentHeight - visibleH);

    // Mouse wheel scrolling
    this.scene.input.on('wheel', (_ptr: Phaser.Input.Pointer, _objs: unknown, _dx: number, dy: number) => {
      this.applyScroll(dy > 0 ? 30 : -30);
    });

    // ── Teeth picker bar (added AFTER tiles so it renders on top) ──
    const barBg = this.scene.add.rectangle(
      (GRID_COLS * (TILE_W + PADDING)) / 2 - PADDING / 2, TEETH_BAR_H / 2,
      GRID_COLS * (TILE_W + PADDING) - PADDING, TEETH_BAR_H - 4,
      0x0a1020, 1,
    );
    this.container.add(barBg);

    const teethLabel = this.scene.add.text(8, TEETH_BAR_H / 2 - 8, 'TEETH SIZE', {
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

    this.teethText = this.scene.add.text(144, TEETH_BAR_H / 2 - 9, `${this.selectedTeeth}t`, {
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

  private applyScroll(delta: number): void {
    this.scrollY = Phaser.Math.Clamp(this.scrollY + delta, 0, this.maxScrollY);
    this.tilesContainer.setY(TEETH_BAR_H - this.scrollY);
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
      // Show locked tooltip with unlock requirement
      hitZone.on('pointerover', () => {
        const unlockNode = Object.values(TECH_NODES).find(n =>
          n.effects.some(e => e.kind === 'unlock_gear' && (e as { kind: string; gearType: string }).gearType === gearType)
        );
        const msg = unlockNode ? `Requires: ${unlockNode.name}` : 'Locked';
        this.lockedTooltip.setText(msg);
        this.lockedTooltip.setVisible(true);
      });
      hitZone.on('pointerout', () => {
        this.lockedTooltip.setVisible(false);
      });
    }
    tile.add(hitZone);

    this.tileGraphics.set(gearType, { border, isLocked: !isUnlocked });
    return tile;
  }

  private buildLockedTooltip(): void {
    this.lockedTooltip = this.scene.add.text(8, 4, '', {
      fontSize: '11px', color: '#aabbcc', fontFamily: 'monospace',
      backgroundColor: '#060e18',
      padding: { x: 6, y: 4 },
    });
    this.lockedTooltip.setDepth(100);
    this.lockedTooltip.setVisible(false);
    this.container.add(this.lockedTooltip);
  }

  private drawBorder(g: Phaser.GameObjects.Graphics, color: number, alpha: number): void {
    g.clear();
    g.lineStyle(1.5, color, alpha);
    g.strokeRect(1, 1, TILE_W - 3, TILE_H - 3);
  }

  private changeTeethe(delta: number): void {
    const validTeeth = this.playerTech.unlockedTeeth || [DEFAULT_TEETH];
    const currentIdx = validTeeth.indexOf(this.selectedTeeth);
    const newIdx = Phaser.Math.Clamp(currentIdx + delta, 0, validTeeth.length - 1);
    this.selectedTeeth = validTeeth[newIdx];
    this.teethText.setText(`${this.selectedTeeth}t`);
    eventBus.emit('ui:teeth_changed', { teeth: this.selectedTeeth });

    // Update all cost texts to reflect new teeth size
    const goldCost = gearPlacementCost(this.selectedTeeth);
    for (const [, costText] of this.costTexts) {
      costText.setText(`G ${goldCost}`);
    }
  }

  private setupInputHandlers(): void {
    eventBus.on('tech:research_complete', () => {
      this.rebuildGrid();
    });
  }

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
      }
    }
  }

  public getContainer(): Phaser.GameObjects.Container {
    return this.container;
  }

  public reposition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }
}
