import type { StyleProto } from "./types";
import { minimalLine } from "./protos/minimalLine";
import { pixelArt } from "./protos/pixelArt";
import { chalkboard } from "./protos/chalkboard";
import { glowSketch } from "./protos/glowSketch";
import { ps2 } from "./protos/ps2";
import { comicArt } from "./protos/comicArt";
import { flatVector } from "./protos/flatVector";
import { cgiMotion } from "./protos/cgiMotion";
import { toyBrick } from "./protos/toyBrick";
import { explainer3d } from "./protos/explainer3d";

/** All style prototypes, in the reel's order. Add new ones here. */
export const STYLES: StyleProto[] = [minimalLine, pixelArt, chalkboard, glowSketch, ps2, comicArt, flatVector, cgiMotion, toyBrick, explainer3d].sort((a, b) => a.n - b.n);
