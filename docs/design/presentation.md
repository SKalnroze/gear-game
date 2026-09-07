# Presentation

[← Game Design Document](../GAME_DESIGN.md)

Visual and audio design, and the reasoning behind both.

---

## Intent

The game is a machine simulation, so the presentation's job is to make **rotation legible**. A player must be able to tell at a glance which chains are turning, how fast, which are jammed, which are damaged, and which are about to fail — from a zoomed-out view of forty gears, without reading any text.

Two consequences shape everything below:

1. **Nothing is a bitmap.** Every visual is drawn procedurally with vector graphics. That is not an art-budget compromise — a gear with 37 teeth has to *have* 37 teeth, at any radius, because tooth count is the game's central number. Sprites cannot express that.
2. **Motion carries meaning.** A spinning gear, a pulsing jam ring, a cavalry trail — animation is the read-out, not decoration.

## Inspirations

| Source | What is borrowed |
|---|---|
| Factory and automation games (*Factorio*, *Zachtronics* puzzles) | The core pleasure: build a contraption, watch it run without you, feel responsible for its output |
| Mechanical watch movements | The visual vocabulary — meshing wheels, exposed mechanism, everything visible |
| Neon / synthwave interface art | The palette and the glow treatment; luminous strokes on near-black |
| Tower defence lane games | The base-attack structure — the part of the ancestry the design has otherwise moved away from. The lane itself is gone. |

---

## Visual language

### Palette

A near-black navy ground with thin luminous strokes. Seven accent colours carry consistent meaning:

| Colour | Used for |
|---|---|
| **Cyan** | Primary accent, friendly, gears tab, borders |
| **Green** | Confirm, start, motors, the lane |
| **Orange** | Research, tier 2, the opposing slot |
| **Red** | Hostile, danger, tier 3 |
| **Magenta** | Abilities |
| **Blue** | Information, pause, the friendly base |
| **Yellow** | Gold and cost, anything the player spends |

Friendly/hostile colouring follows **which side the human is on**, not the owner label — a flipped lobby must still show your own base as friendly.

### Typography

Monospace everywhere, at five sizes. No font is loaded; the stack is the system monospace. The signature treatment is a zero-offset same-colour text shadow with blur, which reads as bloom and ties the type to the neon strokes.

### Panels

A consistent idiom: two soft outer glow rectangles, a dark fill, then a crisp thin border. Hover raises the glow and thickens the border. This one primitive builds every panel, button and card in the game.

### Gears

The most information-dense object on screen. A gear communicates, simultaneously:

| Property | How it reads |
|---|---|
| **Tooth count** | Literally — the polygon has one tooth per tooth |
| **Size** | Radius, directly proportional to teeth |
| **Type** | Body colour, plus a 1–4 character label that counter-rotates so it stays upright |
| **Owner** | A coloured ring inside the body |
| **Rotation** | The whole gear turns; a white dot near the hub gives a speed cue at small sizes |
| **Damage** | Cracks in four tiers, radiating from the hub, seeded from the gear's id so a given gear always cracks identically — a stable identity, not noise |
| **Jam** | A pulsing red double ring, its speed and brightness scaled by `jamSeverity(jamStress)` — a light grind pulses slow and dim, a severe crush pulses fast and bright; the strongest alarm in the visual language, because a jam is a self-destructing state |
| **Friction** | An orange ring pulsing in proportion to load — how a slime puddle standing on a gear becomes visible |
| **Burnout** | The gear fades and gains a red cross |
| **Health** | A bar below the gear, shown only when damaged |
| **Move cooldown** | A grey wedge that unwinds |

The **spiked gear** breaks the house style deliberately: a rusted-iron palette with asymmetric handsaw teeth, metallic edge highlights and seeded rust streaks. It is the only gear that hurts things on contact, and it should look like it.

### Units

Each type has a distinct silhouette so a zoomed-out lane is readable as a composition of shapes rather than coloured dots:

| Type | Shape |
|---|---|
| Infantry | Circle with sword and shield |
| Cavalry | Triangle with a lance, pointing along travel |
| Artillery | Boxy body with an independently rotating barrel |
| Iron Guard | Square with armour plate and corner bolts |
| Crystal Sentinel | Hexagon |
| Aether Phantom | Translucent octagon with a glow ring |
| Crossbow | Circle with sword and shield (shares Infantry's generic silhouette) |
| Sentry Unit | Circle with sword and shield (shares Infantry's generic silhouette) |
| Slime | Squat wobbly blob with a glossy highlight |

Owner is a colour tint over the shape, with a small direction marker ahead of the body. Animation is used sparingly and always to signal state: cavalry draws a tapering trail *only while charging*, infantry sweeps an arc *on the attack frame*, phantoms pulse translucency with a per-unit phase so a group does not blink in unison.

---

## Audio

### Intent

Everything is **synthesised at runtime** — there are no audio files anywhere in the project. This follows the same reasoning as the vector art: the game's sounds are mechanical, and a synthesised sound can scale and vary with the mechanism, where a sample would repeat.

The soundscape has to survive a game where dozens of gears complete rotations continuously, so the design leans on short, dry, percussive cues for events and continuous, evolving texture for atmosphere.

### Sound effects

Built from three primitives — a frequency-swept oscillator, filtered noise, and a bell — combined per event.

| Family | Character |
|---|---|
| UI | Short, clean sine blips |
| Gear placement / meshing | Square-wave clicks and detuned beating tones — the sound of teeth engaging |
| Jam | Low grinding noise plus a buzz; deliberately unpleasant |
| Destruction / burnout | Noise body with a metallic ring and a descending spin-down |
| Capacitor burst | Bright discharge with an ascending zing |
| Units | Ten spawn and ten death variants, one per type, so an off-screen fight is legible by ear |
| Combat | Dry clashes, throttled so a large battle does not become a wall of noise |
| Victory / defeat | A rising major arpeggio and a falling diminished one |

Rapid-fire events are throttled per family — melee hits at 200 ms, artillery at 500 ms — which is what keeps a busy lane from saturating.

### Music

Three moods, each a set of independently-gained layers rather than a finished track:

| Mood | BPM | Character |
|---|---|---|
| **Menu** | 65 | Warm minor pad with a wandering arpeggio |
| **Build** | 72 | A filtered gear drone, an open harmonic pad and a mechanical breath — no rhythm at all |
| **Combat** | 80 | Tritone drone, trembling diminished pad, sub rumble |

**Transitions morph rather than cut.** The transport tempo ramps to the new mood while the old layers fade out and the new fade in, so the existing music literally speeds up into combat. Three speeds — quick, normal, slow — map to bar counts.

Combat mood triggers on genuine pressure: an enemy unit crossing the midpoint, or your gears or base taking damage. It decays back to build after 30 seconds of quiet. The player therefore hears the state of the match before they see it.

**Anti-monotony** is explicit, because a match can run a long time: note velocities jitter, a proportion of arpeggio notes are dropped outright, the melody index takes a weighted random walk instead of repeating, and the build and combat moods use continuous drones with filter sweeps at deliberately mutually-prime rates so the texture never audibly loops.

Layer gains are linear rather than decibel-based, specifically so a linear crossfade sums to constant loudness at the midpoint instead of dipping.
