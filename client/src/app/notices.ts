/**
 * The village notice board: a shortcut to the same attention groups the
 * Overview uses (attention.ts), pinned in the world. Pure; it only reorders
 * what the monitor already knows, so the board never says anything the
 * Workspace wouldn't.
 */
import type { ProjectView, SessionView } from "@shared/model";
import { attentionOf } from "./workspace/attention";
import { elapsed, statusText } from "@/lib/status";

export type NoticeTone = "urgent" | "error" | "wait" | "done";

export interface Notice {
  sessionId: string;
  title: string;
  project: string;
  /** One line: what it's waiting for or how it ended, from recorded data. */
  text: string;
}

export interface NoticeSection {
  id: "needsYou" | "errors" | "yourTurn" | "recentlyDone";
  title: string;
  tone: NoticeTone;
  items: Notice[];
  /** Items not shown because the section is full. */
  more: number;
}

export const NOTICES_PER_SECTION = 4;

export function noticesOf(sessions: SessionView[], projects: ProjectView[], now: number, perSection = NOTICES_PER_SECTION): NoticeSection[] {
  const a = attentionOf(sessions, now);
  const projectName = (s: SessionView) => projects.find((p) => p.id === s.projectId)?.name ?? (s.cwd.split(/[\\/]/).filter(Boolean).pop() || "Project");
  const notice = (s: SessionView, text: string): Notice => ({ sessionId: s.id, title: s.title, project: projectName(s), text });
  const sections: Array<Omit<NoticeSection, "items" | "more"> & { list: SessionView[]; text: (s: SessionView) => string }> = [
    {
      id: "needsYou",
      title: "Needs you",
      tone: "urgent",
      list: a.needsYou,
      text: (s) => {
        const ask = s.link?.approval;
        if (ask?.questions) return `Question: ${ask.label}`;
        if (ask) return `Approve? ${ask.label}`;
        return `${statusText(s)} for ${elapsed(s.statusSince, now)}`;
      },
    },
    { id: "errors", title: "Errors", tone: "error", list: a.errors, text: (s) => s.statusNote ?? s.action?.label ?? "Stopped with an error" },
    { id: "yourTurn", title: "Your turn", tone: "wait", list: a.yourTurn, text: (s) => `Waiting for your next message for ${elapsed(s.statusSince, now)}` },
    { id: "recentlyDone", title: "Recently done", tone: "done", list: a.recentlyDone, text: (s) => `${s.status === "finished" ? "Ended" : "Went idle"} ${elapsed(s.statusSince, now)} ago` },
  ];
  return sections
    .filter((x) => x.list.length > 0)
    .map(({ list, text, ...x }) => ({ ...x, items: list.slice(0, perSection).map((s) => notice(s, text(s))), more: Math.max(0, list.length - perSection) }));
}

/** How many notices need the person (shown on the closed board). */
export function urgentCount(sections: NoticeSection[]): number {
  return sections.filter((s) => s.id === "needsYou" || s.id === "errors").reduce((n, s) => n + s.items.length + s.more, 0);
}
