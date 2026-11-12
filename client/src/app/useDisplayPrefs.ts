import { useCallback, useState } from "react";

export type TimeMode = "auto" | "dawn" | "day" | "dusk" | "night";
export const TIME_HOURS: Record<Exclude<TimeMode, "auto">, number> = { dawn: 6.4, day: 11, dusk: 18.3, night: 22 };

interface Prefs {
  reducedMotion: boolean;
  time: TimeMode;
  dockOpen: boolean;
}

const KEY = "ai-gramam.display";

function load(): Prefs {
  const systemReduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const fallback: Prefs = { reducedMotion: !!systemReduced, time: "auto", dockOpen: true };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return fallback;
  }
}

/** Per-browser display settings (motion, time of day, dock open/closed). */
export function useDisplayPrefs() {
  const [prefs, setPrefs] = useState<Prefs>(load);
  const update = useCallback((patch: Partial<Prefs>) => {
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
  return { prefs, update, hourOverride };
}
