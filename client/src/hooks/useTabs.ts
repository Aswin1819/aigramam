import { useId, type KeyboardEvent } from "react";

/**
 * Accessible tabs (WAI-ARIA tabs pattern, automatic activation): ←/→ move
 * between tabs and select them, Home/End jump to the ends, and only the
 * selected tab is in the Tab order. Each tab is linked to the one panel it
 * controls. Spread `list` on the tablist, `tab(id)` on each tab button and
 * `panel` on the content.
 */
export function useTabs<T extends string>(ids: readonly T[], current: T, onChange: (id: T) => void) {
  const base = useId();
  const tabId = (id: T) => `${base}tab-${id}`;
  const panelId = `${base}panel`;

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const i = ids.indexOf(current);
    if (i < 0 || !ids.length) return;
    const next =
      e.key === "ArrowRight" ? ids[(i + 1) % ids.length] :
      e.key === "ArrowLeft" ? ids[(i - 1 + ids.length) % ids.length] :
      e.key === "Home" ? ids[0] :
      e.key === "End" ? ids[ids.length - 1] :
      undefined;
    if (next === undefined) return;
    e.preventDefault();
    onChange(next);
    document.getElementById(tabId(next))?.focus();
  };

  return {
    list: { role: "tablist" as const, onKeyDown },
    tab: (id: T) => ({
      id: tabId(id),
      role: "tab" as const,
      "aria-selected": id === current,
      "aria-controls": panelId,
      tabIndex: id === current ? 0 : -1,
    }),
    panel: { id: panelId, role: "tabpanel" as const, "aria-labelledby": tabId(current) },
  };
}
