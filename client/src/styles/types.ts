import type { SceneFrame } from "./scene";

/**
 * One style prototype. `draw` paints a whole frame of the shared scene onto
 * a context already scaled to the logical 640 × 360 canvas.
 *
 * Rules every prototype follows (they're the app's rules too):
 * - Draw only in code: no image files, web fonts, CDNs or new dependencies.
 * - Every villager's state is shown as text (its `label`), not only colour.
 * - Original art only: no logos, brands or real characters.
 */
export interface StyleProto {
  id: string;
  /** Number in the reel's list (1–10). */
  n: number;
  name: string;
  /** One line on the look and how it moves. */
  blurb: string;
  /** Choppy styles render at this many frames per second ("on twos" = 12). Omit for smooth. */
  fps?: number;
  /** Background of the card behind the canvas while loading. */
  bg: string;
  draw(ctx: CanvasRenderingContext2D, f: SceneFrame): void;
}
