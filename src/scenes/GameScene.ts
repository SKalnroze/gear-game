import Phaser from 'phaser';
import { eventBus } from '../systems/EventBus';
import { World } from '../world/World';
import { GearMeshGraph } from '../world/GearMeshGraph';
import { WorldRenderer } from '../world/WorldRenderer';
import { GearSystem } from '../systems/GearSystem';
import { RotationPhysicsSystem } from '../systems/RotationPhysicsSystem';
import { EconomySystem } from '../systems/EconomySystem';
import { UnitSystem } from '../systems/UnitSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { ProjectileSystem } from '../systems/ProjectileSystem';
import { WinConditionSystem } from '../systems/WinConditionSystem';
import { TechSystem } from '../systems/TechSystem';
import { GearUnitInteractionSystem } from '../systems/GearUnitInteractionSystem';
import { AIController } from '../ai/AIController';
import { AbilitySystem } from '../systems/AbilitySystem';
import { GearEntity } from '../entities/Gear';
import { panelState } from '../ui/SlidingPanel';
import { UnitEntity } from '../entities/Unit';
import { GearType, GearState } from '../types/gear.types';
import { UnitState } from '../types/unit.types';
import { TechState } from '../types/tech.types';
import { AIStrategyProfile } from '../types/ai.types';
import {
  GEAR_DEFINITIONS, gearRadius, gearPowerCost, DEFAULT_TEETH,
  motorOutput, motorTorque, spikeDamage, miningOutput,
  researcherOutput, converterOutput, healerOutput, healerRadius, turretMaxAmmo, turretRange,
} from '../constants/gear.constants';
import {
  WORLD_WIDTH, WORLD_HEIGHT,
  EDGE_SCROLL_MARGIN, EDGE_SCROLL_SPEED,
  CANVAS_HEIGHT, PANEL_COLLAPSED_H, PANEL_EXPANDED_H,
} from '../constants/world.constants';
import { AI_INITIAL_DECISION_DELAY, REPOSITION_COOLDOWN_MS, CAPACITOR_BURST_ROTATIONS } from '../constants/balance.constants';
import { SoundManager } from '../systems/SoundManager';
import { ParticleManager } from '../systems/ParticleManager';
import { FloatingTextManager } from '../ui/FloatingTextManager';
import { GAME_SETTINGS } from '../constants/ui.constants';
import { TurretSystem } from '../systems/TurretSystem';
import { AIDebugOverlay } from '../ai/AIDebugOverlay';
import { GameEventLogger } from '../ai/GameEventLogger';
import { GameStatsTracker } from '../systems/GameStatsTracker';

/**
 * GameScene: pure orchestrator.
 * Instantiates and wires all systems; delegates to them every tick.
 * Manages visual entities (GearEntity, UnitEntity) in sync with system state.
 * Camera pans the 2800px-wide world; edge-scroll when pointer nears viewport edges.
 */
export class GameScene extends Phaser.Scene {
  // Systems
  private world!: World;
  private meshGraph!: GearMeshGraph;
  private worldRenderer!: WorldRenderer;
  private gearSystem!: GearSystem;
  private rotationPhysics!: RotationPhysicsSystem;
  private economySystem!: EconomySystem;
  private unitSystem!: UnitSystem;
  private combatSystem!: CombatSystem;
  private winSystem!: WinConditionSystem;
  private techSystem!: TechSystem;
  private gearUnitInteraction!: GearUnitInteractionSystem;
  private aiController!: AIController;
  private playerAIController: AIController | null = null;
  private isSpectate: boolean = false;
  private abilitySystem!: AbilitySystem;
  private soundManager!: SoundManager;
  private particleManager!: ParticleManager;
  private floatingTextManager!: FloatingTextManager;
  private projectileSystem!: ProjectileSystem;
  private projectileGraphics!: Phaser.GameObjects.Graphics;
  private rangeCircleGraphics!: Phaser.GameObjects.Graphics;
  private turretSystem!: TurretSystem;
  private aiDebugOverlay!: AIDebugOverlay;
  private gameEventLogger!: GameEventLogger;

  // Entity maps
  private gearEntities: Map<string, GearEntity> = new Map();
  private unitEntities: Map<string, UnitEntity> = new Map();

  // Drag state — now teeth-based
  private dragGearType: GearType | null = null;
  private dragGearTeeth: number = DEFAULT_TEETH;
  private isDragging: boolean = false;
  private removeMode: boolean = false;
  private asEnemyMode: boolean = false;  // practice only: place gears as enemy owner
  private isPaused: boolean = false;      // pause all game simulation

  // Selected teeth for player placement (updated by GearGridSection)
  private selectedTeeth: number = DEFAULT_TEETH;

  // Reposition state (legacy drag-to-reposition; pickup system is preferred for player)
  private repositionGearId: string | null = null;
  private isRepositioning: boolean = false;
  private repositionOriginal: { x: number; y: number } | null = null;

  // Pickup state — for placing gears that are already on the board
  private pickedUpGearId: string | null = null;
  private pickedUpGearOriginalPos: { x: number; y: number } | null = null;

  // Hover tooltip state
  private hoveredGearId: string | null = null;

  // Camera zoom and pan state
  private cameraZoom: number = 1.0;
  private isPanningCamera: boolean = false;
  private panStart: { px: number; py: number; scrollX: number; scrollY: number } = {
    px: 0, py: 0, scrollX: 0, scrollY: 0,
  };

  private playerTech!: TechState;
  private tickNumber: number = 0;
  private difficulty: AIStrategyProfile = 'medium';

  private gameStatsTracker!: GameStatsTracker;
  private gameStartTime = 0;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: { difficulty?: AIStrategyProfile | 'spectate' }): void {
    this.isSpectate = data.difficulty === 'spectate';
    this.difficulty = this.isSpectate ? 'hard' : (data.difficulty as AIStrategyProfile ?? 'medium');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x05050f);

    // ─── Camera setup ─────────────────────────────────────────────────────
    // No hard bounds — clampCamera() enforces "at least 1 world pixel visible"
    // so the camera can scroll freely when zoomed out

    // ─── Initialize data model ───────────────────────────────────────────
    this.playerTech = { researched: new Set(), queue: [], unlockedTeeth: [DEFAULT_TEETH] };

    this.world = new World();
    this.meshGraph = new GearMeshGraph();
    this.worldRenderer = new WorldRenderer(this);

    // ─── Systems ─────────────────────────────────────────────────────────
    const isPractice = this.difficulty === 'practice';
    this.gearSystem = new GearSystem(this.world, this.meshGraph, eventBus, this.playerTech);
    this.rotationPhysics = new RotationPhysicsSystem(this.world, this.meshGraph, eventBus);
    this.economySystem = new EconomySystem(eventBus, this.world);
    this.economySystem.setRotationPhysics(this.rotationPhysics);
    if (isPractice) this.economySystem.setPracticeMode(true);
    this.unitSystem = new UnitSystem(eventBus);
    this.unitSystem.setWorld(this.world);
    this.unitSystem.setEconomySystem(this.economySystem);
    this.combatSystem = new CombatSystem(eventBus, this.unitSystem);
    this.winSystem = new WinConditionSystem(eventBus, isPractice);
    this.gearUnitInteraction = new GearUnitInteractionSystem(this.world, eventBus);
    this.abilitySystem = new AbilitySystem(eventBus, this.economySystem);
    this.rotationPhysics.setAbilitySystem(this.abilitySystem);

    this.techSystem = new TechSystem(
      eventBus, this.economySystem, this.unitSystem,
      this.rotationPhysics, this.winSystem, this.playerTech,
      this.abilitySystem,
    );

    this.aiController = new AIController(
      eventBus, this.gearSystem, this.economySystem, this.unitSystem,
      this.winSystem, this.rotationPhysics, this.world, this.meshGraph, this.difficulty,
      this.techSystem, 'ai',
    );

    if (this.isSpectate) {
      this.playerAIController = new AIController(
        eventBus, this.gearSystem, this.economySystem, this.unitSystem,
        this.winSystem, this.rotationPhysics, this.world, this.meshGraph,
        'hard', this.techSystem, 'player',
      );
    }

    this.economySystem.setUnitSystem(this.unitSystem);

    this.soundManager = new SoundManager(this, eventBus);
    this.particleManager = new ParticleManager(this, eventBus, this.world);
    this.floatingTextManager = new FloatingTextManager(this, eventBus, this.world);
    this.projectileSystem = new ProjectileSystem();
    this.projectileGraphics = this.add.graphics().setDepth(150);
    this.rangeCircleGraphics = this.add.graphics().setDepth(145);
    this.turretSystem = new TurretSystem(this.world, eventBus, this.projectileSystem, this.unitSystem);

    this.gameStartTime = Date.now();
    this.gameStatsTracker = new GameStatsTracker(
      eventBus, this.economySystem, this.winSystem, this.techSystem, this.gameStartTime,
    );

    // Artillery explosion animation
    eventBus.on('projectile:hit', ({ x, y, aoeRadius }: { x: number; y: number; aoeRadius: number }) => {
      if (aoeRadius <= 0) return; // crystal shards don't explode
      this.showExplosionAnimation(x, y, aoeRadius);
    });

    // Healer pulse visual effect
    eventBus.on('gear:healer_pulse', ({ x, y, radius }: { x: number; y: number; radius: number }) => {
      const g = this.add.graphics().setDepth(155);
      const data = { r: 0, alpha: 0.6 };
      this.tweens.add({
        targets: data,
        r: radius,
        alpha: 0,
        duration: 600,
        ease: 'Cubic.easeOut',
        onUpdate: () => {
          g.clear();
          g.lineStyle(2, 0x44ff88, data.alpha);
          g.strokeCircle(x, y, data.r);
          g.fillStyle(0x44ff88, data.alpha * 0.15);
          g.fillCircle(x, y, data.r);
        },
        onComplete: () => g.destroy(),
      });
    });

    // ─── EventBus wiring ─────────────────────────────────────────────────
    this.wireEvents();

    // ─── Input ───────────────────────────────────────────────────────────
    if (!this.isSpectate) {
      this.setupInput();
    } else {
      // Disable player input for spectate mode — keep camera controls only
      this.input.keyboard?.removeAllListeners();
      this.setupSpectateCameraInput();
    }

    // ─── AI Debug Overlay + Game Event Logger ────────────────────────────
    this.aiDebugOverlay = new AIDebugOverlay(this);
    this.gameEventLogger = new GameEventLogger(eventBus);

    const enableDebug = (on: boolean) => {
      this.aiDebugOverlay.setEnabled(on);
      this.gameEventLogger.setEnabled(on);
      this.aiController.setDebugEnabled(on);
      this.playerAIController?.setDebugEnabled(on);
    };

    // Practice mode: enable debug overlay + verbose AI logging automatically
    if (isPractice) enableDebug(true);

    // Spectate mode: both AI controllers get full debug + overlay on by default
    if (this.isSpectate) enableDebug(true);

    // 'D' key toggles the overlay (and event logger) in any mode
    this.input.keyboard?.addKey('D').on('down', () => {
      enableDebug(!this.aiDebugOverlay.isEnabled());
    });

    // ─── Initial AI decision (head start) ─────────────────────────────
    this.time.delayedCall(AI_INITIAL_DECISION_DELAY, () => {
      this.aiController.update(Date.now());
      this.playerAIController?.update(Date.now());
    });

    eventBus.emit('game:started', {});

    // Notify UIScene that systems are ready (deferred one frame)
    this.time.delayedCall(0, () => {
      this.events.emit('systems_ready', {
        techSystem: this.techSystem,
        economySystem: this.economySystem,
        playerTech: this.playerTech,
        unitSystem: this.unitSystem,
        winSystem: this.winSystem,
        abilitySystem: this.abilitySystem,
        world: this.world,
        camera: this.cameras.main,
        isPractice,
        aiTech: this.techSystem.getAITech(),
        isSpectate: this.isSpectate,
      });
    });

    this.updateBasesDisplay();

    eventBus.on('game:over', ({ winner, reason }) => {
      this.showGameOver(winner, reason);
    });

    // Register shutdown hook to cleanup systems
    this.events.on('shutdown', () => this.onShutdown());
  }

  private onShutdown(): void {
    this.scene.stop('UIScene');
    this.gameStatsTracker?.destroy();
    this.rotationPhysics.destroy();
    this.economySystem.destroy();
    this.unitSystem.destroy();
    this.winSystem.destroy();
    this.aiController.destroy();
    this.playerAIController?.destroy();
    this.playerAIController = null;
    this.projectileSystem.destroy();
    this.turretSystem.destroy();
    this.techSystem.destroy();
    this.aiDebugOverlay.destroy();
    this.gameEventLogger.destroy();
    eventBus.removeAllListeners();
  }

  private wireEvents(): void {
    eventBus.on('gear:placed', ({ gear }) => {
      this.createGearEntity(gear);
    });

    eventBus.on('gear:removed', ({ gearId }) => {
      const entity = this.gearEntities.get(gearId);
      if (entity) {
        entity.destroy();
        this.gearEntities.delete(gearId);
      }
      this.world.removeGear(gearId);
      this.meshGraph.removeGear(gearId);
    });

    eventBus.on('gear:destroyed', ({ gearId }) => {
      this.gearSystem.removeGear(gearId);
    });

    eventBus.on('unit:spawned', ({ unit }) => {
      const entity = new UnitEntity(this, unit);
      this.unitEntities.set(unit.id, entity);
      this.world.placeUnit(unit);
    });

    eventBus.on('unit:died', ({ unitId }) => {
      const entity = this.unitEntities.get(unitId);
      if (entity) {
        entity.destroy();
        this.unitEntities.delete(unitId);
      }
      this.world.removeUnit(unitId);
    });

    eventBus.on('unit:reached_base', ({ unit }) => {
      const entity = this.unitEntities.get(unit.id);
      if (entity) {
        entity.destroy();
        this.unitEntities.delete(unit.id);
      }
      this.world.removeUnit(unit.id);
      this.updateBasesDisplay();
    });

    eventBus.on('combat:base_damaged', ({ owner }) => {
      this.updateBasesDisplay();
      if (owner) {
        this.worldRenderer.flashBase(owner as 'player' | 'ai');
      }
      this.cameras.main.shake(300, 0.03);
    });

    eventBus.on('gear:destroyed', ({ owner }) => {
      if (owner === 'player') {
        this.cameras.main.shake(150, 0.015);
      }
    });

    eventBus.on('tech:research_complete', () => { /* tracked by GameStatsTracker */ });

    eventBus.on('ability:activated', ({ id }) => {
      if (id === 'power_surge') {
        this.cameras.main.shake(100, 0.01);
      }
    });

    eventBus.on('power:capacitor_burst', () => {
      this.cameras.main.shake(80, 0.008);
    });

    // Tech research — wire UI click to TechSystem
    eventBus.on('ui:tech_node_clicked', ({ nodeId }) => {
      this.techSystem.startResearch(nodeId, 'player');
    });

    // Drag-from-palette — now carries teeth instead of size
    eventBus.on('ui:gear_drag_start', ({ gearType, teeth }) => {
      this.dragGearType = gearType;
      this.dragGearTeeth = teeth ?? this.selectedTeeth;
      this.isDragging = true;
      this.removeMode = false;
      // Draw ghost immediately at centre of visible world for instant feedback
      const cam = this.cameras.main;
      const wx = cam.scrollX + (this.scale.width / 2) / this.cameraZoom;
      const wy = cam.scrollY + (panelState.topY / 2) / this.cameraZoom;
      const snap = this.gearSystem.getSnapPosition(wx, wy, this.dragGearTeeth, 'player');
      this.worldRenderer.drawGhostGear(snap.x, snap.y, this.dragGearTeeth, snap.valid, snap.snapTargetId !== null);
    });

    eventBus.on('ui:gear_drag_end', () => {
      this.isDragging = false;
      this.worldRenderer.clearGhostGear();
    });

    // Update selected teeth when palette changes teeth picker
    eventBus.on('ui:teeth_changed', ({ teeth }) => {
      this.selectedTeeth = teeth;
    });

    // Listen for remove mode toggled from toolbar
    eventBus.on('ui:remove_mode_toggled', ({ active }) => {
      this.removeMode = active;
      if (active) {
        this.isDragging = false;
        this.dragGearType = null;
        this.isRepositioning = false;
        this.repositionGearId = null;
        this.worldRenderer.clearGhostGear();
      }
    });

    // Practice mode: place gears as enemy owner (free, ignores tech)
    eventBus.on('ui:as_enemy_toggled', ({ active }) => {
      this.asEnemyMode = active;
    });

    // Pause/resume simulation
    eventBus.on('ui:pause_toggled', ({ paused }) => {
      this.isPaused = paused;
      this.gearSystem.setPaused(paused);
    });
  }

  /**
   * Clamp camera so that at least 1 world pixel remains visible on every edge.
   * This allows free panning when zoomed out without showing a black void.
   */
  private clampCamera(): void {
    const cam = this.cameras.main;
    const viewW = this.scale.width / this.cameraZoom;
    const viewH = panelState.topY / this.cameraZoom;
    cam.scrollX = Phaser.Math.Clamp(cam.scrollX, 1 - viewW, WORLD_WIDTH - 1);
    cam.scrollY = Phaser.Math.Clamp(cam.scrollY, 1 - viewH, WORLD_HEIGHT - 1);
  }

  /** Camera input for spectate mode: wheel zoom + right-click pan only */
  private setupSpectateCameraInput(): void {
    this.input.on('wheel', (ptr: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (ptr.y > panelState.topY) return;
      this.cameraZoom = Phaser.Math.Clamp(
        this.cameraZoom + (dy > 0 ? -0.05 : 0.05),
        0.1,
        5.0,
      );
      this.cameras.main.setZoom(this.cameraZoom);
      this.clampCamera();
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 1 || pointer.button === 2) {
        this.isPanningCamera = true;
        const cam = this.cameras.main;
        this.panStart = { px: pointer.x, py: pointer.y, scrollX: cam.scrollX, scrollY: cam.scrollY };
      }
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.isPanningCamera) {
        const cam = this.cameras.main;
        cam.scrollX = this.panStart.scrollX - (pointer.x - this.panStart.px) / this.cameraZoom;
        cam.scrollY = this.panStart.scrollY - (pointer.y - this.panStart.py) / this.cameraZoom;
        this.clampCamera();
      }
    });
    this.input.on('pointerup', () => { this.isPanningCamera = false; });
  }

  private setupInput(): void {
    // ─── Camera zoom (mouse wheel) ─────────────────────────────────────
    this.input.on('wheel', (ptr: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.winSystem.isGameOver()) return; // lock zoom on game-over screen
      if (ptr.y > panelState.topY) return; // over panel — panel handles zoom
      this.cameraZoom = Phaser.Math.Clamp(
        this.cameraZoom + (dy > 0 ? -0.05 : 0.05),
        0.1,
        5.0,
      );
      this.cameras.main.setZoom(this.cameraZoom);
      this.clampCamera();
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      // ─── Camera pan drag ───────────────────────────────────────────────
      if (this.isPanningCamera) {
        const cam = this.cameras.main;
        cam.scrollX = this.panStart.scrollX - (pointer.x - this.panStart.px) / this.cameraZoom;
        cam.scrollY = this.panStart.scrollY - (pointer.y - this.panStart.py) / this.cameraZoom;
        this.clampCamera();
        return;
      }

      // ─── Palette drag (updates ghost even while cursor is over panel) ───
      if (this.isDragging && this.dragGearType) {
        const isPractice = this.difficulty === 'practice';
        const ghostOwner: 'player' | 'ai' = (isPractice && this.asEnemyMode) ? 'ai' : 'player';
        const snap = this.gearSystem.getSnapPosition(pointer.worldX, pointer.worldY, this.dragGearTeeth, ghostOwner);
        this.worldRenderer.drawGhostGear(snap.x, snap.y, this.dragGearTeeth, snap.valid, snap.snapTargetId !== null);
        return;
      }

      if (pointer.y > panelState.topY) return; // over panel — no world interaction

      // ─── Picked-up gear drag ────────────────────────────────────────
      if (this.pickedUpGearId) {
        if (pointer.y > WORLD_HEIGHT) return;
        const gear = this.world.getGear(this.pickedUpGearId);
        if (!gear) {
          this.pickedUpGearId = null;
          return;
        }
        const snap = this.gearSystem.getSnapPositionExcluding(
          pointer.worldX, pointer.worldY, gear.teeth, 'player', this.pickedUpGearId,
        );
        this.worldRenderer.drawGhostGear(snap.x, snap.y, gear.teeth, snap.valid, snap.snapTargetId !== null);
        // Move the gear entity to follow mouse
        const entity = this.gearEntities.get(this.pickedUpGearId);
        if (entity) {
          entity.setPosition(snap.x, snap.y);
          entity.setAlpha(0.6);
        }
        return;
      }

      // ─── Reposition drag ─────────────────────────────────────────────
      if (this.isRepositioning && this.repositionGearId) {
        if (pointer.y > WORLD_HEIGHT) return;
        const gear = this.world.getGear(this.repositionGearId);
        if (!gear) return;
        const snap = this.gearSystem.getSnapPositionExcluding(
          pointer.worldX, pointer.worldY, gear.teeth, 'player', this.repositionGearId,
        );
        this.worldRenderer.drawGhostGear(snap.x, snap.y, gear.teeth, snap.valid, snap.snapTargetId !== null);
        return;
      }

      // ─── Hover tooltip ──────────────────────────────────────────────
      this.worldRenderer.clearGhostGear();
      if (pointer.y > WORLD_HEIGHT) {
        if (this.hoveredGearId) {
          this.hoveredGearId = null;
          eventBus.emit('ui:tooltip_hide', {});
        }
        return;
      }

      const wx = pointer.worldX;
      const wy = pointer.worldY;
      let foundGear: GearState | null = null;
      for (const [, gear] of this.world.getAllGears()) {
        const dx = gear.x - wx;
        const dy = gear.y - wy;
        if (Math.sqrt(dx * dx + dy * dy) < gearRadius(gear.teeth)) {
          foundGear = gear;
          break;
        }
      }

      if (foundGear) {
        if (this.hoveredGearId !== foundGear.id) {
          this.hoveredGearId = foundGear.id;
          const text = this.buildGearTooltip(foundGear);
          eventBus.emit('ui:tooltip_show', { text, x: pointer.x + 16, y: pointer.y - 10 });
        }
        // Draw range circle for ranged gears
        this.rangeCircleGraphics.clear();
        if (foundGear.type === 'crossbow_turret' || foundGear.type === 'artillery_turret') {
          const range = turretRange(foundGear.teeth, foundGear.type as 'crossbow_turret' | 'artillery_turret');
          const color = foundGear.type === 'artillery_turret' ? 0xff6600 : 0xffdd00;
          const ownerAlpha = foundGear.owner === 'player' ? 0.5 : 0.35;
          this.rangeCircleGraphics.lineStyle(1.5, color, ownerAlpha);
          this.rangeCircleGraphics.strokeCircle(foundGear.x, foundGear.y, range);
          this.rangeCircleGraphics.fillStyle(color, 0.04);
          this.rangeCircleGraphics.fillCircle(foundGear.x, foundGear.y, range);
        } else if (foundGear.type === 'healer') {
          const radius = healerRadius(foundGear.teeth);
          this.rangeCircleGraphics.lineStyle(1.5, 0x44ff88, 0.4);
          this.rangeCircleGraphics.strokeCircle(foundGear.x, foundGear.y, radius);
          this.rangeCircleGraphics.fillStyle(0x44ff88, 0.04);
          this.rangeCircleGraphics.fillCircle(foundGear.x, foundGear.y, radius);
        }
      } else if (this.hoveredGearId) {
        this.hoveredGearId = null;
        this.rangeCircleGraphics.clear();
        eventBus.emit('ui:tooltip_hide', {});
      }
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      // ─── Camera pan end ──────────────────────────────────────────────
      if (this.isPanningCamera) {
        this.isPanningCamera = false;
        return;
      }

      // ─── Reposition release ──────────────────────────────────────────
      if (this.isRepositioning && this.repositionGearId) {
        const gear = this.world.getGear(this.repositionGearId);
        if (gear && pointer.y <= WORLD_HEIGHT) {
          const snap = this.gearSystem.getSnapPositionExcluding(
            pointer.worldX, pointer.worldY, gear.teeth, 'player', this.repositionGearId,
          );
          if (snap.valid) {
            const ok = this.gearSystem.repositionGear(this.repositionGearId, snap.x, snap.y, 'player');
            if (ok) {
              const entity = this.gearEntities.get(this.repositionGearId);
              if (entity) {
                entity.setAlpha(1);
                entity.setPosition(snap.x, snap.y);
              }
            }
          }
          // If failed, gear stays at original position (it was never actually moved)
        }
        // Restore alpha if we didn't move
        const entity = this.gearEntities.get(this.repositionGearId);
        if (entity) entity.setAlpha(1);
        this.isRepositioning = false;
        this.repositionGearId = null;
        this.repositionOriginal = null;
        this.worldRenderer.clearGhostGear();
        return;
      }

      // ─── Palette drop ────────────────────────────────────────────────
      if (!this.isDragging || !this.dragGearType) return;
      // Released inside panel — keep gear selected, user will click in world to place
      if (pointer.y > panelState.topY) return;
      if (pointer.y > WORLD_HEIGHT) {
        this.isDragging = false;
        this.worldRenderer.clearGhostGear();
        eventBus.emit('ui:gear_drag_end', {});
        return;
      }

      const worldX = pointer.worldX;
      const worldY = pointer.worldY;
      const isPractice = this.difficulty === 'practice';
      const placeOwner: 'player' | 'ai' = (isPractice && this.asEnemyMode) ? 'ai' : 'player';
      const snap = this.gearSystem.getSnapPosition(worldX, worldY, this.dragGearTeeth, placeOwner);

      if (snap.valid) {
        const def = GEAR_DEFINITIONS[this.dragGearType];
        if (isPractice && this.asEnemyMode) {
          // Practice "as enemy" — free placement, no tech check
          this.gearSystem.tryPlace(this.dragGearType, this.dragGearTeeth, snap.x, snap.y, 'ai', true);
        } else {
          // Normal placement: pay gold, respect tech
          const cost = 10 + (this.dragGearTeeth * 0.5);
          if (def && this.economySystem.canAffordGold('player', cost)) {
            const placed = this.gearSystem.tryPlace(
              this.dragGearType, this.dragGearTeeth, snap.x, snap.y, 'player',
            );
            if (placed) {
              this.economySystem.spendGold('player', cost);
            }
          } else if (def) {
            this.showNotEnoughGold();
          }
        }
      }

      this.isDragging = false;
      this.worldRenderer.clearGhostGear();
      eventBus.emit('ui:gear_drag_end', {});
    });

    // R key: toggle remove mode
    this.input.keyboard?.addKey('R').on('down', () => {
      this.removeMode = !this.removeMode;
      eventBus.emit('ui:remove_mode_toggled', { active: this.removeMode });
      if (this.removeMode) {
        this.isDragging = false;
        this.dragGearType = null;
        this.isRepositioning = false;
        this.repositionGearId = null;
        // Cancel pickup when entering remove mode
        if (this.pickedUpGearId) {
          const entity = this.gearEntities.get(this.pickedUpGearId);
          if (entity && this.pickedUpGearOriginalPos) {
            entity.setPosition(this.pickedUpGearOriginalPos.x, this.pickedUpGearOriginalPos.y);
            entity.setAlpha(1);
          }
          this.pickedUpGearId = null;
          this.pickedUpGearOriginalPos = null;
        }
        this.worldRenderer.clearGhostGear();
      }
    });

    // Click: camera pan (middle/right button), or remove mode, place picked-up gear, or pick up gear
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // ─── Camera pan: middle (button=1) or right (button=2) mouse drag ────────
      // Right-click during ghost placement cancels it instead of panning
      if (pointer.button === 2 && (this.isDragging || this.pickedUpGearId)) {
        // Cancel palette drag
        if (this.isDragging) {
          this.isDragging = false;
          this.dragGearType = null;
          this.worldRenderer.clearGhostGear();
          eventBus.emit('ui:gear_drag_end', {});
        }
        // Cancel pickup — restore gear to original position
        if (this.pickedUpGearId) {
          const entity = this.gearEntities.get(this.pickedUpGearId);
          if (entity && this.pickedUpGearOriginalPos) {
            entity.setPosition(this.pickedUpGearOriginalPos.x, this.pickedUpGearOriginalPos.y);
            entity.setAlpha(1);
          }
          this.pickedUpGearId = null;
          this.pickedUpGearOriginalPos = null;
          this.worldRenderer.clearGhostGear();
          eventBus.emit('ui:gear_pickup_end', {});
        }
        return;
      }
      if (pointer.button === 1 || pointer.button === 2) {
        this.isPanningCamera = true;
        const cam = this.cameras.main;
        this.panStart = {
          px: pointer.x,
          py: pointer.y,
          scrollX: cam.scrollX,
          scrollY: cam.scrollY,
        };
        return;
      }

      if (pointer.y > panelState.topY) return; // over panel — panel handles click

      // Remove mode takes priority
      if (this.removeMode) {
        const clickX = pointer.worldX;
        const clickY = pointer.worldY;
        // In practice+asEnemy mode, allow removing enemy gears too
        const isPractice = this.difficulty === 'practice';
        const canRemoveEnemy = isPractice && this.asEnemyMode;
        for (const [, gear] of this.world.getAllGears()) {
          if (gear.owner !== 'player' && !canRemoveEnemy) continue;
          if (gear.owner === 'ai' && !canRemoveEnemy) continue;
          const dx = gear.x - clickX;
          const dy = gear.y - clickY;
          if (Math.sqrt(dx * dx + dy * dy) < gearRadius(gear.teeth)) {
            const refund = this.gearSystem.sellGear(gear.id);
            if (refund !== null) this.economySystem.earnGold('player', refund);
            break;
          }
        }
        return;
      }

      // If a gear is already picked up, try to place it
      if (this.pickedUpGearId) {
        const gear = this.world.getGear(this.pickedUpGearId);
        if (gear) {
          const snap = this.gearSystem.getSnapPositionExcluding(
            pointer.worldX, pointer.worldY, gear.teeth, 'player', this.pickedUpGearId,
          );

          if (snap.valid) {
            // Valid placement — move the gear in the world
            const moved = this.gearSystem.repositionGear(this.pickedUpGearId, snap.x, snap.y, 'player');
            if (moved) {
              // Successfully placed — clear pickup state
              const entity = this.gearEntities.get(this.pickedUpGearId);
              if (entity) entity.setAlpha(1);
              this.pickedUpGearId = null;
              this.pickedUpGearOriginalPos = null;
              this.worldRenderer.clearGhostGear();
              eventBus.emit('ui:gear_pickup_end', {});
              return;
            }
          }
          // Invalid placement — keep gear on mouse, do nothing
        }
        return;
      }

      // Don't start pickup if palette-dragging
      if (this.isDragging) return;

      // Check for player gear under pointer to pick it up
      const clickX = pointer.worldX;
      const clickY = pointer.worldY;
      for (const [, gear] of this.world.getAllGears()) {
        if (gear.owner !== 'player') continue;
        const dx = gear.x - clickX;
        const dy = gear.y - clickY;
        if (Math.sqrt(dx * dx + dy * dy) < gearRadius(gear.teeth)) {
          if (this.gearSystem.isOnCooldown(gear.id)) break; // on cooldown, ignore
          this.pickedUpGearId = gear.id;
          this.pickedUpGearOriginalPos = { x: gear.x, y: gear.y };
          eventBus.emit('ui:gear_pickup_start', {});
          break;
        }
      }
    });

    this.input.keyboard?.addKey('ESC').on('down', () => {
      // Cancel pickup
      if (this.pickedUpGearId) {
        const entity = this.gearEntities.get(this.pickedUpGearId);
        if (entity && this.pickedUpGearOriginalPos) {
          entity.setPosition(this.pickedUpGearOriginalPos.x, this.pickedUpGearOriginalPos.y);
          entity.setAlpha(1);
        }
        this.pickedUpGearId = null;
        this.pickedUpGearOriginalPos = null;
        eventBus.emit('ui:gear_pickup_end', {});
      }
      // Cancel palette drag
      if (this.isDragging) {
        eventBus.emit('ui:gear_drag_end', {});
      }
      // Cancel reposition
      if (this.isRepositioning && this.repositionGearId) {
        const entity = this.gearEntities.get(this.repositionGearId);
        if (entity) entity.setAlpha(1);
      }
      this.isDragging = false;
      this.dragGearType = null;
      this.removeMode = false;
      this.isRepositioning = false;
      this.repositionGearId = null;
      this.repositionOriginal = null;
      this.worldRenderer.clearGhostGear();
    });
  }

  /** Build a multi-line tooltip string for a gear */
  private buildGearTooltip(gear: GearState): string {
    const r = gearRadius(gear.teeth);
    const ownerLabel = gear.owner === 'player' ? 'Player' : 'AI';
    const lines: string[] = [
      `${gear.type.replace(/_/g, ' ').toUpperCase()} (${gear.teeth}t)`,
      `Owner: ${ownerLabel}  |  Radius: ${r}px  |  HP: ${Math.ceil(gear.hp)}/${gear.maxHp}`,
    ];

    // Type-specific stats
    if (gear.type === 'motor') {
      lines.push(`Output: ${motorOutput(gear.teeth).toFixed(1)} power/rot`);
      lines.push(`Torque: ${motorTorque(gear.teeth).toFixed(0)}`);
    } else if (gear.type === 'amplifier') {
      lines.push('Multiplies downstream chain power by ×1.4');
    } else if (gear.type === 'capacitor') {
      const rotsDone = Math.abs(gear.accumulatedAngle) / (Math.PI * 2);
      lines.push(`Burst every ${CAPACITOR_BURST_ROTATIONS} rotations (2.5× release)`);
      lines.push(`Progress: ${rotsDone.toFixed(1)} / ${CAPACITOR_BURST_ROTATIONS} rotations`);
    } else if (gear.type === 'overclock') {
      lines.push('+50% speed/power to adjacent gears for 10s');
      if (gear.isBurntOut) {
        lines.push('⚠ BURNT OUT');
      } else if (gear.overclockUntil) {
        const remaining = Math.max(0, (gear.overclockUntil - Date.now()) / 1000);
        lines.push(`Active: ${remaining.toFixed(1)}s remaining`);
      }
    } else if (gear.type === 'spiked') {
      const dps = Math.abs(gear.angularVelocity) * spikeDamage(gear.teeth);
      lines.push(`Contact DPS: ${dps.toFixed(1)} at current speed`);
      lines.push('Heals slightly on each rotation');
    } else if (gear.type === 'armored') {
      lines.push('Blocks unit movement; pushes nearby units when spinning');
      lines.push('Heals on each rotation (small gold cost)');
    } else if (gear.type === 'iron_miner' || gear.type === 'crystal_miner' || gear.type === 'aether_miner') {
      const resource = gear.type.replace('_miner', '');
      lines.push(`Output: ${miningOutput(gear.teeth).toFixed(1)} ${resource}/rotation`);
    } else if (gear.type === 'researcher') {
      const boost = researcherOutput(gear.teeth);
      lines.push(`Research boost: ${(boost / 1000).toFixed(1)}s per rotation`);
    } else if (gear.type === 'iron_converter') {
      const amt = converterOutput(gear.teeth);
      lines.push(`Converts: ${amt.toFixed(2)} iron → ${(amt * 2).toFixed(1)} gold/rotation`);
    } else if (gear.type === 'crystal_converter') {
      const amt = converterOutput(gear.teeth);
      lines.push(`Converts: ${amt.toFixed(2)} crystal → ${(amt * 3).toFixed(1)} gold/rotation`);
    } else if (gear.type === 'aether_converter') {
      const amt = converterOutput(gear.teeth);
      lines.push(`Converts: ${amt.toFixed(2)} aether → ${(amt * 6).toFixed(1)} gold/rotation`);
    } else if (gear.type === 'healer') {
      lines.push(`Heal: ${healerOutput(gear.teeth).toFixed(1)} HP/rotation per target`);
      lines.push(`Aura radius: ${healerRadius(gear.teeth).toFixed(0)}px`);
    } else if (gear.type === 'crossbow_turret') {
      const range = turretRange(gear.teeth, 'crossbow_turret');
      const maxAmmo = turretMaxAmmo(gear.teeth);
      lines.push(`Ammo: ${gear.ammo ?? 0} / ${gear.maxAmmo ?? maxAmmo}`);
      lines.push(`Range: ${range}px  |  Fire rate: fast  |  Damage: low`);
      lines.push('Each rotation buys 1 ammo bolt (2 gold)');
    } else if (gear.type === 'artillery_turret') {
      const range = turretRange(gear.teeth, 'artillery_turret');
      const maxAmmo = turretMaxAmmo(gear.teeth);
      lines.push(`Ammo: ${gear.ammo ?? 0} / ${gear.maxAmmo ?? maxAmmo}`);
      lines.push(`Range: ${range}px  |  Fire rate: slow  |  Damage: high AoE`);
      lines.push('Each rotation buys 1 ammo shell (6 gold)');
    } else if (gear.type.includes('spawner')) {
      const def = GEAR_DEFINITIONS[gear.type];
      lines.push(`Spawns a unit per rotation (${def?.goldCost ?? '?'} gold cost)`);
    }

    lines.push(`ω: ${gear.angularVelocity.toFixed(2)} rad/s  |  Status: ${gear.isBurntOut ? 'Burnt out' : gear.isSpinning ? 'Spinning' : 'Idle'}`);

    if (gear.isJammed) {
      lines.push('⚠ JAMMED — taking damage');
    }

    if (gear.lastRepositionedAt) {
      const cdLeft = Math.max(0, REPOSITION_COOLDOWN_MS - (Date.now() - gear.lastRepositionedAt));
      if (cdLeft > 0) {
        lines.push(`Move cooldown: ${(cdLeft / 1000).toFixed(1)}s`);
      }
    }

    return lines.join('\n');
  }

  private createGearEntity(gear: GearState): void {
    const entity = new GearEntity(this, gear);
    this.gearEntities.set(gear.id, entity);
  }

  /** Render all active projectiles as simple shapes */
  private renderProjectiles(): void {
    const g = this.projectileGraphics;
    g.clear();

    for (const [, proj] of this.projectileSystem.getProjectiles()) {
      if (proj.type === 'artillery_shell') {
        // Shell size scales with unit size (aoeRadius = unit.size * 1.5)
        const shellR = Math.max(3, proj.aoeRadius / 3);
        g.fillStyle(0xff6600, 1);
        g.fillCircle(proj.x, proj.y, shellR);
        g.lineStyle(1, 0xffaa00, 1);
        g.strokeCircle(proj.x, proj.y, shellR);
        // Fiery glow
        g.fillStyle(0xffdd00, 0.4);
        g.fillCircle(proj.x, proj.y, shellR * 1.6);
      } else {
        // Crystal shard: cyan diamond
        const s = 5;
        g.fillStyle(0x44ffff, 0.9);
        g.beginPath();
        g.moveTo(proj.x, proj.y - s);
        g.lineTo(proj.x + s * 0.6, proj.y);
        g.lineTo(proj.x, proj.y + s);
        g.lineTo(proj.x - s * 0.6, proj.y);
        g.closePath();
        g.fillPath();
        g.lineStyle(1, 0xffffff, 0.7);
        g.strokePath();
      }
    }
  }

  /** Show expanding AoE circle animation at impact point */
  private showExplosionAnimation(x: number, y: number, aoeRadius: number): void {
    const explosionG = this.add.graphics().setDepth(160);

    // Draw initial inner burst
    explosionG.fillStyle(0xffffff, 0.8);
    explosionG.fillCircle(x, y, aoeRadius * 0.3);

    // Tween data object to animate radius 0 → aoeRadius
    const data = { radius: 0, alpha: 0.55 };
    this.tweens.add({
      targets: data,
      radius: aoeRadius,
      alpha: 0,
      duration: 450,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        explosionG.clear();
        // Outer AoE ring (shows exact damage area)
        explosionG.lineStyle(2.5, 0xff6600, data.alpha * 1.4);
        explosionG.strokeCircle(x, y, data.radius);
        // Inner fill — hot orange
        explosionG.fillStyle(0xff4400, data.alpha * 0.5);
        explosionG.fillCircle(x, y, data.radius);
        // Bright core flash (only early)
        if (data.radius < aoeRadius * 0.4) {
          explosionG.fillStyle(0xffffff, data.alpha);
          explosionG.fillCircle(x, y, data.radius * 0.5);
        }
      },
      onComplete: () => {
        explosionG.destroy();
      },
    });
  }

  private updateBasesDisplay(): void {
    this.worldRenderer.drawBases(
      this.winSystem.getHp('player'),
      this.winSystem.getMaxHp('player'),
      this.winSystem.getHp('ai'),
      this.winSystem.getMaxHp('ai'),
    );
  }

  update(_time: number, delta: number): void {
    if (this.winSystem.isGameOver()) return;

    const now = Date.now();
    this.gameStatsTracker.tick(now);
    const deltaSec = (delta / 1000) * GAME_SETTINGS.gameSpeed;

    // ─── Edge-scroll camera ────────────────────────────────────────────────
    const pointer = this.input.activePointer;
    if (GAME_SETTINGS.edgeScrollEnabled && this.input.isOver) {
      const scrollAmount = GAME_SETTINGS.edgeScrollSpeed * deltaSec;
      const cam = this.cameras.main;
      const vw = this.scale.width;
      const vh = this.scale.height;
      const pct = GAME_SETTINGS.edgeScrollPercent / 100;
      const hMargin = vw * pct;
      const vMargin = vh * pct;
      let moved = false;
      if (pointer.x < hMargin)              { cam.scrollX -= scrollAmount; moved = true; }
      else if (pointer.x > vw - hMargin)    { cam.scrollX += scrollAmount; moved = true; }
      if (pointer.y < vMargin)              { cam.scrollY -= scrollAmount; moved = true; }
      else if (pointer.y > vh - vMargin)    { cam.scrollY += scrollAmount; moved = true; }
      if (moved) this.clampCamera();
    }

    this.tickNumber++;
    eventBus.emit('game:tick', { tickNumber: this.tickNumber, delta });

    // ─── System updates (skipped when paused) ─────────────────────────────
    if (!this.isPaused) {
      this.rotationPhysics.update(deltaSec);
      this.economySystem.update(now);
      this.unitSystem.update(deltaSec, now, this.projectileSystem);

      // Update projectiles (after units, before rendering)
      this.projectileSystem.update(deltaSec, this.unitSystem.getAllUnits(), this.world, eventBus);

      for (const [, unit] of this.unitSystem.getAllUnits()) {
        this.world.updateUnit(unit);
      }
    }

    // Cache allGears once per frame — shared by all subsystems below
    const allGears = this.world.getAllGears();

    if (!this.isPaused) {
      this.gearUnitInteraction.update(deltaSec, this.unitSystem.getAllUnits(), allGears);
      this.combatSystem.update(now);
      this.techSystem.update(now);
      this.turretSystem.update(deltaSec, now);
      this.aiController.update(now);
      this.playerAIController?.update(now);
    }

    // ─── Overclock burnout ────────────────────────────────────────────────
    const burntOut = this.rotationPhysics.checkOverclockBurnouts(now);
    for (const gearId of burntOut) {
      this.gearSystem.markBurntOut(gearId, now);
    }

    // ─── Update gear visuals ──────────────────────────────────────────────
    for (const [id, entity] of this.gearEntities) {
      const gear = allGears.get(id);
      if (gear) {
        entity.updateFromState(gear);
      }
    }

    // ─── Update unit visuals ──────────────────────────────────────────────
    for (const [id, entity] of this.unitEntities) {
      const unit = this.unitSystem.getUnit(id);
      if (unit) {
        entity.updateFromState(unit, _time);
      }
    }

    // ─── Render projectiles ───────────────────────────────────────────────
    this.renderProjectiles();

    // ─── Update mesh arcs ─────────────────────────────────────────────────
    this.worldRenderer.drawMeshArcs(this.meshGraph, allGears);

    // ─── AI debug overlay ─────────────────────────────────────────────────
    if (this.aiDebugOverlay.isEnabled()) {
      const states = [this.aiController.getDebugState()];
      if (this.playerAIController) states.unshift(this.playerAIController.getDebugState());
      this.aiDebugOverlay.update(states);
    }
  }

  private showNotEnoughGold(): void {
    const panelW = 200;
    const panelH = 36;
    // Position relative to camera scroll so it appears in viewport center
    const cam = this.cameras.main;
    const vw = this.scale.width;
    const panelX = cam.scrollX + vw / 2 - panelW / 2;
    const panelY = WORLD_HEIGHT - 50;

    const bg = this.add.graphics().setDepth(250);
    bg.fillStyle(0x0a0005, 0.92);
    bg.fillRect(panelX, panelY, panelW, panelH);
    bg.lineStyle(2, 0xff2222, 1);
    bg.strokeRect(panelX, panelY, panelW, panelH);

    const msg = this.add.text(
      cam.scrollX + vw / 2, panelY + panelH / 2,
      'Not enough gold!',
      { fontSize: '12px', color: '#ff6644', fontFamily: 'monospace' },
    ).setOrigin(0.5).setDepth(251);

    this.time.delayedCall(1500, () => {
      bg.destroy();
      msg.destroy();
    });
  }

  private showGameOver(winner: 'player' | 'ai', reason: string): void {
    this.gameStatsTracker.forceSnapshot(Date.now());
    const data = this.gameStatsTracker.buildGameOverData(winner, reason, this.difficulty);
    // Launch the stats scene — GameScene/UIScene shut down via onShutdown()
    this.scene.start('GameOverScene', data);
  }

}
