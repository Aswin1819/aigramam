# Making a character pack

A **character** is who a session appears as in the village: a sprite sheet with a row per animation, plus a `pack.json` that describes it. Like worlds, characters are **data only** and are checked before use.

The built-in characters are the worked references: [`characters/mundu-hero/pack.json`](../characters/mundu-hero/pack.json) (Unni), `characters/shades-villain` (Shades) and `characters/chaya-sidekick` (Chaya Kutty). Their sheets are drawn in code by `scripts/art/characters.mjs` (run `node scripts/gen-art.mjs characters`).

The format is defined by the zod schema in [`shared/character.ts`](../shared/character.ts); if this guide and the schema ever disagree, the schema wins. For worlds, see [WORLDS.md](WORLDS.md).

## Where characters live

| | Folder |
|---|---|
| Built in | `characters\<id>\` in the app folder |
| Yours | `C:\Users\<you>\.ai-gramam\characters\<id>\` |

```
C:\Users\<you>\.ai-gramam\characters\my-hero\
  pack.json
  sprites.png
```

- The **folder name is the character id**: 1–40 lowercase letters, digits or `-`, and it must match `"id"` in `pack.json`.
- File paths are relative to the folder (no leading `/` or `\`, no `:`, no `..`, no part starting with `.`).
- Folders starting with `.` are ignored. If a built-in character and one of yours share an id, the built-in one wins and yours is listed as an error.
- Changes are picked up within a second or so (hot reload), no restart.

## pack.json fields

Fields marked "—" are required. Unknown fields are errors.

| Field | Type and limits | Default | Notes |
|---|---|---|---|
| `schemaVersion` | exactly `1` | — | |
| `id` | 1–40 lowercase letters, digits, `-` | — | Must equal the folder name. |
| `name` | text, 1–60 chars | — | Shown in the character picker. |
| `author` | text, 1–80 chars | — | |
| `license` | text, 1–60 chars | — | |
| `role` | `hero`, `villain`, `sidekick`, `other` | `other` | Shown as a tag in Settings → Characters. |
| `frame` | `{ width, height }` | — | Size of one frame in pixels, whole numbers 8–128 each. |
| `fps` | 1 to 30 | `8` | Default frames per second for every animation. |
| `scale` | 0.5 to 6 | `2` | How much the frames are enlarged in the world (pixels stay crisp). |
| `sheet` | file (PNG), 1–200 chars | — | The sprite sheet, e.g. `"sprites.png"`. |
| `animations` | map of animation → animation | — | `idle` and `walk` are required. |
| `sounds` | map of animation → sound file | `{}` | Checked, but not played yet (see below). |
| `lines` | file (`.json`) | none | Checked, but not used yet. |
| `palette` | `{ shirt, lower, skin, hair }`, each `#rrggbb` | none | Optional. Used by the art styles (below). |

### animations

Animation names: `idle`, `walk`, `read`, `write`, `bash`, `wait`, `celebrate`, `error`.

| Field | Type and limits | Default | Notes |
|---|---|---|---|
| `row` | whole number 0–15 | — | Which row of the sheet. |
| `frames` | whole number 1–16 | — | How many frames, from the left. |
| `loop` | true / false | `true` | `false` plays once and holds the last frame. |
| `fps` | 1 to 30 | the pack's `fps` | |

**Required:** `idle` and `walk`. Any other animation that's missing falls back to `idle`. Where each one is used:

- `walk`: walking in, moving between places and leaving.
- `idle`, `read`, `write`, `bash`, `wait`, `error`: chosen by the world's `scenes` for each session state (see [WORLDS.md → scenes](WORLDS.md#scenes-what-a-villager-does-in-each-state)). In the Kerala world: reading and searching → `read`, editing → `write`, commands and other tools → `bash`, waiting for you → `wait`.
- `celebrate`: plays for about 2 seconds after a turn finishes, and for the `done` scene.
- `error`: the sprite is also tinted grey.
- Subagent companions are the same character, smaller and tinted blue, playing `read` (or `idle`).

### palette (for art styles)

The art styles (PS2, Comic Art, …) draw their own villagers instead of using your sprite sheet. When a project has a character **chosen** for it, those villagers are dressed in the character's `palette`: `shirt`, `lower` (mundu/trousers), `skin`, `hair`. Without a palette, or for projects on "Automatic", each villager gets stable colours picked from the session id. Example from Unni:

```json
"palette": { "shirt": "#efe2c4", "lower": "#f6f2e6", "skin": "#a8673d", "hair": "#16110d" }
```

### sounds and lines

`sounds` (e.g. `{ "celebrate": "sounds/yay.ogg" }`) and `lines` (a `.json` file) are accepted and their files are checked, so packs can include them now, but the app doesn't play or show them yet. Sound cues currently come from the built-in chime.

## The sprite sheet

One PNG, a grid of equal frames:

- **One row per animation**, frames left to right, starting at the left edge. Row `n` starts `n × frame.height` px from the top.
- Every frame is `frame.width × frame.height`. Draw the character **facing right** with its **feet at the bottom centre** of the frame; it is mirrored when walking left.
- The sheet must be wide enough for the longest row (`frames × frame.width`) and tall enough for the lowest row (`(row + 1) × frame.height`). Rows can be shorter than the sheet; the unused cells are ignored.
- Make the sheet exactly as tall as its rows (highest `row` + 1 times `frame.height`): the small avatars in the dock and picker assume that.
- Transparent background.

The built-in characters use 32 × 48 frames at scale 2, eight rows (idle 4, walk 6, read 4, write 4, bash 6, wait 4, celebrate 6, error 4 frames) on a 256 × 384 sheet (8 columns, so some cells stay empty).

## Checks and limits

| Check | Limit |
|---|---|
| `pack.json` | must exist, valid JSON (BOM is fine), at most 256 KB |
| Sprite sheet | PNG only, at most **2 MB** and **2048 × 2048** px |
| Every animation | must fit in the sheet (row and frame count checked against its real size) |
| Sounds | `.ogg`, `.mp3` or `.wav`, at most 1 MB each |
| `lines` | `.json`, at most 256 KB |
| Whole folder | at most 30 MB and 500 files and folders; no symbolic links |

A pack that fails is skipped and listed in **Settings → Characters** with its messages (for example `animations.walk: 6 frames need 192px but the sheet is 128px wide`), and in the server console as `[Characters] …`. The other characters keep working; if no character can be drawn, a simple built-in figure stands in.

## Choosing a project's character

Open a villager's drawer → **Details** → **Character**. Pick a character, or **Automatic**.

- The choice is per **project**: every session in that project appears as that character, in every world and art style.
- It is saved in `C:\Users\<you>\.ai-gramam\characters.json` ([`server/characters/assignments.ts`](../server/characters/assignments.ts)) and shared by all open tabs.
- **Automatic** (or a chosen character that's no longer installed) uses the world's `defaultCharacters`, picking one per session by its id; if the world lists none that are installed, all installed characters are used.

## Installing from a .zip

**Settings → Characters → Install a character pack**: drop a `.zip` or choose one. The rules are the same as for worlds (see [WORLDS.md → Installing](WORLDS.md#installing-a-world-from-a-zip)), with `pack.json` as the manifest:

- `pack.json` at the top of the zip, or inside exactly one top-level folder.
- Zip ≤ 25 MB, ≤ 30 MB unzipped, ≤ 20 MB per file, ≤ 300 entries, paths ≤ 200 characters and 8 folders deep.
- Allowed types: `.json .png .webp .jpg .jpeg .ogg .mp3 .wav .txt .md`.
- Built-in ids (`mundu-hero`, `shades-villain`, `chaya-sidekick`) can't be replaced.
- Replacing your own pack asks first and moves the old one to `C:\Users\<you>\.ai-gramam\backups\character-<id>-<time>\`.

Or copy the folder into `C:\Users\<you>\.ai-gramam\characters\`.

## A minimal example

`sprites.png` is 192 × 192: four rows of 32 × 48 frames (idle 4, walk 6, wait 4, celebrate 6).

```json
{
  "schemaVersion": 1,
  "id": "my-hero",
  "name": "My Hero",
  "author": "Your Name",
  "license": "CC0-1.0",
  "role": "hero",
  "frame": { "width": 32, "height": 48 },
  "sheet": "sprites.png",
  "animations": {
    "idle": { "row": 0, "frames": 4 },
    "walk": { "row": 1, "frames": 6, "fps": 10 },
    "wait": { "row": 2, "frames": 4 },
    "celebrate": { "row": 3, "frames": 6, "loop": false }
  },
  "palette": { "shirt": "#2563eb", "lower": "#f4efe2", "skin": "#8a5a3c", "hair": "#1b1b1b" }
}
```

`fps` (8) and `scale` (2) use their defaults. `read`, `write`, `bash` and `error` fall back to `idle`.
