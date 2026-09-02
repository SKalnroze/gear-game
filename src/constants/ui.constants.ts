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

/**
 * Canonical depth (z-order) layers used throughout all scenes.
 * Game world objects live in GameScene. UIScene has its own camera and
 * is always rendered on top of GameScene regardless of depth values.
 *
 * Within a single scene, always use these constants instead of magic numbers
 * so draw order is predictable and easy to reason about.
 */
export const UI_DEPTH = {
  // ── In-game HUD (UIScene) ────────────────────────────────────────────────
  HUD:         100,  // base health bars, minimap background
  HUD_PANEL:   200,  // sliding panel body
  HUD_OVERLAY: 400,  // menu/spectate buttons that must sit above the panel

  // ── Menu / info / settings scenes ────────────────────────────────────────
  BG:       0,   // background gradient fill
  PANEL:   10,   // panel / card backgrounds
  CONTENT: 20,   // text and icons inside panels
  CONTROL: 50,   // interactive controls (sliders, inputs, checkboxes)

  // ── Floating layers (shared by all scenes) ────────────────────────────────
  DROPDOWN:   600,  // dropdown lists — must clear HUD_PANEL and CONTROL
  MODAL_BG:   900,  // full-screen modal backdrop
  MODAL:      901,  // modal panel
  MODAL_BODY: 902,  // modal content (text, dividers)
  MODAL_BTN:  903,  // modal action buttons
  TOAST:     9002,  // toast notifications — always on top
} as const;

export const LAYOUT = {
  // ── Spacing ──────────────────────────────────────────────────────────
  GAP_XS:    6,    // between tightly coupled elements (e.g. icon + label)
  GAP_SM:   10,    // between siblings in a group
  GAP:      14,    // default gap between components
  GAP_LG:   24,    // between major sections
  PAD:      14,    // inner padding from panel edge to content
  PAD_SM:    8,    // compact inner padding

  // ── Canonical component heights (use in VStack.push()) ────────────────
  BTN_H:        36,   // neonBtn default height
  INPUT_H:      30,   // neonTextInput, neonFilePicker
  DROPDOWN_H:   36,   // neonDropdown header height
  CHECKBOX_H:   22,   // neonCheckbox (includes label)
  TOGGLE_H:     20,   // neonToggle pill height
  RADIO_H:      28,   // per option in neonRadioGroup
  KEYBIND_H:    30,   // neonKeybindInput
  LABEL_H:      18,   // section/field label line
  DIVIDER_H:     8,   // neonDividerH with spacing
  SLIDER_H:     34,   // neonSlider total hit area
  BADGE_H:      22,   // neonBadge
  PROGRESS_H:   22,   // neonProgressBar
  SPINNER_SIZE: 36,   // neonSpinner diameter
  ALERT_H:      44,   // neonAlert

  // ── Section panel ─────────────────────────────────────────────────────
  SECTION_TITLE_H:  32,   // title + divider row inside neonSection
  SECTION_PAD_BOT:  12,   // bottom padding inside a section panel

  // ── Font sizes ────────────────────────────────────────────────────────
  FONT_TITLE:   20,
  FONT_SECTION: 13,
  FONT_BODY:    11,
  FONT_SMALL:   10,
  FONT_LABEL:   11,

  // ── Page structure ────────────────────────────────────────────────────
  PAGE_TITLE_Y:  28,   // Y of the fixed page title text
  CONTENT_TOP:   92,   // Y where scrollable content starts
  BACK_BTN_X:    14,   // X of back button
  BACK_BTN_Y:     8,   // Y of back button
  BACK_BTN_W:    90,
  BACK_BTN_H:    30,
} as const;
