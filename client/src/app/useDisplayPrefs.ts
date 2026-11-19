import { useEffect, useCallback, useState } from "react";

export type TimeMode = "auto" | "dawn" | "day" | "dusk" | "night";
export const TIME_HOURS: Record<Exclude<TimeMode, "auto">, number> = { dawn: 6.4, day: 11, dusk: 18.3, night: 22 };

interface Prefs {
  reducedMotion: boolean;
  time: TimeMode;
  dockOpen: boolean;
  /** The village notice board (world view) open or folded. */
  boardOpen: boolean;
  /** The "how to read the village" guide was dismissed. */
  legendSeen: boolean;
  /** "classic" (the world pack, drawn by Phaser) or one of the art styles in styles/live/registry. */
  artStyle: string;
  /** Sound cues when a session needs you (approval, question) or finishes its turn. */
  sound: boolean;
  /** World: the village. Workspace: the Focus queue, projects, agents, terminals and history. */
  view: AppView;
  /** The Workspace page last opened. */
  workspacePage: WorkspacePage;
  /** Desktop notifications (approvals, questions, errors, your turn) while the tab is in the background. Off by default. */
  desktopNotify: boolean;
}

export type AppView = "world" | "workspace";
export type WorkspacePage = "overview" | "map" | "projects" | "agents" | "terminals" | "history";
const WORKSPACE_PAGES: WorkspacePage[] = ["overview", "map", "projects", "agents", "terminals", "history"];

const KEY = "ai-gramam.display";

function systemReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** True when the person picked "Reduce motion" in the app; otherwise the system setting is followed (and may change). */
function motionChosen(): boolean {
  try {
    return "reducedMotion" in JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return false;
  }
}

function load(): Prefs {
  const systemReduced = systemReducedMotion();
  const fallback: Prefs = { reducedMotion: !!systemReduced, time: "auto", dockOpen: true, boardOpen: true, legendSeen: false, artStyle: "classic", sound: true, view: "world", workspacePage: "overview", desktopNotify: false };
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
    if (patch.view !== undefined) dropUrlPreview("view");
    if (patch.workspacePage !== undefined) dropUrlPreview("page");
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try {
        // Save the motion setting only once chosen in the app, so until then the system setting keeps applying.
        const { reducedMotion, ...rest } = next;
        localStorage.setItem(KEY, JSON.stringify(patch.reducedMotion !== undefined || motionChosen() ? next : rest));
      } catch {}
      return next;
    });
  }, []);
  // Follow the system's reduce-motion setting while the person hasn't chosen one in the app.
  useEffect(() => {
    const mq = typeof window !== "undefined" ? window.matchMedia?.("(prefers-reduced-motion: reduce)") : undefined;
    if (!mq) return;
    const onChange = () => {
      if (!motionChosen()) setPrefs((p) => ({ ...p, reducedMotion: mq.matches }));
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  // "?time=night" (dawn/day/dusk/night) previews a time of day without changing the saved setting.
  const urlTime = typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("time") as TimeMode | null) : null;
  const time = urlTime && urlTime in TIME_HOURS ? urlTime : prefs.time;
  const hourOverride = time === "auto" ? null : TIME_HOURS[time as Exclude<TimeMode, "auto">];
  // "?art=<style id>" (or "classic") previews an art style for this load without saving it.
  const urlArt = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("art") : null;
  // "?view=workspace" (or "world") opens that view for this visit without saving it.
  const urlView = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("view") : null;
  // "?page=terminals" (a Workspace page) opens that page for this visit without saving it.
  const urlPage = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("page") : null;
  const shown = {
    ...prefs,
    ...(urlArt ? { artStyle: urlArt } : {}),
    ...(urlView === "world" || urlView === "workspace" ? { view: urlView as AppView } : {}),
    ...(urlPage && WORKSPACE_PAGES.includes(urlPage as WorkspacePage) ? { workspacePage: urlPage as WorkspacePage } : {}),
  };
  return { prefs: shown, update, hourOverride };
}
