/** Neon palette and layout breakpoints for the UI overhaul */

export const NEON = {
  cyan: 0x00ffcc,
  magenta: 0xff00aa,
  green: 0x44ff88,
  orange: 0xff8800,
  red: 0xff2244,
  blue: 0x4488ff,
  yellow: 0xffcc00,
} as const;

export const NEON_STR = {
  cyan: '#00ffcc',
  magenta: '#ff00aa',
  green: '#44ff88',
  orange: '#ff8800',
  red: '#ff2244',
  blue: '#4488ff',
  yellow: '#ffcc00',
} as const;

export const BG = {
  deep: 0x05050f,
  mid: 0x0a0a1a,
  panel: 0x0a0f1a,
} as const;

export const HUD_MIN_H = 160;
export const TOOLBAR_H = 36;

/** Breakpoint widths for responsive layout */
export const BP_SMALL = 800;
export const BP_MEDIUM = 1400;

/** Persistent game settings (loaded/saved to localStorage) */
function loadSettings(): {
  soundEnabled: boolean;
  gameSpeed: number;
  edgeScrollEnabled: boolean;
  edgeScrollSpeed: number;
  edgeScrollPercent: number;
} {
  try {
    const raw = localStorage.getItem('gear_game_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        soundEnabled: parsed.soundEnabled ?? true,
        gameSpeed: parsed.gameSpeed ?? 1,
        edgeScrollEnabled: parsed.edgeScrollEnabled ?? false,
        edgeScrollSpeed: parsed.edgeScrollSpeed ?? 300,
        edgeScrollPercent: parsed.edgeScrollPercent ?? 5,
      };
    }
  } catch { /* ignore */ }
  return { soundEnabled: true, gameSpeed: 1, edgeScrollEnabled: false, edgeScrollSpeed: 300, edgeScrollPercent: 5 };
}

export const GAME_SETTINGS = loadSettings();

export function saveSettings(): void {
  try {
    localStorage.setItem('gear_game_settings', JSON.stringify(GAME_SETTINGS));
  } catch { /* ignore */ }
}
