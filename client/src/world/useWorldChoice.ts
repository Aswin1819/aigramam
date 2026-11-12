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
  const [chosenId, setChosenId] = useState<string | null>(readSaved);

  const choose = useCallback((id: string) => {
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
    if (state && chosenId && worlds.some((w) => w.id === chosenId)) {
      try {
        localStorage.setItem(KEY, chosenId);
      } catch {}
    }
  }, [state, chosenId, worlds]);

  return { active, choose, fellBack, chosenId };
}
