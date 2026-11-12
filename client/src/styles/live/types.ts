/**
 * Live art styles: the chosen style prototypes, generalised to draw the real
 * village (any number of projects and sessions) instead of the fixed 3-villager
 * demo scene. See ./README.md for the contract and porting guide.
 */

/** World height in logical units. World width grows with the number of places. */
export const WORLD_H = 360;
/** Ground line, path band and backwater, same as the prototypes. */
export const GROUND = { waterTop: 150, waterBottom: 196, groundY: 196, pathTop: 284, pathBottom: 344 } as const;
/** Width of one place's slot. */
export const SLOT_W = 250;
/** Empty margin before the first and after the last slot. */
export const MARGIN = 150;

/** Drawing statuses (session statuses plus the urgent split of "waiting"). */
export type LiveStatus = "working" | "approval" | "turn" | "idle" | "finished" | "error";

export const LIVE_STATUS_COLOR: Record<LiveStatus, string> = {
  working: "#5eead4",
  approval: "#ff5a4f",
  turn: "#f5b33d",
  idle: "#94a3b8",
  finished: "#a3e635",
  error: "#f87171",
};

export interface LivePlace {
  /** Project id. */
  id: string;
  /** Project name, shown on the building's sign. */
  name: string;
  /** Slot centre x and slot width (world units). */
  x: number;
  w: number;
  /** Building footprint: left x, width, base y (ground contact), wall height, roof height. */
  building: { x: number; w: number; baseY: number; wallH: number; roofH: number; doorX: number };
  /** 0..3, a stable per-project variant (roof colour, sign shape, props) so places differ. */
  variant: number;
  /** Sessions here, and how many need the person (approval/question). */
  sessions: number;
  urgent: number;
  /** The project open in the app (SimInput.selectedProjectId): styles may highlight it. */
  selected?: boolean;
}

/** What a subagent companion is doing, which decides how it moves and what it carries. */
export type CompanionActivity =
  | "errand" // read/search/web: walks out, works there, walks back and hands over
  | "busy" // write/bash/tool: works beside the parent (puffs, bobbing)
  | "pace" // think/delegate: paces a few steps beside the parent
  | "wait" // waiting/question: stands facing out with a "?"
  | "error"
  | "leaving"; // finished: hops once, then runs off fading out

export interface LiveCompanion {
  /** Subagent id. */
  id: string;
  /** e.g. "Explore · Reading auth.ts": always draw it (small) near the companion. */
  label: string;
  activity: CompanionActivity;
  /** A prop/icon for the activity: 📜 read, 🔍 search, 🌐 web, ✏️ write, ⚙️ bash/tool, 💭 think, ❓ wait, ❗ error, ✨ leaving. */
  icon: string;
  /** Feet position (world units), like a villager's. */
  x: number;
  y: number;
  facing: 1 | -1;
  moving: boolean;
  phase: number;
  jump: number;
  alpha: number;
  /** 0 at the parent's side, 1 at the far end of an errand: draw a tether that fades with distance. */
  away: number;
  /** 0..1 burst when an errand ends at the parent (hand-over sparkle), else 0. */
  handover: number;
  /** Working at the spot (an errand's middle, or busy): show the icon bobbing above. */
  working: boolean;
}

export interface LiveVillager {
  /** Session id. */
  id: string;
  projectId: string;
  /** Session title, shortened to ≤ 24 chars. */
  name: string;
  status: LiveStatus;
  /** Status colour (LIVE_STATUS_COLOR[status]). */
  color: string;
  /** Action/status text, e.g. "Editing auth.ts", "Needs approval · Bash". Always draw it. */
  label: string;
  /** True for approval/question: draw the label with an urgent, pulsing treatment. */
  urgent: boolean;
  /** Feet position (world units), facing, walk state (same meaning as the prototypes' VillagerFrame). */
  x: number;
  y: number;
  facing: 1 | -1;
  moving: boolean;
  phase: number;
  /** 0..1 hop height factor (finished villagers celebrate for a while). */
  jump: number;
  /** Where the label goes (top-centre), already laid out so labels don't overlap. */
  labelX: number;
  labelY: number;
  /** Identity colours, stable per session. */
  shirt: string;
  mundu: string;
  skin: string;
  hair: string;
  carry?: "laptop" | "glass";
  /** Linked to the Ai Gramam mod (can be messaged from the browser). */
  linked: boolean;
  /** Number of running subagents (kept for badges; draw `companions` for the figures). */
  helpers: number;
  /** The session's subagents as small figures doing their work around the villager (about 0.7× a villager's size). */
  companions: LiveCompanion[];
  selected: boolean;
  hovered: boolean;
  /** 0..1 fade for villagers walking in (0 = invisible). */
  alpha: number;
}

/**
 * Which place an art style draws: the chosen world's setting, in the style's own look.
 * - kerala: tea shops, coconut palms, the backwater with a canoe, a laterite path, brass lamps.
 * - bengaluru: offices/darshinis/kiosks, gulmohar and rain trees, the skyline with a metro
 *   viaduct and a train (in the water band), a road with autos (the path band), street lights.
 */
export type PlaceTheme = "kerala" | "bengaluru";

/** The setting for a world: its id or name decides; anything unknown is drawn as Kerala. */
export function placeThemeOf(world: { id: string; name?: string } | null | undefined): PlaceTheme {
  const key = `${world?.id ?? ""} ${world?.name ?? ""}`.toLowerCase();
  return /bengaluru|bangalore/.test(key) ? "bengaluru" : "kerala";
}

export interface LiveFrame {
  /** Seconds since the view started (quantised when the style sets fps). */
  t: number;
  /** The place being drawn (see PlaceTheme): same layout, different setting. */
  theme: PlaceTheme;
  /** World size (units). */
  worldW: number;
  worldH: number;
  places: LivePlace[];
  /** Villagers sorted back-to-front (by y): draw in this order. */
  villagers: LiveVillager[];
  /** Decorative palms (world x, base y, height, lean), placed between places. */
  palms: { x: number; baseY: number; h: number; lean: number }[];
  /** Far palms along the far bank (world x). */
  farPalms: number[];
  /** The village sign at the start of the world. */
  sign: { x: number; y: number; text: string };
  /** Brass lamp row near the end: one lamp per finished session today (lit), capped. */
  lamps: { x0: number; dx: number; y: number; count: number; lit: number };
  /** Canoe centre x on the backwater (wraps across worldW). */
  canoeX: number;
  /** 0..1 approval pulse, ~1.2 Hz. */
  pulse: number;
  /** Cloud/bird drift offset (units). */
  drift: number;
  /** Sessions at work right now / total. */
  working: number;
  total: number;
  reducedMotion: boolean;
}

export type Lighting = "day" | "dusk" | "night";

/** The part of the world on screen (world units). Fill at least this rect every frame. */
export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LiveStyle {
  /** Matches the prototype id (e.g. "flat-vector"). */
  id: string;
  name: string;
  /** One line for the picker. */
  blurb: string;
  /** Choppy styles: frames per second for time quantisation. Omit for smooth. */
  fps?: number;
  /** Page background behind the canvas (shown while loading / letterbox). */
  bg: string;
  /** The time of day the style is painted at; the host tints towards a later chosen time (dusk, night). */
  lighting: Lighting;
  /**
   * Draw one frame. ctx is already transformed so 1 unit = 1 world unit and
   * the camera is applied; `view` is the visible world rect.
   */
  draw(ctx: CanvasRenderingContext2D, f: LiveFrame, view: ViewRect): void;
}
