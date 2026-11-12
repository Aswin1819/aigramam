# Art styles

Besides the classic world (Phaser + a world pack, see [WORLDS.md](WORLDS.md)), the village can be drawn in an **art style**: a different look painted entirely in code on a Canvas 2D, showing the same live projects and sessions. Pick one in the top bar's world menu; the choice is remembered in this browser. Add `?art=<id>` to the address (e.g. `http://localhost:4317/?demo&art=comic-art`) to preview one for a single load, or `?art=classic` for the classic world.

Art styles don't use world packs. They do use your character choices: when a project has a character chosen, its villagers wear that character's `palette` colours (see [PACKS.md → palette](PACKS.md#palette-for-art-styles)).

## The Style lab

Open **http://localhost:4317/styles**. Every prototype draws the same fixed demo scene (a tea shop and three villagers on a 640 × 360 canvas), so looks can be compared side by side, starred and annotated (picks and notes stay in this browser and can be copied out). `?style=<id>` opens one large; `?t=<seconds>` freezes time for screenshots.

There are ten prototypes in `client/src/styles/protos/`, listed in `client/src/styles/registry.ts`: Minimal Line, Pixel Art, Chalkboard, Glow Sketch, PS2, Comic Art, Flat Vector, CGI Motion, Toy Brick and Explainer 3D.

## The six live styles

Six prototypes were chosen and ported to draw the real village with any number of places and villagers:

| id | Name | Look |
|---|---|---|
| `ps2` | PS2 | Early-2000s console 3D: low-poly, fog, wobbly polygons. |
| `comic-art` | Comic Art | Halftone dots, thick ink, captions and speech bubbles. |
| `flat-vector` | Flat Vector | Clean flat illustration at dusk, soft light cones. |
| `cgi-motion` | CGI Motion | Cinematic night: rim light, glowing floor rings, holo screens. |
| `toy-brick` | Toy Brick | Plastic-brick world with stop-motion villagers. |
| `explainer-3d` | Explainer 3D | Soft pastel 3D, bouncy rounded villagers. |

## How they plug in

All in `client/src/styles/live/`:

- **`types.ts`**: the contract. A style is a `LiveStyle`: `id`, `name`, `blurb`, optional `fps` (for choppy, stop-motion styles), `bg`, `lighting` (the time of day it's painted at: `day`, `dusk` or `night`) and `draw(ctx, frame, view)`.
- **`sim.ts`**: turns live sessions into a `LiveFrame` every animation frame: places (one building per project, with its name), villagers (positions, status, label text already laid out so labels don't overlap, colours), palms, the lamp row, the canoe and so on. Styles only draw it.
- **`registry.ts`**: `ART_STYLES`, the list shown in the menu. Each entry lazy-loads its module, so unused styles cost nothing.
- **`lighting.ts`**: time of day. If the chosen time is later than the style's `lighting` (e.g. night for a day-painted style), the host multiplies a tint over the frame.
- The host, `client/src/world/StyledWorldView.tsx`, owns the camera (pan, zoom), click-to-select and the tint. If a style fails to load, the app shows a message and falls back to the classic world.

The full porting contract (every frame field, the rules and the performance budget) is in **[`client/src/styles/live/README.md`](../client/src/styles/live/README.md)**, with `reference.ts` as a plain example renderer.

## Adding a new style

1. **Prototype it.** Add `client/src/styles/protos/<name>.ts` exporting a `StyleProto` (`client/src/styles/types.ts`) that draws the demo scene, and add it to `STYLES` in `client/src/styles/registry.ts`. Compare it in the Style lab.
2. **Port it.** Add `client/src/styles/live/<name>.ts` exporting a `LiveStyle` named `<name>Live`, following the live README (start from `reference.ts`; reuse the prototype's drawing code, but place things from the `LiveFrame` and fill the whole `view`).
3. **Register it.** Add an entry to `ART_STYLES` in `client/src/styles/live/registry.ts`: `{ id, name, blurb, load: () => import("./<name>").then((m) => m.<name>Live) }`.
4. **Check it.** `./node_modules/.bin/tsc --noEmit`, then open `http://localhost:4317/?demo&art=<id>` (and without `?demo` for real sessions) at a wide and a narrow window size.

Rules every style follows: drawn in code only (no image files, web fonts, CDNs or new dependencies), original art only (no brands or logos), every villager's state shown as text, urgent villagers clearly pulsing, and reduced motion respected (`frame.reducedMotion`).
