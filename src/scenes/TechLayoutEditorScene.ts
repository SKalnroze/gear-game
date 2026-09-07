import Phaser from 'phaser';
import { neonBtn } from '../ui/NeonRex';
import { NEON, NEON_STR, BG } from '../constants/ui.constants';
import { TECH_NODES } from '../constants/tech.constants';
import {
  ROOT_NODE_ID, NODE_R, LayoutPoint, TechTreeLayoutData, edgeKey, allEdgePairs,
  getNodeIcon, branchOf, BRANCH_ACCENT, generateDefaultLayout, generateStraightBeads,
} from '../ui/techTreeLayout';
import { TECH_TREE_LAYOUT } from '../data/techTreeLayoutData';
import {
  drawGear, drawRing, drawPolyline, darkenColor, colorToHex, EMOJI_FONT_STACK,
} from '../ui/techTreeRender';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 1.12;
const BEAD_HANDLE_R = 6;
const CLICK_MOVE_THRESHOLD = 4; // px — below this, a node drag is treated as a click instead

interface NodeHandle {
  container: Phaser.GameObjects.Container;
  rotor: Phaser.GameObjects.Graphics;
  ring: Phaser.GameObjects.Graphics;
  dragStart: { x: number; y: number };
  dragged: boolean;
}

interface BeadHandle {
  edgeKey: string;
  index: number;
  gfx: Phaser.GameObjects.Rectangle;
}

/**
 * TechLayoutEditorScene — the design-time tool for hand-placing the tech
 * tree. Every node is draggable; every connection's interior beads are
 * draggable handles you can pull into a curve; clicking a node (without
 * dragging it) toggles a local "researched" preview so you can see how the
 * bright/dark states will actually look. Import/Export move the layout to
 * and from a JSON file — there's no other persistence here. This tool never
 * touches real game state; the running game only ever reads the checked-in
 * src/data/techTreeLayoutData.ts, which an Export from here is meant to
 * replace by hand.
 */
export class TechLayoutEditorScene extends Phaser.Scene {
  private world!: Phaser.GameObjects.Container;
  private edgesGfx!: Phaser.GameObjects.Graphics;
  private layout: TechTreeLayoutData = structuredCloneLayout(TECH_TREE_LAYOUT);
  private researchedPreview = new Set<string>();

  private nodeHandles = new Map<string, NodeHandle>();
  private beadHandlesByEdge = new Map<string, BeadHandle[]>();
  /** Every edge touching a given node id — precomputed once so a node drag
   * can cheaply find "everything that needs to regenerate" without scanning
   * all prereqs every frame. */
  private edgesByNode = new Map<string, { fromId: string; toId: string }[]>();

  private zoom = 1;
  private panOffsetX = 0;
  private panOffsetY = 0;
  private isPanning = false;
  private panStart = { px: 0, py: 0, ox: 0, oy: 0 };

  private hintText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'TechLayoutEditorScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    const bg = this.add.graphics();
    bg.fillStyle(BG.deep, 1);
    bg.fillRect(0, 0, width, height);

    this.world = this.add.container(width / 2, height / 2);
    this.edgesGfx = this.add.graphics();
    this.world.add(this.edgesGfx);

    this.indexEdgesByNode();
    this.buildRootHub();
    this.buildAllNodes();
    this.buildAllBeads();
    this.renderEdges();

    this.buildTopBar();
    this.setupCameraInput();

    this.hintText = this.add.text(width / 2, height - 10,
      'Drag a gear to move it (its connections re-route on drop) · drag a small square to reshape a connection · click a gear to preview researched · right-drag to pan · wheel to zoom',
      { fontSize: '11px', color: '#556677', fontFamily: 'monospace' },
    ).setOrigin(0.5, 1);

    this.input.dragDistanceThreshold = CLICK_MOVE_THRESHOLD;
    this.input.on('drag', (_ptr: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject, dragX: number, dragY: number) => {
      const data = obj.getData('kind');
      if (data === 'node') {
        (obj as Phaser.GameObjects.Container).setPosition(dragX, dragY);
        const id = obj.getData('id') as string;
        const handle = this.nodeHandles.get(id);
        if (handle) handle.dragged = true;
        this.layout.nodes[id] = { x: dragX, y: dragY };
        this.renderEdges();
      } else if (data === 'bead') {
        (obj as Phaser.GameObjects.Rectangle).setPosition(dragX, dragY);
        const key = obj.getData('edgeKey') as string;
        const index = obj.getData('index') as number;
        const beads = this.layout.edges[key];
        if (beads?.[index]) { beads[index].x = dragX; beads[index].y = dragY; }
        this.renderEdges();
      }
    });
    this.input.on('dragend', (_ptr: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      const data = obj.getData('kind');
      if (data === 'node') this.regenerateEdgesTouching(obj.getData('id') as string);
      else if (data === 'root') this.regenerateEdgesTouching(ROOT_NODE_ID);
    });
  }

  /** Every prereq edge (and root spoke) that touches a given node — built
   * once, since the tech tree's own structure never changes while the
   * editor is open (only positions do). */
  private indexEdgesByNode(): void {
    this.edgesByNode.clear();
    for (const pair of allEdgePairs()) {
      for (const id of [pair.fromId, pair.toId]) {
        if (!this.edgesByNode.has(id)) this.edgesByNode.set(id, []);
        this.edgesByNode.get(id)!.push(pair);
      }
    }
  }

  /** Re-routes every connection touching `nodeId` as a fresh straight line
   * between its (now current) endpoints — this is what keeps a connection
   * from staying stretched across the old position after its node moves.
   * Any earlier hand-shaped curve on that edge is intentionally discarded:
   * reshaping is a finishing touch you'd redo after placement settles, not
   * something worth preserving across a move. */
  private regenerateEdgesTouching(nodeId: string): void {
    const pairs = this.edgesByNode.get(nodeId);
    if (!pairs) return;
    for (const { fromId, toId } of pairs) {
      const from = this.layout.nodes[fromId], to = this.layout.nodes[toId];
      if (!from || !to) continue;
      const key = edgeKey(fromId, toId);
      this.layout.edges[key] = generateStraightBeads(from, to);
      this.rebuildBeadsForEdge(key, fromId, toId);
    }
    this.renderEdges();
  }

  // ── Root hub ─────────────────────────────────────────────────────────────

  private buildRootHub(): void {
    const hub = this.layout.nodes[ROOT_NODE_ID] ?? { x: 0, y: 0 };
    const g = this.add.graphics();
    g.setPosition(hub.x, hub.y);
    g.fillStyle(NEON.cyan, 0.9);
    g.fillCircle(0, 0, 9);
    g.lineStyle(1.5, 0xffffff, 0.9);
    g.strokeCircle(0, 0, 9);
    this.world.add(g);

    const zone = this.add.zone(hub.x, hub.y, 40, 40);
    zone.setInteractive({ hitArea: new Phaser.Geom.Circle(0, 0, 20), hitAreaCallback: Phaser.Geom.Circle.Contains, draggable: true });
    zone.setData('kind', 'root');
    this.world.add(zone);
    this.input.setDraggable(zone);
    this.input.on('drag', (_ptr: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject, dragX: number, dragY: number) => {
      if (obj !== zone) return;
      zone.setPosition(dragX, dragY);
      g.setPosition(dragX, dragY);
      this.layout.nodes[ROOT_NODE_ID] = { x: dragX, y: dragY };
      this.renderEdges();
    });
  }

  // ── Nodes ────────────────────────────────────────────────────────────────

  private buildAllNodes(): void {
    for (const id of Object.keys(TECH_NODES)) this.buildNode(id);
  }

  private buildNode(nodeId: string): void {
    const node = TECH_NODES[nodeId];
    const pos = this.layout.nodes[nodeId] ?? { x: 0, y: 0 };
    const r = NODE_R;

    const c = this.add.container(pos.x, pos.y);
    this.world.add(c);

    const rotor = this.add.graphics();
    c.add(rotor);
    const ring = this.add.graphics();
    c.add(ring);

    const iconInfo = getNodeIcon(nodeId);
    const icon = this.add.text(0, 0, iconInfo.glyph, {
      fontSize: `${Math.round(r * 1.4)}px`, color: '#eef2ff', fontFamily: EMOJI_FONT_STACK,
    }).setOrigin(0.5);
    c.add(icon);

    if (iconInfo.numeral) {
      const numeral = this.add.text(r * 0.55, r * 0.5, iconInfo.numeral, {
        fontSize: '10px', color: '#eef2ff', fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5);
      numeral.setShadow(0, 1, '#000000', 2, true, true);
      c.add(numeral);
    }

    const label = this.add.text(0, r + 8, node.name, {
      fontSize: '10px', color: colorToHex(BRANCH_ACCENT[branchOf(nodeId)] ?? NEON.cyan),
      fontFamily: 'monospace', fontStyle: 'bold', align: 'center',
      wordWrap: { width: r * 3.4 },
    }).setOrigin(0.5, 0);
    label.setShadow(0, 1, '#000000', 2, true, true);
    c.add(label);

    c.setInteractive({ hitArea: new Phaser.Geom.Circle(0, 0, r * 1.15), hitAreaCallback: Phaser.Geom.Circle.Contains, draggable: true, useHandCursor: true });
    c.setData('kind', 'node');
    c.setData('id', nodeId);
    this.input.setDraggable(c);

    const handle: NodeHandle = { container: c, rotor, ring, dragStart: { x: pos.x, y: pos.y }, dragged: false };
    this.nodeHandles.set(nodeId, handle);

    c.on('dragstart', () => { handle.dragStart = { x: c.x, y: c.y }; handle.dragged = false; });
    c.on('pointerup', () => {
      const moved = Math.hypot(c.x - handle.dragStart.x, c.y - handle.dragStart.y);
      if (moved < CLICK_MOVE_THRESHOLD && !handle.dragged) this.toggleResearched(nodeId);
      handle.dragged = false;
    });

    this.paintNode(nodeId);
  }

  private toggleResearched(nodeId: string): void {
    if (this.researchedPreview.has(nodeId)) this.researchedPreview.delete(nodeId);
    else this.researchedPreview.add(nodeId);
    this.paintNode(nodeId);
    this.renderEdges();
  }

  private paintNode(nodeId: string): void {
    const handle = this.nodeHandles.get(nodeId);
    const node = TECH_NODES[nodeId];
    if (!handle || !node) return;

    const accent = BRANCH_ACCENT[branchOf(nodeId)] ?? NEON.cyan;
    const researched = this.researchedPreview.has(nodeId);
    const teeth = node.tier === 3 ? 12 : node.tier === 2 ? 10 : 8;
    const fillColor = researched ? accent : darkenColor(accent, 0.35);

    drawGear(handle.rotor, NODE_R, teeth, fillColor, 0.95);
    drawRing(handle.ring, NODE_R + 3, researched ? accent : 0x2a3a4a, researched ? 0.95 : 0.6, 2, false);
  }

  // ── Edges / beads ────────────────────────────────────────────────────────

  private buildAllBeads(): void {
    for (const { fromId, toId } of allEdgePairs()) this.buildBeadsForEdge(fromId, toId);
  }

  private buildBeadsForEdge(fromId: string, toId: string): void {
    const key = edgeKey(fromId, toId);
    const beads = this.layout.edges[key] ?? [];
    const handles: BeadHandle[] = [];
    beads.forEach((bead, index) => {
      const gfx = this.add.rectangle(bead.x, bead.y, BEAD_HANDLE_R * 2, BEAD_HANDLE_R * 2, 0x0a1420, 0.9);
      gfx.setStrokeStyle(1.5, NEON.magenta, 0.85);
      gfx.setData('kind', 'bead');
      gfx.setData('edgeKey', key);
      gfx.setData('index', index);
      gfx.setInteractive({ draggable: true, useHandCursor: true });
      this.input.setDraggable(gfx);
      this.world.add(gfx);
      handles.push({ edgeKey: key, index, gfx });
    });
    this.beadHandlesByEdge.set(key, handles);
  }

  /** Destroys and rebuilds one edge's bead handles — used after a node drag
   * regenerates that edge's beads, since the new bead count can differ from
   * the old one (a shorter or longer connection wants fewer or more). */
  private rebuildBeadsForEdge(key: string, fromId: string, toId: string): void {
    for (const handle of this.beadHandlesByEdge.get(key) ?? []) handle.gfx.destroy();
    this.beadHandlesByEdge.delete(key);
    this.buildBeadsForEdge(fromId, toId);
  }

  private renderEdges(): void {
    const g = this.edgesGfx;
    g.clear();

    for (const [nodeId, node] of Object.entries(TECH_NODES)) {
      const childResearched = this.researchedPreview.has(nodeId);
      const accent = BRANCH_ACCENT[branchOf(nodeId)] ?? NEON.cyan;
      const color = childResearched ? accent : 0x445566;
      const alpha = childResearched ? 1 : 0.4;

      const prereqs = node.prereqs?.length ? node.prereqs : [ROOT_NODE_ID];
      for (const fromId of prereqs) {
        const from = this.layout.nodes[fromId];
        const to = this.layout.nodes[nodeId];
        if (!from || !to) continue;
        const beads = this.layout.edges[edgeKey(fromId, nodeId)] ?? [];
        const points: LayoutPoint[] = [from, ...beads, to];
        g.lineStyle(6, color, alpha * 0.3);
        drawPolyline(g, points);
        g.lineStyle(2.5, color, alpha);
        drawPolyline(g, points);
      }
    }
  }

  // ── Top bar (back / import / export) ────────────────────────────────────

  private buildTopBar(): void {
    neonBtn(this, 14, 4, 90, 26, NEON.cyan, NEON_STR.cyan, '< BACK', 11, () => this.scene.start('SettingsScene'));

    this.add.text(this.scale.width / 2, 8, 'TECH LAYOUT EDITOR', {
      fontSize: '14px', color: NEON_STR.magenta, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    const btnW = 110, btnH = 26, gap = 10;
    const rightX = this.scale.width - 14;
    neonBtn(this, rightX - btnW, 4, btnW, btnH, NEON.green, NEON_STR.green, '⇩ EXPORT', 11, () => this.exportLayout());
    neonBtn(this, rightX - btnW * 2 - gap, 4, btnW, btnH, NEON.orange, NEON_STR.orange, '⇧ IMPORT', 11, () => this.importLayout());
    neonBtn(this, rightX - btnW * 3 - gap * 2, 4, btnW, btnH, NEON.blue, NEON_STR.blue, '⟲ REGEN', 11, () => this.regenerateDefault());
  }

  private exportLayout(): void {
    const json = JSON.stringify(this.layout, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'techTreeLayout.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  private importLayout(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          if (!parsed || typeof parsed !== 'object' || !parsed.nodes || !parsed.edges) {
            throw new Error('not a tech tree layout file');
          }
          this.layout = parsed as TechTreeLayoutData;
          this.rebuildAll();
        } catch (e) {
          console.error('Tech layout import failed:', e);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  private regenerateDefault(): void {
    this.layout = generateDefaultLayout();
    this.rebuildAll();
  }

  /** Full teardown/rebuild of every node and bead handle from the current
   * `this.layout` — used after import or regenerate, where wholesale
   * replacement is simpler and safer than patching existing GameObjects. */
  private rebuildAll(): void {
    for (const handle of this.nodeHandles.values()) handle.container.destroy();
    this.nodeHandles.clear();
    for (const handles of this.beadHandlesByEdge.values()) {
      for (const bead of handles) bead.gfx.destroy();
    }
    this.beadHandlesByEdge.clear();
    this.researchedPreview.clear();

    this.buildAllNodes();
    this.buildAllBeads();
    this.renderEdges();
  }

  // ── Pan / zoom ───────────────────────────────────────────────────────────

  private setupCameraInput(): void {
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (!ptr.rightButtonDown()) return;
      this.isPanning = true;
      this.panStart = { px: ptr.x, py: ptr.y, ox: this.panOffsetX, oy: this.panOffsetY };
    });
    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      if (!this.isPanning) return;
      if (!ptr.rightButtonDown()) { this.isPanning = false; return; }
      this.panOffsetX = this.panStart.ox + (ptr.x - this.panStart.px);
      this.panOffsetY = this.panStart.oy + (ptr.y - this.panStart.py);
      this.applyTransform();
    });
    this.input.on('pointerup', () => { this.isPanning = false; });
    this.input.on('wheel', (ptr: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const factor = dy > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
      this.zoomAt(ptr.x, ptr.y, factor);
    });
    this.applyTransform();
  }

  private zoomAt(screenX: number, screenY: number, factor: number): void {
    const oldZoom = this.zoom;
    const newZoom = Phaser.Math.Clamp(oldZoom * factor, MIN_ZOOM, MAX_ZOOM);
    if (newZoom === oldZoom) return;
    const cx = this.scale.width / 2 + this.panOffsetX;
    const cy = this.scale.height / 2 + this.panOffsetY;
    const lx = (screenX - cx) / oldZoom;
    const ly = (screenY - cy) / oldZoom;
    this.zoom = newZoom;
    this.panOffsetX = screenX - lx * newZoom - this.scale.width / 2;
    this.panOffsetY = screenY - ly * newZoom - this.scale.height / 2;
    this.applyTransform();
  }

  private applyTransform(): void {
    this.world.setScale(this.zoom);
    this.world.setPosition(this.scale.width / 2 + this.panOffsetX, this.scale.height / 2 + this.panOffsetY);
  }
}

function structuredCloneLayout(data: TechTreeLayoutData): TechTreeLayoutData {
  return JSON.parse(JSON.stringify(data)) as TechTreeLayoutData;
}
