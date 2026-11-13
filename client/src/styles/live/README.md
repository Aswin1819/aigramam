# Live art styles — porting guide

The user picked six prototypes from the Style lab (`client/src/styles/protos/`) to become real,
selectable art styles for the whole village: **ps2, comic-art, flat-vector, cgi-motion, toy-brick,
explainer-3d**. A live style draws the *real* village: any number of projects (places) and sessions
(villagers), with a camera that pans/zooms. It is chosen in the top bar's world menu; the classic
Phaser world stays the default.

## Files
- `types.ts` — the contract: `LiveFrame`, `LiveVillager`, `LivePlace`, `ViewRect`, `LiveStyle`, `GROUND`, `SLOT_W`, `WORLD_H`. **Read it fully.**
- `sim.ts` — builds a `LiveFrame` from live sessions every animation frame (do not edit).
- `reference.ts` — a plain renderer showing how to use every field + `asVillagerFrame(v)` so the prototypes' `skeleton()`/`poseOf()` work on live villagers. **Read it.**
- `registry.ts` — lists the six styles and lazy-loads `./<file>.ts`, expecting a named export (do not edit):
  `ps2.ts → ps2Live`, `comicArt.ts → comicArtLive`, `flatVector.ts → flatVectorLive`,
  `cgiMotion.ts → cgiMotionLive`, `toyBrick.ts → toyBrickLive`, `explainer3d.ts → explainer3dLive`.
  Each currently holds a placeholder; **replace it** with the real port.
- Host: `client/src/world/StyledWorldView.tsx` (do not edit). It sets `ctx` so 1 unit = 1 world unit with the camera applied, and passes `view` (the visible world rect). It quantises `f.t` and only redraws at `fps` for choppy styles.

## What changes from the prototype
| Prototype (fixed demo) | Live |
|---|---|
| canvas exactly 640×360 | world is `f.worldW` × 360 (worldW ≥ 640, grows ~250/place); only `view` is visible, and it may be **wider than the world** or a zoomed-in part of it |
| one tea shop at `LAYOUT.shop` | `f.places[]`: one building per project at `place.building` (x, w, baseY, wallH, roofH, doorX), **project name on its sign**, `place.variant` (0–3) for variety, `place.urgent > 0` → subtle alert on the building |
| 3 fixed villagers | `f.villagers[]` (0…~30), already sorted back-to-front; statuses `working / approval / turn / idle / finished / error` with `v.color`; `v.urgent` (approval/question) gets the pulsing urgent treatment (`f.pulse`) |
| `labelAnchor(v)` | use **`v.labelX`, `v.labelY`** (top-centre, pre-laid-out so labels don't collide). Draw name + `v.label`. Keep labels compact (~26 units tall) |
| `LAYOUT.palms`, `farPalms`, `sign`, `lamps` | `f.palms`, `f.farPalms`, `f.sign`, `f.lamps` ({x0, dx, y, count, lit}) |
| `f.canoeX`, `f.pulse`, `f.drift` | same names |
| `f.progress` | gone: show `f.working / f.total` somewhere in the style's HUD/decoration if the prototype had a progress element, or drop it |
| — | new: `v.selected` (clearly highlight: ring/outline/spotlight + bring its label forward), `v.hovered` (lighter highlight), `v.alpha` (fade-in), `v.linked` (tiny link dot/badge optional), `v.helpers` (n running subagents: small companion/badge optional), `v.hair`, `f.reducedMotion` (skip big ambient motion), idle villagers look calm (e.g. sitting/standing, dimmer label), error villagers get a red mark |
| Bottom/side panels (comic second panel, HUDs) | must be drawn in **screen-fixed** positions relative to `view` (e.g. `view.x + 8, view.y + view.h - 80`) and scaled sensibly; they must not cover the centre of the scene. The Ai Gramam UI overlays the top ~70 px and the bottom ~60 px of the screen (top bar, session dock), so keep HUD elements out of those bands. |

## Rules
- Keep the prototype's look and motion — the user chose it from the prototype. Reuse its drawing code; generalise positions.
- Fill the whole `view` rect every frame (sky/ground/water extend infinitely left/right).
- **Performance**: up to ~30 villagers and ~12 places; target ≤ 6 ms per frame at 1600×900. Cull anything outside `view` (+ margin). Cache static scenery per place/tile in offscreen canvases (lazily, keyed by size/variant) — a full-world background cache can be huge, so tile it or cache per place. Never allocate big things per frame.
- 3D styles: project with the camera/ground plane mapped from world x and y as in the prototype; keep cost bounded (simplify geometry for distant/off-view items).
- No new dependencies, images, web fonts, CDNs. Original art only; no brand names/logos (toy-brick must never say "Lego").
- Edit only your own `client/src/styles/live/<file>.ts` (and optionally one helper `client/src/styles/live/<file>Kit.ts`). You may import from `../protos/*` and `../scene` read-only (do not edit prototypes — the Style lab keeps them).
- Don't touch the dev server (it hot-reloads), git state, or the Chrome browser tools.

## Verify
1. From the repository folder: `./node_modules/.bin/tsc --noEmit` (your file must be clean).
2. Screenshot the real app in headless Edge with the style forced by URL (`?art=<id>` sets it for that load) and demo data (`?demo`):
   ```
   S="$(mktemp -d)"; mkdir -p "$S/shots"   # any scratch folder
   "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --use-angle=swiftshader --user-data-dir="$S/edge-profile-<you>" --window-size=1600,900 --virtual-time-budget=9000 --screenshot="$S/shots/live-<id>.png" "http://localhost:4317/?demo&art=<id>"
   ```
   Also a narrow shot (`--window-size=1100,800`) and one live (no `?demo`) to see the real sessions. Check: whole view filled, every villager has a readable label, places show project names, urgent ones pulse, nothing broken (a failure shows "The … style failed to draw (…)").
3. Report: what you ported, anything simplified, screenshot paths.

## Places: `f.theme` (Kerala or Bengaluru)

The person picks a **place** (world) and an **art style** separately; the style draws the chosen
place in its own look. `f.theme` is `"kerala"` or `"bengaluru"` (unknown worlds → Kerala). The
layout is identical for both — only the setting changes. Keep the style's look, line work,
palette logic, labels, selection and motion exactly the same; swap the scenery:

| Kerala element (band / field) | Bengaluru equivalent |
|---|---|
| sky (warm/day per style) | the same style's sky; add soft clouds and 1–2 paper kites |
| far bank + far palms (`f.farPalms`, just above `GROUND.waterTop`) | a skyline of glass tech towers and apartment blocks (some with water tanks, 1–2 construction cranes), positions from `f.farPalms` (vary heights by `hash`) |
| backwater band (`GROUND.waterTop`–`waterBottom`) | a raised **metro viaduct** (deck + pillars + purple stripe) with park greenery behind |
| canoe at `f.canoeX` | a **metro train** (3–4 cars, lit windows at night/dark styles) gliding along the viaduct at `f.canoeX` (wider than the canoe is fine) |
| ground (`groundY`–`pathTop`) | footpath pavers / lawn, black-and-yellow kerb at the road edge |
| laterite path (`pathTop`–`pathBottom`) | an asphalt **road** with lane dashes and a zebra crossing near the sign; 2–4 **autos** (yellow-green, black top) and maybe a bus drifting along at their own speeds (deterministic from `f.t`), drawn behind villagers' feet |
| coconut palms (`f.palms`) | gulmohar / rain trees with red-orange blooms (same positions, same sway rules) |
| tea shop per place (`place.building`, `variant`) | city buildings per `variant`: 0 glass office, 1 darshini café (steel counter, steam), 2 co-working/brick loft, 3 kiosk/shop with awning — project name on a signboard as before |
| "AI GRAMAM" sign (`f.sign`) | same sign, as a green street sign or bus-stop style board |
| brass lamp row (`f.lamps`) | street lights / string lights or diyas lit the same way (`lit` count) |
| style-specific extras (comic caption, HUD text) | adjust wording where it names Kerala things, e.g. "MEANWHILE, IN BENGALURU…" |

Cache Bengaluru scenery separately from Kerala's (different cache keys), keep the same performance
rules, and never name real brands, companies or the real metro operator.

Verify both places: `?demo&art=<id>&world=bengaluru` and `?demo&art=<id>&world=kerala`
(`?world=` previews a place for one visit).
