import Phaser from 'phaser';
import { eventBus } from '../systems/EventBus';
import { TechSystem } from '../systems/TechSystem';
import { TechState, TechNodeId } from '../types/tech.types';
import { TECH_NODES } from '../constants/tech.constants';
import { NEON, NEON_STR } from '../constants/ui.constants';
import { PANEL_BODY_H } from '../constants/world.constants';
import { panelState } from './SlidingPanel';
import {
  ROOT_NODE_ID, NODE_R, LayoutPoint, edgeKey,
  getNodeVisualState, getUnmetPrereqs, getNodeIcon, NodeVisualState,
  BRANCH_ACCENT, branchOf,
} from './techTreeLayout';
import { TECH_TREE_LAYOUT } from '../data/techTreeLayoutData';
import {
  drawGear, drawRing, drawPolyline, pointAlongPolyline,
  darkenColor, colorToHex, hashString, EMOJI_FONT_STACK,
} from './techTreeRender';

// ─── Layout constants ────────────────────────────────────────────────────────
const QUEUE_W  = 192;  // left sidebar for research queue
const CONTENT_BASE_X = QUEUE_W + 4;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.8;
const ZOOM_STEP = 1.12;

const TIER_TEETH = [8, 10, 12]; // T1 / T2 / T3, purely cosmetic

const SPIN_RESEARCHED = 0.12;   // rad/sec — slow, content
const SPIN_RESEARCHING = 1.4;   // rad/sec — busy

/** A single node's live GameObjects, kept around so update() can animate
 * (spin/pulse/progress) each frame without rebuilding. Position is set once
 * from the static layout and never changes. */
interface NodeVisual {
  container: Phaser.GameObjects.Container;
  rotor: Phaser.GameObjects.Graphics;   // spins; also the blank circle when distant
  ring: Phaser.GameObjects.Graphics;    // state ring, does not spin
  glow: Phaser.GameObjects.Graphics;    // pulses while researching
  progress: Phaser.GameObjects.Graphics;
  icon: Phaser.GameObjects.Text;
  iconNumeral: Phaser.GameObjects.Text; // small "II"/"III" badge for repeated-upgrade families
  label: Phaser.GameObjects.Text;       // always-visible name + cost, doesn't spin
  state: NodeVisualState;
  radius: number;
}

/**
 * RadialTechSection — a static, hand-designed tech tree. Every node's
 * position and every connection's curve come from TECH_TREE_LAYOUT (see
 * src/data/techTreeLayoutData.ts), authored with the Tech Layout Editor —
 * there is no physics or auto-layout here at all. A node too far from
 * anything touched by research renders as a blank, uninteractive circle
 * rather than a full gear — see getNodeVisualState's 'distant' state.
 * Right-drag pans, the wheel zooms, left-click researches an available gear.
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
  private rootHub!: Phaser.GameObjects.Graphics;
  private nodeVisuals: Map<string, NodeVisual> = new Map();
  private positions: Map<string, LayoutPoint> = new Map();

  private prereqHighlights: Phaser.GameObjects.Graphics[] = [];

  private queuePanel!: Phaser.GameObjects.Container;
  private queueItemsContainer!: Phaser.GameObjects.Container;

  private tooltip!: Phaser.GameObjects.Container;
  private tooltipBg!: Phaser.GameObjects.Rectangle;
  private tooltipName!: Phaser.GameObjects.Text;
  private tooltipDesc!: Phaser.GameObjects.Text;
  private tooltipPrereqs!: Phaser.GameObjects.Text;
  private tooltipStatus!: Phaser.GameObjects.Text;
  private hoveredNodeId: string | null = null;

  private recenterBtn!: Phaser.GameObjects.Container;

  panelW: number;
  private zoom = 1;
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

    this.contentContainer = scene.add.container(CONTENT_BASE_X, 0);
    this.contentContainer.setScale(this.zoom);
    this.container.add(this.contentContainer);

    this.edgesGraphics = scene.add.graphics();
    this.contentContainer.add(this.edgesGraphics);

    this.rootHub = scene.add.graphics();
    this.contentContainer.add(this.rootHub);

    this.loadPositions();
    for (const id of Object.keys(TECH_NODES)) this.createNodeVisual(id);
    this.renderEdges();

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
    for (const id of this.nodeVisuals.keys()) this.restyleNodeVisual(id);
    this.refreshQueuePanel();
  };

  /** Reads every node's fixed position out of TECH_TREE_LAYOUT. A tech that
   * exists in the game but not yet in the saved layout (e.g. newly added
   * content the editor hasn't placed) falls back to the origin rather than
   * crashing — visibly wrong, easy to spot, never a hard failure. */
  private loadPositions(): void {
    this.positions.set(ROOT_NODE_ID, TECH_TREE_LAYOUT.nodes[ROOT_NODE_ID] ?? { x: 0, y: 0 });
    for (const id of Object.keys(TECH_NODES)) {
      this.positions.set(id, TECH_TREE_LAYOUT.nodes[id] ?? { x: 0, y: 0 });
    }
  }

  // ── Node visuals ─────────────────────────────────────────────────────────

  private createNodeVisual(nodeId: string): void {
    const node = TECH_NODES[nodeId];
    const pos = this.positions.get(nodeId);
    if (!node || !pos) return;

    const radius = NODE_R;
    const c = this.scene.add.container(pos.x, pos.y);
    this.contentContainer.add(c);

    const glow = this.scene.add.graphics();
    c.add(glow);

    const rotor = this.scene.add.graphics();
    c.add(rotor);

    const ring = this.scene.add.graphics();
    c.add(ring);

    const progress = this.scene.add.graphics();
    c.add(progress);

    const iconInfo = getNodeIcon(nodeId);
    const icon = this.scene.add.text(0, 0, iconInfo.glyph, {
      fontSize: `${Math.round(radius * 1.4)}px`, color: '#eef2ff', fontFamily: EMOJI_FONT_STACK,
    }).setOrigin(0.5);
    c.add(icon);

    // Small Roman-numeral badge for a repeated-upgrade family ("Gold Mining
    // III") sharing one icon across its tiers — bottom-right of the gear.
    const iconNumeral = this.scene.add.text(radius * 0.55, radius * 0.5, iconInfo.numeral ?? '', {
      fontSize: '10px', color: '#eef2ff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    iconNumeral.setShadow(0, 1, '#000000', 2, true, true);
    c.add(iconNumeral);

    // Always-visible name + cost, hovering below the gear — never rotates
    // with the rotor, and its size/position never feeds back into layout,
    // so it can never nudge node spacing even though it visually overflows
    // the gear's own radius.
    const label = this.scene.add.text(0, radius + 8, `${node.name}\n${node.goldCost}g`, {
      fontSize: '10px', color: colorToHex(BRANCH_ACCENT[branchOf(nodeId)] ?? NEON.cyan),
      fontFamily: 'monospace', fontStyle: 'bold', align: 'center',
      wordWrap: { width: radius * 3.4 },
    }).setOrigin(0.5, 0);
    label.setShadow(0, 1, '#000000', 2, true, true);
    c.add(label);

    const state = getNodeVisualState(nodeId, this.playerTech);
    this.nodeVisuals.set(nodeId, { container: c, rotor, ring, glow, progress, icon, iconNumeral, label, state, radius });
    this.paintNode(nodeId);
  }

  private restyleNodeVisual(nodeId: string): void {
    const visual = this.nodeVisuals.get(nodeId);
    const newState = getNodeVisualState(nodeId, this.playerTech);
    if (!visual || visual.state === newState) return;
    visual.state = newState;
    this.paintNode(nodeId);
  }

  private paintNode(nodeId: string): void {
    const visual = this.nodeVisuals.get(nodeId);
    const node = TECH_NODES[nodeId];
    if (!visual || !node) return;

    const accent = BRANCH_ACCENT[branchOf(nodeId)] ?? NEON.cyan;
    const r = visual.radius;
    const state = visual.state;

    if (state === 'distant') {
      // Blank, undecorated circle — no icon, no name, no tooltip, not
      // interactive (see hitTestNode). Keeps the whole tree's shape legible
      // without drowning it in detail for techs nothing points at yet.
      visual.ring.clear();
      visual.glow.clear();
      visual.progress.clear();
      visual.icon.setVisible(false);
      visual.iconNumeral.setVisible(false);
      visual.label.setVisible(false);
      visual.rotor.clear();
      const dr = r * 0.55;
      visual.rotor.fillStyle(darkenColor(accent, 0.3), 0.6);
      visual.rotor.fillCircle(0, 0, dr);
      visual.rotor.lineStyle(1, accent, 0.4);
      visual.rotor.strokeCircle(0, 0, dr);
      return;
    }

    visual.icon.setVisible(true);
    visual.iconNumeral.setVisible(!!visual.iconNumeral.text);
    visual.label.setVisible(true);

    const teeth = TIER_TEETH[(node.tier ?? 1) - 1] ?? TIER_TEETH[0];
    const researched = state === 'researched';
    const researching = state === 'researching';
    const darkened = !researched;

    const fillColor = darkened ? darkenColor(accent, researching ? 0.55 : (state === 'available' ? 0.42 : 0.22)) : accent;

    drawGear(visual.rotor, r, teeth, fillColor, 0.95);

    let ringColor = 0x2a3a4a;
    let ringAlpha = 0.4;
    let ringWidth = 2;
    let dashed = false;
    switch (state) {
      case 'researched':  ringColor = accent;       ringAlpha = 0.95; ringWidth = 2.5; break;
      case 'researching': ringColor = 0xffffff;     ringAlpha = 0.9;  ringWidth = 2.5; break;
      case 'queued':       ringColor = NEON.yellow;  ringAlpha = 0.85; ringWidth = 2;   dashed = true; break;
      case 'available':    ringColor = accent;       ringAlpha = 0.85; ringWidth = 2.5; break;
      case 'next':         ringColor = 0x2a3a4a;     ringAlpha = 0.5;  ringWidth = 1.5; break;
    }
    drawRing(visual.ring, r + 3, ringColor, ringAlpha, ringWidth, dashed);

    if (!researching) visual.glow.clear();
    if (state !== 'researching') visual.progress.clear();
  }

  // ── Edges (circuit-style connections, static curve from the layout) ─────

  private renderEdges(): void {
    const g = this.edgesGraphics;
    g.clear();

    const drawEdge = (fromId: string, toId: string, color: number, alpha: number, animate: boolean): void => {
      const from = this.positions.get(fromId);
      const to = this.positions.get(toId);
      if (!from || !to) return;

      const beads = TECH_TREE_LAYOUT.edges[edgeKey(fromId, toId)] ?? [];
      const points: LayoutPoint[] = [from, ...beads, to];

      // Glow pass + bright core pass through the curve, plus small "via"
      // studs at each bead for the circuit-board feel.
      g.lineStyle(8, color, alpha * 0.25);
      drawPolyline(g, points);
      g.lineStyle(3, color, alpha);
      drawPolyline(g, points);
      for (const bead of beads) {
        g.fillStyle(color, alpha);
        g.fillCircle(bead.x, bead.y, 2.4);
      }

      if (animate) {
        const t = ((this.scene.time.now / 2600) + hashString(toId)) % 1;
        const pip = pointAlongPolyline(points, t);
        g.fillStyle(0xffffff, 1);
        g.fillCircle(pip.x, pip.y, 3.2);
      }
    };

    // Every connection is always drawn — including root spokes and edges
    // into a 'distant' blank node — but only carries "electricity" (the
    // traveling pip) once its target is researched or being researched, and
    // stays darkened until its target is actually researched. Depth-0 nodes
    // have no real prereq, so they spoke from the (invisible) root instead.
    for (const [nodeId, node] of Object.entries(TECH_NODES)) {
      const childResearched = this.playerTech.researched.has(nodeId);
      const childResearching = this.playerTech.inProgress === nodeId;
      const accent = BRANCH_ACCENT[branchOf(nodeId)] ?? NEON.cyan;
      const color = childResearched ? accent : 0x445566;
      const alpha = childResearched ? 1 : (childResearching ? 0.6 : 0.35);
      const animate = childResearched || childResearching;

      const prereqs = node.prereqs?.length ? node.prereqs : [ROOT_NODE_ID];
      for (const prereqId of prereqs) {
        drawEdge(prereqId, nodeId, color, alpha, animate);
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

    for (const prereqId of node.prereqs) {
      const visual = this.nodeVisuals.get(prereqId);
      if (!visual) continue;
      const accent = BRANCH_ACCENT[branchOf(prereqId)] ?? NEON.cyan;

      const g = this.scene.add.graphics();
      g.lineStyle(2.5, accent, 0.9);
      g.strokeCircle(0, 0, visual.radius + 8);
      g.lineStyle(5, accent, 0.25);
      g.strokeCircle(0, 0, visual.radius + 11);
      visual.container.add(g);
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

  private showTooltip(nodeId: string): void {
    const node = TECH_NODES[nodeId];
    const pos = this.positions.get(nodeId);
    const visual = this.nodeVisuals.get(nodeId);
    if (!node || !pos || !visual) return;

    this.tooltipName.setText(node.name);
    this.tooltipDesc.setText(node.description ?? '');

    const unmet = new Set(getUnmetPrereqs(nodeId, this.playerTech));
    const prereqNames = node.prereqs?.length
      ? 'Requires: ' + node.prereqs.map(p => `${unmet.has(p) ? '✗' : '✓'} ${TECH_NODES[p]?.name ?? p}`).join(', ')
      : '';
    this.tooltipPrereqs.setText(prereqNames);

    const state = visual.state;
    const statusMap: Record<NodeVisualState, string> = {
      researched:  '✓ Researched',
      researching: '◈ Researching...',
      queued:      '⌛ Queued',
      available:   `Click to research  G ${node.goldCost}`,
      next:        '🔒 Missing prerequisite',
      distant:     '',
    };
    this.tooltipStatus.setText(statusMap[state]);

    const statusColors: Record<NodeVisualState, string> = {
      researched:  NEON_STR.green,
      researching: NEON_STR.cyan,
      queued:      NEON_STR.yellow,
      available:   NEON_STR.cyan,
      next:        '#556677',
      distant:     '#556677',
    };
    this.tooltipStatus.setColor(statusColors[state]);

    const descH = this.tooltipDesc.height;
    const prereqsY = 28 + descH + (descH > 0 ? 6 : 0);
    this.tooltipPrereqs.setY(prereqsY);
    const prereqsH = this.tooltipPrereqs.height;
    const statusY = prereqsY + prereqsH + (prereqsH > 0 ? 6 : 0);
    this.tooltipStatus.setY(statusY);
    const totalH = Math.max(80, statusY + this.tooltipStatus.height + 12);
    this.tooltipBg.setSize(280, totalH);

    const worldX = this.container.x + this.contentContainer.x + pos.x * this.zoom;
    const worldY = this.container.y + this.contentContainer.y + pos.y * this.zoom;
    const rawTx = worldX + visual.radius * this.zoom + 12;
    const tx = Math.min(rawTx, (this.scene.scale.width ?? 1400) - 288);
    const ty = Math.max(0, worldY - visual.radius * this.zoom);
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
      this.centerView();
      this.applyTransform();
    });
  }

  /** Places the layout's origin (where the root hub sits) in the middle of
   * the visible viewport, to the right of the queue sidebar. */
  private centerView(): void {
    const viewW = Math.max(200, this.panelW - QUEUE_W);
    this.panOffsetX = viewW / 2 - 4;
    this.panOffsetY = PANEL_BODY_H / 2;
  }

  // ── Update (spin/pulse/progress animation + edge redraw for the pip) ────

  public update(now: number): void {
    const dtSec = this._lastUpdateAt === null ? 0 : Math.min(0.05, (now - this._lastUpdateAt) / 1000);
    this._lastUpdateAt = now;

    for (const [id, visual] of this.nodeVisuals) {
      const spin = visual.state === 'researched' ? SPIN_RESEARCHED
        : visual.state === 'researching' ? SPIN_RESEARCHING : 0;
      if (spin !== 0) visual.rotor.rotation += spin * dtSec;

      if (visual.state === 'researching') {
        const pulse = 0.22 + 0.18 * Math.sin(now / 260);
        visual.glow.clear();
        visual.glow.fillStyle(0xffffff, pulse);
        visual.glow.fillCircle(0, 0, visual.radius * 1.35);

        const inProg = this.playerTech.inProgress;
        const node = inProg ? TECH_NODES[inProg] : undefined;
        if (inProg === id && node && this.playerTech.progressStartedAt) {
          const progress = Math.min(1, (now - this.playerTech.progressStartedAt) / node.researchTime);
          visual.progress.clear();
          visual.progress.lineStyle(3, NEON.cyan, 0.95);
          visual.progress.beginPath();
          visual.progress.arc(0, 0, visual.radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress, false);
          visual.progress.strokePath();
        }
      }
    }

    this.renderEdges();
    this.drawRootHub(now);
    if (this.hoveredNodeId) this.showTooltip(this.hoveredNodeId);
  }

  private _lastUpdateAt: number | null = null;

  /** The root is a real, visible hub — a small pulsing core at the origin
   * that every "researchable now" gear spokes out from — even though it
   * isn't a tech and can never be researched itself. */
  private drawRootHub(now: number): void {
    const g = this.rootHub;
    g.clear();
    const pulse = 0.55 + 0.25 * Math.sin(now / 700);
    const r = 9;
    const hub = this.positions.get(ROOT_NODE_ID) ?? { x: 0, y: 0 };
    g.setPosition(hub.x, hub.y);
    g.fillStyle(0xffffff, pulse * 0.25);
    g.fillCircle(0, 0, r * 2.4);
    g.fillStyle(NEON.cyan, 0.9);
    g.fillCircle(0, 0, r);
    g.lineStyle(1.5, 0xffffff, 0.9);
    g.strokeCircle(0, 0, r);
  }

  // ── Hit-testing (unified — no per-node interactive zones) ───────────────

  /** Converts a screen-space (pointer) coordinate into `this.container`'s own
   * local space via its actual world transform, rather than assuming
   * `this.container.x/y` reflect its screen position — they don't: the
   * SlidingPanel this container lives in slides its whole tab body up from
   * the bottom of the canvas via ancestor containers this section never
   * touches directly, so any hand-rolled offset math here would silently
   * break the moment that ancestor moves. */
  private toLocal(screenX: number, screenY: number): { x: number; y: number } {
    const m = this.container.getWorldTransformMatrix();
    const out = new Phaser.Math.Vector2();
    m.applyInverse(screenX, screenY, out);
    return { x: out.x, y: out.y };
  }

  /** Local-space (this.container's frame) rectangles that cover the tree
   * canvas but belong to other UI (the queue sidebar, recenter button) — a
   * click or hover landing here is never a node, however far a panned
   * node's own geometry might otherwise extend underneath it. */
  private isInExcludedUiArea(screenX: number, screenY: number): boolean {
    const { x: localX, y: localY } = this.toLocal(screenX, screenY);
    if (localX < CONTENT_BASE_X) return true; // queue sidebar
    if (localY < 0 || localY > PANEL_BODY_H) return true; // outside the panel body

    const rbX = this.panelW - 84 - 10, rbY = 8;
    if (localX >= rbX && localX <= rbX + 84 && localY >= rbY && localY <= rbY + 22) return true; // recenter

    return false;
  }

  /** Finds the node under a screen point, if any — gear circles are tested
   * first and always win; a node's label (which can overhang a neighbor's
   * gear, since it deliberately doesn't affect layout) is only eligible when
   * no gear was hit directly, so a passing label never steals a click or
   * hover from the gear actually underneath it. Distant (blank) nodes are
   * never interactive. */
  private hitTestNode(screenX: number, screenY: number): string | null {
    if (this.isInExcludedUiArea(screenX, screenY)) return null;

    const containerLocal = this.toLocal(screenX, screenY);
    const localX = (containerLocal.x - this.contentContainer.x) / this.zoom;
    const localY = (containerLocal.y - this.contentContainer.y) / this.zoom;

    let best: string | null = null;
    let bestDist = Infinity;
    for (const [id, visual] of this.nodeVisuals) {
      if (visual.state === 'distant') continue;
      const pos = this.positions.get(id);
      if (!pos) continue;
      const d = Math.hypot(localX - pos.x, localY - pos.y);
      if (d <= visual.radius * 1.15 && d < bestDist) { best = id; bestDist = d; }
    }
    if (best) return best;

    for (const [id, visual] of this.nodeVisuals) {
      if (visual.state === 'distant') continue;
      const pos = this.positions.get(id);
      if (!pos) continue;
      const halfW = visual.label.width / 2;
      const top = pos.y + visual.radius + 6;
      const bottom = top + visual.label.height;
      if (localX >= pos.x - halfW && localX <= pos.x + halfW && localY >= top && localY <= bottom) {
        const d = Math.hypot(localX - pos.x, localY - pos.y);
        if (d < bestDist) { best = id; bestDist = d; }
      }
    }
    return best;
  }

  private setHovered(nodeId: string | null): void {
    if (nodeId === this.hoveredNodeId) return;
    this.hoveredNodeId = nodeId;
    this.clearPrereqHighlights();
    if (nodeId) { this.highlightPrereqs(nodeId); this.showTooltip(nodeId); }
    else this.hideTooltip();
  }

  // ── Input (right-drag pan, wheel zoom, left-click research) ─────────────

  private setupInput(): void {
    this.scene.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (!this.container.visible) return;
      if (ptr.rightButtonDown()) {
        this.isPanning = true;
        this.panStart = { px: ptr.x, py: ptr.y, ox: this.panOffsetX, oy: this.panOffsetY };
        return;
      }
      if (!ptr.leftButtonDown()) return;
      if (panelState.isAnimating || this.readonly) return;
      const hit = this.hitTestNode(ptr.x, ptr.y);
      if (!hit) return;
      const visual = this.nodeVisuals.get(hit);
      if (visual?.state !== 'available') return;
      eventBus.emit('ui:tech_node_clicked', { nodeId: hit });
    });

    this.scene.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      if (!this.container.visible) return;
      if (this.isPanning) {
        if (!ptr.rightButtonDown()) { this.isPanning = false; return; }
        this.panOffsetX = this.panStart.ox + (ptr.x - this.panStart.px);
        this.panOffsetY = this.panStart.oy + (ptr.y - this.panStart.py);
        this.clampPan();
        this.applyTransform();
        return;
      }
      this.setHovered(this.hitTestNode(ptr.x, ptr.y));
    });

    this.scene.input.on('pointerup', () => { this.isPanning = false; });

    this.scene.input.on('wheel', (ptr: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (!this.container.visible) return;
      if (this.isInExcludedUiArea(ptr.x, ptr.y)) return;
      const factor = dy > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
      this.zoomAt(ptr.x, ptr.y, factor);
    });
  }

  /** Change zoom by `factor`, keeping the content point under the cursor
   * fixed on screen. */
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
   * viewport (with a generous margin), so a stray drag can't strand the
   * tree somewhere the user can't pan back from. */
  private clampPan(): void {
    const viewW = Math.max(200, this.panelW - QUEUE_W);
    let maxR = 0;
    for (const p of this.positions.values()) maxR = Math.max(maxR, Math.hypot(p.x, p.y));
    const scaledR = maxR * this.zoom;
    const marginX = viewW * 0.5;
    const marginY = PANEL_BODY_H * 0.5;
    this.panOffsetX = Phaser.Math.Clamp(
      this.panOffsetX,
      -marginX - scaledR - CONTENT_BASE_X,
      viewW + marginX + scaledR - CONTENT_BASE_X,
    );
    this.panOffsetY = Phaser.Math.Clamp(
      this.panOffsetY,
      -marginY - scaledR,
      PANEL_BODY_H + marginY + scaledR,
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
