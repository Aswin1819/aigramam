import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard behaviour for a dialog: Esc closes it. For a modal (`trap`, the
 * default) Tab also stays inside it, focus moves into it on open (unless
 * something inside already has it, e.g. an autoFocus input) and goes back
 * where it was on close. A floating panel (`trap: false`) only gets Esc.
 */
export function useModal(ref: RefObject<HTMLElement | null>, onClose: () => void, { trap = true }: { trap?: boolean } = {}) {
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const el = ref.current;
    const before = document.activeElement as HTMLElement | null;
    if (trap && el && !el.contains(document.activeElement)) (el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (!el) return;
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        e.stopPropagation();
        close.current();
        return;
      }
      if (!trap || e.key !== "Tab") return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!el.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };
    // Capture phase, so the dialog's Esc wins over page-wide shortcuts.
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (trap && before?.isConnected) before.focus({ preventScroll: true });
    };
  }, [ref, trap]);
}
