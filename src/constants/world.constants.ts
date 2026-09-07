/** World dimensions and zone boundaries for the pixel-based layout */

export const WORLD_WIDTH = 3600;
export const WORLD_HEIGHT = 1575;

// Edge scrolling
export const EDGE_SCROLL_MARGIN = 50;   // px from viewport edge to trigger scroll
export const EDGE_SCROLL_SPEED = 300;   // px/sec

/**
 * The playable band is the WHOLE arena.
 *
 * Units and gears used to share a corridor down the middle third, which meant
 * the top and bottom thirds were safe ground: a gear parked there could not be
 * reached by melee and could not be attacked at all. Anything you wanted
 * protected went in the dead zone, which is the opposite of a game about
 * building an exposed machine.
 *
 * There is no lane any more. Every gear is reachable, and the only cover is
 * distance and whatever you build in front of it.
 */
export const PLAY_Y_MIN = 0;
export const PLAY_Y_MAX = WORLD_HEIGHT;

/** Keeps a spawned unit's body clear of the arena edge. */
export const SPAWN_Y_MARGIN = 60;

// Zone boundaries.
//
// Free-placement zones stay the width they were; the arena got wider, so the
// no-man's-land between them grew from 880px to 1680px. Crossing it is now a
// real commitment for units and for any gear train that tries to creep across.
export const PLAYER_ZONE_MAX_X = 960;
export const AI_ZONE_MIN_X = WORLD_WIDTH - 960;

// Base walls
export const PLAYER_BASE_X = 20;                 // center x of player base wall
export const AI_BASE_X = WORLD_WIDTH - 20;       // center x of AI base wall
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
