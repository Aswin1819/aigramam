import type { LiveStyle } from "./types";

/**
 * Art styles the village can be drawn in, besides the classic Kerala world
 * (Phaser + world packs). Chosen in the Style lab: 4, 5, 6, 8, 9, 10.
 * Each module is loaded on demand so unused styles cost nothing.
 */
export interface ArtStyleEntry {
  id: string;
  name: string;
  blurb: string;
  load: () => Promise<LiveStyle>;
}

export const ART_STYLES: ArtStyleEntry[] = [
  { id: "ps2", name: "PS2", blurb: "Early-2000s console 3D: low-poly, fog, wobbly polygons.", load: () => import("./ps2").then((m) => m.ps2Live) },
  { id: "comic-art", name: "Comic Art", blurb: "Comic page: halftone dots, thick ink, captions and speech bubbles.", load: () => import("./comicArt").then((m) => m.comicArtLive) },
  { id: "flat-vector", name: "Flat Vector", blurb: "Clean flat explainer illustration at dusk, soft light cones.", load: () => import("./flatVector").then((m) => m.flatVectorLive) },
  { id: "cgi-motion", name: "CGI Motion", blurb: "Cinematic CGI night: rim light, glowing floor rings, holo screens.", load: () => import("./cgiMotion").then((m) => m.cgiMotionLive) },
  { id: "toy-brick", name: "Toy Brick", blurb: "Plastic-brick world with stop-motion villagers.", load: () => import("./toyBrick").then((m) => m.toyBrickLive) },
  { id: "explainer-3d", name: "Explainer 3D", blurb: "Soft pastel 3D explainer look, bouncy rounded villagers.", load: () => import("./explainer3d").then((m) => m.explainer3dLive) },
];

/** "classic" = the Phaser Kerala world. */
export type ArtStyleId = "classic" | (typeof ART_STYLES)[number]["id"];
