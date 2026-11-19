/**
 * Tells the person the moment a session newly needs them: a toast (approvals
 * can be answered right in it), a sound, and optionally a desktop
 * notification. Only real changes count: what is already open when the page
 * loads or the mode switches is the baseline, not news. Toasts for requests
 * answered elsewhere (here or in the terminal) are closed.
 */
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { SessionView } from "@shared/model";
import type { AppMode } from "@/hooks/useLiveSessions";
import { playChime } from "@/lib/chime";
import { desktopNotify } from "@/lib/desktopNotify";
import { isUrgent, statusText } from "@/lib/status";

export function useAttentionAlerts(
  sessions: SessionView[],
  mode: AppMode,
  select: (id: string) => void,
  decide: (approvalId: string, decision: "allow" | "deny") => void,
  opts: { sound: boolean; desktopNotify: boolean },
) {
  const seenUrgent = useRef<Set<string> | null>(null);
  const seenTurns = useRef<Set<string> | null>(null);
  const seenErrors = useRef<Set<string> | null>(null);
  const shownApprovals = useRef(new Set<string>());
  // After a mode switch (and on load) the first snapshot with sessions is a baseline: what is already
  // open then isn't "new", so it gets no toast, sound or notification.
  useEffect(() => {
    seenUrgent.current = seenTurns.current = seenErrors.current = null;
  }, [mode]);
  useEffect(() => {
    if (sessions.length === 0 && !seenUrgent.current) return;
    const urgentNow = new Set(sessions.filter(isUrgent).map((s) => `${s.id}:${s.statusSince}`));
    const turnsNow = new Set(sessions.filter((s) => s.status === "waiting" && s.waitingReason === "turn_end").map((s) => `${s.id}:${s.statusSince}`));
    const errorsNow = new Set(sessions.filter((s) => s.status === "error").map((s) => `${s.id}:${s.statusSince}`));
    const notify = (s: (typeof sessions)[number], body: string) => opts.desktopNotify && desktopNotify(s.title, body, `ai-gramam:${s.id}`, () => select(s.id));
    if (seenUrgent.current && mode === "live") {
      let urgentNew = false;
      for (const s of sessions.filter(isUrgent)) {
        if (seenUrgent.current.has(`${s.id}:${s.statusSince}`)) continue;
        urgentNew = true;
        const approval = s.link?.approval;
        // Approvals can be answered right in the toast; questions need the card in the chat.
        const quick = approval && !approval.questions ? approval : null;
        toast(`${s.title}`, {
          // One toast per request, so it can be closed once the request is answered anywhere.
          id: approval ? `approval:${approval.id}` : `urgent:${s.id}:${s.statusSince}`,
          description: approval?.questions ? `Asks: ${approval.label}` : `${statusText(s)}${s.action ? ` · ${s.action.label}` : ""}`,
          action: quick ? { label: "Approve", onClick: () => decide(quick.id, "allow") } : { label: approval?.questions ? "Answer" : "Show me", onClick: () => select(s.id) },
          cancel: quick ? { label: "Deny", onClick: () => decide(quick.id, "deny") } : undefined,
          duration: approval ? 45000 : 8000,
        });
        notify(s, approval?.questions ? `Asks: ${approval.label}` : `${statusText(s)}${s.action ? ` · ${s.action.label}` : ""}`);
      }
      const turnNew = !!seenTurns.current && [...turnsNow].some((k) => !seenTurns.current!.has(k));
      if (seenTurns.current) for (const s of sessions) if (turnsNow.has(`${s.id}:${s.statusSince}`) && !seenTurns.current.has(`${s.id}:${s.statusSince}`)) notify(s, "Finished its turn: your turn");
      if (seenErrors.current) for (const s of sessions) if (errorsNow.has(`${s.id}:${s.statusSince}`) && !seenErrors.current.has(`${s.id}:${s.statusSince}`)) notify(s, "Stopped with an error");
      if (opts.sound && urgentNew) playChime("urgent");
      else if (opts.sound && turnNew) playChime("soft");
    }
    seenTurns.current = turnsNow;
    seenErrors.current = errorsNow;
    // Close toasts for requests that were answered (here, in the terminal) or expired.
    const openApprovals = new Set(sessions.map((s) => s.link?.approval?.id).filter(Boolean));
    for (const id of shownApprovals.current) {
      if (!openApprovals.has(id)) {
        toast.dismiss(`approval:${id}`);
        shownApprovals.current.delete(id);
      }
    }
    for (const id of openApprovals) shownApprovals.current.add(id as string);
    seenUrgent.current = urgentNow;
  }, [sessions, mode, select, decide, opts.sound, opts.desktopNotify]);
}
