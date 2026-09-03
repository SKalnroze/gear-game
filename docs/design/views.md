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

**Intent.** Show the state of the machine and the match without occluding the arena, and put every build action within one click. The lane band runs through the vertical middle of the screen, so the HUD lives at the very top and the very bottom.

| Element | Position | Shows |
|---|---|---|
| **Base health bars** | Top corners | Each side's base HP. The friendly bar is always the cool colour and the hostile one red, whichever side you are on. Flashes on damage. |
| **Minimap** | Bottom right, above the panel | The whole arena: zone shading, base markers, gears colour-coded by type, units by owner, and the current viewport rectangle. Click or drag to pan. |
| **Sliding panel** | Bottom, full width | The build interface. 60 px collapsed, 440 px expanded. |
| **Resource readout** | Panel tab bar, right | Gold, iron, crystal, aether, plus the current research and its percentage. |
| **Toasts** | Top centre | Research completed, ability activated, gear destroyed. Slide in, hold ~2 s, slide out. |
| **Tooltips** | Follows cursor | Detail on whatever is hovered. |
| **Floating text** | In world | Per-gear production results, damage numbers, burst notices. Rises and fades. |

The panel exports its top edge as shared state so the world scene knows where the HUD begins — a click below that line belongs to the panel, never the world. The panel auto-collapses when a gear drag starts, so you always have a clear view of where you are placing, and restores afterwards.

### GEARS tab

**Intent.** The primary build surface. Every gear type is visible at all times, including locked ones, so the player can see what the tech tree is *for* before researching it.

A **teeth selector** at the top sets the size for the next placement, stepping through the tooth counts research has unlocked. Changing it live-updates every card's price — reinforcing that size is a cost decision.

Cards show name, price, a miniature procedural gear glyph, and a type-coloured stripe. Locked cards are dimmed with a padlock and a tooltip naming the research that opens them. Clicking a card starts a drag; the panel collapses so you can place into the world.

### TECH tab

**Intent.** Show the whole tree at once, including what you cannot yet reach, so research feels like navigation rather than a menu.

Five labelled columns of cards, sorted by tier, with elbow connectors drawn from prerequisite to dependent — green when satisfied, grey when not. Hovering a card highlights every prerequisite it depends on, which is how a player reads a path backwards from a goal. A tier stripe colours the card. In-progress nodes show a live progress fill.

A **queue sidebar** on the left lists the node in progress and everything waiting, each cancellable for a full refund.

### ACTIONS tab

**Intent.** The one place a player acts directly. Deliberately sparse — see [pillar 1](../GAME_DESIGN.md#1-the-machine-is-the-strategy).

Three ability cards with cooldown bars, and below them a read-only list of which unit types are currently unlocked.

> **⚠ DIVERGENCE** — The ability buttons emit an event straight onto the bus rather than going through `AbilitySystem` (`ActionsSection.ts:201`), so Gold Surge grants nothing and its cooldown bar is decorative. Its label reads "+50 power instantly" while the ability grants 30 gold. See the [tech tree chapter](tech-tree.md#abilities).

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
| `R` | Toggle sell mode |
| `ESC` | Cancel the current placement |
| Mouse wheel | Zoom, 0.1×–5× |
| Middle-drag or right-drag | Pan |
| Right-click while placing | Cancel rather than pan |
| `D` | Toggle the AI debug overlay |
| Minimap click/drag | Jump the camera |

Edge scrolling is available but **off by default** — it interferes with precise placement, which is the game's primary interaction.

The camera has no hard bounds; it is clamped only so at least one world pixel stays visible, which lets the player pull back far enough to see a whole machine at once.

---

## Settings

Persisted to `localStorage` and applied immediately.

| Setting | Default | Effect |
|---|---|---|
| Sound | On | Gates all SFX and music |
| Game speed | 1× | 0.5× / 1× / 2× — scales the game clock, so simulation, research and income all move together |
| Edge scrolling | Off | Camera pans when the pointer nears a screen edge |
| Edge scroll speed | 300 px/s | 150 / 300 / 600 |
| Edge scroll zone | 5% | 3% / 5% / 10% of viewport |

> **⚠ DIVERGENCE** — Ability cooldowns still read the wall clock rather than the game clock (`AbilitySystem.ts:45`), so they neither pause nor scale with game speed. The settings screen carries a note admitting this, which is a documented bug rather than a design decision.

Neither music nor SFX volume is exposed here — both are reachable only from the audio showcase, and that slider is not persisted.
