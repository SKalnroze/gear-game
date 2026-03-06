import Phaser from 'phaser';
import { eventBus } from '../systems/EventBus';
import { CANVAS_HEIGHT, PANEL_COLLAPSED_H, PANEL_EXPANDED_H } from '../constants/world.constants';
import { NEON } from '../constants/ui.constants';

/**
 * Exported panel state: TopY position of the panel top edge
 * Used by GameScene to gate input when pointer.y > panelState.topY
 */
export const panelState: { topY: number; isAnimating: boolean; isExpanded: boolean } = {
  topY: CANVAS_HEIGHT - PANEL_COLLAPSED_H,
  isAnimating: false,
  isExpanded: false,
};

type TabName = 'gears' | 'tech' | 'actions';

const TAB_DEFS: { id: TabName; label: string; accentColor: number }[] = [
  { id: 'gears',   label: '⚙ GEARS',   accentColor: NEON.cyan    },
  { id: 'tech',    label: '◈ TECH',     accentColor: NEON.orange  },
  { id: 'actions', label: '⚡ ACTIONS', accentColor: NEON.magenta },
];

const TAB_BTN_W = 130;
const TAB_BTN_H = 44;
const TAB_BTN_GAP = 6;
const TAB_START_X = 12;
const TAB_CENTER_Y = PANEL_COLLAPSED_H / 2;

/**
 * SlidingPanel: 60px collapsed, 440px expanded
 * Modern tab bar: accent-underline active style, bigger fonts, multi-color resources
 */
export class SlidingPanel {
  private scene: Phaser.Scene;
  private canvasW: number;
  private canvasH: number;

  private outerContainer!: Phaser.GameObjects.Container;
  private tabBar!: Phaser.GameObjects.Container;
  private bodyContainer!: Phaser.GameObjects.Container;
  private dismissZone!: Phaser.GameObjects.Zone;

  // Resize-able tab bar elements
  private tabBarBg!: Phaser.GameObjects.Rectangle;
  private topAccentLine!: Phaser.GameObjects.Rectangle;
  private sep!: Phaser.GameObjects.Line;
  private maskGraphics!: Phaser.GameObjects.Graphics;

  // Resource texts (separate objects for different colors)
  private goldText!: Phaser.GameObjects.Text;
  private ironText!: Phaser.GameObjects.Text;
  private crystalText!: Phaser.GameObjects.Text;
  private aetherText!: Phaser.GameObjects.Text;
  private researchText!: Phaser.GameObjects.Text;

  // REMOVE / AS ENEMY / PAUSE buttons
  private removeBtn!: Phaser.GameObjects.Container;

  private activeTab: TabName | null = null;
  private currentBodyH: number = 0;
  private isExpanded: boolean = false;
  private isPractice: boolean = false;

  // State saved when panel auto-collapses for gear drag/pickup
  private wasExpandedBeforeAction: boolean = false;
  private activeTabBeforeAction: TabName | null = null;

  private tabButtons: Map<TabName, { bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text; underline: Phaser.GameObjects.Rectangle }> = new Map();
  private tabBodies: Map<TabName, Phaser.GameObjects.Container> = new Map();

  constructor(scene: Phaser.Scene, canvasW: number, canvasH: number, isPractice: boolean = false) {
    this.scene = scene;
    this.canvasW = canvasW;
    this.canvasH = canvasH;
    this.isPractice = isPractice;
    // Reset module-level shared state for a fresh game
    panelState.topY = canvasH - PANEL_COLLAPSED_H;
    panelState.isAnimating = false;
    panelState.isExpanded = false;
    this.buildPanel();
  }

  private buildPanel(): void {
    this.outerContainer = this.scene.add.container(0, this.canvasH - PANEL_COLLAPSED_H);
    this.outerContainer.setDepth(100);

    this.tabBar = this.scene.add.container(0, 0);
    this.outerContainer.add(this.tabBar);

    // Tab bar background — dark blue-black
    this.tabBarBg = this.scene.add.rectangle(
      this.canvasW / 2, PANEL_COLLAPSED_H / 2,
      this.canvasW, PANEL_COLLAPSED_H,
      0x06080f, 0.97,
    );
    this.tabBarBg.setDepth(50);
    this.tabBar.add(this.tabBarBg);

    // Top accent line (1px neon cyan at y=0, panel/game boundary)
    this.topAccentLine = this.scene.add.rectangle(this.canvasW / 2, 1, this.canvasW, 2, NEON.cyan, 0.7);
    this.topAccentLine.setDepth(52);
    this.tabBar.add(this.topAccentLine);

    // Bottom separator (between tab bar and body, faint)
    this.sep = this.scene.add.line(
      this.canvasW / 2, 0,
      -this.canvasW / 2, PANEL_COLLAPSED_H,
      this.canvasW / 2, PANEL_COLLAPSED_H,
      0x1a2a3a, 1,
    );
    this.sep.setDepth(51);
    this.sep.setLineWidth(1);
    this.tabBar.add(this.sep);

    // Tab buttons
    let btnX = TAB_START_X;
    for (const def of TAB_DEFS) {
      this.createTabButton(def.id, def.label, def.accentColor, btnX + TAB_BTN_W / 2, TAB_CENTER_Y);
      btnX += TAB_BTN_W + TAB_BTN_GAP;
    }

    // REMOVE toggle button (after tabs)
    this.removeBtn = this.createRemoveButton(btnX + 58, TAB_CENTER_Y);
    this.tabBar.add(this.removeBtn);
    btnX += 122;

    // AS ENEMY toggle (practice mode only)
    if (this.isPractice) {
      const asEnemyBtn = this.createToggleButton(
        btnX + 58, TAB_CENTER_Y,
        '⚔ AS ENEMY', 110,
        0x1a0a00, 0xff8800, 0.7,
        0x663300, 0xff8800, 1,
        '#ff9933', '#ffffff',
        active => eventBus.emit('ui:as_enemy_toggled', { active }),
      );
      this.tabBar.add(asEnemyBtn);
      btnX += 122;
    }

    // PAUSE toggle (all modes)
    const pauseBtn = this.createToggleButton(
      btnX + 58, TAB_CENTER_Y,
      '⏸ PAUSE', 104,
      0x0a0a1a, 0x4488ff, 0.7,
      0x001144, 0x4488ff, 1,
      '#6699ff', '#ffffff',
      active => eventBus.emit('ui:pause_toggled', { paused: active }),
    );
    this.tabBar.add(pauseBtn);

    // Resource displays (right side, multi-color)
    const resY = PANEL_COLLAPSED_H / 2 - 6;
    this.goldText = this.makeResText(this.canvasW - 380, resY, 'G —', '#ffcc00');
    this.ironText = this.makeResText(this.canvasW - 295, resY, 'Fe —', '#aabbcc');
    this.crystalText = this.makeResText(this.canvasW - 210, resY, 'Cr —', '#00ffcc');
    this.aetherText = this.makeResText(this.canvasW - 125, resY, 'Ae —', '#cc44ff');

    // Research progress (below resource row)
    const researchY = PANEL_COLLAPSED_H / 2 + 6;
    this.researchText = this.scene.add.text(this.canvasW - 380, researchY, '', {
      fontSize: '15px',
      color: '#00ffcc',
      fontFamily: 'monospace',
    });
    this.researchText.setDepth(52);
    this.tabBar.add(this.researchText);

    // Body container
    this.bodyContainer = this.scene.add.container(0, PANEL_COLLAPSED_H);

    // Dark background for the body area
    const bodyBg = this.scene.add.rectangle(
      this.canvasW / 2, (PANEL_EXPANDED_H - PANEL_COLLAPSED_H) / 2,
      this.canvasW, PANEL_EXPANDED_H - PANEL_COLLAPSED_H,
      0x040810, 1,
    );
    this.bodyContainer.add(bodyBg);

    this.maskGraphics = this.scene.add.graphics();
    this.maskGraphics.fillStyle(0xffffff, 1);
    this.maskGraphics.fillRect(0, 0, this.canvasW, PANEL_EXPANDED_H - PANEL_COLLAPSED_H);
    this.maskGraphics.setPosition(0, this.canvasH); // starts off-screen
    this.bodyContainer.setMask(this.maskGraphics.createGeometryMask());
    this.outerContainer.add(this.bodyContainer);

    // Dismiss zone
    this.dismissZone = this.scene.add.zone(
      this.canvasW / 2, this.canvasH / 2,
      this.canvasW, this.canvasH,
    );
    this.dismissZone.setDepth(49);
    this.dismissZone.setInteractive();
    this.dismissZone.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      // Only collapse when clicking in the game world above the panel, not inside the panel body
      if (this.isExpanded && ptr.y < panelState.topY) this.collapse();
    });
    this.dismissZone.setVisible(false);

    panelState.topY = this.canvasH - PANEL_COLLAPSED_H;

    // Economy updates — gold_changed fires on earn/spend, resources_changed on mining
    const updateResources = (owner: string, resources: { gold: number; iron: number; crystal: number; aether: number }) => {
      if (owner === 'player') {
        this.goldText.setText(`G ${Math.floor(resources.gold)}`);
        this.ironText.setText(`Fe ${Math.floor(resources.iron)}`);
        this.crystalText.setText(`Cr ${Math.floor(resources.crystal)}`);
        this.aetherText.setText(`Ae ${Math.floor(resources.aether)}`);
      }
    };
    eventBus.on('economy:gold_changed', ({ owner, resources }) => updateResources(owner, resources));
    eventBus.on('economy:resources_changed', ({ owner, resources }) => updateResources(owner, resources));

    // Collapse panel during gear drag/pickup; restore afterwards
    const onActionStart = () => {
      if (this.isExpanded) {
        this.wasExpandedBeforeAction = true;
        this.activeTabBeforeAction = this.activeTab;
        this.collapse();
      }
    };
    const onActionEnd = () => {
      if (this.wasExpandedBeforeAction) {
        this.wasExpandedBeforeAction = false;
        this.activeTab = this.activeTabBeforeAction;
        if (this.activeTabBeforeAction) {
          this.showTab(this.activeTabBeforeAction);
        }
        this.expand();
        this.updateTabStyles();
      }
    };
    eventBus.on('ui:gear_drag_start', onActionStart);
    eventBus.on('ui:gear_drag_end', onActionEnd);
    eventBus.on('ui:gear_pickup_start', onActionStart);
    eventBus.on('ui:gear_pickup_end', onActionEnd);
  }

  private makeResText(x: number, y: number, text: string, color: string): Phaser.GameObjects.Text {
    const t = this.scene.add.text(x, y, text, {
      fontSize: '18px',
      color,
      fontFamily: 'monospace',
      fontStyle: 'bold',
    });
    t.setDepth(52);
    this.tabBar.add(t);
    return t;
  }

  private createTabButton(tab: TabName, label: string, accentColor: number, cx: number, cy: number): void {
    const isActive = this.activeTab === tab;

    // Button background (visual only — not the hit target)
    const bg = this.scene.add.rectangle(cx, cy, TAB_BTN_W, TAB_BTN_H,
      isActive ? 0x0a1520 : 0x06080f, isActive ? 0.9 : 0.0,
    );
    bg.setDepth(51);
    this.tabBar.add(bg);

    // Button label text
    const txt = this.scene.add.text(cx, cy - 2, label, {
      fontSize: '19px',
      color: isActive ? '#ffffff' : '#778899',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    txt.setDepth(52);
    this.tabBar.add(txt);

    // Accent underline (3px, visible only when active)
    const underlineY = cy + TAB_BTN_H / 2 - 2;
    const underline = this.scene.add.rectangle(cx, underlineY, TAB_BTN_W - 4, 3,
      accentColor, isActive ? 1.0 : 0.0,
    );
    underline.setDepth(53);
    this.tabBar.add(underline);

    // Zone is the reliable hit target for containers (avoids transparent-rect input issues)
    const hitZone = this.scene.add.zone(cx, cy, TAB_BTN_W, TAB_BTN_H)
      .setInteractive({ useHandCursor: true });
    hitZone.setDepth(54);
    this.tabBar.add(hitZone);

    hitZone.on('pointerover', () => {
      if (this.activeTab !== tab) {
        bg.setFillStyle(0x0a1520, 0.5);
        txt.setColor('#aabbcc');
      }
    });
    hitZone.on('pointerout', () => {
      if (this.activeTab !== tab) {
        bg.setFillStyle(0x06080f, 0);
        txt.setColor('#778899');
      }
    });
    hitZone.on('pointerdown', () => {
      if (this.activeTab === tab && this.isExpanded) {
        this.collapse();
      } else {
        this.activeTab = tab;
        this.showTab(tab);
        if (!this.isExpanded) this.expand();
        this.updateTabStyles();
      }
    });

    this.tabButtons.set(tab, { bg, text: txt, underline });
  }

  private createRemoveButton(cx: number, cy: number): Phaser.GameObjects.Container {
    return this.createToggleButton(
      cx, cy,
      '$ SELL', 100,
      0x0f130a, 0xd4a017, 0.7,
      0x3a2e00, 0xffd700, 1,
      '#d4a017', '#ffffff',
      active => eventBus.emit('ui:remove_mode_toggled', { active }),
    );
  }

  /**
   * Generic reusable toggle button.
   * Off state: bgFill/borderColor/borderAlpha/labelColor
   * On state:  bgFillOn/borderColorOn/borderAlphaOn/labelColorOn
   * onChange: called with new active state
   */
  private createToggleButton(
    cx: number, cy: number,
    label: string, width: number,
    bgFill: number, borderColor: number, borderAlpha: number,
    bgFillOn: number, borderColorOn: number, borderAlphaOn: number,
    labelColor: string, labelColorOn: string,
    onChange: (active: boolean) => void,
  ): Phaser.GameObjects.Container {
    const btnContainer = this.scene.add.container(cx, cy);

    const bg = this.scene.add.rectangle(0, 0, width, TAB_BTN_H, bgFill, 0.9);
    bg.setStrokeStyle(1.5, borderColor, borderAlpha);
    bg.setDepth(51);
    btnContainer.add(bg);

    const txt = this.scene.add.text(0, -2, label, {
      fontSize: '18px',
      color: labelColor,
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    txt.setDepth(52);
    btnContainer.add(txt);

    let active = false;
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => {
      if (!active) bg.setFillStyle(bgFillOn, 0.6);
    });
    bg.on('pointerout', () => {
      if (!active) bg.setFillStyle(bgFill, 0.9);
    });
    bg.on('pointerdown', () => {
      active = !active;
      if (active) {
        bg.setFillStyle(bgFillOn, 1);
        bg.setStrokeStyle(2, borderColorOn, borderAlphaOn);
        txt.setColor(labelColorOn);
      } else {
        bg.setFillStyle(bgFill, 0.9);
        bg.setStrokeStyle(1.5, borderColor, borderAlpha);
        txt.setColor(labelColor);
      }
      onChange(active);
    });

    return btnContainer;
  }

  private updateTabStyles(): void {
    for (const [tab, { bg, text, underline }] of this.tabButtons) {
      const def = TAB_DEFS.find(d => d.id === tab)!;
      if (this.activeTab !== null && this.activeTab === tab) {
        bg.setFillStyle(0x0a1520, 0.9);
        text.setColor('#ffffff');
        underline.setAlpha(1);
      } else {
        bg.setFillStyle(0x06080f, 0);
        text.setColor('#778899');
        underline.setAlpha(0);
        void def; // suppress unused warning
      }
    }
  }

  private showTab(tab: TabName): void {
    // Cancel any in-flight tab transitions before starting new ones
    for (const [, body] of this.tabBodies) {
      this.scene.tweens.killTweensOf(body);
    }

    const incoming = this.tabBodies.get(tab);
    const outgoing: Phaser.GameObjects.Container[] = [];
    for (const [t, body] of this.tabBodies) {
      if (t !== tab) {
        body.setVisible(false);
        body.setAlpha(1);
        outgoing.push(body);
      }
    }

    // Fade in incoming tab
    if (incoming) {
      incoming.setAlpha(0);
      incoming.setVisible(true);
      this.scene.tweens.add({
        targets: incoming,
        alpha: 1,
        duration: 120,
      });
    }
  }

  private expand(): void {
    if (this.isExpanded) return;
    this.isExpanded = true;
    panelState.isExpanded = true;
    this.dismissZone.setVisible(true);
    panelState.isAnimating = true;
    this.scene.tweens.add({
      targets: this,
      currentBodyH: PANEL_EXPANDED_H - PANEL_COLLAPSED_H,
      duration: 240,
      ease: 'Cubic.Out',
      onUpdate: () => {
        const newY = this.canvasH - PANEL_COLLAPSED_H - this.currentBodyH;
        this.outerContainer.setY(newY);
        panelState.topY = newY;
        this.maskGraphics.setY(newY + PANEL_COLLAPSED_H);
        eventBus.emit('ui:panel_height_changed', {
          topY: panelState.topY,
          totalH: PANEL_COLLAPSED_H + this.currentBodyH,
        });
      },
      onComplete: () => { panelState.isAnimating = false; },
    });
  }

  private collapse(): void {
    if (!this.isExpanded) return;
    this.isExpanded = false;
    panelState.isExpanded = false;
    this.dismissZone.setVisible(false);
    panelState.isAnimating = true;
    this.scene.tweens.add({
      targets: this,
      currentBodyH: 0,
      duration: 220,
      ease: 'Cubic.Out',
      onUpdate: () => {
        const newY = this.canvasH - PANEL_COLLAPSED_H - this.currentBodyH;
        this.outerContainer.setY(newY);
        panelState.topY = newY;
        this.maskGraphics.setY(newY + PANEL_COLLAPSED_H);
        eventBus.emit('ui:panel_height_changed', {
          topY: panelState.topY,
          totalH: PANEL_COLLAPSED_H + this.currentBodyH,
        });
      },
      onComplete: () => { panelState.isAnimating = false; },
    });
  }

  public resize(w: number, h: number): void {
    this.canvasW = w;
    this.canvasH = h;

    const newY = h - PANEL_COLLAPSED_H - this.currentBodyH;
    this.outerContainer.setY(newY);
    panelState.topY = newY;

    this.tabBarBg.setPosition(w / 2, PANEL_COLLAPSED_H / 2);
    this.tabBarBg.setSize(w, PANEL_COLLAPSED_H);
    this.topAccentLine.setPosition(w / 2, 1);
    this.topAccentLine.setSize(w, 2);
    this.sep.setTo(-w / 2, PANEL_COLLAPSED_H, w / 2, PANEL_COLLAPSED_H);
    this.sep.setX(w / 2);

    this.goldText.setX(w - 380);
    this.ironText.setX(w - 295);
    this.crystalText.setX(w - 210);
    this.aetherText.setX(w - 125);
    this.researchText.setX(w - 380);

    this.dismissZone.setPosition(w / 2, h / 2);
    this.dismissZone.setSize(w, h);

    this.maskGraphics.clear();
    this.maskGraphics.fillStyle(0xffffff, 1);
    this.maskGraphics.fillRect(0, 0, w, PANEL_EXPANDED_H - PANEL_COLLAPSED_H);
    this.maskGraphics.setPosition(0, newY + PANEL_COLLAPSED_H);
  }

  public updateResearch(info: { nodeId: string; progress: number } | null): void {
    if (!info) {
      this.researchText.setText('');
      return;
    }
    const pct = Math.floor(info.progress * 100);
    // Use TECH_NODES for name lookup if available, else nodeId
    this.researchText.setText(`◈ ${info.nodeId} ${pct}%`);
  }

  public registerTabBody(tab: TabName, body: Phaser.GameObjects.Container): void {
    this.tabBodies.set(tab, body);
    this.bodyContainer.add(body);
    body.setVisible(tab === this.activeTab);
  }
}
