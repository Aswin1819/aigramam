import { describe, expect, it } from "vitest";
import type { SessionView } from "@shared/model";
import { byAttention, controlOf, isInbox, paletteMatches, plainStatus, step } from "./focus";

const NOW = 50_000_000;
const s = (id: string, over: Partial<SessionView> = {}): SessionView =>
  ({ id, shortId: id, projectId: "p", title: id, titleSource: "ai", cwd: "C:\\x", status: "working", startedAt: NOW - 1e6, lastActivityAt: NOW - 1000, statusSince: NOW - 30_000, hooksActive: false, source: "local", subagents: [], ...over }) as SessionView;

describe("plain status", () => {
  it("never repeats the headline in the detail", () => {
    const turn = plainStatus(s("t", { status: "waiting", waitingReason: "turn_end" }), NOW);
    expect(turn).toEqual({ tone: "turn", headline: "Your turn", detail: "Reply finished 30s ago" });
    const idle = plainStatus(s("i", { status: "idle" }), NOW);
    expect(idle.headline).toBe("Idle");
    expect(idle.detail).not.toMatch(/idle/i);
  });

  it("names the approval or question and says quiet sessions plainly", () => {
    const ask = s("a", { status: "waiting", waitingReason: "permission", link: { connected: true, queued: 0, approval: { id: "1", tool: "Bash", label: "npm publish", since: NOW } } });
    expect(plainStatus(ask, NOW)).toMatchObject({ tone: "urgent", headline: "Needs your approval" });
    expect(plainStatus(ask, NOW).detail).toMatch(/^npm publish/);
    const quiet = s("q", { lastActivityAt: NOW - 10 * 60_000, action: { kind: "bash", emoji: "", label: "Running npm run build", startedAt: NOW - 11 * 60_000 } });
    expect(plainStatus(quiet, NOW)).toMatchObject({ tone: "quiet", headline: "No recent activity" });
  });

  it("explains when a session can't be controlled", () => {
    expect(controlOf(s("x"), false)).toEqual({ canAct: false, why: expect.stringContaining("Watch only") });
    expect(controlOf(s("x", { link: { connected: true, queued: 0 } }), false)).toEqual({ canAct: true });
    expect(controlOf(s("x", { link: { connected: true, queued: 0 } }), true).canAct).toBe(false);
  });

  it("sorts by what needs the person and picks the inbox", () => {
    const list = [s("work"), s("idle", { status: "idle" }), s("turn", { status: "waiting", waitingReason: "turn_end" }), s("ask", { status: "waiting", waitingReason: "question" })];
    expect([...list].sort(byAttention(NOW)).map((x) => x.id)).toEqual(["ask", "turn", "work", "idle"]);
    expect(list.filter((x) => isInbox(x, NOW)).map((x) => x.id)).toEqual(["turn", "ask"]);
  });
});

describe("queue helpers", () => {
  it("steps through the queue and stops at the ends", () => {
    const q = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(step(q, "a", 1)).toBe("b");
    expect(step(q, "c", 1)).toBe("c");
    expect(step(q, "a", -1)).toBe("a");
    expect(step(q, "gone", 1)).toBe("a");
    expect(step([], null, 1)).toBeNull();
  });

  it("finds by every word, in name or folder", () => {
    const items = [{ label: "Fix login", sub: "kurippu" }, { label: "Add tests", sub: "aigramam" }];
    expect(paletteMatches(items, "fix kur").map((x) => x.label)).toEqual(["Fix login"]);
    expect(paletteMatches(items, "  ")).toHaveLength(2);
    expect(paletteMatches(items, "nothing")).toHaveLength(0);
  });
});
