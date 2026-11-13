import { describe, expect, it } from "vitest";
import type { ProjectView, SessionView } from "@shared/model";
import { noticesOf, urgentCount } from "./notices";

const NOW = 10_000_000;
function s(id: string, over: Partial<SessionView>): SessionView {
  return {
    id,
    shortId: id,
    projectId: "p1",
    title: `Session ${id}`,
    titleSource: "ai",
    cwd: "C:\\work\\app",
    status: "working",
    startedAt: NOW - 600_000,
    lastActivityAt: NOW - 1000,
    statusSince: NOW - 60_000,
    hooksActive: false,
    source: "local",
    subagents: [],
    ...over,
  } as SessionView;
}
const projects = [{ id: "p1", name: "app" }] as ProjectView[];

describe("notice board", () => {
  it("pins the same groups as the Overview, most urgent first, with recorded details", () => {
    const sessions = [
      s("work", {}),
      s("ask", { status: "waiting", waitingReason: "question", link: { connected: true, queued: 0, approval: { id: "a", tool: "AskUserQuestion", label: "Which port?", since: NOW, questions: [] } } }),
      s("perm", { status: "waiting", waitingReason: "permission", link: { connected: true, queued: 0, approval: { id: "b", tool: "Bash", label: "rm -rf build", since: NOW } } }),
      s("err", { status: "error", statusNote: "The API returned an error." }),
      s("turn", { status: "waiting", waitingReason: "turn_end" }),
      s("done", { status: "finished", statusSince: NOW - 30 * 60_000 }),
      s("old", { status: "idle", statusSince: NOW - 5 * 3600_000 }),
    ];
    const board = noticesOf(sessions, projects, NOW);
    expect(board.map((x) => x.id)).toEqual(["needsYou", "errors", "yourTurn", "recentlyDone"]);
    const texts = Object.fromEntries(board.flatMap((x) => x.items.map((n) => [n.sessionId, n.text])));
    expect(texts.ask).toBe("Question: Which port?");
    expect(texts.perm).toBe("Approve? rm -rf build");
    expect(texts.err).toBe("The API returned an error.");
    expect(texts.turn).toMatch(/^Waiting for your next message for /);
    expect(texts.done).toMatch(/^Ended .* ago$/);
    expect(texts.work).toBeUndefined();
    expect(texts.old).toBeUndefined();
    expect(board[0]!.items[0]!.project).toBe("app");
    expect(urgentCount(board)).toBe(3);
  });

  it("is empty when nothing needs attention, and caps each section", () => {
    expect(noticesOf([s("w", {})], projects, NOW)).toEqual([]);
    const many = Array.from({ length: 6 }, (_, i) => s(`t${i}`, { status: "waiting", waitingReason: "turn_end" }));
    const [turn] = noticesOf(many, projects, NOW, 4);
    expect(turn!.items).toHaveLength(4);
    expect(turn!.more).toBe(2);
  });
});
