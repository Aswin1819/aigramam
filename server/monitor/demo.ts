/** Simulated sessions for demo mode. Deterministic from the clock, no state. */
import type { Action, ActivityEntry, SessionStatus, SessionView, Snapshot, SubagentView, WaitingReason } from "@shared/model";
import { describeTool, stateAction } from "./actions";

type Step = { tool?: [string, Record<string, unknown>]; status?: SessionStatus; waiting?: WaitingReason; ms: number };

const SCRIPTS: Step[][] = [
  [
    { tool: ["Read", { file_path: "src/auth/login.ts" }], ms: 5000 },
    { tool: ["Grep", { pattern: "validateToken" }], ms: 4000 },
    { tool: ["Edit", { file_path: "src/auth/login.ts" }], ms: 6000 },
    { tool: ["Bash", { command: "npm test" }], ms: 8000 },
    { status: "waiting", waiting: "turn_end", ms: 9000 },
  ],
  [
    { tool: ["WebSearch", { query: "kerala monsoon dates" }], ms: 6000 },
    { tool: ["WebFetch", { url: "https://example.com/weather" }], ms: 5000 },
    { tool: ["Write", { file_path: "notes/monsoon.md" }], ms: 5000 },
    { status: "working", ms: 4000 },
  ],
  [
    { tool: ["Bash", { command: "git push origin main" }], ms: 3000 },
    { status: "waiting", waiting: "permission", ms: 12000 },
    { tool: ["Bash", { command: "git push origin main" }], ms: 4000 },
    { status: "idle", ms: 8000 },
  ],
  [
    { tool: ["Agent", { subagent_type: "Explore", description: "Map the payment flow" }], ms: 15000 },
    { tool: ["Read", { file_path: "server/payments.py" }], ms: 5000 },
    { tool: ["AskUserQuestion", {}], ms: 9000 },
  ],
];

const SESSIONS = [
  { id: "demo0001-0000-4000-8000-000000000001", title: "Fix login token bug", project: "chaya-app", branch: "fix/login" },
  { id: "demo0002-0000-4000-8000-000000000002", title: "Monsoon research", project: "backwaters-blog", branch: "main" },
  { id: "demo0003-0000-4000-8000-000000000003", title: "Release v2", project: "chaya-app", branch: "release/v2" },
  { id: "demo0004-0000-4000-8000-000000000004", title: "Payments audit", project: "metro-pay", branch: "audit" },
];

function stepAt(script: Step[], t: number): { step: Step; since: number } {
  const total = script.reduce((a, s) => a + s.ms, 0);
  let x = t % total;
  let since = t - x;
  for (const s of script) {
    if (x < s.ms) return { step: s, since };
    x -= s.ms;
    since += s.ms;
  }
  return { step: script[0], since: t };
}

export function demoSnapshot(now = Date.now(), startedAt = now): Snapshot {
  const t = now - startedAt;
  const sessions: SessionView[] = SESSIONS.map((d, i) => {
    const { step, since } = stepAt(SCRIPTS[i], t + i * 1700);
    const at = startedAt + since - i * 1700;
    let status: SessionStatus = step.status ?? "working";
    let action: Action;
    if (step.tool) action = describeTool(step.tool[0], step.tool[1], at);
    else if (step.waiting === "permission") action = stateAction("permission", at, "Running git push origin main");
    else if (step.waiting === "turn_end") action = stateAction("turn_end", at);
    else if (status === "idle") action = stateAction("idle", at);
    else action = stateAction("think", at);
    let waitingReason = step.waiting;
    if (action.kind === "question") {
      status = "waiting";
      waitingReason = "question";
    }
    const subagents: SubagentView[] =
      i === 3 && step.tool?.[0] === "Agent"
        ? [{ id: "demo-agent-1", sessionId: d.id, agentType: "Explore", description: "Map the payment flow", status: "working", action: describeTool("Grep", { pattern: "charge(" }, at), startedAt: at, lastActivityAt: now }]
        : [];
    const recent: ActivityEntry[] = SCRIPTS[i].filter((s) => s.tool).map((s, k) => {
      const a = describeTool(s.tool![0], s.tool![1], at - (SCRIPTS[i].length - k) * 4000);
      return { at: a.startedAt, emoji: a.emoji, text: a.label, level: "info" as const };
    });
    const root = `C:\\demo\\${d.project}`;
    return {
      id: d.id,
      shortId: d.id.slice(0, 8),
      projectId: root.toLowerCase(),
      title: d.title,
      titleSource: "demo",
      cwd: root,
      gitBranch: d.branch,
      status,
      waitingReason,
      action,
      startedAt: startedAt - 20 * 60_000,
      lastActivityAt: now,
      statusSince: at,
      hooksActive: true,
      source: "demo",
      subagents,
      recent,
    };
  });
  const projects = [...new Map(sessions.map((s) => [s.projectId, { id: s.projectId, name: s.cwd.split("\\").pop()!, root: s.cwd }])).values()];
  return { projects, sessions, hooks: { installed: true }, serverTime: now, demo: true };
}

/** A short sample conversation for a demo session's chat view. */
export function demoChat(sessionId: string, now = Date.now()): import("@shared/model").ChatItem[] {
  const at = (minAgo: number) => now - minAgo * 60_000;
  const t = (k: "user" | "assistant" | "tool", text: string, ago: number, emoji?: string, n = 0) => ({ id: `${sessionId}:${ago}:${n}`, at: at(ago), kind: k, text, emoji });
  if (sessionId.startsWith("demo0001")) {
    return [
      t("user", "Login fails with an expired token even right after signing in. Can you find out why?", 9),
      t("tool", "Reading login.ts", 8.8, "📖"),
      t("tool", 'Searching "validateToken"', 8.5, "🔍"),
      t("assistant", "Found it. `validateToken` compares `exp` (seconds) with `Date.now()` (milliseconds), so every token looks expired.\n\nThe fix is a one-liner:\n\n```ts\nreturn payload.exp * 1000 > Date.now()\n```\n\nShall I apply it and run the tests?", 8),
      t("user", "Yes, go ahead.", 7),
      t("tool", "Editing login.ts", 6.8, "✏️"),
      t("tool", "Running npm test", 6.5, "💻"),
      t("assistant", "Done. **All 42 tests pass**, including a new one for tokens that expire in the next minute.", 6),
    ];
  }
  if (sessionId.startsWith("demo0002")) {
    return [
      t("user", "When does the monsoon usually reach Kerala? Write a short note for the blog.", 5),
      t("tool", 'Searching web "kerala monsoon dates"', 4.8, "🌐"),
      t("assistant", "The south-west monsoon usually arrives around **1 June**, give or take a week. I'm writing `notes/monsoon.md` with the history and this year's forecast.", 4),
    ];
  }
  return [t("user", "Let's get started.", 3), t("assistant", "On it. I'll keep you posted here.", 2.5)];
}
