import Phaser from 'phaser';
import { GameOverData, StatSnapshot } from '../types/stats.types';
import { NEON, NEON_STR, BG } from '../constants/ui.constants';
import { NeonUI } from '../ui/NeonUI';

// ── Layout constants ────────────────────────────────────────────────────────
const HDR_H   = 64;
const TAB_H   = 44;
const FLT_Y   = TAB_H + HDR_H;
const FLT_H   = 38;

const CHT_L   = 72;          // chart inner left (room for y-axis labels)
const CHT_T   = FLT_Y + FLT_H + 14;   // chart top
const CHT_H   = 272;
const CHT_B   = CHT_T + CHT_H;

const STAT_Y  = CHT_B + 22;
const STAT_H  = 162;
const FOOTER_Y = STAT_Y + STAT_H + 12;

type Section = 'main' | 'economy' | 'tech' | 'military';
type FilterKey = string;

const SECTIONS: { id: Section; label: string; color: number; colorStr: string }[] = [
  { id: 'main',     label: '⚡ MAIN',     color: NEON.cyan,    colorStr: NEON_STR.cyan },
  { id: 'economy',  label: '◈ ECONOMY',  color: NEON.yellow,  colorStr: NEON_STR.yellow },
  { id: 'tech',     label: '◉ TECH',     color: NEON.orange,  colorStr: NEON_STR.orange },
  { id: 'military', label: '⚔ MILITARY', color: NEON.red,     colorStr: NEON_STR.red },
];

const ECONOMY_FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'gold', label: 'GOLD' },
  { key: 'iron', label: 'IRON' },
  { key: 'crystal', label: 'CRYSTAL' },
  { key: 'aether', label: 'AETHER' },
];

const TECH_FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',      label: 'ALL' },
  { key: 'gear',     label: 'GEAR' },
  { key: 'military', label: 'MILITARY' },
  { key: 'economy',  label: 'ECONOMY' },
  { key: 'defense',  label: 'DEFENSE' },
];

const PLAYER_COL = NEON.cyan;
const AI_COL     = NEON.red;
const PLAYER_STR = NEON_STR.cyan;
const AI_STR     = NEON_STR.red;

interface DataPoint { px: number; py: number; snapIdx: number }

export class GameOverScene extends Phaser.Scene {
  private statsData!: GameOverData;
  private activeSection: Section = 'main';
  private activeFilter: FilterKey = 'all';

  // Graphics layers
  private chartGfx!: Phaser.GameObjects.Graphics;
  private crosshairGfx!: Phaser.GameObjects.Graphics;

  // Dynamic content (destroyed/recreated on section change)
  private dynamicObjs: Phaser.GameObjects.GameObject[] = [];

  // Hover tooltip elements
  private tooltipBg!: Phaser.GameObjects.Graphics;
  private tooltipText!: Phaser.GameObjects.Text;

  // Stored data point positions for hover
  private playerPoints: DataPoint[] = [];
  private aiPoints: DataPoint[] = [];

  // Tab button graphics (for active-state highlight)
  private tabBtnGfx: Map<Section, Phaser.GameObjects.Graphics> = new Map();

  // Filter button references
  private filterBtnGfx: Map<string, Phaser.GameObjects.Graphics> = new Map();
  private filterBtnLabels: Map<string, Phaser.GameObjects.Text> = new Map();

  // Available unit-type filters (computed from data)
  private militaryFilters: { key: string; label: string }[] = [];

  // CHT_R computed from canvas width
  private CHTR = 1328;
  private CHTW = 1256;

  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(data: GameOverData): void {
    this.statsData = data;
    this.activeSection = 'main';
    this.activeFilter = 'all';
  }

  create(): void {
    const { width } = this.scale;
    this.CHTR = width - 72;
    this.CHTW = this.CHTR - CHT_L;

    // Background
    const bg = this.add.graphics();
    bg.fillGradientStyle(BG.deep, BG.deep, BG.mid, BG.mid, 1);
    bg.fillRect(0, 0, width, this.scale.height);

    this.drawHeader();
    this.drawTabs();
    this.drawFilterBar();

    // Chart background panel
    const chartBg = this.add.graphics();
    chartBg.fillStyle(0x060610, 0.96);
    chartBg.fillRoundedRect(CHT_L - 4, CHT_T - 4, this.CHTW + 8, CHT_H + 8, 4);
    chartBg.lineStyle(1, 0x223344, 0.5);
    chartBg.strokeRoundedRect(CHT_L - 4, CHT_T - 4, this.CHTW + 8, CHT_H + 8, 4);

    this.chartGfx      = this.add.graphics().setDepth(10);
    this.crosshairGfx  = this.add.graphics().setDepth(12);

    // Tooltip (hidden initially)
    this.tooltipBg   = this.add.graphics().setDepth(20).setVisible(false);
    this.tooltipText = this.add.text(0, 0, '', {
      fontSize: '11px', fontFamily: 'monospace', color: '#ccddee',
      lineSpacing: 3,
    }).setDepth(21).setVisible(false);

    this.drawFooter();
    this.buildMilitaryFilters();
    this.refreshSection();
  }

  // ── Header ────────────────────────────────────────────────────────────────

  private drawHeader(): void {
    const { width } = this.scale;
    const cx = width / 2;
    const isVictory = this.statsData.winner === 'player';
    const titleColor = isVictory ? NEON_STR.cyan : NEON_STR.red;
    const titleText  = isVictory ? '⚡ VICTORY' : '✕ DEFEAT';
    const glowColor  = isVictory ? NEON.cyan : NEON.red;

    const hdrBg = this.add.graphics();
    hdrBg.fillStyle(0x05050e, 0.98);
    hdrBg.fillRect(0, 0, width, HDR_H);
    hdrBg.lineStyle(1, glowColor, 0.3);
    hdrBg.beginPath();
    hdrBg.moveTo(0, HDR_H - 1);
    hdrBg.lineTo(width, HDR_H - 1);
    hdrBg.strokePath();

    this.add.text(20, HDR_H / 2, titleText, {
      fontSize: '26px', color: titleColor, fontFamily: 'monospace', fontStyle: 'bold',
      shadow: { offsetX: 0, offsetY: 0, color: titleColor, blur: 12, fill: true },
    }).setOrigin(0, 0.5);

    this.add.text(cx, HDR_H / 2, this.statsData.reason, {
      fontSize: '12px', color: '#889aab', fontFamily: 'monospace',
    }).setOrigin(0.5, 0.5);

    // Final HP badges
    const snap = this.statsData.snapshots[this.statsData.snapshots.length - 1];
    if (snap) {
      const pHpPct = snap.playerHp / Math.max(1, snap.playerMaxHp);
      const aHpPct = snap.aiHp     / Math.max(1, snap.aiMaxHp);
      this.add.text(width - 20, HDR_H / 2 - 10,
        `PLAYER  ${Math.ceil(snap.playerHp)}/${snap.playerMaxHp} HP  (${Math.round(pHpPct * 100)}%)`,
        { fontSize: '11px', color: PLAYER_STR, fontFamily: 'monospace' }).setOrigin(1, 0.5);
      this.add.text(width - 20, HDR_H / 2 + 10,
        `AI      ${Math.ceil(snap.aiHp)}/${snap.aiMaxHp} HP  (${Math.round(aHpPct * 100)}%)`,
        { fontSize: '11px', color: AI_STR, fontFamily: 'monospace' }).setOrigin(1, 0.5);
    }
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────

  private drawTabs(): void {
    const { width } = this.scale;
    const tabW = Math.floor(width / SECTIONS.length);

    const tabsBg = this.add.graphics();
    tabsBg.fillStyle(0x080812, 1);
    tabsBg.fillRect(0, HDR_H, width, TAB_H);

    SECTIONS.forEach((sec, i) => {
      const tx = i * tabW;
      const g = this.add.graphics();
      this.tabBtnGfx.set(sec.id, g);
      this.drawTabBtn(g, tx, tabW, sec.id === this.activeSection, sec.color);

      const label = this.add.text(tx + tabW / 2, HDR_H + TAB_H / 2, sec.label, {
        fontSize: '13px', fontFamily: 'monospace', fontStyle: 'bold',
        color: sec.colorStr,
      }).setOrigin(0.5, 0.5);

      const zone = this.add.zone(tx + tabW / 2, HDR_H + TAB_H / 2, tabW, TAB_H)
        .setInteractive({ cursor: 'pointer' });
      zone.on('pointerdown', () => {
        this.activeSection = sec.id;
        this.activeFilter = 'all';
        this.tabBtnGfx.forEach((gg, sid) => {
          const s = SECTIONS.find(ss => ss.id === sid)!;
          this.drawTabBtn(gg, SECTIONS.indexOf(s) * tabW, tabW, sid === this.activeSection, s.color);
        });
        this.refreshFilterBar();
        this.refreshSection();
      });
      void label;
    });
  }

  private drawTabBtn(g: Phaser.GameObjects.Graphics, tx: number, tw: number, active: boolean, color: number): void {
    g.clear();
    if (active) {
      g.fillStyle(color, 0.12);
      g.fillRect(tx, HDR_H, tw, TAB_H);
      g.lineStyle(2, color, 0.8);
      g.beginPath();
      g.moveTo(tx + 2, HDR_H + TAB_H - 1);
      g.lineTo(tx + tw - 2, HDR_H + TAB_H - 1);
      g.strokePath();
    }
  }

  // ── Filter bar ────────────────────────────────────────────────────────────

  private drawFilterBar(): void {
    const filterBg = this.add.graphics();
    filterBg.fillStyle(0x070711, 0.98);
    filterBg.fillRect(0, FLT_Y, this.scale.width, FLT_H);
    filterBg.lineStyle(1, 0x1a2233, 1);
    filterBg.beginPath();
    filterBg.moveTo(0, FLT_Y + FLT_H - 1);
    filterBg.lineTo(this.scale.width, FLT_Y + FLT_H - 1);
    filterBg.strokePath();
  }

  private refreshFilterBar(): void {
    // Destroy existing filter button graphics
    this.filterBtnGfx.forEach(g => g.destroy());
    this.filterBtnLabels.forEach(t => t.destroy());
    this.filterBtnGfx.clear();
    this.filterBtnLabels.clear();

    let filters: { key: string; label: string }[];
    if (this.activeSection === 'economy')  filters = ECONOMY_FILTERS;
    else if (this.activeSection === 'tech') filters = TECH_FILTERS;
    else if (this.activeSection === 'military') filters = this.militaryFilters;
    else filters = [];

    const BTNW = 80, BTNH = 24, GAP = 6;
    let startX = 16;

    filters.forEach(f => {
      const bx = startX;
      const by = FLT_Y + (FLT_H - BTNH) / 2;
      const g = this.add.graphics();
      const txt = this.add.text(bx + BTNW / 2, by + BTNH / 2, f.label, {
        fontSize: '11px', fontFamily: 'monospace', fontStyle: 'bold', color: '#445566',
      }).setOrigin(0.5).setDepth(5);
      this.filterBtnGfx.set(f.key, g);
      this.filterBtnLabels.set(f.key, txt);
      this.drawFilterBtn(f.key, g, bx, by, BTNW, BTNH);

      const z = this.add.zone(bx + BTNW / 2, by + BTNH / 2, BTNW, BTNH).setInteractive({ cursor: 'pointer' });
      z.on('pointerdown', () => {
        this.activeFilter = f.key;
        this.filterBtnGfx.forEach((gg, k) => {
          const fdef = filters.find(ff => ff.key === k)!;
          void fdef;
          this.drawFilterBtn(k, gg, bx + filters.indexOf(f) * (BTNW + GAP), by, BTNW, BTNH);
        });
        // Redraw all filter buttons with new active state
        let rx = 16;
        filters.forEach(ff => {
          const gg = this.filterBtnGfx.get(ff.key)!;
          const tl = this.filterBtnLabels.get(ff.key)!;
          const by2 = FLT_Y + (FLT_H - BTNH) / 2;
          this.drawFilterBtn(ff.key, gg, rx, by2, BTNW, BTNH);
          tl.setColor(ff.key === this.activeFilter ? '#ffffff' : '#445566');
          rx += BTNW + GAP;
        });
        this.refreshSection();
      });
      startX += BTNW + GAP;
    });

    // Initial label colors
    filters.forEach(f => {
      this.filterBtnLabels.get(f.key)?.setColor(f.key === this.activeFilter ? '#ffffff' : '#445566');
    });
  }

  private drawFilterBtn(key: string, g: Phaser.GameObjects.Graphics, bx: number, by: number, bw: number, bh: number): void {
    g.clear();
    const active = key === this.activeFilter;
    const col = active ? NEON.cyan : 0x223344;
    g.fillStyle(active ? NEON.cyan : 0x0a0a18, active ? 0.15 : 1);
    g.fillRoundedRect(bx, by, bw, bh, 3);
    g.lineStyle(1, col, active ? 0.9 : 0.3);
    g.strokeRoundedRect(bx, by, bw, bh, 3);
  }

  // ── Dynamic section rendering ──────────────────────────────────────────────

  private refreshSection(): void {
    this.clearDynamic();
    this.chartGfx.clear();
    this.crosshairGfx.clear();
    this.hideTooltip();
    this.playerPoints = [];
    this.aiPoints = [];

    const snaps = this.statsData.snapshots;
    if (snaps.length < 2) {
      this.addDynamic(this.add.text(CHT_L + this.CHTW / 2, CHT_T + CHT_H / 2, 'Not enough data', {
        fontSize: '14px', color: '#445566', fontFamily: 'monospace',
      }).setOrigin(0.5));
      this.drawStatsGrid();
      return;
    }

    switch (this.activeSection) {
      case 'main':     this.renderMain();     break;
      case 'economy':  this.renderEconomy();  break;
      case 'tech':     this.renderTech();     break;
      case 'military': this.renderMilitary(); break;
    }
    this.drawStatsGrid();
  }

  private renderMain(): void {
    const snaps = this.statsData.snapshots;
    const pData = snaps.map(s => s.playerHp);
    const aData = snaps.map(s => s.aiHp);
    const maxHp = Math.max(...snaps.map(s => Math.max(s.playerMaxHp, s.aiMaxHp)), 1);
    this.drawChart(
      [{ data: pData, color: PLAYER_COL, label: 'Player HP' }, { data: aData, color: AI_COL, label: 'AI HP' }],
      0, maxHp, 'Base HP over time', '%',
    );
    this.addLegend('Player HP', PLAYER_COL, 'AI HP', AI_COL);
    this.refreshFilterBar();
  }

  private renderEconomy(): void {
    const snaps = this.statsData.snapshots;
    const key = this.activeFilter as 'all' | 'gold' | 'iron' | 'crystal' | 'aether';

    const getVal = (s: StatSnapshot, owner: 'player' | 'ai'): number => {
      const r = owner === 'player' ? s.playerResources : s.aiResources;
      if (key === 'all') return r.gold + r.iron + r.crystal + r.aether;
      return r[key] ?? 0;
    };

    const pData = snaps.map(s => getVal(s, 'player'));
    const aData = snaps.map(s => getVal(s, 'ai'));
    const maxVal = Math.max(...pData, ...aData, 1);
    const title  = key === 'all' ? 'Total resources' : key.charAt(0).toUpperCase() + key.slice(1);

    this.drawChart(
      [{ data: pData, color: PLAYER_COL, label: 'Player' }, { data: aData, color: AI_COL, label: 'AI' }],
      0, maxVal, title, '',
    );
    this.addLegend('Player', PLAYER_COL, 'AI', AI_COL);
    this.refreshFilterBar();
  }

  private renderTech(): void {
    const snaps = this.statsData.snapshots;
    const key = this.activeFilter as keyof { all: 0; gear: 0; military: 0; economy: 0; defense: 0 };

    const getVal = (s: StatSnapshot, owner: 'player' | 'ai'): number => {
      const t = owner === 'player' ? s.playerTech : s.aiTech;
      if (key === 'all') return t.total;
      return (t as unknown as Record<string, number>)[key] ?? 0;
    };

    const pData = snaps.map(s => getVal(s, 'player'));
    const aData = snaps.map(s => getVal(s, 'ai'));
    const maxVal = Math.max(...pData, ...aData, 1);
    const title  = key === 'all' ? 'Technologies researched' : `${key} technologies`;

    this.drawChart(
      [{ data: pData, color: PLAYER_COL, label: 'Player' }, { data: aData, color: AI_COL, label: 'AI' }],
      0, maxVal, title, '',
    );
    this.addLegend('Player', PLAYER_COL, 'AI', AI_COL);
    this.refreshFilterBar();
  }

  private renderMilitary(): void {
    const snaps = this.statsData.snapshots;
    const key = this.activeFilter;

    const getVal = (s: StatSnapshot, owner: 'player' | 'ai'): number => {
      if (key === 'all') return owner === 'player' ? s.playerUnitTotal : s.aiUnitTotal;
      const map = owner === 'player' ? s.playerUnitByType : s.aiUnitByType;
      return map[key] ?? 0;
    };

    const pData = snaps.map(s => getVal(s, 'player'));
    const aData = snaps.map(s => getVal(s, 'ai'));
    const maxVal = Math.max(...pData, ...aData, 1);
    const title  = key === 'all' ? 'Units spawned (cumulative)' : `${key.replace(/_/g, ' ')} spawned`;

    this.drawChart(
      [{ data: pData, color: PLAYER_COL, label: 'Player' }, { data: aData, color: AI_COL, label: 'AI' }],
      0, maxVal, title, '',
    );
    this.addLegend('Player', PLAYER_COL, 'AI', AI_COL);
    this.refreshFilterBar();
  }

  // ── Line chart ────────────────────────────────────────────────────────────

  private drawChart(
    series: { data: number[]; color: number; label: string }[],
    minVal: number,
    maxVal: number,
    title: string,
    _unit: string,
  ): void {
    const g = this.chartGfx;
    const snaps = this.statsData.snapshots;
    const n = snaps.length;
    if (n < 2) return;

    const range = Math.max(maxVal - minVal, 1);
    const toY = (v: number) => CHT_B - ((v - minVal) / range) * CHT_H;
    const toX = (i: number) => CHT_L + (i / (n - 1)) * this.CHTW;

    // Grid
    g.lineStyle(1, 0x1a2a3a, 0.8);
    for (let row = 0; row <= 4; row++) {
      const y = CHT_T + row * CHT_H / 4;
      g.beginPath(); g.moveTo(CHT_L, y); g.lineTo(this.CHTR, y); g.strokePath();
      // Y-axis label
      const val = maxVal - row * range / 4;
      this.addDynamic(this.add.text(CHT_L - 6, y, String(Math.round(val)), {
        fontSize: '10px', color: '#445566', fontFamily: 'monospace',
      }).setOrigin(1, 0.5).setDepth(11));
    }

    // X-axis time labels (max 8)
    const labelStep = Math.max(1, Math.floor(n / 8));
    for (let i = 0; i < n; i += labelStep) {
      const x = toX(i);
      const sec = snaps[i].time;
      const timeStr = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
      g.lineStyle(1, 0x1a2a3a, 0.4);
      g.beginPath(); g.moveTo(x, CHT_T); g.lineTo(x, CHT_B); g.strokePath();
      this.addDynamic(this.add.text(x, CHT_B + 5, timeStr, {
        fontSize: '10px', color: '#445566', fontFamily: 'monospace',
      }).setOrigin(0.5, 0).setDepth(11));
    }

    // Chart title
    this.addDynamic(this.add.text(CHT_L, CHT_T - 12, title, {
      fontSize: '11px', color: '#6688aa', fontFamily: 'monospace',
    }).setOrigin(0, 1).setDepth(11));

    // Axes
    g.lineStyle(1, 0x334455, 1);
    g.beginPath(); g.moveTo(CHT_L, CHT_T); g.lineTo(CHT_L, CHT_B); g.strokePath();
    g.beginPath(); g.moveTo(CHT_L, CHT_B); g.lineTo(this.CHTR, CHT_B); g.strokePath();

    // Draw series (back-to-front: AI behind player)
    this.playerPoints = [];
    this.aiPoints = [];

    series.forEach((s, si) => {
      const pts: { x: number; y: number }[] = s.data.map((v, i) => ({ x: toX(i), y: toY(v) }));
      const isPlayer = si === 0;

      // Shaded area under line
      if (pts.length >= 2) {
        g.fillStyle(s.color, 0.06);
        g.beginPath();
        g.moveTo(pts[0].x, CHT_B);
        pts.forEach(p => g.lineTo(p.x, p.y));
        g.lineTo(pts[pts.length - 1].x, CHT_B);
        g.closePath();
        g.fillPath();
      }

      // Line
      g.lineStyle(2, s.color, 0.9);
      for (let i = 1; i < pts.length; i++) {
        g.beginPath();
        g.moveTo(pts[i - 1].x, pts[i - 1].y);
        g.lineTo(pts[i].x, pts[i].y);
        g.strokePath();
      }

      // Dots
      pts.forEach((p, i) => {
        g.fillStyle(s.color, 1);
        g.fillCircle(p.x, p.y, 4);
        g.fillStyle(0x05050e, 1);
        g.fillCircle(p.x, p.y, 2);
        const dp: DataPoint = { px: p.x, py: p.y, snapIdx: i };
        if (isPlayer) this.playerPoints.push(dp); else this.aiPoints.push(dp);
      });
    });
  }

  private addLegend(labelA: string, colorA: number, labelB: string, colorB: number): void {
    const y = CHT_T - 12;
    const rx = this.CHTR;

    const legendGfx = this.add.graphics().setDepth(11);
    legendGfx.fillStyle(colorA, 1); legendGfx.fillCircle(rx - 170, y - 3, 5);
    legendGfx.fillStyle(colorB, 1); legendGfx.fillCircle(rx - 70,  y - 3, 5);
    this.addDynamic(legendGfx);

    this.addDynamic(this.add.text(rx - 162, y, labelA, {
      fontSize: '11px', color: Phaser.Display.Color.IntegerToColor(colorA).rgba, fontFamily: 'monospace',
    }).setOrigin(0, 1).setDepth(11));
    this.addDynamic(this.add.text(rx - 62, y, labelB, {
      fontSize: '11px', color: Phaser.Display.Color.IntegerToColor(colorB).rgba, fontFamily: 'monospace',
    }).setOrigin(0, 1).setDepth(11));
  }

  // ── Stats grid ────────────────────────────────────────────────────────────

  private drawStatsGrid(): void {
    const { width } = this.scale;
    const gridBg = this.add.graphics().setDepth(5);
    gridBg.fillStyle(0x060610, 0.94);
    gridBg.fillRoundedRect(12, STAT_Y, width - 24, STAT_H, 5);
    gridBg.lineStyle(1, 0x1a2233, 0.7);
    gridBg.strokeRoundedRect(12, STAT_Y, width - 24, STAT_H, 5);
    this.addDynamic(gridBg);

    const colW = (width - 24) / 3;
    const statX = { label: 28, player: 28 + colW, ai: 28 + colW * 2 };

    // Column headers
    this.addDynamic(this.add.text(statX.player + colW / 2, STAT_Y + 10, '⚡ PLAYER', {
      fontSize: '11px', color: PLAYER_STR, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5, 0).setDepth(6));
    this.addDynamic(this.add.text(statX.ai + colW / 2, STAT_Y + 10, '✕ AI', {
      fontSize: '11px', color: AI_STR, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5, 0).setDepth(6));

    const rows = this.buildStatRows();
    const rowH = (STAT_H - 30) / Math.max(rows.length, 1);

    rows.forEach((row, i) => {
      const ry = STAT_Y + 28 + i * rowH;
      // Alternating row bg
      if (i % 2 === 0) {
        const rowBg = this.add.graphics().setDepth(5);
        rowBg.fillStyle(0xffffff, 0.02);
        rowBg.fillRect(14, ry - 2, width - 28, rowH);
        this.addDynamic(rowBg);
      }
      this.addDynamic(this.add.text(statX.label, ry + rowH / 2, row.label, {
        fontSize: '11px', color: '#667788', fontFamily: 'monospace',
      }).setOrigin(0, 0.5).setDepth(6));
      this.addDynamic(this.add.text(statX.player + colW / 2, ry + rowH / 2, row.player, {
        fontSize: '11px', color: PLAYER_STR, fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5, 0.5).setDepth(6));
      this.addDynamic(this.add.text(statX.ai + colW / 2, ry + rowH / 2, row.ai, {
        fontSize: '11px', color: AI_STR, fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5, 0.5).setDepth(6));
    });
  }

  private buildStatRows(): { label: string; player: string; ai: string }[] {
    const d = this.statsData;
    const last = d.snapshots[d.snapshots.length - 1];
    const gameMin = last ? Math.floor(last.time / 60) : 0;
    const gameSec = last ? last.time % 60 : 0;

    switch (this.activeSection) {
      case 'main':
        return [
          { label: 'Game Time',       player: `${gameMin}m ${gameSec}s`, ai: '' },
          { label: 'Final HP',        player: last ? `${Math.ceil(last.playerHp)}/${last.playerMaxHp}` : '-', ai: last ? `${Math.ceil(last.aiHp)}/${last.aiMaxHp}` : '-' },
          { label: 'Gears Placed',    player: String(d.playerGearsPlaced),  ai: String(d.aiGearsPlaced) },
          { label: 'Gears Lost',      player: String(d.playerGearsLost),    ai: String(d.aiGearsLost) },
          { label: 'Units Killed',    player: String(d.playerUnitsKilled),  ai: String(d.aiUnitsKilled) },
          { label: 'Units Lost',      player: String(d.playerUnitsLost),    ai: String(d.aiUnitsLost) },
          { label: 'Tech Researched', player: String(d.playerTechResearched), ai: String(d.aiTechResearched) },
        ];
      case 'economy':
        if (!last) return [];
        return [
          { label: 'Gold',    player: String(Math.round(last.playerResources.gold)),    ai: String(Math.round(last.aiResources.gold)) },
          { label: 'Iron',    player: String(Math.round(last.playerResources.iron)),    ai: String(Math.round(last.aiResources.iron)) },
          { label: 'Crystal', player: String(Math.round(last.playerResources.crystal)), ai: String(Math.round(last.aiResources.crystal)) },
          { label: 'Aether',  player: String(Math.round(last.playerResources.aether)),  ai: String(Math.round(last.aiResources.aether)) },
          { label: 'Peak Gold (P)', player: String(Math.round(Math.max(...d.snapshots.map(s => s.playerResources.gold)))), ai: '' },
          { label: 'Peak Gold (AI)', player: '', ai: String(Math.round(Math.max(...d.snapshots.map(s => s.aiResources.gold)))) },
        ];
      case 'tech':
        if (!last) return [];
        return [
          { label: 'Total Researched', player: String(last.playerTech.total),    ai: String(last.aiTech.total) },
          { label: 'Gear',             player: String(last.playerTech.gear),     ai: String(last.aiTech.gear) },
          { label: 'Military',         player: String(last.playerTech.military), ai: String(last.aiTech.military) },
          { label: 'Economy',          player: String(last.playerTech.economy),  ai: String(last.aiTech.economy) },
          { label: 'Defense',          player: String(last.playerTech.defense),  ai: String(last.aiTech.defense) },
        ];
      case 'military': {
        if (!last) return [];
        const rows = [
          { label: 'Total Spawned', player: String(last.playerUnitTotal), ai: String(last.aiUnitTotal) },
          { label: 'Killed',        player: String(d.playerUnitsKilled),  ai: String(d.aiUnitsKilled) },
          { label: 'Lost',          player: String(d.playerUnitsLost),    ai: String(d.aiUnitsLost) },
        ];
        // Top unit types
        const allTypes = new Set([...Object.keys(last.playerUnitByType), ...Object.keys(last.aiUnitByType)]);
        allTypes.forEach(type => {
          rows.push({
            label:  type.replace(/_/g, ' '),
            player: String(last.playerUnitByType[type] ?? 0),
            ai:     String(last.aiUnitByType[type] ?? 0),
          });
        });
        return rows;
      }
      default: return [];
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────────

  private drawFooter(): void {
    const { width } = this.scale;
    const cx = width / 2;
    const btnW = 180, btnH = 38;

    const menuBtnG = this.add.graphics().setDepth(5);
    NeonUI.drawButton(menuBtnG, cx - btnW - 10, FOOTER_Y, btnW, btnH, NEON.cyan, false);
    const menuLbl = this.add.text(cx - 10 - btnW / 2, FOOTER_Y + btnH / 2, 'MAIN MENU', {
      fontSize: '13px', color: NEON_STR.cyan, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(6);

    const playBtnG = this.add.graphics().setDepth(5);
    NeonUI.drawButton(playBtnG, cx + 10, FOOTER_Y, btnW, btnH, NEON.green, false);
    const playLbl = this.add.text(cx + 10 + btnW / 2, FOOTER_Y + btnH / 2, 'PLAY AGAIN', {
      fontSize: '13px', color: NEON_STR.green, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(6);

    void menuLbl; void playLbl;

    const menuZone = this.add.zone(cx - 10 - btnW / 2, FOOTER_Y + btnH / 2, btnW, btnH)
      .setInteractive({ cursor: 'pointer' }).setDepth(7);
    menuZone.on('pointerdown', () => this.scene.start('MenuScene'));

    const playZone = this.add.zone(cx + 10 + btnW / 2, FOOTER_Y + btnH / 2, btnW, btnH)
      .setInteractive({ cursor: 'pointer' }).setDepth(7);
    playZone.on('pointerdown', () => this.scene.start('DifficultySelectScene'));
  }

  // ── Hover / tooltip ───────────────────────────────────────────────────────

  update(): void {
    const ptr = this.input.activePointer;
    if (!ptr) return;

    const px = ptr.x;
    const py = ptr.y;

    if (px < CHT_L || px > this.CHTR || py < CHT_T || py > CHT_B
      || this.playerPoints.length === 0) {
      this.crosshairGfx.clear();
      this.hideTooltip();
      return;
    }

    // Find nearest snapshot by x position
    const snapCount = this.statsData.snapshots.length;
    const xStep = this.CHTW / Math.max(1, snapCount - 1);
    const idx = Math.max(0, Math.min(snapCount - 1, Math.round((px - CHT_L) / xStep)));

    this.showTooltipAtSnapshot(idx);
  }

  private showTooltipAtSnapshot(idx: number): void {
    const snaps  = this.statsData.snapshots;
    const snap   = snaps[idx];
    const xPos   = CHT_L + (idx / Math.max(1, snaps.length - 1)) * this.CHTW;

    // Crosshair
    this.crosshairGfx.clear();
    this.crosshairGfx.lineStyle(1, 0xffffff, 0.25);
    this.crosshairGfx.beginPath();
    this.crosshairGfx.moveTo(xPos, CHT_T);
    this.crosshairGfx.lineTo(xPos, CHT_B);
    this.crosshairGfx.strokePath();

    // Highlight nearest player and AI dots
    const ppt = this.playerPoints[idx];
    const apt = this.aiPoints[idx];
    if (ppt) {
      this.crosshairGfx.lineStyle(2, PLAYER_COL, 1);
      this.crosshairGfx.strokeCircle(ppt.px, ppt.py, 7);
    }
    if (apt) {
      this.crosshairGfx.lineStyle(2, AI_COL, 1);
      this.crosshairGfx.strokeCircle(apt.px, apt.py, 7);
    }

    // Build tooltip lines
    const sec = snap.time;
    const timeStr = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    const lines = this.buildTooltipLines(snap, timeStr);
    const text = lines.join('\n');

    this.tooltipText.setText(text);
    const tw = Math.max(this.tooltipText.width + 20, 180);
    const th = this.tooltipText.height + 14;

    let tx = xPos + 14;
    if (tx + tw > this.CHTR) tx = xPos - tw - 14;
    const ty = Math.max(CHT_T + 6, Math.min(CHT_B - th - 6, (CHT_T + CHT_B) / 2 - th / 2));

    this.tooltipBg.clear();
    this.tooltipBg.fillStyle(0x04040d, 0.95);
    this.tooltipBg.fillRoundedRect(tx, ty, tw, th, 5);
    this.tooltipBg.lineStyle(1, 0x445566, 0.8);
    this.tooltipBg.strokeRoundedRect(tx, ty, tw, th, 5);
    this.tooltipText.setPosition(tx + 10, ty + 7);

    this.tooltipBg.setVisible(true);
    this.tooltipText.setVisible(true);
  }

  private buildTooltipLines(snap: StatSnapshot, timeStr: string): string[] {
    const lines: string[] = [`⏱ ${timeStr}`];
    switch (this.activeSection) {
      case 'main':
        lines.push(`Player HP: ${Math.ceil(snap.playerHp)}/${snap.playerMaxHp}`);
        lines.push(`AI HP:     ${Math.ceil(snap.aiHp)}/${snap.aiMaxHp}`);
        break;
      case 'economy': {
        const f = this.activeFilter as keyof typeof snap.playerResources;
        const keys: (keyof typeof snap.playerResources)[] = f === 'all' as never
          ? ['gold', 'iron', 'crystal', 'aether']
          : [f];
        for (const k of keys) {
          lines.push(`Player ${k}: ${Math.round(snap.playerResources[k])}`);
          lines.push(`AI ${k}:    ${Math.round(snap.aiResources[k])}`);
        }
        break;
      }
      case 'tech': {
        const f = this.activeFilter;
        if (f === 'all') {
          lines.push(`Player: ${snap.playerTech.total} techs`);
          lines.push(`AI:     ${snap.aiTech.total} techs`);
        } else {
          const pv = (snap.playerTech as unknown as Record<string, number>)[f] ?? 0;
          const av = (snap.aiTech as unknown as Record<string, number>)[f] ?? 0;
          lines.push(`Player ${f}: ${pv}`);
          lines.push(`AI ${f}:    ${av}`);
        }
        break;
      }
      case 'military': {
        const f = this.activeFilter;
        if (f === 'all') {
          lines.push(`Player units: ${snap.playerUnitTotal}`);
          lines.push(`AI units:     ${snap.aiUnitTotal}`);
        } else {
          const pv = snap.playerUnitByType[f] ?? 0;
          const av = snap.aiUnitByType[f] ?? 0;
          lines.push(`Player ${f.replace(/_/g, ' ')}: ${pv}`);
          lines.push(`AI ${f.replace(/_/g, ' ')}:    ${av}`);
        }
        break;
      }
    }
    return lines;
  }

  private hideTooltip(): void {
    this.tooltipBg.setVisible(false);
    this.tooltipText.setVisible(false);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private buildMilitaryFilters(): void {
    const snaps = this.statsData.snapshots;
    const last = snaps[snaps.length - 1];
    const types = new Set<string>();
    if (last) {
      Object.keys(last.playerUnitByType).forEach(t => types.add(t));
      Object.keys(last.aiUnitByType).forEach(t => types.add(t));
    }
    this.militaryFilters = [
      { key: 'all', label: 'ALL' },
      ...[...types].map(t => ({ key: t, label: t.replace(/_/g, ' ').toUpperCase() })),
    ];
  }

  private addDynamic(obj: Phaser.GameObjects.GameObject): void {
    this.dynamicObjs.push(obj);
  }

  private clearDynamic(): void {
    for (const obj of this.dynamicObjs) obj.destroy();
    this.dynamicObjs = [];
  }
}
