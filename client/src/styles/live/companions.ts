/**
 * Subagent companions for the art styles: what each one is doing and where it
 * is, every frame. Errands (reading, searching, fetching) walk out, work at a
 * spot and walk back to hand over; busy ones work beside the villager; finished
 * ones hop and run off. Positions come from time and the subagent id, so they
 * are smooth and stable across frames without per-frame randomness.
 */
import type { SessionView, SubagentView } from "@shared/model";
import { hashString } from "@shared/placement";
import type { CompanionActivity, LiveCompanion } from "./types";

const ICON: Partial<Record<string, string>> = {
  read: "📜", search: "🔍", web: "🌐", write: "✏️", bash: "⚙️", tool: "⚙️",
  think: "💭", delegate: "💭", question: "❓", waiting: "❓", error: "❗",
};
const WALK_SPEED_CYCLES = 1.8;
const ARRIVE_S = 0.5;
const LEAVE_S = 1.4;

interface Track {
  bornT: number;
  /** Set when the subagent stopped running: it hops, then runs off. */
  goneT: number | null;
  slot: number;
  last: LiveCompanion | null;
  label: string;
}

const rand = (id: string, salt: number) => (hashString(`${id}~${salt}`) % 10000) / 10000;
const ease = (x: number) => x * x * (3 - 2 * x);
const short = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

export function activityOf(a: Pick<SubagentView, "status" | "action">): CompanionActivity {
  if (a.status === "error") return "error";
  if (a.status === "waiting") return "wait";
  const k = a.action?.kind ?? "think";
  if (k === "read" || k === "search" || k === "web") return "errand";
  if (k === "write" || k === "bash" || k === "tool") return "busy";
  if (k === "question" || k === "waiting") return "wait";
  if (k === "error") return "error";
  return "pace";
}

const running = (a: SubagentView) => a.status !== "finished";

export class CompanionTracker {
  private tracks = new Map<string, Track>();

  /**
   * Companions for one villager at time t (seconds). Call once per frame per session.
   * `bounds` is the world's walkable x range: errands turn back inward instead of leaving it.
   */
  frame(s: SessionView, parent: { x: number; y: number }, t: number, reduced: boolean, bounds = { min: -Infinity, max: Infinity }): LiveCompanion[] {
    const out: LiveCompanion[] = [];
    const live = new Set<string>();
    const usedSlots = new Set([...this.tracks.values()].filter((tr) => tr.goneT === null).map((tr) => tr.slot));
    for (const a of s.subagents) {
      const key = `${s.id}/${a.id}`;
      let tr = this.tracks.get(key);
      if (!running(a)) {
        if (tr && tr.goneT === null) tr.goneT = t; // it just finished: hop and leave
        continue;
      }
      live.add(key);
      if (!tr) {
        let slot = 0;
        while (usedSlots.has(slot)) slot++;
        usedSlots.add(slot);
        tr = { bornT: t, goneT: null, slot, last: null, label: "" };
        this.tracks.set(key, tr);
      }
      tr.label = short(`${a.agentType} · ${a.action?.label ?? (a.description || "Working")}`, 34);
      const c = place(a, tr, parent, t, reduced, bounds);
      tr.last = c;
      out.push(c);
    }
    // Leaving companions finish their exit, then are forgotten.
    for (const [key, tr] of this.tracks) {
      if (!key.startsWith(`${s.id}/`) || live.has(key)) continue;
      if (tr.goneT === null) tr.goneT = t;
      const k = (t - tr.goneT) / LEAVE_S;
      if (k >= 1 || !tr.last || reduced) {
        this.tracks.delete(key);
        continue;
      }
      const side = tr.slot % 2 === 0 ? 1 : -1;
      const hop = k < 0.3 ? Math.sin((k / 0.3) * Math.PI) : 0;
      const run = k < 0.3 ? 0 : ease((k - 0.3) / 0.7);
      out.push({
        ...tr.last,
        activity: "leaving",
        icon: "✨",
        x: tr.last.x + side * run * 70,
        facing: side as 1 | -1,
        moving: run > 0,
        phase: ((t * WALK_SPEED_CYCLES * 1.6) % 1 + 1) % 1,
        jump: hop * 0.6,
        alpha: tr.last.alpha * (1 - run),
        working: false,
        handover: 0,
      });
    }
    return out;
  }

  /** Forget companions of sessions that are gone. */
  prune(liveSessionIds: Set<string>) {
    for (const key of this.tracks.keys()) if (!liveSessionIds.has(key.slice(0, key.indexOf("/")))) this.tracks.delete(key);
  }
}

function place(a: SubagentView, tr: Track, parent: { x: number; y: number }, t: number, reduced: boolean, bounds: { min: number; max: number }): LiveCompanion {
  const id = a.id;
  const activity = activityOf(a);
  let side = tr.slot % 2 === 0 ? 1 : -1;
  const baseX = parent.x + side * (30 + Math.floor(tr.slot / 2) * 22);
  const y = parent.y + 6 + (tr.slot % 3) * 3;
  const age = t - tr.bornT;
  const alpha = Math.min(1, age / ARRIVE_S);
  // Arrival: a little pop.
  const pop = !reduced && age < 0.4 ? Math.sin((age / 0.4) * Math.PI) * 0.45 : 0;
  const walkPhase = (((t + rand(id, 1) * 3) * WALK_SPEED_CYCLES) % 1 + 1) % 1;
  const icon = ICON[activity === "wait" ? "waiting" : activity === "error" ? "error" : a.action?.kind ?? "think"] ?? "💭";
  const base: LiveCompanion = {
    id, label: tr.label, activity, icon, x: baseX, y, facing: (-side) as 1 | -1, moving: false, phase: 0,
    jump: pop, alpha, away: 0, handover: 0, working: false,
  };
  if (reduced) return { ...base, working: activity === "busy" || activity === "errand", jump: 0 };

  if (activity === "errand") {
    const web = a.action?.kind === "web";
    const dist = web ? 120 + rand(id, 2) * 40 : 70 + rand(id, 2) * 50;
    // Near the end of the world, run the errand the other way so it stays in view.
    const far = baseX + side * dist;
    if (far < bounds.min || far > bounds.max) side = -side;
    const period = web ? 9 : 7;
    const u = (((age / period + rand(id, 3)) % 1) + 1) % 1;
    if (u < 0.25) {
      const k = ease(u / 0.25);
      return { ...base, x: baseX + side * dist * k, facing: side as 1 | -1, moving: true, phase: walkPhase, away: k };
    }
    if (u < 0.6) return { ...base, x: baseX + side * dist, facing: (-side) as 1 | -1, working: true, away: 1, jump: pop + 0.06 * Math.abs(Math.sin(t * 5)) };
    if (u < 0.85) {
      const k = 1 - ease((u - 0.6) / 0.25);
      return { ...base, x: baseX + side * dist * k, facing: (-side) as 1 | -1, moving: true, phase: walkPhase, away: k };
    }
    const h = u < 0.93 ? 1 - (u - 0.85) / 0.08 : 0;
    return { ...base, handover: h };
  }
  if (activity === "busy") return { ...base, working: true, jump: pop + 0.1 * Math.abs(Math.sin((t + rand(id, 4)) * 6)) };
  if (activity === "pace") {
    const w = (t + rand(id, 5) * 6) * 0.9;
    const v = Math.cos(w);
    return { ...base, x: baseX + side * 12 * Math.sin(w), moving: Math.abs(v) > 0.25, facing: (v * side >= 0 ? 1 : -1) as 1 | -1, phase: walkPhase };
  }
  if (activity === "wait") return { ...base, facing: 1 };
  return base; // error: stands, the style shows the ❗
}
