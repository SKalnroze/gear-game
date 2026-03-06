/** World dimensions and zone boundaries for the pixel-based layout */

export const WORLD_WIDTH = 2800;
export const WORLD_HEIGHT = 1575;  // 16:9 ratio with WORLD_WIDTH (2800 × 9/16 = 1575)

// Edge scrolling
export const EDGE_SCROLL_MARGIN = 50;   // px from viewport edge to trigger scroll
export const EDGE_SCROLL_SPEED = 300;   // px/sec

// Lane band: middle vertical third of the arena (units and gears share this corridor)
// Arena divided into thirds vertically: top/lane/bottom = 525/525/525
export const LANE_Y_MIN = 525;           // WORLD_HEIGHT / 3
export const LANE_Y_MAX = 1050;          // WORLD_HEIGHT * 2/3
export const LANE_HEIGHT = LANE_Y_MAX - LANE_Y_MIN; // 525

// Zone boundaries
export const PLAYER_ZONE_MAX_X = 960;
export const AI_ZONE_MIN_X = 1840;

// Base walls
export const PLAYER_BASE_X = 20;    // center x of player base wall
export const AI_BASE_X = 2780;      // center x of AI base wall
export const BASE_WIDTH = 20;
export const BASE_HEIGHT = WORLD_HEIGHT;

// Snap threshold: px beyond meshing distance that triggers snap preview
export const SNAP_THRESHOLD = 40;

// HUD height below world (used as default/minimum)
export const HUD_HEIGHT = 220;

// UI Redesign: Canvas and Panel dimensions
export const CANVAS_WIDTH = 1400;
export const CANVAS_HEIGHT = 788;  // 16:9 ratio with CANVAS_WIDTH (1400 × 9/16 ≈ 788)
export const PANEL_COLLAPSED_H = 60;
export const PANEL_EXPANDED_H = 440;
export const PANEL_BODY_H = PANEL_EXPANDED_H - PANEL_COLLAPSED_H; // 380px scrollable area
