import Phaser from 'phaser';
import { eventBus } from '../systems/EventBus';
import { AbilitySystem } from '../systems/AbilitySystem';
import { TechState } from '../types/tech.types';
import { AbilityId } from '../types/ability.types';
import { ABILITY_DEFINITIONS } from '../constants/ability.constants';
import { NEON, NEON_STR } from '../constants/ui.constants';
import { panelState } from './SlidingPanel';

const BTN_W       = 192;
const BTN_H       = 88;
const BTN_GAP     = 12;
const BTN_START_X = 12;
const BTN_Y       = 36;

const COOLDOWN_BAR_H = 5;

const ABILITY_DEFS: {
  id: AbilityId;
  icon: string;
  name: string;
  desc: string;
  color: number;
  colorStr: string;
}[] = [
  { id: 'power_surge',          icon: '⚡', name: 'GOLD SURGE',     desc: '+30 gold instantly',        color: NEON.yellow,  colorStr: NEON_STR.yellow  },
  { id: 'counter_intel',        icon: '🔍', name: 'COUNTER INTEL',  desc: 'Reveal AI unit type',       color: NEON.cyan,    colorStr: NEON_STR.cyan    },
  { id: 'overclock_no_burnout', icon: '🔧', name: 'OVERCLOCK+',     desc: 'Overclock — no burnout',    color: NEON.orange,  colorStr: NEON_STR.orange  },
];

/**
 * ActionsSection: redesigned ability buttons with large icons, names,
 * descriptions, and animated cooldown progress bars.
 */
export class ActionsSection {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private abilitySystem: AbilitySystem;
  private playerTech: TechState;
  private readonly: boolean;

  // Per-ability: cooldown bar fill and timer text
  private cooldownFills: Map<AbilityId, Phaser.GameObjects.Rectangle> = new Map();
  private cooldownTexts: Map<AbilityId, Phaser.GameObjects.Text>      = new Map();
  private abilityBgs:   Map<AbilityId, Phaser.GameObjects.Rectangle>  = new Map();
  private abilityIcons:  Map<AbilityId, Phaser.GameObjects.Text>      = new Map();
  private abilityNames:  Map<AbilityId, Phaser.GameObjects.Text>      = new Map();
  private abilityStripes:Map<AbilityId, Phaser.GameObjects.Rectangle> = new Map();
  private abilityHits:   Map<AbilityId, Phaser.GameObjects.Zone>      = new Map();
  private wasOnCooldown: Map<AbilityId, boolean>                      = new Map();

  // Unit pill objects for rebuild on tech unlock
  private pillMap: Map<string, { bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text; lock?: Phaser.GameObjects.Text }> = new Map();
  private unitSectionX: number = 0;
  private updateListener: (() => void) | null = null;
  private techListener: (() => void) | null = null;
  private unitSectionY: number = 0;

  constructor(
    scene: Phaser.Scene,
    abilitySystem: AbilitySystem,
    playerTech: TechState,
    readonly: boolean = false,
  ) {
    this.scene = scene;
    this.abilitySystem = abilitySystem;
    this.playerTech = playerTech;
    this.readonly = readonly;
    this.container = scene.add.container(0, 0);

    this.buildSection();
    this.setupUpdate();
  }

  private buildSection(): void {
    // ── Section header ──
    const header = this.scene.add.text(BTN_START_X, 10, 'ABILITIES', {
      fontSize: '13px', color: NEON_STR.cyan, fontFamily: 'monospace', fontStyle: 'bold',
    });
    this.container.add(header);

    // Accent line under header
    const headerLine = this.scene.add.rectangle(
      BTN_START_X + (ABILITY_DEFS.length * (BTN_W + BTN_GAP)) / 2,
      28, ABILITY_DEFS.length * (BTN_W + BTN_GAP), 1,
      NEON.cyan, 0.3,
    );
    this.container.add(headerLine);

    // ── Ability buttons ──
    ABILITY_DEFS.forEach((def, i) => {
      const btnX = BTN_START_X + i * (BTN_W + BTN_GAP);
      this.createAbilityButton(def, btnX, BTN_Y);
    });

    // ── Unit section ──
    const unitHeaderY = BTN_Y + BTN_H + 20;
    const unitHeader = this.scene.add.text(BTN_START_X, unitHeaderY, 'AVAILABLE UNITS', {
      fontSize: '13px', color: '#778899', fontFamily: 'monospace', fontStyle: 'bold',
    });
    this.container.add(unitHeader);

    this.unitSectionX = BTN_START_X;
    this.unitSectionY = unitHeaderY + 20;
    this.buildUnitDisplay(this.unitSectionX, this.unitSectionY);
  }

  private createAbilityButton(
    def: typeof ABILITY_DEFS[0],
    x: number, y: number,
  ): void {
    const btnContainer = this.scene.add.container(x, y);

    // Background
    const bg = this.scene.add.rectangle(BTN_W / 2, BTN_H / 2, BTN_W, BTN_H, 0x080e18, 1);
    bg.setStrokeStyle(1.5, def.color, 0.45);
    btnContainer.add(bg);
    this.abilityBgs.set(def.id, bg);

    // Left accent stripe
    const stripe = this.scene.add.rectangle(3, BTN_H / 2, 4, BTN_H - 4, def.color, 0.7);
    btnContainer.add(stripe);
    this.abilityStripes.set(def.id, stripe);

    // Icon
    const icon = this.scene.add.text(22, BTN_H / 2 - 14, def.icon, {
      fontSize: '28px',
    }).setOrigin(0, 0.5);
    btnContainer.add(icon);
    this.abilityIcons.set(def.id, icon);

    // Name
    const name = this.scene.add.text(58, 10, def.name, {
      fontSize: '13px', color: def.colorStr, fontFamily: 'monospace', fontStyle: 'bold',
    });
    btnContainer.add(name);
    this.abilityNames.set(def.id, name);

    // Description
    const desc = this.scene.add.text(58, 28, def.desc, {
      fontSize: '10px', color: '#667788', fontFamily: 'monospace',
      wordWrap: { width: BTN_W - 68 },
    });
    btnContainer.add(desc);

    // Cooldown bar (empty track)
    const barTrack = this.scene.add.rectangle(
      BTN_W / 2, BTN_H - 10,
      BTN_W - 16, COOLDOWN_BAR_H,
      0x0d1a28, 1,
    );
    btnContainer.add(barTrack);

    // Cooldown bar fill (full = ready)
    const barFill = this.scene.add.rectangle(
      8 + (BTN_W - 16) / 2, BTN_H - 10,
      BTN_W - 16, COOLDOWN_BAR_H,
      def.color, 0.8,
    );
    btnContainer.add(barFill);
    this.cooldownFills.set(def.id, barFill);

    // Cooldown timer text
    const cdText = this.scene.add.text(BTN_W - 10, BTN_H - 16, '', {
      fontSize: '10px', color: NEON_STR.yellow, fontFamily: 'monospace',
    }).setOrigin(1, 0);
    btnContainer.add(cdText);
    this.cooldownTexts.set(def.id, cdText);

    // Hit zone
    const hit = this.scene.add.zone(BTN_W / 2, BTN_H / 2, BTN_W, BTN_H);
    hit.setInteractive({ useHandCursor: true });
    this.abilityHits.set(def.id, hit);

    hit.on('pointerover', () => {
      const onCd = this.abilitySystem.getCooldownRemaining(def.id) > 0;
      if (!onCd) {
        bg.setFillStyle(0x0d1e30, 1);
        bg.setStrokeStyle(2, def.color, 0.9);
        this.scene.tweens.add({
          targets: btnContainer,
          scaleX: 1.02,
          scaleY: 1.02,
          duration: 80,
          ease: 'Quad.Out',
        });
      }
    });
    hit.on('pointerout', () => {
      const onCd = this.abilitySystem.getCooldownRemaining(def.id) > 0;
      bg.setFillStyle(onCd ? 0x040608 : 0x080e18, 1);
      bg.setStrokeStyle(1.5, onCd ? 0x333333 : def.color, onCd ? 0.3 : 0.45);
      this.scene.tweens.add({
        targets: btnContainer,
        scaleX: 1,
        scaleY: 1,
        duration: 80,
        ease: 'Quad.Out',
      });
    });
    if (!this.readonly) {
      hit.on('pointerdown', () => {
        if (panelState.isAnimating) return;
        // Route through AbilitySystem rather than faking the event directly --
        // this used to bypass it entirely, so Gold Surge granted no gold, set
        // no cooldown, and fired even while locked or already on cooldown.
        this.abilitySystem.activate(def.id);
      });
    }

    btnContainer.add(hit);
    this.container.add(btnContainer);
  }

  private buildUnitDisplay(x: number, y: number): void {
    const UNIT_TYPES = [
      { key: 'infantry',       label: 'INFANTRY',   color: NEON.green   },
      { key: 'artillery',      label: 'ARTILLERY',  color: NEON.blue    },
      { key: 'cavalry',        label: 'CAVALRY',    color: NEON.orange  },
      { key: 'elite_infantry', label: 'ELITE INF',  color: NEON.green   },
      { key: 'elite_artillery',label: 'ELITE ART',  color: NEON.blue    },
      { key: 'elite_cavalry',  label: 'ELITE CAV',  color: NEON.orange  },
      { key: 'wrench',         label: 'WRENCH',     color: NEON.yellow  },
    ];

    const PILL_W = 98, PILL_H = 28, PILL_GAP = 8, PILLS_PER_ROW = 4;

    UNIT_TYPES.forEach(({ key, label, color }, i) => {
      const row = Math.floor(i / PILLS_PER_ROW);
      const col = i % PILLS_PER_ROW;
      const px = x + col * (PILL_W + PILL_GAP);
      const py = y + row * (PILL_H + 6);

      const unlockKey = key === 'infantry' ? 'unlock_infantry' : `unlock_${key}`;
      const isUnlocked = key === 'infantry' || this.playerTech.researched.has(unlockKey);

      const pillBg = this.scene.add.rectangle(
        px + PILL_W / 2, py + PILL_H / 2,
        PILL_W, PILL_H,
        isUnlocked ? 0x0a1820 : 0x060810,
        1,
      );
      pillBg.setStrokeStyle(1, color, isUnlocked ? 0.7 : 0.2);
      this.container.add(pillBg);

      const pillText = this.scene.add.text(px + PILL_W / 2, py + PILL_H / 2, label, {
        fontSize: '11px',
        color: isUnlocked ? `#${color.toString(16).padStart(6, '0')}` : '#334455',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      this.container.add(pillText);

      // Lock indicator
      let lock: Phaser.GameObjects.Text | undefined;
      if (!isUnlocked) {
        lock = this.scene.add.text(px + PILL_W - 10, py + 6, '🔒', { fontSize: '10px' });
        this.container.add(lock);
      }

      this.pillMap.set(key, { bg: pillBg, text: pillText, lock });
    });
  }

  private rebuildUnitDisplay(): void {
    // Destroy old pill objects
    for (const { bg, text, lock } of this.pillMap.values()) {
      bg.destroy();
      text.destroy();
      lock?.destroy();
    }
    this.pillMap.clear();
    this.buildUnitDisplay(this.unitSectionX, this.unitSectionY);
  }

  private setupUpdate(): void {
    // Per-frame cooldown bar updates
    this.updateListener = () => {
      for (const def of ABILITY_DEFS) {
        const cdText = this.cooldownTexts.get(def.id);
        const fill = this.cooldownFills.get(def.id);
        if (!fill || !cdText) continue; // ability not yet built (tech not researched);
        const bg = this.abilityBgs.get(def.id);
        const icon = this.abilityIcons.get(def.id);
        const nameText = this.abilityNames.get(def.id);
        const stripe = this.abilityStripes.get(def.id);
        const remaining = this.abilitySystem.getCooldownRemaining(def.id);
        const maxCd = ABILITY_DEFINITIONS[def.id]?.cooldownMs ?? 60000;
        const wasOnCd = this.wasOnCooldown.get(def.id) ?? false;
        const onCooldown = remaining > 0;

        if (onCooldown && maxCd > 0) {
          const fraction = 1 - remaining / maxCd;
          const barW = Math.max(1, (BTN_W - 16) * fraction);
          fill.setSize(barW, COOLDOWN_BAR_H);
          fill.setX(8 + barW / 2);
          fill.setFillStyle(def.color, 0.5);
          cdText.setText((remaining / 1000).toFixed(1) + 's');

          // Dim elements during cooldown
          if (bg) { bg.setFillStyle(0x040608, 1); bg.setStrokeStyle(1.5, 0x333333, 0.3); }
          if (icon) icon.setAlpha(0.4);
          if (nameText) nameText.setColor('#555555');
          if (stripe) stripe.setFillStyle(0x333333, 0.3);
        } else {
          fill.setSize(BTN_W - 16, COOLDOWN_BAR_H);
          fill.setX(8 + (BTN_W - 16) / 2);
          fill.setFillStyle(def.color, 0.85);
          cdText.setText('');

          // Restore elements when ready
          if (bg) { bg.setFillStyle(0x080e18, 1); bg.setStrokeStyle(1.5, def.color, 0.45); }
          if (icon) icon.setAlpha(1);
          if (nameText) nameText.setColor(def.colorStr);
          if (stripe) stripe.setFillStyle(def.color, 0.7);

          // Flash border bright when cooldown just ended
          if (wasOnCd && bg) {
            bg.setStrokeStyle(3, 0xffffff, 1);
            this.scene.time.delayedCall(200, () => {
              bg.setStrokeStyle(1.5, def.color, 0.45);
            });
          }
        }

        this.wasOnCooldown.set(def.id, onCooldown);
      }
    };
    this.scene.events.on('update', this.updateListener);

    this.techListener = () => { this.rebuildUnitDisplay(); };
    eventBus.on('tech:research_complete', this.techListener);
  }

  public getContainer(): Phaser.GameObjects.Container {
    return this.container;
  }

  public reposition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  public destroy(): void {
    if (this.updateListener) {
      this.scene.events.off('update', this.updateListener);
      this.updateListener = null;
    }
    if (this.techListener) {
      eventBus.off('tech:research_complete', this.techListener);
      this.techListener = null;
    }
    this.cooldownTexts.clear();
    this.cooldownFills.clear();
    this.abilityBgs.clear();
    this.container.destroy();
  }
}
