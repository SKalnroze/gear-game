import Phaser from 'phaser';
import { eventBus } from '../systems/EventBus';
import { TechSystem } from '../systems/TechSystem';
import { TechState } from '../types/tech.types';
import { TECH_NODES } from '../constants/tech.constants';
import { NEON, NEON_STR } from '../constants/ui.constants';
import { PANEL_BODY_H } from '../constants/world.constants';
import { panelState } from './SlidingPanel';

// ─── Layout constants ────────────────────────────────────────────────────────
const QUEUE_W       = 192;  // left sidebar for research queue
const COL_W         = 272;  // virtual width per column band
const CARD_W        = 252;  // card width
const CARD_H        = 54;   // card height
const CARD_GAP      = 8;    // vertical gap between cards in same column
const CARD_SLOT     = CARD_H + CARD_GAP;
const HEADER_H      = 40;   // column header height
const COL_PAD_X     = (COL_W - CARD_W) / 2;
const TOTAL_COLS    = 5;
const VIRTUAL_W     = TOTAL_COLS * COL_W;
const CONTENT_BASE_X = QUEUE_W + 4;

const TIER_STRIPE_H = 4;

const COLUMN_LABELS = ['⚙  GEARS', '⚔  UNITS', '◈  ECONOMY', '✦  ABILITIES', '⬡  DEFENSE'];
const COLUMN_ACCENT: number[] = [NEON.cyan, NEON.green, NEON.yellow, NEON.magenta, NEON.orange];

const TIER_COLORS: number[] = [
  0x00ffcc, // T1 — cyan
  0xff8800, // T2 — orange
  0xff2244, // T3 — red
];

const STATE = {
  researched: { bg: 0x001a0f, border: NEON.green,   text: '#66ff99', stripe: NEON.green  },
  queued:     { bg: 0x1a1300, border: NEON.yellow,  text: '#ffcc44', stripe: NEON.yellow },
  available:  { bg: 0x040e1a, border: NEON.blue,    text: '#eef2ff', stripe: NEON.blue   },
  locked:     { bg: 0x060810, border: 0x1a2233,     text: '#3a4a5a', stripe: 0x1a2233    },
};

type NodeState = keyof typeof STATE;

/**
 * ColumnTechSection — 5-column card grid with:
 *  - Left queue sidebar showing in-progress + queued techs
 *  - Per-card animated progress bar for in-progress research
 *  - Prerequisite highlighting on hover
 *  - Dynamic prereq names in tooltips
 */
export class RadialTechSection {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private techSystem: TechSystem;
  private playerTech: TechState;
  private owner: 'player' | 'ai';
  private readonly: boolean;

  private contentContainer!: Phaser.GameObjects.Container;
  private edgesGraphics!: Phaser.GameObjects.Graphics;
  private cardContainers: Map<string, Phaser.GameObjects.Container> = new Map();
  private positions: Map<string, { x: number; y: number }> = new Map();

  // Progress bars (only the in-progress card has one)
  private progressBarRects: Map<string, Phaser.GameObjects.Rectangle> = new Map();

  // Prereq highlight overlays (temporary, cleared on mouse-out)
  private prereqHighlights: Phaser.GameObjects.Graphics[] = [];

  // Queue sidebar
  private queuePanel!: Phaser.GameObjects.Container;
  private queueItemsContainer!: Phaser.GameObjects.Container;

  // Internal tooltip
  private tooltip!: Phaser.GameObjects.Container;
  private tooltipBg!: Phaser.GameObjects.Rectangle;
  private tooltipName!: Phaser.GameObjects.Text;
  private tooltipDesc!: Phaser.GameObjects.Text;
  private tooltipPrereqs!: Phaser.GameObjects.Text;
  private tooltipStatus!: Phaser.GameObjects.Text;

  panelW: number;
  private panOffsetX = 0;
  private panOffsetY = 0;
  private isPanning = false;
  private panStart = { px: 0, py: 0, ox: 0, oy: 0 };

  constructor(
    scene: Phaser.Scene,
    techSystem: TechSystem,
    playerTech: TechState,
    panelW: number,
    owner: 'player' | 'ai' = 'player',
    readonly: boolean = false,
  ) {
    this.scene = scene;
    this.techSystem = techSystem;
    this.playerTech = playerTech;
    this.panelW = panelW;
    this.owner = owner;
    this.readonly = readonly;
    this.container = scene.add.container(0, 0);

    this.contentContainer = scene.add.container(CONTENT_BASE_X + this.panOffsetX, this.panOffsetY);
    this.container.add(this.contentContainer);

    this.edgesGraphics = scene.add.graphics();
    this.contentContainer.add(this.edgesGraphics);

    this.buildLayout();
    this.buildQueuePanel();
    this.buildTooltip();
    this.setupInput();

    eventBus.on('tech:research_complete', () => { this.refreshCards(); this.refreshQueuePanel(); });
    eventBus.on('tech:queued',            () => { this.refreshCards(); this.refreshQueuePanel(); });
    eventBus.on('tech:research_started',  () => { this.refreshCards(); this.refreshQueuePanel(); });
    eventBus.on('tech:cancelled',         () => { this.refreshCards(); this.refreshQueuePanel(); });
  }

  // ── Build layout ─────────────────────────────────────────────────────────

  private buildLayout(): void {
    const byCol = new Map<number, string[]>();
    for (let c = 0; c < TOTAL_COLS; c++) byCol.set(c, []);

    for (const nodeId of Object.keys(TECH_NODES)) {
      const node = TECH_NODES[nodeId];
      if (!node) continue;
      const col = node.column ?? 0;
      byCol.get(col)?.push(nodeId);
    }

    for (const [, ids] of byCol) {
      ids.sort((a, b) => {
        const ta = TECH_NODES[a]?.tier ?? 1;
        const tb = TECH_NODES[b]?.tier ?? 1;
        return ta !== tb ? ta - tb : a.localeCompare(b);
      });
    }

    for (const [col, ids] of byCol) {
      const baseX = col * COL_W + COL_PAD_X;
      ids.forEach((nodeId, idx) => {
        const x = baseX;
        const y = HEADER_H + idx * CARD_SLOT;
        this.positions.set(nodeId, { x: x + CARD_W / 2, y: y + CARD_H / 2 });
      });
    }

    this.renderEdges();

    for (let col = 0; col < TOTAL_COLS; col++) {
      this.renderColumnHeader(col);
    }

    for (const nodeId of Object.keys(TECH_NODES)) {
      this.renderCard(nodeId);
    }
  }

  private renderColumnHeader(col: number): void {
    const x = col * COL_W;
    const accent = COLUMN_ACCENT[col];

    const bg = this.scene.add.rectangle(x + COL_W / 2, HEADER_H / 2, COL_W - 2, HEADER_H - 4, 0x070c16, 1);
    this.contentContainer.add(bg);

    const line = this.scene.add.rectangle(x + COL_W / 2, HEADER_H - 3, COL_W - 4, 2, accent, 0.8);
    this.contentContainer.add(line);

    const label = this.scene.add.text(x + COL_W / 2, HEADER_H / 2 - 1, COLUMN_LABELS[col], {
      fontSize: '13px',
      color: `#${accent.toString(16).padStart(6, '0')}`,
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.contentContainer.add(label);
  }

  private getNodeState(nodeId: string): NodeState {
    if (this.playerTech.researched.has(nodeId)) return 'researched';
    if (this.playerTech.queue.includes(nodeId)) return 'queued';
    const node = TECH_NODES[nodeId];
    if (!node) return 'locked';
    const prereqsMet = !node.prereqs?.length || node.prereqs.every(p => this.playerTech.researched.has(p));
    return prereqsMet ? 'available' : 'locked';
  }

  private renderCard(nodeId: string): void {
    const pos = this.positions.get(nodeId);
    const node = TECH_NODES[nodeId];
    if (!pos || !node) return;

    const state = this.getNodeState(nodeId);
    const isInProgress = this.playerTech.inProgress === nodeId;
    const colors = STATE[state];
    const tierColor = TIER_COLORS[(node.tier ?? 1) - 1] ?? TIER_COLORS[0];

    const cardX = pos.x - CARD_W / 2;
    const cardY = pos.y - CARD_H / 2;

    const c = this.scene.add.container(cardX, cardY);
    this.contentContainer.add(c);
    this.cardContainers.set(nodeId, c);

    // Background
    const bg = this.scene.add.rectangle(CARD_W / 2, CARD_H / 2, CARD_W, CARD_H, colors.bg, 1);
    c.add(bg);

    // Progress bar (only for in-progress node — starts at 0 width, updated each frame)
    if (isInProgress) {
      const progressBar = this.scene.add.rectangle(0, 0, 0, CARD_H, 0x112244, 1).setOrigin(0, 0);
      c.add(progressBar);
      this.progressBarRects.set(nodeId, progressBar);
    }

    // Tier stripe (top)
    const stripe = this.scene.add.rectangle(CARD_W / 2, TIER_STRIPE_H / 2, CARD_W, TIER_STRIPE_H, tierColor, isInProgress ? 1 : 0.85);
    c.add(stripe);

    // Border
    const border = this.scene.add.graphics();
    border.lineStyle(1.5, colors.border, state === 'locked' ? 0.25 : 0.8);
    border.strokeRect(0, 0, CARD_W, CARD_H);
    c.add(border);

    // Status icon (top-right)
    const statusIcon = state === 'researched' ? '✓' : state === 'queued' ? '⌛' : isInProgress ? '◈' : '';
    if (statusIcon) {
      const statusTxt = this.scene.add.text(CARD_W - 8, 7, statusIcon, {
        fontSize: '12px', color: colors.text, fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(1, 0);
      c.add(statusTxt);
    }

    // Node name
    const nameText = this.scene.add.text(8, 8, node.name, {
      fontSize: '12px', color: colors.text, fontFamily: 'monospace', fontStyle: 'bold',
      wordWrap: { width: CARD_W - 40 },
    });
    c.add(nameText);

    // Gold cost (bottom-right)
    const costText = this.scene.add.text(CARD_W - 8, CARD_H - 8, `G ${node.goldCost}`, {
      fontSize: '11px',
      color: state === 'locked' ? '#334455' : NEON_STR.yellow,
      fontFamily: 'monospace',
    }).setOrigin(1, 1);
    c.add(costText);

    // Hit zone
    const hit = this.scene.add.zone(CARD_W / 2, CARD_H / 2, CARD_W, CARD_H);
    const canClick = state !== 'researched' && state !== 'locked' && !isInProgress;
    hit.setInteractive({ useHandCursor: state === 'available' });

    hit.on('pointerover', () => {
      if (state !== 'locked') {
        bg.setFillStyle(state === 'queued' ? 0x2a2000 : (isInProgress ? 0x0a1a2e : 0x071222), 1);
        border.clear();
        border.lineStyle(2, colors.border, 1);
        border.strokeRect(0, 0, CARD_W, CARD_H);
      }
      this.highlightPrereqs(nodeId);
      this.showTooltip(nodeId, pos);
    });
    hit.on('pointerout', () => {
      bg.setFillStyle(colors.bg, 1);
      border.clear();
      border.lineStyle(1.5, colors.border, state === 'locked' ? 0.25 : 0.8);
      border.strokeRect(0, 0, CARD_W, CARD_H);
      this.clearPrereqHighlights();
      this.hideTooltip();
    });
    if (canClick && !this.readonly) {
      hit.on('pointerdown', () => {
        if (panelState.isAnimating) return;
        eventBus.emit('ui:tech_node_clicked', { nodeId });
      });
    }
    c.add(hit);
  }

  private renderEdges(): void {
    const g = this.edgesGraphics;
    g.clear();

    for (const [nodeId, node] of Object.entries(TECH_NODES)) {
      if (!node.prereqs?.length) continue;
      const to = this.positions.get(nodeId);
      if (!to) continue;

      for (const prereqId of node.prereqs) {
        const from = this.positions.get(prereqId);
        if (!from) continue;

        const isResearched = this.playerTech.researched.has(prereqId);
        const alpha = isResearched ? 0.5 : 0.18;
        const color = isResearched ? NEON.green : 0x334455;

        g.lineStyle(1, color, alpha);

        const mx = (from.x + to.x) / 2;
        const my = (from.y + to.y) / 2;

        if (Math.abs(from.x - to.x) < 4) {
          g.lineBetween(from.x, from.y + CARD_H / 2, to.x, to.y - CARD_H / 2);
        } else {
          g.lineBetween(from.x, from.y + CARD_H / 2, from.x, my);
          g.lineBetween(from.x, my, to.x, my);
          g.lineBetween(to.x, my, to.x, to.y - CARD_H / 2);
        }
      }
    }
  }

  // ── Queue sidebar ────────────────────────────────────────────────────────

  private buildQueuePanel(): void {
    this.queuePanel = this.scene.add.container(0, 0);
    this.container.add(this.queuePanel);

    // Background
    const bg = this.scene.add.rectangle(QUEUE_W / 2, PANEL_BODY_H / 2, QUEUE_W, PANEL_BODY_H, 0x04080f, 1);
    this.queuePanel.add(bg);

    // Right divider line
    const divider = this.scene.add.graphics();
    divider.lineStyle(1, NEON.cyan, 0.2);
    divider.lineBetween(QUEUE_W - 1, 0, QUEUE_W - 1, PANEL_BODY_H);
    this.queuePanel.add(divider);

    // Header
    const header = this.scene.add.text(QUEUE_W / 2, 10, 'RESEARCH QUEUE', {
      fontSize: '11px', color: NEON_STR.cyan, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    this.queuePanel.add(header);

    const headerLine = this.scene.add.graphics();
    headerLine.lineStyle(1, NEON.cyan, 0.3);
    headerLine.lineBetween(8, 28, QUEUE_W - 8, 28);
    this.queuePanel.add(headerLine);

    // Items container (below header)
    this.queueItemsContainer = this.scene.add.container(0, 32);
    this.queuePanel.add(this.queueItemsContainer);

    this.refreshQueuePanel();
  }

  private refreshQueuePanel(): void {
    // Clear previous items
    this.queueItemsContainer.removeAll(true);

    const inProgress = this.playerTech.inProgress;
    const queue = this.playerTech.queue;

    if (!inProgress && queue.length === 0) {
      const empty = this.scene.add.text(QUEUE_W / 2, 16, 'Queue empty', {
        fontSize: '10px', color: '#334455', fontFamily: 'monospace',
      }).setOrigin(0.5, 0);
      this.queueItemsContainer.add(empty);
      return;
    }

    let yOffset = 0;
    const ITEM_H = 44;
    const ITEM_PAD = 4;

    // In-progress item
    if (inProgress) {
      const node = TECH_NODES[inProgress];
      if (node) {
        const item = this.buildQueueItem(inProgress, node.name, true, yOffset);
        this.queueItemsContainer.add(item);
        yOffset += ITEM_H + ITEM_PAD;
      }
    }

    // Queued items
    for (const nodeId of queue) {
      const node = TECH_NODES[nodeId];
      if (!node) continue;
      const item = this.buildQueueItem(nodeId, node.name, false, yOffset);
      this.queueItemsContainer.add(item);
      yOffset += ITEM_H + ITEM_PAD;
    }
  }

  private buildQueueItem(
    nodeId: string,
    name: string,
    isActive: boolean,
    y: number,
  ): Phaser.GameObjects.Container {
    const ITEM_W = QUEUE_W - 8;
    const ITEM_H = 44;
    const item = this.scene.add.container(4, y);

    const bg = this.scene.add.rectangle(ITEM_W / 2, ITEM_H / 2, ITEM_W, ITEM_H,
      isActive ? 0x0a1830 : 0x080f1a, 1);
    bg.setStrokeStyle(1, isActive ? NEON.cyan : 0x1a2a3a, isActive ? 0.8 : 0.4);
    item.add(bg);

    // Active indicator
    if (isActive) {
      const activeDot = this.scene.add.rectangle(6, ITEM_H / 2, 3, ITEM_H - 8, NEON.cyan, 0.8).setOrigin(0, 0.5);
      item.add(activeDot);
    }

    // Tech name
    const nameText = this.scene.add.text(14, 6, name, {
      fontSize: '10px',
      color: isActive ? '#eeeeff' : '#778899',
      fontFamily: 'monospace',
      fontStyle: isActive ? 'bold' : 'normal',
      wordWrap: { width: ITEM_W - 36 },
    });
    item.add(nameText);

    // Status label
    const statusLabel = this.scene.add.text(14, ITEM_H - 10, isActive ? '◈ Researching...' : '⌛ Queued', {
      fontSize: '9px',
      color: isActive ? NEON_STR.cyan : '#556677',
      fontFamily: 'monospace',
    });
    item.add(statusLabel);

    // X cancel button
    const btnSize = 16;
    const btnX = ITEM_W - btnSize / 2 - 4;
    const btnY = ITEM_H / 2;

    const btnBg = this.scene.add.rectangle(btnX, btnY, btnSize, btnSize, 0x1a0508, 0.9);
    btnBg.setStrokeStyle(1, 0xff2244, 0.6);
    item.add(btnBg);

    const btnTxt = this.scene.add.text(btnX, btnY, '✕', {
      fontSize: '9px', color: '#ff4455', fontFamily: 'monospace',
    }).setOrigin(0.5);
    item.add(btnTxt);

    // Cancel interaction
    btnBg.setInteractive({ useHandCursor: true });
    btnBg.on('pointerover', () => btnBg.setFillStyle(0x3a0510, 1));
    btnBg.on('pointerout', () => btnBg.setFillStyle(0x1a0508, 0.9));
    if (!this.readonly) {
      btnBg.on('pointerdown', () => {
        if (panelState.isAnimating) return;
        this.techSystem.cancelResearch(nodeId as import('../types/tech.types').TechNodeId, this.owner);
      });
    }

    return item;
  }

  // ── Prereq highlighting ──────────────────────────────────────────────────

  private highlightPrereqs(nodeId: string): void {
    this.clearPrereqHighlights();
    const node = TECH_NODES[nodeId];
    if (!node?.prereqs?.length) return;

    const tierColor = TIER_COLORS[(node.tier ?? 1) - 1] ?? TIER_COLORS[0];
    const highlightColor = tierColor;

    for (const prereqId of node.prereqs) {
      const prereqCard = this.cardContainers.get(prereqId);
      if (!prereqCard) continue;

      const g = this.scene.add.graphics();
      // Pulsing neon border — drawn as a thick neon rectangle
      g.lineStyle(2.5, highlightColor, 0.9);
      g.strokeRect(0, 0, CARD_W, CARD_H);
      // Glow: second pass wider, lower alpha
      g.lineStyle(5, highlightColor, 0.25);
      g.strokeRect(-1, -1, CARD_W + 2, CARD_H + 2);
      prereqCard.add(g);
      this.prereqHighlights.push(g);
    }
  }

  private clearPrereqHighlights(): void {
    for (const g of this.prereqHighlights) {
      g.destroy();
    }
    this.prereqHighlights = [];
  }

  // ── Tooltip ──────────────────────────────────────────────────────────────

  private buildTooltip(): void {
    this.tooltip = this.scene.add.container(0, 0);
    this.tooltip.setDepth(200);
    this.tooltip.setVisible(false);

    const TW = 280;
    this.tooltipBg = this.scene.add.rectangle(TW / 2, 0, TW, 120, 0x050a12, 0.97).setOrigin(0.5, 0);
    this.tooltipBg.setStrokeStyle(1.5, NEON.cyan, 0.7);
    this.tooltip.add(this.tooltipBg);

    this.tooltipName = this.scene.add.text(10, 8, '', {
      fontSize: '13px', color: '#eeeeff', fontFamily: 'monospace', fontStyle: 'bold',
      wordWrap: { width: 260 },
    });
    this.tooltip.add(this.tooltipName);

    this.tooltipDesc = this.scene.add.text(10, 28, '', {
      fontSize: '11px', color: '#8899aa', fontFamily: 'monospace',
      wordWrap: { width: 260 },
    });
    this.tooltip.add(this.tooltipDesc);

    this.tooltipPrereqs = this.scene.add.text(10, 0, '', {
      fontSize: '10px', color: '#556677', fontFamily: 'monospace',
      wordWrap: { width: 260 },
    });
    this.tooltip.add(this.tooltipPrereqs);

    this.tooltipStatus = this.scene.add.text(10, 0, '', {
      fontSize: '11px', color: NEON_STR.cyan, fontFamily: 'monospace', fontStyle: 'bold',
    });
    this.tooltip.add(this.tooltipStatus);

    this.container.add(this.tooltip);
  }

  private showTooltip(nodeId: string, pos: { x: number; y: number }): void {
    const node = TECH_NODES[nodeId];
    if (!node) return;

    this.tooltipName.setText(node.name);
    this.tooltipDesc.setText(node.description ?? '');

    // Dynamic prereq list
    const prereqNames = node.prereqs?.length
      ? 'Requires: ' + node.prereqs.map(p => TECH_NODES[p]?.name ?? p).join(', ')
      : '';
    this.tooltipPrereqs.setText(prereqNames);

    const state = this.getNodeState(nodeId);
    const isInProgress = this.playerTech.inProgress === nodeId;
    const statusMap: Record<NodeState, string> = {
      researched: '✓ Researched',
      queued:     '⌛ Queued',
      available:  `Click to research  G ${node.goldCost}`,
      locked:     '🔒 Locked',
    };
    const statusStr = isInProgress ? '◈ Researching...' : statusMap[state];
    this.tooltipStatus.setText(statusStr);

    const statusColors: Record<NodeState, string> = {
      researched: NEON_STR.green,
      queued:     NEON_STR.yellow,
      available:  NEON_STR.cyan,
      locked:     '#556677',
    };
    this.tooltipStatus.setColor(isInProgress ? NEON_STR.cyan : statusColors[state]);

    // Layout: desc → prereqs → status, stacked
    const descH = this.tooltipDesc.height;
    const prereqsY = 28 + descH + (descH > 0 ? 6 : 0);
    this.tooltipPrereqs.setY(prereqsY);
    const prereqsH = this.tooltipPrereqs.height;
    const statusY = prereqsY + prereqsH + (prereqsH > 0 ? 6 : 0);
    this.tooltipStatus.setY(statusY);
    const totalH = Math.max(80, statusY + this.tooltipStatus.height + 12);
    this.tooltipBg.setSize(280, totalH);

    // Position tooltip to the right of the card, clamped to screen
    const worldX = this.container.x + this.contentContainer.x + pos.x;
    const worldY = this.container.y + this.contentContainer.y + pos.y;
    const rawTx = worldX + CARD_W / 2 + 8;
    const tx = Math.min(rawTx, (this.scene.scale.width ?? 1400) - 288);
    const ty = Math.max(0, worldY - CARD_H / 2);
    this.tooltip.setPosition(tx, ty);
    this.tooltip.setVisible(true);
  }

  private hideTooltip(): void {
    this.tooltip.setVisible(false);
  }

  // ── Update (progress bars) ───────────────────────────────────────────────

  public update(now: number): void {
    const inProg = this.playerTech.inProgress;
    if (!inProg || !this.playerTech.progressStartedAt) return;

    const node = TECH_NODES[inProg];
    if (!node) return;

    const progress = Math.min(1, (now - this.playerTech.progressStartedAt) / node.researchTime);
    const progressBar = this.progressBarRects.get(inProg);
    if (progressBar) {
      progressBar.setSize(CARD_W * progress, CARD_H);
    }
  }

  // ── Refresh ──────────────────────────────────────────────────────────────

  private refreshCards(): void {
    this.progressBarRects.clear();
    this.clearPrereqHighlights();
    this.renderEdges();
    for (const [, c] of this.cardContainers) {
      c.destroy();
    }
    this.cardContainers.clear();
    for (const nodeId of Object.keys(TECH_NODES)) {
      this.renderCard(nodeId);
    }
  }

  // ── Input (panning) ──────────────────────────────────────────────────────

  private setupInput(): void {
    this.scene.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (!this.container.visible) return;
      this.isPanning = false;
      this.panStart = { px: ptr.x, py: ptr.y, ox: this.panOffsetX, oy: this.panOffsetY };
    });

    this.scene.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      if (!ptr.isDown || !this.container.visible) return;
      const dx = ptr.x - this.panStart.px;
      const dy = ptr.y - this.panStart.py;
      if (!this.isPanning && Math.hypot(dx, dy) < 6) return;
      this.isPanning = true;
      this.panOffsetX = this.panStart.ox + dx;
      this.panOffsetY = this.panStart.oy + dy;
      const overflow = VIRTUAL_W - (this.panelW - QUEUE_W);
      if (overflow <= 0) {
        this.panOffsetX = Phaser.Math.Clamp(this.panOffsetX, -40, 40);
      } else {
        this.panOffsetX = Phaser.Math.Clamp(this.panOffsetX, -(overflow + 80), 80);
      }
      const maxPanY = 80;
      const minPanY = -(this.getTotalContentH() - PANEL_BODY_H + 80);
      this.panOffsetY = Phaser.Math.Clamp(this.panOffsetY, minPanY, maxPanY);
      this.contentContainer.setPosition(CONTENT_BASE_X + this.panOffsetX, this.panOffsetY);
    });

    this.scene.input.on('pointerup', () => { this.isPanning = false; });

    this.scene.input.on('wheel', (_ptr: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (!this.container.visible) return;
      this.panOffsetY -= dy * 0.8;
      const minPanY = -(this.getTotalContentH() - PANEL_BODY_H + 80);
      this.panOffsetY = Phaser.Math.Clamp(this.panOffsetY, minPanY, 80);
      this.contentContainer.setPosition(CONTENT_BASE_X + this.panOffsetX, this.panOffsetY);
    });
  }

  private getTotalContentH(): number {
    let max = 0;
    for (const [, pos] of this.positions) {
      max = Math.max(max, pos.y + CARD_H / 2 + 16);
    }
    return max;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  public getContainer(): Phaser.GameObjects.Container {
    return this.container;
  }

  public reposition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  public resize(panelW: number): void {
    this.panelW = panelW;
  }
}
