import { useCallback, useState } from "react";

export type TimeMode = "auto" | "dawn" | "day" | "dusk" | "night";
export const TIME_HOURS: Record<Exclude<TimeMode, "auto">, number> = { dawn: 6.4, day: 11, dusk: 18.3, night: 22 };

interface Prefs {
  reducedMotion: boolean;
  time: TimeMode;
  dockOpen: boolean;
  /** "classic" (the world pack, drawn by Phaser) or one of the art styles in styles/live/registry. */
  artStyle: string;
  /** Sound cues when a session needs you (approval, question) or finishes its turn. */
  sound: boolean;
  /** World: the village. Workspace: the Overview dashboard of projects and agents. */
  view: AppView;
}

export type AppView = "world" | "workspace";

const KEY = "ai-gramam.display";

function load(): Prefs {
  const systemReduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const fallback: Prefs = { reducedMotion: !!systemReduced, time: "auto", dockOpen: true, artStyle: "classic", sound: true, view: "world" };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return fallback;
  }
}

/** Remove a preview parameter (?art=, ?time=) from the address bar without reloading. */
function dropUrlPreview(name: string) {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(name)) return;
    url.searchParams.delete(name);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  } catch {}
}

/** Per-browser display settings (motion, time of day, dock open/closed). */
export function useDisplayPrefs() {
  const [prefs, setPrefs] = useState<Prefs>(load);
  const update = useCallback((patch: Partial<Prefs>) => {
    // A choice made in the app wins over a preview in the URL: drop that preview so the choice shows.
    if (patch.artStyle !== undefined) dropUrlPreview("art");
    if (patch.time !== undefined) dropUrlPreview("time");
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);
  // "?time=night" (dawn/day/dusk/night) previews a time of day without changing the saved setting.
  const urlTime = typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("time") as TimeMode | null) : null;
  const time = urlTime && urlTime in TIME_HOURS ? urlTime : prefs.time;
  const hourOverride = time === "auto" ? null : TIME_HOURS[time as Exclude<TimeMode, "auto">];
  // "?art=<style id>" (or "classic") previews an art style for this load without saving it.
  const urlArt = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("art") : null;
  const shown = urlArt ? { ...prefs, artStyle: urlArt } : prefs;
  return { prefs: shown, update, hourOverride };
}
