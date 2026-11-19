import { useCallback, useEffect, useRef, useState } from "react";

/** Copy text to the clipboard; `copied` is true for a moment afterwards (for a tick icon). */
export function useCopy(ms = 1500): { copied: boolean; copy: (text: string) => Promise<void> } {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        return; // not allowed (e.g. no focus): leave the icon as it was
      }
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), ms);
    },
    [ms],
  );
  return { copied, copy };
}
