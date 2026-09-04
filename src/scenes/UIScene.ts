import Phaser from 'phaser';
import { eventBus } from '../systems/EventBus';
import { LayoutManager } from '../systems/LayoutManager';
import { TooltipManager } from '../ui/TooltipManager';
import { ToastManager } from '../ui/ToastManager';
import { Minimap } from '../ui/Minimap';
import { SlidingPanel } from '../ui/SlidingPanel';
import { GearGridSection } from '../ui/GearGridSection';
import { RadialTechSection } from '../ui/RadialTechSection';
import { ActionsSection } from '../ui/ActionsSection';
import { BaseHealthBars } from '../ui/BaseHealthBars';
import { TechState } from '../types/tech.types';
import { AIStrategyProfile } from '../types/ai.types';
import { PANEL_COLLAPSED_H, WORLD_WIDTH, WORLD_HEIGHT } from '../constants/world.constants';
import { NEON, NEON_STR, UI_DEPTH } from '../constants/ui.constants';
import { neonBtn } from '../ui/NeonRex';

/**
 * UIScene: runs in parallel with GameScene, provides all HUD elements.
 * Uses LayoutManager for responsive positioning.
 * In spectate mode, shows the full UI panel with a perspective toggle.
 * All elements are in UIScene camera space → unaffected by GameScene zoom.
 */
export class UIScene extends Phaser.Scene {
  private layout!: LayoutManager;
  private slidingPanel!: SlidingPanel;
  private gearGridSection!: GearGridSection;
  private radialTechSection!: RadialTechSection;
  private actionsSection!: ActionsSection;
  private tooltipManager!: TooltipManager;
  private toastManager!: ToastManager;
  private minimap!: Minimap;
  private healthBars!: BaseHealthBars;
  /** Per-frame research-bar refresh; removed on shutdown. */
  private onSceneUpdate: (() => void) | null = null;

  // Spectate state
  private spectateOwner: 'player' | 'ai' = 'player';
  private isSpectate: boolean = false;
  private playerIsRight: boolean = false; // orientation flag

  // Spectate overlay elements (for toggle-button text update)
  private spectateToggleBtn: Phaser.GameObjects.Text | null = null;

  // Stored for rebuild
  private techSystem!: import('../systems/TechSystem').TechSystem;
  private abilitySystem!: import('../systems/AbilitySystem').AbilitySystem;
  private aiAbilitySystem!: import('../systems/AbilitySystem').AbilitySystem;
  private playerTech!: TechState;
  private aiTech!: TechState;
  private world!: import('../world/World').World;
  private camera!: Phaser.Cameras.Scene2D.Camera;
  private isPractice!: boolean;

  constructor() {
    super({ key: 'UIScene', active: false });
  }

  init(data: { spectateOwner?: 'player' | 'ai'; playerIsRight?: boolean } = {}): void {
    if (data.spectateOwner) this.spectateOwner = data.spectateOwner;
    if (data.playerIsRight !== undefined) this.playerIsRight = data.playerIsRight;
  }

  create(): void {
    this.layout = new LayoutManager(this);

    const gameScene = this.scene.get('GameScene') as Phaser.Scene;

    gameScene.events.once('systems_ready', (data: {
      techSystem: import('../systems/TechSystem').TechSystem;
      economySystem: import('../systems/EconomySystem').EconomySystem;
      playerTech: TechState;
      unitSystem: import('../systems/UnitSystem').UnitSystem;
      winSystem: import('../systems/WinConditionSystem').WinConditionSystem;
      abilitySystem: import('../systems/AbilitySystem').AbilitySystem;
      aiAbilitySystem: import('../systems/AbilitySystem').AbilitySystem;
      world: import('../world/World').World;
      camera: Phaser.Cameras.Scene2D.Camera;
      isPractice: boolean;
      aiTech?: TechState;
      isSpectate?: boolean;
      playerIsRight?: boolean;
    }) => {
      this.techSystem = data.techSystem;
      this.abilitySystem = data.abilitySystem;
      this.aiAbilitySystem = data.aiAbilitySystem;
      this.playerTech = data.playerTech;
      this.aiTech = data.aiTech ?? data.playerTech;
      this.world = data.world;
      this.camera = data.camera;
      this.isPractice = data.isPractice;
      this.isSpectate = data.isSpectate ?? false;
      if (data.playerIsRight !== undefined) this.playerIsRight = data.playerIsRight;

      this.setupUI(data);

      if (this.isSpectate) {
        this.createSpectateOverlay();
        this.listenSpectateSwitch();
      }
    });
  }

  private setupUI(data: {
    techSystem: import('../systems/TechSystem').TechSystem;
    economySystem: import('../systems/EconomySystem').EconomySystem;
    playerTech: TechState;
    unitSystem: import('../systems/UnitSystem').UnitSystem;
    winSystem: import('../systems/WinConditionSystem').WinConditionSystem;
    abilitySystem: import('../systems/AbilitySystem').AbilitySystem;
    aiAbilitySystem: import('../systems/AbilitySystem').AbilitySystem;
    world: import('../world/World').World;
    camera: Phaser.Cameras.Scene2D.Camera;
    isPractice: boolean;
  }): void {
    const { abilitySystem, world, camera, winSystem } = data;

    // ── Health bars (always visible, top of screen) ────────────────────────
    let playerLabel: string;
    let aiLabel: string;
    if (this.isSpectate) {
      playerLabel = 'PLAYER 1';
      aiLabel     = 'PLAYER 2';
    } else if (this.playerIsRight) {
      // swap labels when human is on right side
      playerLabel = 'AI BASE';
      aiLabel     = 'PLAYER BASE';
    } else {
      playerLabel = 'PLAYER BASE';
      aiLabel     = 'AI BASE';
    }
    const humanOwner: 'player' | 'ai' | null =
      this.isSpectate ? null : this.playerIsRight ? 'ai' : 'player';
    this.healthBars = new BaseHealthBars(this, winSystem, playerLabel, aiLabel, humanOwner);

    // ── Tooltip (must be first — high depth) ──────────────────────────────
    this.tooltipManager = new TooltipManager(this, eventBus);

    // ── Toast notifications ────────────────────────────────────────────────
    this.toastManager = new ToastManager(this, eventBus);

    // ── SlidingPanel ──────────────────────────────────────────────────────
    this.slidingPanel = new SlidingPanel(this, this.scale.width, this.scale.height, data.isPractice);
    this.slidingPanel.setEconomySystem(data.economySystem);

    // In spectate mode the current view tech may differ from playerTech
    const viewTech = this.isSpectate && this.spectateOwner === 'ai'
      ? this.aiTech
      : this.playerTech;
    const readonly = this.isSpectate;

    // ── Panel tab sections ─────────────────────────────────────────────────
    this.gearGridSection = new GearGridSection(this, viewTech, readonly);
    this.slidingPanel.registerTabBody('gears', this.gearGridSection.getContainer());

    this.radialTechSection = new RadialTechSection(this, this.techSystem, viewTech, this.scale.width, this.spectateOwner, readonly);
    this.slidingPanel.registerTabBody('tech', this.radialTechSection.getContainer());

    const viewAbilitySystem = this.isSpectate && this.spectateOwner === 'ai'
      ? this.aiAbilitySystem
      : abilitySystem;
    this.actionsSection = new ActionsSection(this, viewAbilitySystem, viewTech, readonly);
    this.slidingPanel.registerTabBody('actions', this.actionsSection.getContainer());

    // ── Minimap ────────────────────────────────────────────────────────────
    const mapW = 280;
    const mapH = Math.round(mapW * WORLD_HEIGHT / WORLD_WIDTH);
    this.minimap = new Minimap(
      this, world, camera,
      this.scale.width - mapW - 10,
      this.scale.height - PANEL_COLLAPSED_H - mapH - 4,
      mapW, mapH,
    );

    // ── Return-to-menu button (non-spectate games only) ───────────────────
    if (!this.isSpectate) {
      this.createMenuButton();
    }

    // ── Research progress update ───────────────────────────────────────────
    // Held in a field so onShutdown can remove it: a scene emitter survives
    // shutdown, so re-registering per session stacked one extra per-frame
    // callback for every game played.
    this.onSceneUpdate = () => {
      const owner = this.isSpectate ? this.spectateOwner : 'player';
      const progress = this.techSystem.getResearchProgress(owner);
      this.slidingPanel.updateResearch(progress);
    };
    this.events.on('update', this.onSceneUpdate);

    // ── Resize handler ─────────────────────────────────────────────────────
    this.layout.onResize = (newState) => {
      this.minimap.reposition(newState.minimap.x, newState.minimap.y, newState.minimap.w, newState.minimap.h);
      this.slidingPanel.resize(newState.canvasW, newState.canvasH);
      this.radialTechSection.resize(newState.canvasW);
    };

    // ── Shutdown cleanup ───────────────────────────────────────────────────
    this.events.once('shutdown', () => this.onShutdown());
  }

  /**
   * Small "MENU" button in the top-left corner for non-spectate games.
   * Stops both GameScene and UIScene, then returns to MenuScene.
   */
  private createMenuButton(): void {
    neonBtn(this, 8, 8, 72, 28, NEON.cyan, NEON_STR.cyan, 'MENU', 11, () => {
      this.scene.stop('GameScene');
      this.scene.start('MenuScene');
    }).setDepth(UI_DEPTH.HUD_OVERLAY);
  }

  /**
   * Creates the spectate bar at the top of the screen in UIScene space.
   * Since UIScene has its own camera (zoom=1 always), this is zoom-immune.
   */
  private createSpectateOverlay(): void {
    const cw = this.scale.width;
    const barY = 48; // below health bars

    // Title — centered
    this.add.text(cw / 2, barY, 'SPECTATE — AI vs AI', {
      fontSize: '15px',
      color: '#cc88ff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      backgroundColor: '#00000099',
      padding: { left: 14, right: 14, top: 5, bottom: 5 },
    }).setOrigin(0.5, 0).setDepth(400);

    // Back-to-menu button — below title
    const menuBtn = this.add.text(cw / 2, barY + 32, '[ BACK TO MENU ]', {
      fontSize: '11px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
      backgroundColor: '#00000099',
      padding: { left: 10, right: 10, top: 4, bottom: 4 },
    }).setOrigin(0.5, 0).setDepth(400).setInteractive({ useHandCursor: true });

    menuBtn.on('pointerover', () => menuBtn.setColor('#ffffff'));
    menuBtn.on('pointerout',  () => menuBtn.setColor('#aaaaaa'));
    menuBtn.on('pointerdown', () => {
      this.scene.stop('GameScene');
      this.scene.start('MenuScene');
    });

    // Perspective toggle — right side
    let currentOwner: 'player' | 'ai' = 'player';
    this.spectateToggleBtn = this.add.text(cw - 12, barY, '👁 VIEW: PLAYER 1', {
      fontSize: '12px',
      color: NEON_STR.blue,
      fontFamily: 'monospace',
      backgroundColor: '#00000099',
      padding: { left: 10, right: 10, top: 4, bottom: 4 },
    }).setOrigin(1, 0).setDepth(400).setInteractive({ useHandCursor: true });

    this.spectateToggleBtn.on('pointerover', () => this.spectateToggleBtn?.setColor('#ffffff'));
    this.spectateToggleBtn.on('pointerout', () => {
      this.spectateToggleBtn?.setColor(currentOwner === 'player' ? NEON_STR.blue : NEON_STR.red);
    });
    this.spectateToggleBtn.on('pointerdown', () => {
      currentOwner = currentOwner === 'player' ? 'ai' : 'player';
      const col = currentOwner === 'player' ? NEON_STR.blue : NEON_STR.red;
      this.spectateToggleBtn?.setColor(col);
      this.spectateToggleBtn?.setText(currentOwner === 'player' ? '👁 VIEW: PLAYER 1' : '👁 VIEW: PLAYER 2');
      eventBus.emit('spectate:switch_view', { owner: currentOwner });
    });
  }

  /** Called only in spectate mode: listen for perspective switch events. */
  private listenSpectateSwitch(): void {
    eventBus.on('spectate:switch_view', ({ owner }: { owner: 'player' | 'ai' }) => {
      this.spectateOwner = owner;
      this.rebuildPanelForOwner(owner);
    });
  }

  /**
   * Destroy and recreate GearGridSection, RadialTechSection, ActionsSection
   * with the correct TechState for the given owner (spectate only).
   */
  private rebuildPanelForOwner(owner: 'player' | 'ai'): void {
    if (!this.isSpectate) return;

    const viewTech = owner === 'ai' ? this.aiTech : this.playerTech;

    this.actionsSection.destroy();
    this.gearGridSection.destroy();
    this.gearGridSection.getContainer().destroy();
    this.radialTechSection.destroy();
    this.radialTechSection.getContainer().destroy();

    this.gearGridSection = new GearGridSection(this, viewTech, true);
    this.slidingPanel.registerTabBody('gears', this.gearGridSection.getContainer());

    this.radialTechSection = new RadialTechSection(this, this.techSystem, viewTech, this.scale.width, owner, true);
    this.slidingPanel.registerTabBody('tech', this.radialTechSection.getContainer());

    const viewAbilitySystem = owner === 'ai' ? this.aiAbilitySystem : this.abilitySystem;
    this.actionsSection = new ActionsSection(this, viewAbilitySystem, viewTech, true);
    this.slidingPanel.registerTabBody('actions', this.actionsSection.getContainer());
  }

  private onShutdown(): void {
    if (this.onSceneUpdate) {
      this.events.off('update', this.onSceneUpdate);
      this.onSceneUpdate = null;
    }
    this.tooltipManager?.destroy();
    this.toastManager?.destroy();
    this.healthBars?.destroy();
    this.actionsSection?.destroy();
    this.gearGridSection?.destroy();
    this.radialTechSection?.destroy();
    this.layout?.destroy();
    if (this.isSpectate) {
      eventBus.removeAllListeners('spectate:switch_view');
    }
  }

  update(): void {
    if (this.minimap) {
      this.minimap.update();
    }
    if (this.radialTechSection) {
      this.radialTechSection.update(Date.now());
    }
  }
}
