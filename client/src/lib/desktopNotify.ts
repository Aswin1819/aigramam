/**
 * Optional desktop notifications (the browser's Notification API, shown by
 * the operating system). Off unless the person turns them on in Settings and
 * the browser grants permission. Only sent while the Ai Gramam tab isn't in
 * front, so they never duplicate what's already on screen.
 */
export type NotifyPermission = "granted" | "denied" | "default" | "unsupported";

export function notifyPermission(): NotifyPermission {
  return typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported";
}

/** Ask the browser (must be called from a click). Resolves to the resulting permission. */
export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (notifyPermission() === "unsupported") return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return notifyPermission();
  }
}

/**
 * Show one notification. `tag` makes a newer one for the same thing replace
 * an older one; clicking it brings the tab forward and calls `onClick`.
 */
export function desktopNotify(title: string, body: string, tag: string, onClick?: () => void) {
  if (notifyPermission() !== "granted" || document.visibilityState === "visible") return;
  try {
    const n = new Notification(title, { body, tag, silent: true });
    n.onclick = () => {
      window.focus();
      onClick?.();
      n.close();
    };
  } catch {
    // Some browsers only allow notifications from a service worker; then there's simply none.
  }
}
