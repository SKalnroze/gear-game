# UI Guidelines — Gear Game

Source of truth for building scenes and UI components.

---

## Layout System Overview

```
BEFORE (manual math):
  let y = 100;
  const g = this.add.graphics();
  NeonUI.drawPanel(g, px, py, panelW, 70, NEON.cyan);
  this.add.text(px + 14, py + 10, 'AUDIO', ...);
  y += 70 + 14;

AFTER (layout system):
  const stack = new VStack(LAYOUT.CONTENT_TOP, LAYOUT.GAP);
  const sectionH = neonSection(this, r => reg(r), h => handle(h),
    px, stack.peek(), panelW, 'AUDIO', NEON.cyan,
    (inner, ix) => {
      h(neonCheckbox(this, ix, inner.push(LAYOUT.CHECKBOX_H), 18, 'Sound', true, NEON.cyan, cb));
    });
  stack.push(sectionH, LAYOUT.GAP);
```

---

## LAYOUT Constants (`src/constants/ui.constants.ts`)

### Spacing
| Constant      | Value | Use case |
|---------------|-------|----------|
| `GAP_XS`      | 6     | Between tightly coupled elements (icon + label) |
| `GAP_SM`      | 10    | Between siblings in a group |
| `GAP`         | 14    | Default gap between components |
| `GAP_LG`      | 24    | Between major sections |
| `PAD`         | 14    | Inner padding from panel edge to content |
| `PAD_SM`      | 8     | Compact inner padding |

### Component Heights
| Constant        | Value | Component |
|-----------------|-------|-----------|
| `BTN_H`         | 36    | `neonBtn` |
| `INPUT_H`       | 30    | `neonTextInput`, `neonFilePicker` |
| `DROPDOWN_H`    | 36    | `neonDropdown` header |
| `CHECKBOX_H`    | 22    | `neonCheckbox` (includes label) |
| `TOGGLE_H`      | 20    | `neonToggle` pill |
| `RADIO_H`       | 28    | Per option in `neonRadioGroup` |
| `KEYBIND_H`     | 30    | `neonKeybindInput` |
| `LABEL_H`       | 18    | Section/field label line |
| `DIVIDER_H`     | 8     | `neonDividerH` with spacing |
| `SLIDER_H`      | 34    | `neonSlider` total hit area |
| `BADGE_H`       | 22    | `neonBadge` |
| `PROGRESS_H`    | 22    | `neonProgressBar` |
| `SPINNER_SIZE`  | 36    | `neonSpinner` diameter |
| `ALERT_H`       | 44    | `neonAlert` |

### Section Panel
| Constant            | Value | Use case |
|---------------------|-------|----------|
| `SECTION_TITLE_H`   | 32    | Height of title + divider row in `neonSection` |
| `SECTION_PAD_BOT`   | 12    | Bottom padding inside section panel |

### Font Sizes
| Constant       | Value | Use case |
|----------------|-------|----------|
| `FONT_TITLE`   | 20    | Page title |
| `FONT_SECTION` | 13    | Section header text |
| `FONT_BODY`    | 11    | Body text |
| `FONT_SMALL`   | 10    | Notes, hints |
| `FONT_LABEL`   | 11    | Field labels |

### Page Structure
| Constant       | Value | Use case |
|----------------|-------|----------|
| `PAGE_TITLE_Y` | 28    | Fixed page title Y |
| `CONTENT_TOP`  | 92    | Y where scrollable content starts |
| `BACK_BTN_X`   | 14    | Back button X |
| `BACK_BTN_Y`   | 8     | Back button Y |
| `BACK_BTN_W`   | 90    | Back button width |
| `BACK_BTN_H`   | 30    | Back button height |

---

## VStack / HStack (`src/ui/NeonStack.ts`)

### VStack — vertical layout cursor

```typescript
import { VStack } from '../ui/NeonStack';
import { LAYOUT } from '../constants/ui.constants';

const stack = new VStack(LAYOUT.CONTENT_TOP, LAYOUT.GAP);

// push(height) — returns top Y of slot, advances cursor by height + defaultGap
const btnY   = stack.push(LAYOUT.BTN_H);
const inputY = stack.push(LAYOUT.INPUT_H);

// push(height, customGap) — override gap for this slot
const labelY = stack.push(LAYOUT.LABEL_H, LAYOUT.GAP_XS);

// addGap — add extra space without placing a component
stack.addGap(LAYOUT.GAP_LG);

// peek() — read current Y without advancing
const currentTop = stack.peek();

// currentY — same as peek(), as a property
const y = stack.currentY;

// totalHeight — distance consumed from startY
const h = stack.totalHeight;
```

### HStack — horizontal layout cursor

```typescript
import { HStack } from '../ui/NeonStack';

const row = new HStack(startX, LAYOUT.GAP_SM);
const x1  = row.push(60);   // left X of first item
const x2  = row.push(100);  // left X of second item
```

---

## NeonSceneBase (`src/ui/NeonSceneBase.ts`)

Base class for all menu/settings/info scenes.

### Usage pattern

```typescript
import { NeonSceneBase } from '../ui/NeonSceneBase';
import { LAYOUT } from '../constants/ui.constants';
import { VStack } from '../ui/NeonStack';
import { neonSection } from '../ui/NeonCompose';

export class MyScene extends NeonSceneBase {
  constructor() { super({ key: 'MyScene' }); }

  create(): void {
    this.buildPage('MY SCENE', 'MenuScene'); // sets up bg, title, back btn, scroll hint

    const panelW = this.panelWidth(520);     // clamped to viewport
    const px     = this.panelX(panelW);      // centred left X
    const stack  = new VStack(LAYOUT.CONTENT_TOP, LAYOUT.GAP);

    // Register game objects with this.reg(), handles with this.h()
    this.reg(this.add.text(px, stack.push(LAYOUT.LABEL_H), 'Hello', {}));

    const sectionH = neonSection(this, r => this.reg(r), h => this.h(h),
      px, stack.peek(), panelW, 'MY SECTION', NEON.cyan,
      (inner, ix) => {
        this.h(neonCheckbox(this, ix, inner.push(LAYOUT.CHECKBOX_H), 18, 'Option', true, NEON.cyan, () => {}));
      });
    stack.push(sectionH, LAYOUT.GAP);

    this.enableScroll(stack.currentY); // wire mouse-wheel scrolling
  }
}
```

### Computed layout helpers
- `this.cx` — horizontal center of viewport
- `this.panelWidth(max?, margin?)` — `Math.min(max, width - margin)`
- `this.panelX(w)` — left X of a centred panel

### Lifecycle helpers
- `this.reg(gameObject)` — register for cleanup, returns object
- `this.h(handle)` — register `{ destroy() }` for cleanup, returns handle
- `this.clearScene()` — destroy all registered objects/handles

---

## Composite Builders (`src/ui/NeonCompose.ts`)

### `neonSection` — auto-height titled panel

```typescript
import { neonSection } from '../ui/NeonCompose';

// Returns panelH (total height consumed)
const panelH = neonSection(
  scene,
  r => this.reg(r),     // reg callback
  h => this.h(h),       // handle callback
  px, y, panelW,        // position and width
  'SECTION TITLE',      // title text
  NEON.cyan,            // neon color
  (inner, ix, iw) => {  // content builder
    // Place components using inner.push(LAYOUT.COMPONENT_H)
    this.h(neonCheckbox(scene, ix, inner.push(LAYOUT.CHECKBOX_H), 18, 'Label', true, NEON.cyan, cb));
    this.h(neonToggle(scene, ix, inner.push(LAYOUT.TOGGLE_H), 54, 20, true, NEON.green, cb));
  }
);
stack.push(panelH, LAYOUT.GAP);
```

### `neonLabelRow` — inline section label

```typescript
import { neonLabelRow } from '../ui/NeonCompose';

neonLabelRow(scene, r => reg(r), ix, stack, 'CHOOSE OPTION');
// Advances stack by LABEL_H + GAP_XS
```

### `neonFormRow` — label + control inline

```typescript
import { neonFormRow } from '../ui/NeonCompose';

neonFormRow(scene, r => reg(r), h => handle(h),
  ix, iw, inner,
  'Game speed', NEON.orange,
  (controlX, controlY, controlW) => {
    this.h(neonSlider(scene, controlX, controlY + 4, controlW,
      0.5, 2.0, 1.0, NEON.orange, NEON_STR.orange, cb));
  });
```

### `neonButtonRow` — evenly-spaced button row

```typescript
import { neonButtonRow } from '../ui/NeonCompose';

neonButtonRow(scene, h => handle(h),
  ix, iw, inner,
  NEON.orange, NEON_STR.orange,
  [{ key: '0.5x', label: '0.5x' }, { key: '1x', label: '1x' }, { key: '2x', label: '2x' }],
  activeKey,
  (key) => setSpeed(key));
// Advances stack by BTN_H + defaultGap
```

---

## Component Catalogue

All components return a handle `{ destroy(), getValue?(), setValue?(), ... }`.

### `src/ui/NeonRex.ts`
| Function | Signature | Height |
|----------|-----------|--------|
| `neonBtn` | `(scene, x, y, w, h, color, colorStr, text, fontSize, onClick)` | any |
| `neonDropdown` | `(scene, x, y, w, options, initialKey, onChange)` | `DROPDOWN_H` |
| `neonSlider` | `(scene, x, y, w, min, max, value, color, colorStr, onChange)` | `SLIDER_H` |
| `neonTextInput` | `(scene, x, y, w, placeholder, initialValue, onChange)` | `INPUT_H` |
| `neonColorPicker` | `(scene, x, y, initialColor, onChange)` | varies |
| `neonTwoSlider` | `(scene, x, y, w, min, max, lo, hi, color, colorStr, onChange)` | `SLIDER_H` |

### `src/ui/NeonForm.ts`
| Function | Height |
|----------|--------|
| `neonCheckbox` | `CHECKBOX_H` |
| `neonToggle` | `TOGGLE_H` |
| `neonRadioGroup` | `RADIO_H * n` |
| `neonTextarea` | custom |
| `neonKeybindInput` | `KEYBIND_H` |
| `neonIconBtn` | `BTN_H` |
| `neonBtnGroup` | `BTN_H` |
| `neonFilePicker` | `INPUT_H` |
| `neonFormGroup` | wraps any |
| `neonValidationMsg` | `LABEL_H` |
| `neonDisabledOverlay` | n/a |

### `src/ui/NeonLayout.ts`
| Function | Notes |
|----------|-------|
| `neonTitledPanel` | Panel with title, returns inner bounds |
| `neonCard` | Compact card panel |
| `neonTabs` | Tab bar + content area |
| `neonAccordion` | Collapsible sections |
| `neonScrollContainer` | Clipped scroll area |
| `neonToolbar` | Horizontal toolbar |
| `neonDividerH/V` | Divider line |
| `neonSplitPane` | Resizable two-pane |
| `neonResizablePanel` | Drag-resizable panel |
| `neonGridLayout` | Grid with auto-placement |
| `neonFlexRow/Column` | Flex-like layout |

### `src/ui/NeonFeedback.ts`
| Function | Height |
|----------|--------|
| `neonModal` | scene-level overlay |
| `neonToast` | transient notification |
| `neonProgressBar` | `PROGRESS_H` |
| `neonSpinner` | `SPINNER_SIZE` |
| `neonBadge` | `BADGE_H` |
| `neonAlert` | `ALERT_H` |
| `neonStatusMsg` | `LABEL_H` |

### `src/ui/NeonData.ts`
| Function | Notes |
|----------|-------|
| `neonTable` | Tabular data display |
| `neonList` | Scrollable list |
| `neonTreeView` | Hierarchical tree |
| `neonPropertyInspector` | Key-value inspector |
| `neonPagination` | Page navigation |
| `neonContextMenu` | Right-click menu |
| `neonDropdownMenu` | Dropdown menu |

### `src/ui/NeonGame.ts`
| Function | Notes |
|----------|-------|
| `neonHealthBar` | HP bar with label |
| `neonResourceBar` | Resource bar |
| `neonInventoryGrid` | Item grid |
| `neonItemSlot` | Single item slot |
| `neonSkillBar` | Skill/ability bar |
| `neonHotkeyBar` | Keybind display |
| `neonTimeline` | Event timeline |
| `neonCombatLog` | Scrolling combat log |

---

## Color Palette

```typescript
import { NEON, NEON_STR } from '../constants/ui.constants';

NEON.cyan     // 0x00ffcc  — primary UI, settings, info
NEON.magenta  // 0xff00aa  — danger, delete, alerts
NEON.green    // 0x44ff88  — success, enabled, AI/player positive
NEON.orange   // 0xff8800  — gameplay settings, warnings
NEON.red      // 0xff2244  — error, disabled
NEON.blue     // 0x4488ff  — controls, info panels
NEON.yellow   // 0xffcc00  — active/selected state
```

**When to use which color:**
- Cyan — default for most UI elements; settings headers
- Orange — gameplay/speed settings; warnings
- Green — enabled states; success feedback; showcase
- Red — disabled states; danger; error
- Yellow — currently selected/active toggle
- Magenta — secondary panels; edge scroll; destructive actions
- Blue — informational panels; controls/keybinds

---

## Depth Layer Conventions

| Layer | Depth | Used for |
|-------|-------|----------|
| World | 0     | Game world objects |
| HUD   | 100   | In-game HUD elements |
| Panels | 500  | Settings panels, tabs |
| Dropdowns | 600 | Rex dropdown lists |
| Dropdown BG | 599 | Dropdown outer panel |
| Modals | 9001 | Modal overlays |
| Toasts | 9002 | Toast notifications |

---

## Interactive Zone Rules

1. **Never nest interactive Phaser Containers inside other Containers** — hit-area bugs
2. **Place all interactive objects directly in scene space**
3. Use `zone.setInteractive({ cursor: 'pointer' })` for all clickable zones
4. Rex components (dropdowns, sliders) handle their own zones — don't add extra zones

---

## Scene Patterns

### Pattern 1: Settings/Config scene

```typescript
export class MySettingsScene extends NeonSceneBase {
  create(): void {
    this.buildPage('MY SETTINGS', 'MenuScene');
    const panelW = this.panelWidth(520);
    const px     = this.panelX(panelW);
    const stack  = new VStack(LAYOUT.CONTENT_TOP, LAYOUT.GAP);

    const h1 = neonSection(this, r => this.reg(r), h => this.h(h),
      px, stack.peek(), panelW, 'SECTION 1', NEON.cyan, (inner, ix) => { /* ... */ });
    stack.push(h1, LAYOUT.GAP);

    const h2 = neonSection(this, r => this.reg(r), h => this.h(h),
      px, stack.peek(), panelW, 'SECTION 2', NEON.orange, (inner, ix) => { /* ... */ });
    stack.push(h2, LAYOUT.GAP);

    this.enableScroll(stack.currentY);
  }
}
```

### Pattern 2: Menu scene (no scroll)

```typescript
export class MyMenuScene extends Phaser.Scene {
  create(): void {
    const { width, height } = this.scale;
    const cx = width / 2, cy = height / 2;

    // Background, title, subtitle
    // Center button stack using HStack/VStack from center
    const stack = new VStack(cy - totalH / 2, LAYOUT.GAP);
    BUTTONS.forEach(btn => {
      const y = stack.push(LAYOUT.BTN_H);
      neonBtn(this, cx - btnW / 2, y, btnW, LAYOUT.BTN_H, ...);
    });
  }
}
```

### Pattern 3: Scrollable content only (no NeonSceneBase)

```typescript
// If you need custom back nav or title, skip NeonSceneBase
// and use VStack + enableScroll manually:
const stack = new VStack(startY, LAYOUT.GAP);
// ... add content ...
// Wire scroll:
this.input.on('wheel', (_p, _o, _dx, dy) => {
  camY = Phaser.Math.Clamp(camY + dy * 0.8, 0, Math.max(0, totalH - height));
  this.cameras.main.setScroll(0, camY);
});
```

---

## Do's and Don'ts

### Do
- Use `VStack.push(LAYOUT.COMPONENT_H)` for all Y positions
- Use `neonSection` for any group of related settings
- Register all game objects with `reg()` and all handles with `h()`
- Use `LAYOUT.PAD` for inner content offset from panel edges
- Use `NEON.*` constants — never hardcode hex colors

### Don't
- Don't hardcode Y offsets (`let y = 100; y += 70 + 14`)
- Don't create new components when existing ones suffice (41+ components exist)
- Don't nest interactive containers inside other containers
- Don't use `panelH` magic numbers — let `neonSection` compute height from content
- Don't skip `npx tsc --noEmit` after UI changes

---

## Build & Validation

After any UI changes:

```bash
npx tsc --noEmit   # must pass clean — fix errors before reporting done
```

Open the scene in-game and verify:
1. Visual appearance matches expectation
2. All interactive controls respond correctly
3. Scroll (if enabled) reaches all content
4. No old UI artifacts remain
5. Panel widths adjust when browser is resized
