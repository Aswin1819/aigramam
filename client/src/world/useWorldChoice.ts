import { useCallback, useEffect, useState } from "react";
import type { WorldInfo, WorldsState } from "@shared/world";

const KEY = "ai-gramam.world";

function readSaved(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/**
 * The world shown on screen. The choice is remembered in this browser; if the
 * saved world is missing or broken, the default world is used instead.
 */
export function useWorldChoice(state: WorldsState | null) {
  const [savedId, setChosenId] = useState<string | null>(readSaved);
  // "?world=<id>" previews a place for this visit without saving it.
  const [previewId, setPreviewId] = useState<string | null>(() => {
    try {
      return new URLSearchParams(window.location.search).get("world");
    } catch {
      return null;
    }
  });
  const chosenId = previewId ?? savedId;

  const choose = useCallback((id: string) => {
    setPreviewId(null);
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("world")) {
        url.searchParams.delete("world");
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      }
    } catch {}
    setChosenId(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {}
  }, []);

  const worlds = state?.worlds ?? [];
  const active: WorldInfo | null =
    worlds.find((w) => w.id === chosenId) ?? worlds.find((w) => w.id === state?.defaultId) ?? worlds[0] ?? null;
  const fellBack = !!chosenId && !!state && !worlds.some((w) => w.id === chosenId);

  // Keep the stored choice once the list has loaded and it exists again.
  useEffect(() => {
    if (state && savedId && worlds.some((w) => w.id === savedId)) {
      try {
        localStorage.setItem(KEY, savedId);
      } catch {}
    }
  }, [state, savedId, worlds]);

  return { active, choose, fellBack, chosenId };
}
