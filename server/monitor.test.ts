import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import express from "express";
import type { AddressInfo } from "net";
import { describeTool } from "./monitor/actions";
import { parseLine, parseRecord } from "./monitor/parser";
import { FileTailer } from "./monitor/tailer";
import { SessionStore, TIMING } from "./monitor/store";
import { readRegistry } from "./monitor/registry";
import { resolveProject, clearProjectCache } from "./monitor/projectRoot";
import { createHooksRouter, HooksInstaller, HOOK_HEADER, withOurHooks, withoutOurHooks, hasOurHooks } from "./monitor/hooks";
import { Monitor } from "./monitor/monitor";
import { demoSnapshot } from "./monitor/demo";

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gramam-test-"));
  clearProjectCache();
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const T0 = Date.parse("2026-11-12T10:00:00.000Z");
const iso = (ms: number) => new Date(T0 + ms).toISOString();
const SID = "11111111-2222-4333-8444-555555555555";

const rec = {
  meta: (ms: number, extra: object = {}) => ({ type: "attachment", cwd: "C:\\work\\chaya-app", gitBranch: "main", sessionId: SID, timestamp: iso(ms), ...extra }),
  toolUse: (ms: number, id: string, name: string, input: object = {}) => ({
    type: "assistant", cwd: "C:\\work\\chaya-app", gitBranch: "feat/x", sessionId: SID, timestamp: iso(ms),
    message: { content: [{ type: "tool_use", id, name, input }] },
  }),
  toolResult: (ms: number, id: string, extra: object = {}) => ({
    type: "user", cwd: "C:\\work\\chaya-app", sessionId: SID, timestamp: iso(ms),
    message: { content: [{ type: "tool_result", tool_use_id: id }] }, ...extra,
  }),
  prompt: (ms: number, text = "hello") => ({ type: "user", cwd: "C:\\work\\chaya-app", sessionId: SID, timestamp: iso(ms), message: { content: text } }),
  turnEnd: (ms: number) => ({ type: "system", subtype: "turn_duration", cwd: "C:\\work\\chaya-app", sessionId: SID, timestamp: iso(ms), durationMs: 1000 }),
};

// ── actions ──────────────────────────────────────────────────────────────────

describe("describeTool", () => {
  it("labels common tools with text and a target", () => {
    expect(describeTool("Edit", { file_path: "C:\\src\\auth.ts" }).label).toBe("Editing auth.ts");
    expect(describeTool("Bash", { command: "npm test" }).label).toBe("Running npm test");
    expect(describeTool("Grep", { pattern: "login" }).label).toBe('Searching "login"');
    expect(describeTool("WebFetch", { url: "https://example.com/a/b" }).label).toBe("Fetching example.com");
    expect(describeTool("mcp__github__create_issue", {}).label).toBe("Using github.create_issue");
    expect(describeTool("AskUserQuestion", {}).kind).toBe("question");
  });
  it("survives junk input and truncates long targets", () => {
    expect(describeTool("Read", null).label).toBe("Reading a file");
    expect(describeTool("Bash", { command: "x".repeat(500) }).label.length).toBeLessThan(70);
    expect(describeTool("", undefined).label).toBe("Using tool");
  });
});

// ── parser ───────────────────────────────────────────────────────────────────

describe("parser", () => {
  it("handles string message content without throwing", () => {
    const evs = parseRecord(rec.prompt(0, "fix the bug"));
    expect(evs.map((e) => e.t)).toEqual(["meta", "prompt", "chat"]);
    expect(evs[2]).toMatchObject({ role: "user", text: "fix the bug" });
  });
  it("ignores malformed lines, unknown record types and non-objects", () => {
    expect(parseLine("{not json")).toEqual([]);
    expect(parseLine("")).toEqual([]);
    expect(parseRecord({ type: "future-record-type", foo: 1 })).toEqual([]);
    expect(parseRecord(42)).toEqual([]);
    expect(parseRecord({ type: "assistant", message: { content: "weird" } }).map((e) => e.t)).toEqual(["assistant"]);
  });
  it("reads titles, branch, tool start/end, turn end and interrupts", () => {
    expect(parseRecord({ type: "custom-title", customTitle: "Login fix", sessionId: SID })).toEqual([{ t: "title", source: "custom", title: "Login fix" }]);
    expect(parseRecord({ type: "ai-title", aiTitle: "Auto", sessionId: SID })[0]).toMatchObject({ source: "ai" });
    const start = parseRecord(rec.toolUse(0, "t1", "Read", { file_path: "a.ts" }));
    expect(start[0]).toMatchObject({ t: "meta", gitBranch: "feat/x" });
    expect(start[1]).toMatchObject({ t: "tool_start", id: "t1", name: "Read" });
    expect(parseRecord(rec.toolResult(1, "t1", { toolUseResult: { interrupted: true } }))[1]).toMatchObject({ t: "tool_end", interrupted: true });
    expect(parseRecord(rec.turnEnd(2))[1]).toMatchObject({ t: "turn_end" });
    expect(parseRecord(rec.prompt(3, "[Request interrupted by user]"))[1]).toMatchObject({ t: "interrupted" });
  });
  it("hides the placeholder branch HEAD", () => {
    expect(parseRecord({ ...rec.meta(0), gitBranch: "HEAD" })[0]).toMatchObject({ t: "meta", gitBranch: undefined });
  });
  it("does not treat meta (injected) user records as prompts", () => {
    expect(parseRecord({ ...rec.prompt(0), isMeta: true }).map((e) => e.t)).toEqual(["meta"]);
  });
  it("rejects non-https PR links", () => {
    expect(parseRecord({ type: "pr-link", prUrl: "javascript:alert(1)" })).toEqual([]);
  });
});

// ── tailer ───────────────────────────────────────────────────────────────────

describe("FileTailer", () => {
  it("keeps a half-written line until its newline arrives", () => {
    const f = path.join(tmp, "a.jsonl");
    fs.writeFileSync(f, "");
    const t = new FileTailer(f);
    expect(t.readNewLines()).toEqual([]);
    fs.appendFileSync(f, '{"a":1}\n{"b":');
    expect(t.readNewLines()).toEqual(['{"a":1}']);
    fs.appendFileSync(f, "2}\n");
    expect(t.readNewLines()).toEqual(['{"b":2}']);
  });
  it("never splits multi-byte characters across reads", () => {
    const f = path.join(tmp, "u.jsonl");
    fs.writeFileSync(f, "");
    const t = new FileTailer(f);
    t.readNewLines();
    const line = Buffer.from('{"t":"നിലവിളക്ക്"}\n', "utf8");
    fs.appendFileSync(f, line.subarray(0, 9));
    expect(t.readNewLines()).toEqual([]);
    fs.appendFileSync(f, line.subarray(9));
    expect(t.readNewLines()).toEqual(['{"t":"നിലവിളക്ക്"}']);
  });
  it("starts near the end of a big file and drops the partial first line", () => {
    const f = path.join(tmp, "big.jsonl");
    const lines = Array.from({ length: 2000 }, (_, i) => JSON.stringify({ i, pad: "x".repeat(100) }));
    fs.writeFileSync(f, lines.join("\n") + "\n");
    const got = new FileTailer(f, 10_000).readNewLines();
    expect(got.length).toBeGreaterThan(50);
    expect(got.length).toBeLessThan(120);
    expect(() => got.forEach((l) => JSON.parse(l))).not.toThrow();
    expect(JSON.parse(got[got.length - 1]).i).toBe(1999);
  });
  it("restarts when the file is truncated and handles CRLF", () => {
    const f = path.join(tmp, "r.jsonl");
    fs.writeFileSync(f, '{"x":1}\r\n{"x":2}\r\n');
    const t = new FileTailer(f);
    expect(t.readNewLines()).toEqual(['{"x":1}', '{"x":2}']);
    fs.writeFileSync(f, '{"y":1}\n');
    expect(t.readNewLines()).toEqual(['{"y":1}']);
  });
  it("picks up a 50 MB transcript in well under a second", () => {
    const f = path.join(tmp, "huge.jsonl");
    const chunk = (JSON.stringify(rec.toolUse(0, "x", "Read", { file_path: "a.ts", pad: "p".repeat(900) })) + "\n").repeat(1000);
    const fd = fs.openSync(f, "w");
    for (let i = 0; i < 50; i++) fs.writeSync(fd, chunk);
    fs.closeSync(fd);
    expect(fs.statSync(f).size).toBeGreaterThan(45 * 1024 * 1024);
    const started = performance.now();
    const store = new SessionStore();
    for (const l of new FileTailer(f).readNewLines()) for (const e of parseLine(l)) store.applyEvent(SID, e);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(store.snapshot(T0).sessions).toHaveLength(1);
  });
});

// ── store ────────────────────────────────────────────────────────────────────

function feed(store: SessionStore, ...records: object[]) {
  for (const r of records) for (const e of parseRecord(r)) store.applyEvent(SID, e);
}

describe("SessionStore", () => {
  it("shows the current action while a tool runs, with project and branch", () => {
    const s = new SessionStore();
    feed(s, rec.toolUse(0, "t1", "Edit", { file_path: "src/auth.ts" }));
    const snap = s.snapshot(T0 + 1000);
    expect(snap.sessions[0]).toMatchObject({ status: "working", gitBranch: "feat/x", title: `Session ${SID.slice(0, 8)}` });
    expect(snap.sessions[0].action?.label).toBe("Editing auth.ts");
    expect(snap.projects[0].name).toBe("chaya-app");
  });

  it("goes to 'your turn' after a reply, then idle after the wait window", () => {
    const s = new SessionStore();
    feed(s, rec.toolUse(0, "t1", "Bash", { command: "ls" }), rec.toolResult(1000, "t1"), rec.turnEnd(2000));
    expect(s.snapshot(T0 + 3000).sessions[0]).toMatchObject({ status: "waiting", waitingReason: "turn_end" });
    expect(s.snapshot(T0 + 2000 + TIMING.turnEndWaitMs + 1).sessions[0].status).toBe("idle");
  });

  it("treats a pending AskUserQuestion as waiting for the user", () => {
    const s = new SessionStore();
    feed(s, rec.toolUse(0, "q1", "AskUserQuestion"));
    expect(s.snapshot(T0 + 500).sessions[0]).toMatchObject({ status: "waiting", waitingReason: "question" });
  });

  it("hints 'may need approval' without hooks, but not for reads or in bypass mode", () => {
    const s = new SessionStore();
    feed(s, rec.toolUse(0, "b1", "Bash", { command: "git push" }));
    expect(s.snapshot(T0 + 2000).sessions[0].maybeNeedsApproval).toBeUndefined();
    expect(s.snapshot(T0 + 20_000).sessions[0].maybeNeedsApproval).toBe(true);
    const r = new SessionStore();
    feed(r, rec.toolUse(0, "r1", "Read", { file_path: "a" }));
    expect(r.snapshot(T0 + 20_000).sessions[0].maybeNeedsApproval).toBeUndefined();
    const b = new SessionStore();
    feed(b, { type: "permission-mode", permissionMode: "bypassPermissions" }, rec.toolUse(0, "b1", "Bash", { command: "x" }));
    expect(b.snapshot(T0 + 20_000).sessions[0].maybeNeedsApproval).toBeUndefined();
  });

  it("uses hooks for exact permission prompts, cleared when the tool finishes", () => {
    const s = new SessionStore();
    const base = { session_id: SID, cwd: "C:\\work\\chaya-app" };
    s.applyHook({ ...base, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "rm -rf build" }, tool_use_id: "h1" }, T0);
    s.applyHook({ ...base, hook_event_name: "PermissionRequest", tool_name: "Bash", tool_input: { command: "rm -rf build" } }, T0 + 100);
    let v = s.snapshot(T0 + 200).sessions[0];
    expect(v).toMatchObject({ status: "waiting", waitingReason: "permission", hooksActive: true });
    expect(v.action?.label).toContain("rm -rf build");
    s.applyHook({ ...base, hook_event_name: "PostToolUse", tool_name: "Bash", tool_use_id: "h1" }, T0 + 5000);
    v = s.snapshot(T0 + 5100).sessions[0];
    expect(v.status).toBe("working");
    expect(v.maybeNeedsApproval).toBeUndefined();
  });

  it("does not double-count a tool seen via both hooks and the transcript", () => {
    const s = new SessionStore();
    s.applyHook({ session_id: SID, cwd: "C:\\w\\p", hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "a.ts" }, tool_use_id: "x1" }, T0);
    s.applyHook({ session_id: SID, hook_event_name: "PostToolUse", tool_name: "Read", tool_use_id: "x1" }, T0 + 10);
    feed(s, rec.toolUse(5, "x1", "Read", { file_path: "a.ts" }));
    const v = s.snapshot(T0 + 20).sessions[0];
    expect(v.action?.kind).not.toBe("read");
    expect(v.recent.filter((r) => r.text === "Reading a.ts")).toHaveLength(1);
  });

  it("prefers custom title > agent name > registry user name > AI title", () => {
    const s = new SessionStore();
    feed(s, rec.meta(0), { type: "ai-title", aiTitle: "AI one" });
    expect(s.snapshot(T0).sessions[0].title).toBe("AI one");
    s.applyRegistry([{ pid: 1, sessionId: SID, name: "From registry", nameSource: "user", alive: true }], T0);
    expect(s.snapshot(T0).sessions[0].title).toBe("From registry");
    feed(s, { type: "custom-title", customTitle: "Renamed" });
    expect(s.snapshot(T0).sessions[0]).toMatchObject({ title: "Renamed", titleSource: "custom" });
  });

  it("finishes a session when its process leaves the registry, then removes it", () => {
    const s = new SessionStore();
    feed(s, rec.meta(0));
    s.applyRegistry([{ pid: 1, sessionId: SID, alive: true }], T0);
    s.applyRegistry([], T0 + 1000);
    expect(s.snapshot(T0 + 1000).sessions[0].status).toBe("finished");
    s.prune(T0 + 1000 + TIMING.finishedLingerMs + 1);
    expect(s.snapshot(T0).sessions).toHaveLength(0);
  });

  it("tracks subagents and finishes them when the parent's Agent call returns", () => {
    const s = new SessionStore();
    feed(s, rec.toolUse(0, "agent-call", "Agent", { subagent_type: "Explore", description: "Map payments" }));
    s.subagentMeta(SID, "a1", { agentType: "Explore", description: "Map payments", toolUseId: "agent-call" }, T0 + 10);
    s.applyEvent(SID, { t: "tool_start", at: T0 + 20, id: "s1", name: "Grep", input: { pattern: "charge" } }, "a1");
    let v = s.snapshot(T0 + 30).sessions[0];
    expect(v.action?.kind).toBe("delegate");
    expect(v.subagents[0]).toMatchObject({ agentType: "Explore", status: "working" });
    expect(v.subagents[0].action?.label).toBe('Searching "charge"');
    expect(v.recent.some((r) => r.agent === "Explore")).toBe(true);
    feed(s, rec.toolResult(1000, "agent-call"));
    v = s.snapshot(T0 + 1100).sessions[0];
    expect(v.subagents[0].status).toBe("finished");
    s.prune(T0 + 1000 + TIMING.subagentLingerMs + 1);
    expect(s.snapshot(T0 + 1000 + TIMING.subagentLingerMs + 1).sessions[0].subagents).toHaveLength(0);
  });

  it("keeps background (async) subagents running after the Agent call returns", () => {
    const s = new SessionStore();
    feed(s, rec.toolUse(0, "bg", "Agent", {}));
    s.subagentMeta(SID, "a2", { toolUseId: "bg" }, T0);
    feed(s, rec.toolResult(10, "bg", { toolUseResult: { isAsync: true, agentId: "a2" } }));
    expect(s.snapshot(T0 + 20).sessions[0].subagents[0].status).not.toBe("finished");
  });

  it("caps the activity log", () => {
    const s = new SessionStore();
    for (let i = 0; i < 200; i++) feed(s, rec.toolUse(i, `t${i}`, "Read", { file_path: `f${i}` }));
    expect(s.snapshot(T0 + 300).sessions[0].recent).toHaveLength(TIMING.recentMax);
  });
});

// ── registry & project root ──────────────────────────────────────────────────

describe("registry and project root", () => {
  it("reads running sessions and skips broken files", () => {
    fs.writeFileSync(path.join(tmp, "100.json"), JSON.stringify({ pid: 100, sessionId: SID, cwd: "C:\\w", name: "N", nameSource: "user", status: "busy" }));
    fs.writeFileSync(path.join(tmp, "200.json"), "{broken");
    fs.writeFileSync(path.join(tmp, "300.json"), JSON.stringify({ pid: 300 }));
    fs.writeFileSync(path.join(tmp, "notes.txt"), "x");
    const got = readRegistry(tmp, (pid) => pid === 100);
    expect(got).toEqual([expect.objectContaining({ pid: 100, sessionId: SID, name: "N", alive: true })]);
    expect(readRegistry(path.join(tmp, "missing"))).toEqual([]);
  });
  it("groups a subfolder under its git repo root", () => {
    const root = path.join(tmp, "repo");
    fs.mkdirSync(path.join(root, ".git"), { recursive: true });
    fs.mkdirSync(path.join(root, "client", "src"), { recursive: true });
    const a = resolveProject(path.join(root, "client", "src"));
    const b = resolveProject(root);
    expect(a.id).toBe(b.id);
    expect(a.name).toBe("repo");
    expect(resolveProject(path.join(tmp, "plain")).name).toBe("plain");
  });
});

// ── hooks ────────────────────────────────────────────────────────────────────

describe("hooks install / uninstall", () => {
  const existing = {
    model: "opus",
    hooks: {
      PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "python my_gate.py" }] }],
      Stop: [{ hooks: [{ type: "command", command: "notify.exe" }] }],
    },
  };

  it("adds our hooks without touching existing ones, and removes only ours", () => {
    const installed = withOurHooks(existing, 4317, "k");
    expect(hasOurHooks(installed)).toBe(true);
    expect(installed.hooks!.PreToolUse[0]).toEqual(existing.hooks.PreToolUse[0]);
    expect(installed.hooks!.Stop[0]).toEqual(existing.hooks.Stop[0]);
    const ours = installed.hooks!.Notification[0].hooks![0];
    expect(ours).toMatchObject({ type: "http", url: "http://127.0.0.1:4317/api/hooks", timeout: 2 });
    expect(withOurHooks(installed, 4317, "k")).toEqual(installed); // idempotent
    expect(withoutOurHooks(installed)).toEqual(existing);
  });

  it("writes a backup before changing settings and refuses unparsable files", () => {
    const settings = path.join(tmp, "claude", "settings.json");
    fs.mkdirSync(path.dirname(settings));
    fs.writeFileSync(settings, JSON.stringify(existing, null, 2));
    const inst = new HooksInstaller(settings, path.join(tmp, "backups"));
    expect(inst.status(4317)).toMatchObject({ installed: false, readable: true });
    const { backupPath } = inst.apply(4317, "k", "install");
    expect(fs.readFileSync(backupPath!, "utf8")).toBe(JSON.stringify(existing, null, 2));
    expect(inst.status(4317).installed).toBe(true);
    inst.apply(4317, "k", "uninstall");
    expect(JSON.parse(fs.readFileSync(settings, "utf8"))).toEqual(existing);
    fs.writeFileSync(settings, "{ // comment\n}");
    expect(inst.status(4317).readable).toBe(false);
    expect(() => inst.apply(4317, "k", "install")).toThrow();
  });

  it("warns when an allowlist would block our hook URL", () => {
    const settings = path.join(tmp, "settings.json");
    fs.writeFileSync(settings, JSON.stringify({ allowedHttpHookUrls: ["https://corp.example/*x"] }));
    expect(new HooksInstaller(settings, tmp).status(4317).blockedByAllowlist).toBe(true);
  });

  it("endpoint replies 204 with an empty body and rejects a wrong key", async () => {
    const got: unknown[] = [];
    const app = express();
    app.use(express.json());
    app.use("/api/hooks", createHooksRouter(() => "secret-key", (p) => got.push(p)));
    const server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/hooks`;
    try {
      const bad = await fetch(url, { method: "POST", headers: { "content-type": "application/json", [HOOK_HEADER]: "nope" }, body: "{}" });
      expect(bad.status).toBe(403);
      const ok = await fetch(url, { method: "POST", headers: { "content-type": "application/json", [HOOK_HEADER]: "secret-key" }, body: JSON.stringify({ hook_event_name: "Stop", session_id: SID }) });
      expect(ok.status).toBe(204);
      expect(await ok.text()).toBe("");
      await new Promise((r) => setTimeout(r, 20));
      expect(got).toEqual([{ hook_event_name: "Stop", session_id: SID }]);
    } finally {
      server.close();
    }
  });
});

// ── router ───────────────────────────────────────────────────────────────────

describe("tRPC router", () => {
  it("loads and lists hook status without changing anything", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller({ req: {} as never, res: {} as never });
    const st = await caller.hooks.status();
    expect(st.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/api\/hooks$/);
    expect(st.events).toContain("PermissionRequest");
  });
});

// ── monitor (end to end on a fake ~/.claude) ─────────────────────────────────

describe("Monitor", () => {
  it("discovers a live session and its subagent from disk", () => {
    const claude = path.join(tmp, ".claude");
    const proj = path.join(claude, "projects", "C--work-chaya-app");
    const subDir = path.join(proj, SID, "subagents");
    fs.mkdirSync(subDir, { recursive: true });
    fs.mkdirSync(path.join(claude, "sessions"));
    const now = Date.now();
    const at = (ms: number) => new Date(now + ms).toISOString();
    const lines = [
      { type: "custom-title", customTitle: "Chaya login fix", sessionId: SID },
      { type: "user", cwd: "C:\\work\\chaya-app", gitBranch: "fix/login", sessionId: SID, timestamp: at(-3000), message: { content: "fix login" } },
      { type: "assistant", cwd: "C:\\work\\chaya-app", gitBranch: "fix/login", sessionId: SID, timestamp: at(-2000), message: { content: [{ type: "tool_use", id: "ag", name: "Agent", input: { subagent_type: "Explore", description: "Find auth" } }] } },
    ];
    fs.writeFileSync(path.join(proj, `${SID}.jsonl`), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
    fs.writeFileSync(path.join(subDir, "agent-abc123.meta.json"), JSON.stringify({ agentType: "Explore", description: "Find auth", toolUseId: "ag" }));
    fs.writeFileSync(
      path.join(subDir, "agent-abc123.jsonl"),
      JSON.stringify({ type: "assistant", agentId: "abc123", isSidechain: true, sessionId: SID, cwd: "C:\\work\\chaya-app", timestamp: at(-1000), message: { content: [{ type: "tool_use", id: "g1", name: "Grep", input: { pattern: "token" } }] } }) + "\n",
    );
    // An old transcript must be ignored.
    const old = path.join(proj, "99999999-2222-4333-8444-555555555555.jsonl");
    fs.writeFileSync(old, JSON.stringify(lines[1]) + "\n");
    fs.utimesSync(old, new Date(now - 3600_000), new Date(now - 3600_000));

    const m = new Monitor({ claudeDir: claude });
    m.scan();
    m.pollTailers();
    const snap = m.store.snapshot();
    expect(snap.sessions).toHaveLength(1);
    const s = snap.sessions[0];
    expect(s).toMatchObject({ title: "Chaya login fix", gitBranch: "fix/login", cwd: "C:\\work\\chaya-app" });
    expect(s.action?.kind).toBe("delegate");
    expect(s.subagents).toEqual([expect.objectContaining({ id: "abc123", agentType: "Explore", description: "Find auth", status: "working" })]);
    expect(s.subagents[0].action?.label).toBe('Searching "token"');

    // New lines appended later are picked up.
    fs.appendFileSync(path.join(proj, `${SID}.jsonl`), JSON.stringify({ type: "system", subtype: "turn_duration", sessionId: SID, cwd: "C:\\work\\chaya-app", timestamp: at(0) }) + "\n");
    m.pollTailers();
    expect(m.store.snapshot().sessions[0]).toMatchObject({ status: "waiting", waitingReason: "turn_end" });
  });

  it("demo snapshot is well formed and includes every status the UI shows", () => {
    const seen = new Set<string>();
    for (let t = 0; t < 120_000; t += 1000) for (const s of demoSnapshot(T0 + t, T0).sessions) seen.add(s.status + (s.waitingReason ?? ""));
    expect([...seen]).toEqual(expect.arrayContaining(["working", "idle", "waitingpermission", "waitingturn_end", "waitingquestion"]));
  });
});

describe("guessPathFromEncodedName", () => {
  it("rebuilds a Windows path with hyphens, dots and spaces from what exists", async () => {
    const { guessPathFromEncodedName } = await import("./routers/agents");
    const root = "C:" + path.sep;
    const p = (...parts: string[]) => path.join(root, ...parts);
    const existing = new Set([p("Users"), p("Users", "me"), p("Users", "me", "my projects"), p("Users", "me", "my projects", "Expense-Tracker"), p("Users", "me", ".claude")].map((x) => x.toLowerCase()));
    const exists = (x: string) => existing.has(x.toLowerCase());
    if (process.platform === "win32") {
      expect(guessPathFromEncodedName("C--Users-me-my-projects-Expense-Tracker", exists)).toBe(p("Users", "me", "my projects", "Expense-Tracker"));
      expect(guessPathFromEncodedName("C--Users-me--claude", exists)).toBe(p("Users", "me", ".claude"));
    }
    expect(guessPathFromEncodedName("C--nowhere-at-all", () => false)).toBeNull();
    expect(guessPathFromEncodedName("plainname", exists)).toBeNull();
  });
});

describe("chat view", () => {
  it("keeps what the person said, strips reminders, shows slash commands, drops engine notices", async () => {
    const { chatTextOfPrompt } = await import("./monitor/parser");
    expect(chatTextOfPrompt("please fix it")).toBe("please fix it");
    expect(chatTextOfPrompt("hi <system-reminder>secret context</system-reminder>")).toBe("hi");
    expect(chatTextOfPrompt("<command-name>/review</command-name><command-args>PR 12</command-args>")).toBe("/review PR 12");
    expect(chatTextOfPrompt("<task-notification><task-id>x</task-id></task-notification>")).toBeNull();
    expect(chatTextOfPrompt("<local-command-stdout>done</local-command-stdout>")).toBeNull();
    expect(chatTextOfPrompt("<system-reminder>only this</system-reminder>")).toBeNull();
  });

  it("collects replies and tool lines in order, without duplicates or subagent chatter", () => {
    const s = new SessionStore();
    const seen: string[] = [];
    s.onChat = (_id, items) => items.forEach((i) => seen.push(i.kind));
    const reply = { type: "assistant", uuid: "a1", cwd: "C:\w", sessionId: SID, timestamp: iso(2), message: { content: [{ type: "text", text: "Found it." }, { type: "tool_use", id: "t9", name: "Edit", input: { file_path: "a.ts" } }] } };
    feed(s, { ...rec.prompt(1, "why is login broken?"), uuid: "u1" }, reply, reply);
    feed(s, { ...reply, uuid: "side", isSidechain: true, message: { content: [{ type: "text", text: "subagent musing" }] } });
    const chat = s.chat(SID);
    expect(chat.map((c) => [c.kind, c.text])).toEqual([["user", "why is login broken?"], ["assistant", "Found it."], ["tool", "Editing a.ts"]]);
    expect(seen).toEqual(["user", "assistant", "tool"]);
  });

  it("caps the conversation it keeps", () => {
    const s = new SessionStore();
    for (let i = 0; i < 400; i++) feed(s, { ...rec.prompt(i, `m${i}`), uuid: `u${i}` });
    const chat = s.chat(SID);
    expect(chat).toHaveLength(TIMING.chatMax);
    expect(chat.at(-1)?.text).toBe("m399");
  });
});

describe("chat history", () => {
  it("reads older conversation from the transcript when a chat is opened", async () => {
    const claude = path.join(tmp, ".claude");
    const proj = path.join(claude, "projects", "C--work-chat");
    fs.mkdirSync(proj, { recursive: true });
    const now = Date.now();
    const at = (ms: number) => new Date(now - 60_000 + ms).toISOString();
    const pad = "x".repeat(2000);
    const lines = [JSON.stringify({ type: "user", uuid: "first", sessionId: SID, cwd: "C:\work\chat", timestamp: at(0), message: { content: "the very first question" } })];
    for (let i = 0; i < 300; i++) lines.push(JSON.stringify({ type: "attachment", sessionId: SID, cwd: "C:\work\chat", timestamp: at(i + 1), attachment: { type: "noise", pad } }));
    lines.push(JSON.stringify({ type: "assistant", uuid: "last", sessionId: SID, cwd: "C:\work\chat", timestamp: at(500), message: { content: [{ type: "text", text: "the latest answer" }] } }));
    fs.writeFileSync(path.join(proj, `${SID}.jsonl`), lines.join("\n") + "\n");

    const m = new Monitor({ claudeDir: claude });
    m.scan();
    expect(m.store.chat(SID).map((c) => c.text)).toEqual(["the latest answer"]); // beyond the startup tail
    await m.loadChatHistory(SID);
    expect(m.store.chat(SID).map((c) => c.text)).toEqual(["the very first question", "the latest answer"]);
  });
});

describe("compaction summary", () => {
  it("shows a note instead of a user bubble and doesn't count as a prompt", () => {
    const evs = parseLine(JSON.stringify({ type: "user", uuid: "cs", isCompactSummary: true, timestamp: new Date().toISOString(), message: { content: "This session is being continued..." } }));
    expect(evs.map((e) => e.t)).toEqual(["chat"]);
    expect(evs[0]).toMatchObject({ role: "note" });
  });
});

describe("stopping from Ai Gramam", () => {
  const notes = (s: SessionStore) => s.chat(SID).filter((c) => c.kind === "note").map((c) => c.text);

  it("labels a turn the mod reports as stopped by the app", () => {
    const s = new SessionStore();
    feed(s, rec.toolUse(0, "t1", "Bash", { command: "sleep 100" }));
    s.applyHook({ hook_event_name: "Stop", session_id: SID, aborted: true, stopped_by_app: true }, T0 + 5000);
    const v = s.snapshot(T0 + 6000).sessions[0];
    expect(v.status).toBe("idle");
    expect(v.action?.label).toBe("Stopped from Ai Gramam");
    expect(notes(s)).toEqual(["Stopped from Ai Gramam"]);
  });

  it("matches the transcript's interrupt to a Stop pressed in the browser, once", () => {
    const s = new SessionStore();
    feed(s, rec.toolUse(0, "t1", "Bash", { command: "sleep 100" }));
    s.stopRequested(SID, T0 + 4000);
    s.applyEvent(SID, { t: "interrupted", at: T0 + 5000 });
    s.applyHook({ hook_event_name: "Stop", session_id: SID, aborted: true, stopped_by_app: true }, T0 + 5200);
    expect(s.snapshot(T0 + 6000).sessions[0].action?.label).toBe("Stopped from Ai Gramam");
    expect(notes(s)).toEqual(["Stopped from Ai Gramam"]);
  });

  it("relabels an earlier 'Interrupted' note when the mod's report comes second", () => {
    const s = new SessionStore();
    const pushed: string[] = [];
    s.onChat = (_id, items) => pushed.push(...items.map((i) => i.text));
    feed(s, rec.toolUse(0, "t1", "Bash", { command: "sleep 100" }));
    s.applyEvent(SID, { t: "interrupted", at: T0 + 5000 });
    s.applyHook({ hook_event_name: "Stop", session_id: SID, aborted: true, stopped_by_app: true }, T0 + 5300);
    expect(notes(s)).toEqual(["Stopped from Ai Gramam"]);
    expect(pushed.slice(-1)).toEqual(["Stopped from Ai Gramam"]);
  });

  it("keeps 'Interrupted by you' for a stop pressed in the terminal", () => {
    const s = new SessionStore();
    feed(s, rec.toolUse(0, "t1", "Bash", { command: "sleep 100" }));
    s.applyHook({ hook_event_name: "Stop", session_id: SID, aborted: true, stopped_by_app: false }, T0 + 5000);
    expect(s.snapshot(T0 + 6000).sessions[0].action?.label).toBe("Interrupted by you");
    expect(notes(s)).toEqual(["Interrupted"]);
  });
});

describe("turn cut short mid-tool", () => {
  it("treats a 'did not complete' tool result as an interruption", () => {
    const evs = parseLine(JSON.stringify({
      type: "user", timestamp: new Date().toISOString(),
      message: { content: [{ type: "tool_result", tool_use_id: "toolu_1", is_error: true, content: "[Tool call did not complete: the turn was ended to deliver the message that follows.]" }] },
      toolUseResult: "[Tool call did not complete: the turn was ended to deliver the message that follows.]",
    }));
    expect(evs.map((e) => e.t)).toEqual(["tool_end", "interrupted"]);
  });
});
