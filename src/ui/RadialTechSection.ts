import Phaser from 'phaser';
import { eventBus } from '../systems/EventBus';
import { TechSystem } from '../systems/TechSystem';
import { TechState, TechNodeId } from '../types/tech.types';
import { TECH_NODES } from '../constants/tech.constants';
import { NEON, NEON_STR } from '../constants/ui.constants';
import { PANEL_BODY_H } from '../constants/world.constants';
import { panelState } from './SlidingPanel';
import {
  computeTechTreeLayout, polarToXY,
  TechTreeLayout, TechLayoutNode, BranchSector,
  CARD_W, CARD_H, RING_GAP, ELLIPSE_Y,
} from './techTreeLayout';

// ─── Layout constants ────────────────────────────────────────────────────────
const QUEUE_W  = 192;  // left sidebar for research queue
const CONTENT_BASE_X = QUEUE_W + 4;

const TIER_STRIPE_H = 3;
const TIER_COLORS: number[] = [0x00ffcc, 0xff8800, 0xff2244]; // T1 / T2 / T3

const STATE = {
  researched: { bg: 0x001a0f, border: NEON.green,   text: '#66ff99', stripe: NEON.green  },
  queued:     { bg: 0x1a1300, border: NEON.yellow,  text: '#ffcc44', stripe: NEON.yellow },
  available:  { bg: 0x040e1a, border: NEON.blue,    text: '#eef2ff', stripe: NEON.blue   },
  locked:     { bg: 0x060810, border: 0x1a2233,     text: '#3a4a5a', stripe: 0x1a2233    },
};
type NodeState = keyof typeof STATE;

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 1.1;
const ZOOM_STEP = 1.12;

/**
 * RadialTechSection — a true radial tree: prereq-chain depth is radius (the
 * techs researchable right now form the innermost ring), branch is angle (a
 * resource's whole line — mining, converting, its unit spawner — always
 * points the same direction, see techTreeLayout.ts). Right-drag pans,
 * the wheel zooms, left-click researches.
 */
export class RadialTechSection {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private techSystem: TechSystem;
  private playerTech: TechState;
  private owner: 'player' | 'ai';
  private readonly: boolean;

  private contentContainer!: Phaser.GameObjects.Container;
  private guideGraphics!: Phaser.GameObjects.Graphics;
  private edgesGraphics!: Phaser.GameObjects.Graphics;
  private cardContainers: Map<string, Phaser.GameObjects.Container> = new Map();

  private layout: TechTreeLayout;

  private progressBarRects: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  private prereqHighlights: Phaser.GameObjects.Graphics[] = [];

  private queuePanel!: Phaser.GameObjects.Container;
  private queueItemsContainer!: Phaser.GameObjects.Container;

  private tooltip!: Phaser.GameObjects.Container;
  private tooltipBg!: Phaser.GameObjects.Rectangle;
  private tooltipName!: Phaser.GameObjects.Text;
  private tooltipDesc!: Phaser.GameObjects.Text;
  private tooltipPrereqs!: Phaser.GameObjects.Text;
  private tooltipStatus!: Phaser.GameObjects.Text;

  private recenterBtn!: Phaser.GameObjects.Container;

  panelW: number;
  private panOffsetX = 0;
  private panOffsetY = 0;
  private zoom = 0.3;
  private defaultZoom = 0.3;
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
    this.layout = computeTechTreeLayout();

    this.defaultZoom = this.computeDefaultZoom();
    this.zoom = this.defaultZoom;

    this.contentContainer = scene.add.container(CONTENT_BASE_X, 0);
    this.contentContainer.setScale(this.zoom);
    this.container.add(this.contentContainer);

    this.guideGraphics = scene.add.graphics();
    this.contentContainer.add(this.guideGraphics);
    this.edgesGraphics = scene.add.graphics();
    this.contentContainer.add(this.edgesGraphics);

    this.buildLayout();
    this.buildQueuePanel();
    this.buildTooltip();
    this.buildRecenterButton();
    this.setupInput();
    this.centerView();
    this.applyTransform();

    eventBus.on('tech:research_complete', this.handleTechEvent);
    eventBus.on('tech:queued',            this.handleTechEvent);
    eventBus.on('tech:research_started',  this.handleTechEvent);
    eventBus.on('tech:cancelled',         this.handleTechEvent);
  }

  private readonly handleTechEvent = (): void => {
    this.refreshCards();
    this.refreshQueuePanel();
  };

  /** Fit the innermost ring plus a first step outward (the "available now"
   * techs and what they lead to) comfortably in the body viewport on first
   * open — not the whole tree, which would shrink the center to a speck. */
  private computeDefaultZoom(): number {
    const viewW = Math.max(200, this.panelW - QUEUE_W);
    const viewH = PANEL_BODY_H;
    const target = this.hubRadius() + RING_GAP * 1.2;
    const fitW = (viewW * 0.46) / target;
    const fitH = (viewH * 0.92) / (target * ELLIPSE_Y);
    return Phaser.Math.Clamp(Math.min(fitW, fitH), MIN_ZOOM, MAX_ZOOM);
  }

  // ── Build layout ─────────────────────────────────────────────────────────

  private buildLayout(): void {
    this.renderSectorGuides();
    this.renderEdges();
    for (const nodeId of Object.keys(TECH_NODES)) {
      this.renderCard(nodeId);
    }
  }

  /** Faint depth rings + branch wedges + branch labels, drawn in the same
   * ellipse-projected space as the nodes so they line up exactly. */
  private renderSectorGuides(): void {
    const g = this.guideGraphics;
    g.clear();

    // Depth rings
    const hub = this.hubRadius();
    for (let d = 0; d <= this.layout.maxDepth + 1; d++) {
      const r = hub + d * RING_GAP;
      if (r > this.layout.maxRadius + RING_GAP) break;
      g.lineStyle(1, 0x1a2a33, 0.35);
      this.strokeEllipse(g, r, 40);
    }

    // Branch wedges + labels
    for (const sector of this.layout.sectors) {
      this.fillWedge(g, sector, sector.outerRadius + 60, 0.05);
      const midAngle = (sector.startAngle + sector.endAngle) / 2;
      const { x, y } = polarToXY(sector.outerRadius + 46, midAngle);
      const label = this.scene.add.text(x, y, sector.label, {
        fontSize: '12px', color: `#${sector.accent.toString(16).padStart(6, '0')}`,
        fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5).setAlpha(0.85);
      this.contentContainer.add(label);
    }
  }

  private hubRadius(): number {
    let min = Infinity;
    for (const n of this.layout.nodes.values()) if (n.depth === 0) min = Math.min(min, n.radius);
    return Number.isFinite(min) ? min : 0;
  }

  private strokeEllipse(g: Phaser.GameObjects.Graphics, radius: number, segments: number): void {
    g.beginPath();
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const { x, y } = polarToXY(radius, a);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.strokePath();
  }

  private fillWedge(g: Phaser.GameObjects.Graphics, sector: BranchSector, radius: number, alpha: number): void {
    const segments = 14;
    g.fillStyle(sector.accent, alpha);
    g.beginPath();
    g.moveTo(0, 0);
    for (let i = 0; i <= segments; i++) {
      const a = sector.startAngle + (i / segments) * (sector.endAngle - sector.startAngle);
      const { x, y } = polarToXY(radius, a);
      g.lineTo(x, y);
    }
    g.closePath();
    g.fillPath();
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
    const pos = this.layout.nodes.get(nodeId);
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

    const bg = this.scene.add.rectangle(CARD_W / 2, CARD_H / 2, CARD_W, CARD_H, colors.bg, 1);
    c.add(bg);

    if (isInProgress) {
      const progressBar = this.scene.add.rectangle(0, 0, 0, CARD_H, 0x112244, 1).setOrigin(0, 0);
      c.add(progressBar);
      this.progressBarRects.set(nodeId, progressBar);
    }

    const stripe = this.scene.add.rectangle(CARD_W / 2, TIER_STRIPE_H / 2, CARD_W, TIER_STRIPE_H, tierColor, isInProgress ? 1 : 0.85);
    c.add(stripe);

    const border = this.scene.add.graphics();
    border.lineStyle(1.5, colors.border, state === 'locked' ? 0.25 : 0.85);
    border.strokeRect(0, 0, CARD_W, CARD_H);
    c.add(border);

    const statusIcon = state === 'researched' ? '✓' : state === 'queued' ? '⌛' : isInProgress ? '◈' : '';
    if (statusIcon) {
      const statusTxt = this.scene.add.text(CARD_W - 6, 5, statusIcon, {
        fontSize: '11px', color: colors.text, fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(1, 0);
      c.add(statusTxt);
    }

    const nameText = this.scene.add.text(7, 6, node.name, {
      fontSize: '10.5px', color: colors.text, fontFamily: 'monospace', fontStyle: 'bold',
      wordWrap: { width: CARD_W - 34 },
    });
    c.add(nameText);

    const costText = this.scene.add.text(CARD_W - 6, CARD_H - 6, `G${node.goldCost}`, {
      fontSize: '10px',
      color: state === 'locked' ? '#334455' : NEON_STR.yellow,
      fontFamily: 'monospace',
    }).setOrigin(1, 1);
    c.add(costText);

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
      border.lineStyle(1.5, colors.border, state === 'locked' ? 0.25 : 0.85);
      border.strokeRect(0, 0, CARD_W, CARD_H);
      this.clearPrereqHighlights();
      this.hideTooltip();
    });
    if (canClick && !this.readonly) {
      hit.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        if (!ptr.leftButtonDown()) return;
        if (panelState.isAnimating || this.isPanning) return;
        eventBus.emit('ui:tech_node_clicked', { nodeId });
      });
    }
    c.add(hit);
  }

  /** Radial "elbow" edges: straight out along the parent's angle to the
   * child's ring, then an arc sweep at that ring to the child's angle. Every
   * sibling sweeps at its own ring, so fanning children never overlaps. */
  private renderEdges(): void {
    const g = this.edgesGraphics;
    g.clear();

    for (const [nodeId, node] of Object.entries(TECH_NODES)) {
      if (!node.prereqs?.length) continue;
      const to = this.layout.nodes.get(nodeId);
      if (!to) continue;

      for (const prereqId of node.prereqs) {
        const from = this.layout.nodes.get(prereqId);
        if (!from) continue;

        const isResearched = this.playerTech.researched.has(prereqId);
        const crossBranch = from.branch !== to.branch;
        const alpha = isResearched ? 0.55 : 0.16;
        const color = isResearched ? NEON.green : (crossBranch ? NEON.magenta : 0x334455);

        const waypoint = polarToXY(to.radius, from.angle);
        const points: { x: number; y: number }[] = [{ x: from.x, y: from.y }, waypoint];
        const arcSegments = 10;
        for (let i = 1; i <= arcSegments; i++) {
          const t = i / arcSegments;
          const a = from.angle + (to.angle - from.angle) * t;
          points.push(polarToXY(to.radius, a));
        }

        if (crossBranch) {
          this.strokeDashed(g, points, color, alpha, 1.5, 7, 5);
        } else {
          g.lineStyle(1, color, alpha);
          g.beginPath();
          g.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
          g.strokePath();
        }
      }
    }
  }

  private strokeDashed(
    g: Phaser.GameObjects.Graphics, points: { x: number; y: number }[],
    color: number, alpha: number, width: number, dashLen: number, gapLen: number,
  ): void {
    g.lineStyle(width, color, alpha);
    let remaining = dashLen;
    let drawing = true;
    for (let i = 0; i < points.length - 1; i++) {
      let [x1, y1] = [points[i].x, points[i].y];
      const [x2, y2] = [points[i + 1].x, points[i + 1].y];
      let segLen = Phaser.Math.Distance.Between(x1, y1, x2, y2);
      while (segLen > 0) {
        const step = Math.min(remaining, segLen);
        const t = step / segLen;
        const nx = x1 + (x2 - x1) * t;
        const ny = y1 + (y2 - y1) * t;
        if (drawing) g.lineBetween(x1, y1, nx, ny);
        x1 = nx; y1 = ny;
        segLen -= step;
        remaining -= step;
        if (remaining <= 0.001) { drawing = !drawing; remaining = drawing ? dashLen : gapLen; }
      }
    }
  }

  // ── Queue sidebar ────────────────────────────────────────────────────────

  private buildQueuePanel(): void {
    this.queuePanel = this.scene.add.container(0, 0);
    this.container.add(this.queuePanel);

    const bg = this.scene.add.rectangle(QUEUE_W / 2, PANEL_BODY_H / 2, QUEUE_W, PANEL_BODY_H, 0x04080f, 1);
    this.queuePanel.add(bg);

    const divider = this.scene.add.graphics();
    divider.lineStyle(1, NEON.cyan, 0.2);
    divider.lineBetween(QUEUE_W - 1, 0, QUEUE_W - 1, PANEL_BODY_H);
    this.queuePanel.add(divider);

    const header = this.scene.add.text(QUEUE_W / 2, 10, 'RESEARCH QUEUE', {
      fontSize: '11px', color: NEON_STR.cyan, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    this.queuePanel.add(header);

    const headerLine = this.scene.add.graphics();
    headerLine.lineStyle(1, NEON.cyan, 0.3);
    headerLine.lineBetween(8, 28, QUEUE_W - 8, 28);
    this.queuePanel.add(headerLine);

    this.queueItemsContainer = this.scene.add.container(0, 32);
    this.queuePanel.add(this.queueItemsContainer);

    this.refreshQueuePanel();
  }

  private refreshQueuePanel(): void {
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

    if (inProgress) {
      const node = TECH_NODES[inProgress];
      if (node) {
        const item = this.buildQueueItem(inProgress, node.name, true, yOffset);
        this.queueItemsContainer.add(item);
        yOffset += ITEM_H + ITEM_PAD;
      }
    }

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

    if (isActive) {
      const activeDot = this.scene.add.rectangle(6, ITEM_H / 2, 3, ITEM_H - 8, NEON.cyan, 0.8).setOrigin(0, 0.5);
      item.add(activeDot);
    }

    const nameText = this.scene.add.text(14, 6, name, {
      fontSize: '10px',
      color: isActive ? '#eeeeff' : '#778899',
      fontFamily: 'monospace',
      fontStyle: isActive ? 'bold' : 'normal',
      wordWrap: { width: ITEM_W - 36 },
    });
    item.add(nameText);

    const statusLabel = this.scene.add.text(14, ITEM_H - 10, isActive ? '◈ Researching...' : '⌛ Queued', {
      fontSize: '9px',
      color: isActive ? NEON_STR.cyan : '#556677',
      fontFamily: 'monospace',
    });
    item.add(statusLabel);

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

    btnBg.setInteractive({ useHandCursor: true });
    btnBg.on('pointerover', () => btnBg.setFillStyle(0x3a0510, 1));
    btnBg.on('pointerout', () => btnBg.setFillStyle(0x1a0508, 0.9));
    if (!this.readonly) {
      btnBg.on('pointerdown', () => {
        if (panelState.isAnimating) return;
        this.techSystem.cancelResearch(nodeId as TechNodeId, this.owner);
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

    for (const prereqId of node.prereqs) {
      const prereqCard = this.cardContainers.get(prereqId);
      if (!prereqCard) continue;

      const g = this.scene.add.graphics();
      g.lineStyle(2.5, tierColor, 0.9);
      g.strokeRect(0, 0, CARD_W, CARD_H);
      g.lineStyle(5, tierColor, 0.25);
      g.strokeRect(-1, -1, CARD_W + 2, CARD_H + 2);
      prereqCard.add(g);
      this.prereqHighlights.push(g);
    }
  }

  private clearPrereqHighlights(): void {
    for (const g of this.prereqHighlights) g.destroy();
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

  private showTooltip(nodeId: string, pos: TechLayoutNode): void {
    const node = TECH_NODES[nodeId];
    if (!node) return;

    this.tooltipName.setText(node.name);
    this.tooltipDesc.setText(node.description ?? '');

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

    const descH = this.tooltipDesc.height;
    const prereqsY = 28 + descH + (descH > 0 ? 6 : 0);
    this.tooltipPrereqs.setY(prereqsY);
    const prereqsH = this.tooltipPrereqs.height;
    const statusY = prereqsY + prereqsH + (prereqsH > 0 ? 6 : 0);
    this.tooltipStatus.setY(statusY);
    const totalH = Math.max(80, statusY + this.tooltipStatus.height + 12);
    this.tooltipBg.setSize(280, totalH);

    // pos is in unscaled content space; project through the same transform
    // the content container itself uses to find its actual screen position.
    const worldX = this.container.x + this.contentContainer.x + pos.x * this.zoom;
    const worldY = this.container.y + this.contentContainer.y + pos.y * this.zoom;
    const rawTx = worldX + (CARD_W / 2) * this.zoom + 8;
    const tx = Math.min(rawTx, (this.scene.scale.width ?? 1400) - 288);
    const ty = Math.max(0, worldY - (CARD_H / 2) * this.zoom);
    this.tooltip.setPosition(tx, ty);
    this.tooltip.setVisible(true);
  }

  private hideTooltip(): void {
    this.tooltip.setVisible(false);
  }

  // ── Recenter button ─────────────────────────────────────────────────────

  private buildRecenterButton(): void {
    const w = 84, h = 22;
    const x = this.panelW - w - 10;
    const y = 8;
    this.recenterBtn = this.scene.add.container(x, y);
    this.container.add(this.recenterBtn);

    const bg = this.scene.add.rectangle(w / 2, h / 2, w, h, 0x081018, 0.9);
    bg.setStrokeStyle(1, NEON.cyan, 0.6);
    this.recenterBtn.add(bg);
    const txt = this.scene.add.text(w / 2, h / 2, '⌖ RECENTER', {
      fontSize: '10px', color: NEON_STR.cyan, fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.recenterBtn.add(txt);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(0x0f2030, 0.95));
    bg.on('pointerout', () => bg.setFillStyle(0x081018, 0.9));
    bg.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (!ptr.leftButtonDown()) return;
      this.resetView();
    });
  }

  private resetView(): void {
    this.zoom = this.defaultZoom;
    this.centerView();
    this.applyTransform();
  }

  /** Places the tree's convergence point (radius 0 — no node sits exactly
   * here, but every branch wedge meets there) in the middle of the visible
   * viewport, to the right of the queue sidebar. */
  private centerView(): void {
    const viewW = Math.max(200, this.panelW - QUEUE_W);
    this.panOffsetX = viewW / 2 - 4;
    this.panOffsetY = PANEL_BODY_H / 2;
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
    for (const [, c] of this.cardContainers) c.destroy();
    this.cardContainers.clear();
    for (const nodeId of Object.keys(TECH_NODES)) {
      this.renderCard(nodeId);
    }
  }

  // ── Input (right-drag pan, wheel zoom) ──────────────────────────────────

  private setupInput(): void {
    this.scene.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (!this.container.visible) return;
      if (!ptr.rightButtonDown()) return;
      this.isPanning = true;
      this.panStart = { px: ptr.x, py: ptr.y, ox: this.panOffsetX, oy: this.panOffsetY };
    });

    this.scene.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      if (!this.isPanning || !this.container.visible) return;
      if (!ptr.rightButtonDown()) { this.isPanning = false; return; }
      this.panOffsetX = this.panStart.ox + (ptr.x - this.panStart.px);
      this.panOffsetY = this.panStart.oy + (ptr.y - this.panStart.py);
      this.clampPan();
      this.applyTransform();
    });

    this.scene.input.on('pointerup', () => { this.isPanning = false; });

    this.scene.input.on('wheel', (ptr: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (!this.container.visible) return;
      const factor = dy > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
      this.zoomAt(ptr.x, ptr.y, factor);
    });
  }

  /** Change zoom by `factor`, keeping the content point under the cursor fixed on screen. */
  private zoomAt(screenX: number, screenY: number, factor: number): void {
    const oldZoom = this.zoom;
    const newZoom = Phaser.Math.Clamp(oldZoom * factor, MIN_ZOOM, MAX_ZOOM);
    if (newZoom === oldZoom) return;

    const curX = CONTENT_BASE_X + this.panOffsetX;
    const curY = this.panOffsetY;
    const lx = (screenX - curX) / oldZoom;
    const ly = (screenY - curY) / oldZoom;

    this.zoom = newZoom;
    this.panOffsetX = screenX - lx * newZoom - CONTENT_BASE_X;
    this.panOffsetY = screenY - ly * newZoom;
    this.clampPan();
    this.applyTransform();
  }

  /** Loose clamp: keeps the content's bounding box always overlapping the
   * viewport (with a generous margin), so a stray drag/zoom can't strand
   * the tree somewhere the user can't pan back from. */
  private clampPan(): void {
    const viewW = Math.max(200, this.panelW - QUEUE_W);
    const contentW = this.layout.maxRadius * this.zoom;
    const contentH = this.layout.maxRadius * ELLIPSE_Y * this.zoom;
    const marginX = viewW * 0.5;
    const marginY = PANEL_BODY_H * 0.5;
    this.panOffsetX = Phaser.Math.Clamp(
      this.panOffsetX,
      -marginX - contentW - CONTENT_BASE_X,
      viewW + marginX + contentW - CONTENT_BASE_X,
    );
    this.panOffsetY = Phaser.Math.Clamp(
      this.panOffsetY,
      -marginY - contentH,
      PANEL_BODY_H + marginY + contentH,
    );
  }

  private applyTransform(): void {
    this.contentContainer.setScale(this.zoom);
    this.contentContainer.setPosition(CONTENT_BASE_X + this.panOffsetX, this.panOffsetY);
  }

  // ── Public API ───────────────────────────────────────────────────────────

  public getContainer(): Phaser.GameObjects.Container {
    return this.container;
  }

  public destroy(): void {
    eventBus.off('tech:research_complete', this.handleTechEvent);
    eventBus.off('tech:queued',            this.handleTechEvent);
    eventBus.off('tech:research_started',  this.handleTechEvent);
    eventBus.off('tech:cancelled',         this.handleTechEvent);
  }

  public reposition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  public resize(panelW: number): void {
    this.panelW = panelW;
    if (this.recenterBtn) this.recenterBtn.setPosition(this.panelW - 84 - 10, 8);
  }
}
