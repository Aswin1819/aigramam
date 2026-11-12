/**
 * Time of day for the art styles. Each style is painted at one lighting
 * (its `lighting`); when the chosen time is later in the day than that,
 * the host multiplies a tint over the frame. Earlier times leave the style
 * as painted, so night styles keep their look by day.
 */
import type { Lighting } from "./types";

export type Phase = "dawn" | "day" | "dusk" | "night";

export function phaseAt(hour: number): Phase {
  const h = ((hour % 24) + 24) % 24;
  if (h < 5.5 || h >= 20) return "night";
  if (h < 8) return "dawn";
  if (h < 17) return "day";
  return "dusk";
}

/** Multiply colours: white leaves the frame unchanged, darker colours dim and tint it. */
const TINT: Record<Lighting, Partial<Record<Phase, string>>> = {
  day: { dawn: "#ffdcdc", dusk: "#ffc7a3", night: "#6d7cb8" },
  dusk: { night: "#8a93c8" },
  night: {},
};

/** The tint to multiply over a style painted at `lighting`, at `hour`; null for none. */
export function tintFor(lighting: Lighting, hour: number): string | null {
  return TINT[lighting][phaseAt(hour)] ?? null;
}
