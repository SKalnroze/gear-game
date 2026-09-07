# Views & flow

[← Game Design Document](../GAME_DESIGN.md)

Every screen the player sees, how they move between them, and what they can touch.

---

## Navigation

```
BootScene ──600ms──► MenuScene
                       ├── SINGLEPLAYER ─► LobbyScene ─► GameScene ║ UIScene   (parallel)
                       │                      ▲               │
                       │                      └─ PLAY AGAIN ──┤
                       │                                      ▼
                       │                              GameOverScene ─► MenuScene
                       ├── MULTIPLAYER  (disabled — "Coming Soon")
                       ├── SETTINGS ─► SettingsScene ─┬─► UIShowcaseScene
                       │                              └─► AudioShowcaseScene
                       └── ABOUT ─► AboutScene

UIScene "MENU" ─► stops GameScene, returns to MenuScene
```

`GameScene` and `UIScene` run **in parallel**, which is the one structural thing to know about this game's UI: the world simulation and the HUD are separate scenes with separate cameras. The HUD camera never zooms, so panel and readouts stay crisp at any world zoom. GameScene hands UIScene its systems via a one-shot `systems_ready` event.

| Screen | Intent |
|---|---|
| **Boot** | Cover the first frame while Phaser initialises. Deliberately trivial. |
| **Menu** | Set tone before anything else — the rotating gears in the background are the game's thesis stated visually. |
| **Lobby** | Make the match's shape an explicit choice: who plays which side, and against what. |
| **Game** | The match. The only screen that matters. |
| **UI** | The HUD, kept out of the world so world zoom cannot affect legibility. |
| **Game over** | Explain *why* the match went that way, with time-series charts rather than a single verdict. |
| **Settings** | A small set of genuine preferences; no gameplay-altering options beyond game speed. |
| **About** | Credits. |
| **UI / Audio showcase** | Developer galleries for the component and sound libraries. Reached from Settings; not part of the player-facing flow. |

## Match modes

Derived from the two lobby slots rather than chosen from a list, so the mode is a consequence of an understandable choice:

| Slots | Mode | Behaviour |
|---|---|---|
| Human vs AI | **Normal** | The standard match. The human may sit on **either** side. |
| Human vs Human | **Practice** | Free economy for the opposing side, debug overlay on, an "AS ENEMY" toggle to build for the other side. A sandbox. |
| AI vs AI | **Spectate** | Player input disabled; a perspective toggle switches which side the read-only HUD reports on. |

---

## The in-match HUD

**Intent.** Show the state of the machine and the match without occluding the arena, and put every build action within one click. Play fills the whole arena vertically, so the HUD lives at the very top and the very bottom and keeps the middle clear.

| Element | Position | Shows |
|---|---|---|
| **Base health bars** | Top corners | Each side's base HP. The friendly bar is always the cool colour and the hostile one red (orange in colorblind mode), whichever side you are on. Flashes on damage. Shrinks below an 800px-wide viewport. |
| **Jam indicator** | Top-left, below the player health bar | Badge showing how many of the player's own gears are currently jammed; hidden at zero. Skipped in spectate. |
| **Minimap** | Bottom right, above the panel | The whole arena: zone shading, base markers, gears colour-coded by type, units by owner, and the current viewport rectangle. Jammed gears (any owner) get a pulsing ring. Click or drag to pan. |
| **Sliding panel** | Bottom, full width | The build interface. 60 px collapsed, 440 px expanded. |
| **Resource readout** | Panel tab bar, right | Gold, iron, crystal, aether, plus the current research and its percentage. Blocks shrink and hide the rate sub-text below an 800px-wide viewport. |
| **Toasts** | Top centre | Research completed, ability activated, gear destroyed, a severe gear jam on one of the player's own gears. Slide in, hold ~2 s, slide out. |
| **Tooltips** | Follows cursor | Detail on whatever is hovered. |
| **Floating text** | In world | Per-gear production results, damage numbers, burst notices. Rises and fades. |

`GameScene` listens for the panel's `ui:panel_height_changed` event to track where the HUD begins — a click below that line belongs to the panel, never the world. The panel auto-collapses when a gear drag starts, so you always have a clear view of where you are placing, and restores afterwards.

### GEARS tab

**Intent.** The primary build surface. Every gear type is visible at all times, including locked ones, so the player can see what the tech tree is *for* before researching it.

A **teeth selector** at the top sets the size for the next placement, stepping through the tooth counts research has unlocked. Changing it live-updates every card's price — reinforcing that size is a cost decision.

Cards show name, price, a miniature procedural gear glyph, and a type-coloured stripe. Locked cards are dimmed with a padlock and a tooltip naming the research that opens them. Clicking a card starts a drag; the panel collapses so you can place into the world.

### TECH tab

**Intent.** Show the whole tree at once, including what you cannot yet reach, so research feels like navigation rather than a menu.

A true radial tree, not a grid: prerequisite-chain depth is radius, so every node researchable right now — no prereqs, or all of them met — sits on one shared inner ring, and the tree fans outward as chains get longer. Angle is a thematic branch, finer than the tech data's own five columns, so a single resource's whole line always points one direction (Iron Mining, Iron Smelting and the Iron Guard Spawner all sit in the same wedge, even though the spawner is data-column "Units"). Elbow connectors — straight out to the child's ring, then an arc sweep to its angle — run from prerequisite to dependent, green when satisfied, grey when not, dashed for the tree's one cross-branch dependency (Super Amplifier's economy prereq). Hovering a card highlights every prerequisite it depends on. A tier stripe colours the card; in-progress nodes show a live progress fill.

Right mouse button drags to pan; the wheel zooms, centred on the cursor; a RECENTER button restores the default framing. A **queue sidebar** on the left, fixed regardless of pan/zoom, lists the node in progress and everything waiting, each cancellable for a full refund.

### ACTIONS tab

**Intent.** The one place a player acts directly. Deliberately sparse — see [pillar 1](../GAME_DESIGN.md#1-the-machine-is-the-strategy).

Three ability cards with cooldown bars, and below them a read-only list of which unit types are currently unlocked. Clicking a card calls `AbilitySystem.activate()` directly, so the cooldown bar reflects a real cooldown.

### Toolbar

| Control | Purpose |
|---|---|
| **$ SELL** | Toggle; clicking a friendly gear then sells it for half its cost. Also bound to `R`. |
| **⏸ PAUSE** | Stops the game clock. Simulation halts; camera and UI stay live. |
| **⚔ AS ENEMY** | Practice only. Places gears for the opposing side. |

---

## World interaction

| Input | Action |
|---|---|
| Click a gear card, then click the world | Place a gear (snaps to mesh) |
| Click a placed gear | Pick it up to reposition, subject to cooldown |
| `R` (rebindable) | Toggle sell mode |
| `ESC` (rebindable) | Cancel the current placement |
| Mouse wheel | Zoom, 0.1×–5× |
| Middle-drag or right-drag | Pan |
| Right-click while placing | Cancel rather than pan |
| `D` | Toggle the AI debug overlay |
| Minimap click/drag | Jump the camera |

Edge scrolling is available but **off by default** — it interferes with precise placement, which is the game's primary interaction.

The camera has no hard bounds; it is clamped only so at least one world pixel stays visible, which lets the player pull back far enough to see a whole machine at once.

---

## Settings

Persisted to `localStorage`. Most settings apply live via a `settings:changed` event; two exceptions are noted below.

| Setting | Default | Effect |
|---|---|---|
| Sound | On | Master gate for all SFX and music |
| Music volume | 0.7 | Slider, 0–1, applied live |
| SFX volume | 0.7 | Slider, 0–1, applied live |
| Game speed | 1× | 0.5× / 1× / 2× — scales the game clock, so simulation, research and income all move together |
| UI scale | 1× (Normal) | Small / Normal / Large / XL — restarts this scene to preview; other scenes and the next match pick it up next time they're built |
| Colorblind mode | Off | Swaps the hostile-side accent from red to orange across the HUD (health bars, base markers), applied live |
| Edge scrolling | Off | Camera pans when the pointer nears a screen edge |
| Edge scroll speed | 300 px/s | 150 / 300 / 600 |
| Edge scroll zone | 5% | 3% / 5% / 10% of viewport |
| Remove-mode key | `R` | Rebindable via the keybind picker in Controls |
| Cancel key | `ESC` | Rebindable via the keybind picker in Controls |

Ability cooldowns run on the same game clock as everything else, so they pause and scale with game speed like the rest of the simulation.

**Exceptions:** UI scale is read once at scene construction (see above), and a keybind change only takes effect on the next match — `GameScene` reads it once at scene creation. Neither is worth rebuilding a live scene or re-registering key listeners mid-match for.
