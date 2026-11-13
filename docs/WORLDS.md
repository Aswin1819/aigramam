# Making a world pack

A **world** is the place your villagers live in: a background, a set of locations where projects settle, animated scenery, a sky that follows the clock, weather, and a small celebration when a task finishes. A world is **data only**: one `world.json` plus PNG images (and optionally one sound). Effects and animations are picked from fixed lists, never code.

The built-in **Kerala Backwaters** world is the worked reference: [`worlds/kerala/world.json`](../worlds/kerala/world.json). Its art is generated in code by `scripts/art/kerala.mjs` (run `node scripts/gen-art.mjs worlds`), so you can see how every image was made.

The format is defined by the zod schema in [`shared/world.ts`](../shared/world.ts). This guide follows it field by field; if the two ever disagree, the schema wins.

## Where worlds live

| | Folder |
|---|---|
| Built in (ships with the app) | `worlds\<id>\` in the app folder |
| Yours | `C:\Users\<you>\.ai-gramam\worlds\<id>\` |

A world folder looks like this:

```
C:\Users\<you>\.ai-gramam\worlds\my-village\
  world.json
  assets\
    background.png
    shop.png
    palm.png
    glow.png
```

- The **folder name is the world id**. It must be 1–40 lowercase letters, digits or `-`, and it must match `"id"` in `world.json`.
- Image paths in `world.json` are relative to the folder, e.g. `"assets/palm.png"` (forward or back slashes both work). They may not start with `/` or `\`, contain `:` or `..`, or have a part starting with `.`.
- Folders whose name starts with `.` are ignored.
- If a built-in world and one of yours have the same id, the built-in one wins and yours is listed as an error.

## Hot reload

Ai Gramam watches both folders. Save a file and the world reloads within a second or so (a 3-second poll covers cases where file watching doesn't work). No restart, no page refresh. Choose the world in the top bar's world menu.

## Checks and limits

Every world is checked before it is used. A world that fails any check is skipped (the others still load) and its errors are listed.

| Check | Limit |
|---|---|
| `world.json` | must exist, be valid JSON (a UTF-8 BOM is fine), at most 256 KB |
| Referenced images | PNG only (`.png`), real PNG data, at most 4 MB and 4096 × 4096 px each |
| `completion.sound` | `.ogg`, `.mp3` or `.wav`, at most 1 MB |
| Whole folder | at most 30 MB and 500 files and folders; no symbolic links |
| Ids | `layers`, `locations` and `decor` ids must each be unique within their list |
| Every referenced file | must exist and be a regular file inside the folder |

Only files that `world.json` references are served to the browser. Anything else in the folder is ignored.

### Where errors show up

- **Settings → Worlds** lists every pack that couldn't load, with up to 20 readable messages each, for example `locations.2.x: is missing (expected number)` or `layers.0.image: file "assets/sky.png" not found`. The Settings tab shows a red count.
- The server console prints the same messages, prefixed `[Worlds]`.
- A broken world never breaks the app: the other worlds keep working.

## world.json fields

Types below: *id* = 1–40 lowercase letters, digits or `-`. *colour* = `#rrggbb` or `#rrggbbaa`. *coord* = a number from −10000 to 10000. *file* = a relative path, 1–200 characters. *hour* = 0 to 24 (decimals allowed, e.g. `18.5`). Fields marked "—" in the default column are required. Unknown fields are errors (every object is strict).

### Top level

| Field | Type and limits | Default | Notes |
|---|---|---|---|
| `schemaVersion` | exactly `1` | — | |
| `id` | id | — | Must equal the folder name. |
| `name` | text, 1–60 chars | — | Shown in the world menu. |
| `description` | text, up to 300 chars | none | |
| `author` | text, 1–80 chars | — | Shown with the world. |
| `license` | text, 1–60 chars | — | e.g. `CC0-1.0`, `CC-BY-4.0`. |
| `size` | `{ width, height }` | — | Whole pixels. `width` 320–4096, `height` 240–4096. |
| `palette` | object, see below | — | |
| `layers` | 1–12 layers | — | |
| `locations` | 1–32 locations | — | |
| `overflow` | object | none | Where extra projects go. |
| `decor` | 0–120 decor items | `[]` | |
| `lighting` | object | none | Without it the sky is a flat `palette.background` with no sun, moon or night. |
| `scenes` | map of scene → scene | `{}` | |
| `ambient` | 0–6 effects | `[]` | |
| `completion` | object | none | |
| `defaultCharacters` | 0–12 character ids | `[]` | |

### palette

All six are required colours.

| Field | Used for |
|---|---|
| `background` | Behind everything, and the whole sky when there's no `lighting`. |
| `accent` | Selection ring, highlight ring and the `glow` scene effect. |
| `waiting` | The pulsing ring under a session whose turn it is. |
| `urgent` | The pulsing ring under a session that needs an approval or answer. |
| `label`, `labelBg` | Required, but the HTML labels currently use the app's own colours. |

### layers

Big flat images: hills, water, ground. They are drawn in list order (first = furthest back), each with its top-left corner at `x`, `y`. The sky is drawn behind all layers, so leave the top of your first layer transparent where the sky should show.

| Field | Type and limits | Default | Notes |
|---|---|---|---|
| `id` | id | — | Unique among layers. |
| `image` | file (PNG) | — | |
| `x`, `y` | coord | `0` | Top-left corner. |
| `scrollX` | −500 to 500 | `0` | Pixels per second. Not 0 = the image repeats across the full world width and scrolls (positive moves it left). Good for water shimmer. |
| `alpha` | 0 to 1 | `1` | |

### locations: how projects find a place

Each **project** gets one location. The project id is hashed to pick a location, and if that one is taken it moves to the next free one. Once placed, a project **keeps its location while the page is open**, and for two minutes after its last session ends, so nobody walks across the village because another project started or stopped. When every location is taken, the remaining projects share the **overflow** area (below).

The project's name replaces `label` on the signboard, which also shows its counts ("1 needs you · 2 working") and the project's colour. In front of the location is the project's **plot** (see `plots` below): its villagers stand at the plot's stations, never outside it.

| Field | Type and limits | Default | Notes |
|---|---|---|---|
| `id` | id | — | Unique among locations. |
| `kind` | id | — | A free-form tag, e.g. `houseboat`, `temple`. |
| `label` | text, 1–40 chars | — | Sign text when no project is here. |
| `x`, `y` | coord | — | The standing spot (feet of the middle villager). |
| `prop` | file (PNG) | none | The building/boat drawn here, anchored bottom-centre. |
| `propScale` | 0.1 to 10 | `1` | |
| `propDy` | coord | `18` | How far below `y` the prop's bottom edge is (e.g. a hull below the deck). |
| `propAnim` | `none` or `bob` | `none` | `bob` moves the prop **and everyone standing on it** up and down. |
| `propAmp` | 0 to 40 | `2` | Bob height in pixels. |
| `propSpeed` | 0 to 5 | `0.25` | Bob cycles per second. |
| `signboard` | `{ dx, dy }` (coords) | `{ "dx": 0, "dy": -120 }` | Where the sign sits, relative to `x`, `y`. Both are required if you give `signboard`. It rises at most 230 px, so the name stays near its people. |
| `plot` | `{ w }` (100–600) | the room before the neighbours on the same row, up to 320 | Width of the yard in front, e.g. a houseboat's deck. |
| `slots` | whole number 1–12 | `4` | Kept for older worlds; plots and stations decide where villagers stand. |
| `spacing` | 20 to 400 | `70` | Kept for older worlds. |

Props, scene decor and characters are depth-sorted by their `y`, so things lower on screen draw in front.

### plots: each project's yard and stations

Every project's yard has the same stations, in the same order from left to right, so learning one place teaches them all ([`shared/stations.ts`](../shared/stations.ts)):

| Station | Where in the yard | Who stands there |
|---|---|---|
| `study` | left | reading or searching |
| `desk` | left of centre | writing code, delegating to a subagent |
| `works` | right of centre | running commands, tests, other tools |
| `gate` | right edge | fetching from the web; villagers also arrive and leave through the gate |
| `porch` | front centre, nearest you | waiting for your approval or answer |
| `bench` | front left | your turn, or resting |

A villager walks to a station only when its work changes: a new kind of work has to last 3 s before it moves, and it walks between work stations at most once every 6 s. Thinking and errors stay put; needing you goes to the porch or bench at once. Helpers (subagents) stay by their parent and only leave the yard, through the gate, to fetch from the web.

| Field | Type and limits | Default | Notes |
|---|---|---|---|
| `style` | `courtyard` or `forecourt` | `courtyard` | A swept courtyard with a palm-frond fence, or a paved forecourt with a painted kerb. |
| `props` | `{ study?, desk?, works?, gate?, porch?, bench? }` (PNG files) | none | One prop per station, shown while someone of that project works there. `desk` and `bench` draw under the villager (a mat, a seat); the others stand beside. |
| `propScale` | 0.1 to 10 | `1` | |

Each session also gets a small lamp at the front of its yard: lit = working, blinking red = needs your approval or answer, amber = your turn, dark red = error, out = resting.

### overflow

| Field | Type and limits | Default | Notes |
|---|---|---|---|
| `area` | `{ x, y, w, h }` | — | Required if `overflow` is given. `x`, `y` coords; `w`, `h` 10–4096. Projects are spread on a grid inside it. |
| `prop` | file (PNG) | none | Drawn for each overflow project (fades in and out). |
| `propScale` | 0.1 to 10 | `1` | |
| `label` | text, 1–40 chars | `"Camp"` | Sign text. |

With no `overflow`, the area is a band 30 %–70 % across the world, 85 %–95 % down, labelled "Camp". Overflow spots hold 3 villagers, 56 px apart.

### decor: animated scenery

Palms, clouds, boats, ducks, lamp glows. Each item is one image.

| Field | Type and limits | Default | Notes |
|---|---|---|---|
| `id` | id | — | Unique among decor. |
| `image` | file (PNG) | — | |
| `x`, `y` | coord | — | Position of the origin point. |
| `scale` | 0.05 to 10 | `1` | |
| `originX`, `originY` | 0 to 1 | `0.5`, `1` | The anchor and pivot (default: bottom centre, so palms sway from the trunk base). |
| `flipX` | true / false | `false` | Mirror the image. |
| `layer` | `sky`, `scene`, `front` | `scene` | See below. |
| `anim` | `none`, `sway`, `bob`, `drift`, `flicker`, `dip`, `pulse` | `none` | See below. |
| `amp` | 0 to 200 | `1` | Strength (meaning depends on `anim`). |
| `speed` | −400 to 400 | `1` | Cycles per second; for `drift`, pixels per second. |
| `phase` | 0 to 1000 | `0` | Offset in radians, so neighbours don't move in step. |
| `night` | `always`, `only`, `hide` | `always` | `only` fades in at night (lamps, glows); `hide` fades out at night. |
| `blend` | `normal`, `add` | `normal` | `add` = additive light: brightens what's below. |
| `alpha` | 0 to 1 | `1` | |

**Layers.** `sky` sits behind the scenery layers (clouds) and gets darker at night and in rain. `scene` is sorted with props and characters by `y`. `front` is drawn above the scene, under the night tint; but `front` items with `"blend": "add"` are drawn **above** the tint, so lamp glows really shine at night.

**Animations** (all stop when the person turns on reduced motion):

| `anim` | What it does | `amp` means |
|---|---|---|
| `sway` | Rocks back and forth around the origin. Rain makes the wind stronger. | degrees |
| `bob` | Moves up and down. | pixels |
| `drift` | Moves sideways at `speed` px/s and wraps around the world (negative = leftwards). Draw the art facing right: it is mirrored automatically when moving left. Items with `y` between 540 and 820 also bob gently, as if on water. | not used |
| `flicker` | Alpha flickers like a flame. | 0–1 (how deep) |
| `dip` | Tilts from 0 to `amp` degrees and back, like a lift net. | degrees |
| `pulse` | Grows and shrinks. | ×10 % (`1` = ±10 %) |

A typical night lamp glow (from Kerala):

```json
{ "id": "glow-temple", "image": "assets/glow_warm.png", "x": 1260, "y": 862, "scale": 2.2, "originY": 0.5,
  "layer": "front", "night": "only", "blend": "add", "anim": "flicker", "amp": 0.25, "speed": 2.5, "alpha": 0.8 }
```

### lighting: the sky by hour

| Field | Type and limits | Default | Notes |
|---|---|---|---|
| `mode` | `clock` or `fixed` | `clock` | `clock` follows this computer's local time. |
| `fixedHour` | hour | `10` | Used when `mode` is `fixed`. |
| `sky` | 2–24 stops `{ hour, top, bottom }` | — | Top and bottom colours of the sky gradient. |
| `tint` | 1–24 stops `{ hour, color, alpha }` | — | A colour laid over the whole world. `alpha` 0–0.9. |
| `sun` | true / false | `true` | Sun (6:00 → 18:00) and moon (18:00 → 6:00) arcs. |
| `stars` | true / false | `true` | Twinkle at night. |
| `nightFrom` | hour | `19` | Night starts (lamps, fireflies, stars). |
| `nightTo` | hour | `6` | Night ends. |

- Stops are sorted by hour and colours are blended in between. **Add a stop at hour 0 and one at hour 24** (usually the same colours): before the first stop the colours are extrapolated, and after the last one they stay fixed.
- The sky gradient fills the top 60 % of the world; the bottom colour continues below.
- Night fades in and out over about an hour around `nightFrom` and `nightTo`.
- Anyone can preview a time with `?time=dawn|day|dusk|night` or the time control in the top bar.
- The sun/moon arc and stars are placed for a world about 1080 px tall (stars in the top 470 px).

### scenes: what a villager does in each state

`scenes` maps a session's state to a character animation and an effect. Any scene you leave out uses `{ "anim": "idle", "fx": "none" }`.

How the state is chosen: waiting for an answer → `question`; waiting for an approval or its turn → `waiting`; finished → `done`; error → `error`; idle → `idle`; working → the current action: `read`, `search`, `write`, `bash`, `test` (a test command such as `vitest`, `pytest` or `npm test`; worlds without a `test` scene use `bash`), `web`, `delegate`, `tool` or `think` (`think` when there's no action). While a session works through quick tool calls, a villager keeps each activity pose for at least 1.5 s so the village stays calm; waiting, questions, errors and finishing show at once.

| Field | Type and limits | Default | Notes |
|---|---|---|---|
| `anim` | `idle`, `walk`, `read`, `write`, `bash`, `wait`, `celebrate`, `error` | `idle` | If the character doesn't have it, `idle` plays. |
| `fx` | `none`, `sparks`, `signal`, `bell`, `smoke`, `glow`, `steam` | `none` | See below. |
| `offsetX`, `offsetY` | coord | `0` | Shift the villager from its spot while in this state. |

Effects: `sparks` (hot particles at the hands), `signal` (radio rings by the head), `steam` (rising puffs, nice for thinking), `smoke` (dark puffs, nice for errors), `glow` (a soft `palette.accent` halo). `bell` adds nothing extra yet: waiting villagers always get the pulsing `waiting` / `urgent` ring. Walking villagers show no effect, and reduced motion turns effects off.

### ambient: weather and life

| Field | Type and limits | Default | Notes |
|---|---|---|---|
| `type` | `rain`, `birds`, `fireflies`, `lightning` | — | |
| `chancePerMinute` | 0 to 1 | `1` | `1` = always on. |
| `durationSec` | `[min, max]`, each 1–3600 | `[30, 90]` | How long a shower lasts (rain only). |
| `count` | whole number 1–400 | `80` | Amount. |
| `color` | colour | per type | |

- **rain**: once a minute, starts a shower with probability `chancePerMinute`, lasting a random time within `durationSec`. More `count` = heavier rain. Rain darkens the scene, dims the sky decor, and makes palms sway harder.
- **lightning**: flashes only during heavy rain. Higher `chancePerMinute` = more often (roughly every 20–60 s at `1`).
- **birds**: `count` birds fly across the upper sky by day, hidden at night and in heavy rain.
- **fireflies**: glow in the lower part of the world at night when it isn't raining. More `count` = more fireflies.

Rain and fireflies stop with reduced motion.

### completion: the "task finished" moment

Plays when a session finishes a turn or the whole session finishes. The villager also plays its `celebrate` animation for about 2 seconds.

| Field | Type and limits | Default | Notes |
|---|---|---|---|
| `effect` | `lamp-row`, `vehicle-pass`, `confetti` | — | |
| `params` | map of name (1–20 letters) → number or text (≤ 40 chars) | `{}` | |
| `sound` | file (`.ogg`/`.mp3`/`.wav`) | none | Checked and served, but not played yet. |

- **`lamp-row`**: a row of brass nilavilakku lamps lights up one by one in front of the villager, then fades after about 5 s. `params.count` sets the number of lamps (3–15, default 7).
- **`confetti`**: a burst of coloured confetti. `vehicle-pass` is accepted and currently shows the same burst.

### defaultCharacters

Up to 12 character ids (see [PACKS.md](PACKS.md)) that make up this world's cast. A session appears as the character the person chose for its project; otherwise it gets one from this list (picked by the session id, so it stays the same). Ids that aren't installed are skipped, and if none are left, every installed character is used.

## A minimal complete example

Folder `C:\Users\<you>\.ai-gramam\worlds\my-village\` with `assets\ground.png` (1280 × 720, transparent at the top so the sky shows), `assets\shop.png`, `assets\palm.png` and `assets\glow.png`:

```json
{
  "schemaVersion": 1,
  "id": "my-village",
  "name": "My Village",
  "description": "A small test world with two places, a palm and a night lamp.",
  "author": "Your Name",
  "license": "CC0-1.0",
  "size": { "width": 1280, "height": 720 },
  "palette": {
    "background": "#1d3b2a",
    "accent": "#e0b040",
    "label": "#fff8e7",
    "labelBg": "#14261ee6",
    "waiting": "#f59e0b",
    "urgent": "#ef4444"
  },
  "lighting": {
    "sky": [
      { "hour": 0, "top": "#070b1f", "bottom": "#18234a" },
      { "hour": 7, "top": "#3b6aa5", "bottom": "#f5b487" },
      { "hour": 12, "top": "#2c84d6", "bottom": "#d2effa" },
      { "hour": 18.5, "top": "#38387a", "bottom": "#f2865a" },
      { "hour": 21, "top": "#070b1f", "bottom": "#18234a" },
      { "hour": 24, "top": "#070b1f", "bottom": "#18234a" }
    ],
    "tint": [
      { "hour": 0, "color": "#0a1440", "alpha": 0.5 },
      { "hour": 8, "color": "#ffffff", "alpha": 0 },
      { "hour": 18, "color": "#ff7a40", "alpha": 0.15 },
      { "hour": 21, "color": "#0a1440", "alpha": 0.5 },
      { "hour": 24, "color": "#0a1440", "alpha": 0.5 }
    ]
  },
  "layers": [{ "id": "ground", "image": "assets/ground.png" }],
  "locations": [
    { "id": "shop", "kind": "tea-shop", "label": "Tea Shop", "x": 400, "y": 600, "prop": "assets/shop.png", "signboard": { "dx": 0, "dy": -200 } },
    { "id": "square", "kind": "square", "label": "Square", "x": 880, "y": 620 }
  ],
  "decor": [
    { "id": "palm", "image": "assets/palm.png", "x": 640, "y": 610, "anim": "sway", "amp": 2, "speed": 0.3 },
    { "id": "lamp-glow", "image": "assets/glow.png", "x": 400, "y": 520, "originY": 0.5, "layer": "front", "night": "only", "blend": "add", "anim": "flicker", "amp": 0.2, "speed": 2 }
  ],
  "scenes": {
    "write": { "anim": "write" },
    "bash": { "anim": "bash", "fx": "sparks" },
    "test": { "anim": "bash", "fx": "signal" },
    "think": { "anim": "idle", "fx": "steam" },
    "waiting": { "anim": "wait" },
    "question": { "anim": "wait" },
    "done": { "anim": "celebrate", "fx": "glow" },
    "error": { "anim": "error", "fx": "smoke" }
  },
  "ambient": [{ "type": "fireflies", "count": 30 }],
  "completion": { "effect": "lamp-row", "params": { "count": 5 } },
  "defaultCharacters": ["mundu-hero", "chaya-sidekick"]
}
```

## Installing a world from a .zip

**Settings → Worlds → Install a world pack**: drop a `.zip` or choose one. Nothing is written until the whole zip has been checked ([`server/packs/upload.ts`](../server/packs/upload.ts)):

- `world.json` must be at the top of the zip, or inside exactly one top-level folder (that folder is stripped).
- Zip at most **25 MB**; at most **30 MB** unzipped; at most **20 MB** per file; at most **300** entries; paths at most 200 characters and 8 folders deep.
- Allowed file types: `.json .png .webp .jpg .jpeg .ogg .mp3 .wav .txt .md` (anything else is refused). Images that `world.json` references must still be PNG.
- No absolute paths, no `..`, no names Windows can't create (`CON`, `NUL`, `a:b`, names ending in a dot or space), no two names that differ only by case. OS clutter (`__MACOSX`, `.DS_Store`, `Thumbs.db`, `desktop.ini`, dot files) is skipped silently.
- `world.json` is checked with the same schema, every file it names must be in the zip, and then the unpacked folder gets exactly the checks above.
- **Built-in worlds are protected**: a zip whose id matches a built-in world (e.g. `kerala`) is refused. Give your pack a different id.
- **Replacing**: if you already have a world with that id, you're asked first. On "Replace", the old folder is moved to `C:\Users\<you>\.ai-gramam\backups\world-<id>-<time>\` and the new one takes its place (if that fails, the old one is put back).

The new world appears through the normal hot reload. Uploads are accepted only from this computer.

Prefer folders? Copy the folder into `C:\Users\<you>\.ai-gramam\worlds\` instead; it's picked up the same way.

## Making the art

- Only original art ships, and every pack shows its author and license.
- The built-in placeholder art is drawn in code by `scripts/art/*.mjs` (`raster.mjs` holds the shared drawing helpers). `node scripts/gen-art.mjs` rebuilds everything; `node scripts/gen-art.mjs worlds` or `... characters` rebuilds one half. The output is deterministic and CC0.
- Kerala's scale is a good starting point: a 1920 × 1080 world, characters about 96 px tall (32 × 48 frames at scale 2).
