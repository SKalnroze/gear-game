/**
 * Visual/rendering magic numbers in one place.
 * Import from here instead of scattering literals across entity files.
 */

export const GEAR_VISUALS = {
  /** Tooth depth scaling factor (proportion of outerR) */
  TOOTH_DEPTH_FACTOR: 0.12,
  /** Minimum tooth depth in pixels */
  TOOTH_DEPTH_MIN: 3,
  /** Maximum tooth depth in pixels */
  TOOTH_DEPTH_MAX: 12,
  /** Spike tip radius for spiked gears */
  SPIKE_TIP_RADIUS: 3,
  /** Pixels beyond gear radius for spike tips */
  SPIKE_OFFSET: 6,
  /** HP bar height in pixels */
  HP_BAR_H: 4,
  /** Pixels below gear center-bottom to start HP bar */
  HP_BAR_OFFSET_Y: 4,
  /** Jam ring pulse period (ms) */
  JAM_PULSE_MS: 80,
  /** Friction ring pulse period (ms) */
  FRICTION_PULSE_MS: 300,
  /** Cooldown arc redraw throttle (ms) */
  COOLDOWN_THROTTLE_MS: 100,
  /** Owner ring radius factor (of innerR) */
  OWNER_RING_FACTOR: 0.85,
  /** Center hub radius factor (of outerR) */
  HUB_RADIUS_FACTOR: 0.15,
  /** Inner circle radius factor (of outerR) */
  INNER_RADIUS_FACTOR: 0.72,
} as const;

export const UNIT_VISUALS = {
  /** Base sprite radius for unit circles */
  SPRITE_RADIUS: 10,
  /** HP bar height for units */
  HP_BAR_H: 3,
  /** Pixels below unit for HP bar */
  HP_BAR_OFFSET_Y: 14,
} as const;
