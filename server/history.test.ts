import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { HistoryIndex } from "./history";
import { TranscriptSummary, dayKey } from "./history/summarize";
import { newTimelineState, readTimeline, timelineEventsOf } from "./history/timeline";
import { createHistoryRouter } from "./routers/history";

const ID = "11111111-2222-3333-4444-555555555555";
const T0 = Date.parse("2026-11-10T09:00:00Z");
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();
const J = (o: object) => JSON.stringify(o);

const base = (min: number, extra: object = {}) => ({ sessionId: ID, cwd: "C:\\work\\demo", gitBranch: "main", timestamp: at(min), ...extra });
const prompt = (min: number, text: string) => J({ ...base(min), type: "user", uuid: `u${min}`, message: { role: "user", content: text } });
const toolUse = (min: number, msgId: string, id: string, name: string, input: object, usage?: object) =>
  J({ ...base(min), type: "assistant", uuid: `a${min}${id}`, message: { id: msgId, model: "claude-opus-5-5", role: "assistant", content: [{ type: "tool_use", id, name, input }], usage } });
const reply = (min: number, msgId: string, text: string, usage?: object) =>
  J({ ...base(min), type: "assistant", uuid: `r${min}`, message: { id: msgId, model: "claude-opus-5-5", role: "assistant", content: [{ type: "text", text }], usage } });
const result = (min: number, id: string, isError = false, content = "ok") =>
  J({ ...base(min), type: "user", uuid: `t${min}${id}`, message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, is_error: isError, content }] } });
const turnEnd = (min: number, durationMs = 90_000) => J({ ...base(min), type: "system", subtype: "turn_duration", durationMs });
const usage = { input_tokens: 10, output_tokens: 100, cache_read_input_tokens: 1000, cache_creation_input_tokens: 50 };

const SESSION = [
  J({ type: "ai-title", sessionId: ID, aiTitle: "Fix the login page" }),
  prompt(0, "Please fix the login page"),
  // One API response split into two records that repeat its usage: counted once.
  toolUse(1, "msg1", "t1", "Read", { file_path: "C:\\work\\demo\\login.ts" }, usage),
  toolUse(1, "msg1", "t2", "Edit", { file_path: "C:\\work\\demo\\login.ts" }, usage),
  result(2, "t1"),
  result(2, "t2", true, "String not found"),
  J({ type: "api-request-blob", sessionId: ID, message: { huge: "x".repeat(5000) } }),
  // Subagent work in the main transcript isn't the conversation's.
  J({ ...base(3), type: "user", isSidechain: true, message: { role: "user", content: "subagent task" } }),
  reply(3, "msg2", "Fixed it.", usage),
  turnEnd(3),
  J({ type: "pr-link", sessionId: ID, prUrl: "https://github.com/me/demo/pull/1", timestamp: at(4) }),
  J({ type: "pr-link", sessionId: ID, prUrl: "https://github.com/me/demo/pull/1", timestamp: at(5) }),
  // A day-later prompt after a long gap: the gap isn't active time.
  prompt(24 * 60, "Now add tests"),
  J({ ...base(24 * 60 + 1), type: "user", uuid: "int", message: { role: "user", content: [{ type: "text", text: "[Request interrupted by user]" }] } }),
];

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gramam-history-"));
  fs.mkdirSync(path.join(tmp, "C--work-demo"));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));
const fileOf = () => path.join(tmp, "C--work-demo", `${ID}.jsonl`);

describe("transcript summary", () => {
  it("counts prompts, tools, errors, files and usage from what was recorded", () => {
    const s = new TranscriptSummary();
    for (const l of SESSION) s.add(l);
    expect(s.title(ID)).toEqual({ title: "Fix the login page", source: "ai" });
    expect(s.prompts).toBe(2);
    expect(s.toolCalls).toBe(2);
    expect(s.toolErrors).toBe(1);
    expect(s.files.size).toBe(1);
    expect(s.interrupts).toBe(1);
    expect(s.usage).toEqual({ input: 20, output: 200, cacheRead: 2000, cacheWrite: 100, responses: 2 });
    expect([...s.models]).toEqual(["claude-opus-5-5"]);
    expect(s.prUrl).toBe("https://github.com/me/demo/pull/1");
    expect(s.lastEvent).toBe("interrupted");
    // 0→1→2→3→(pr-link records have no cwd)→… active 3 min on day one, 1 min on day two.
    expect(s.activeMs).toBe(4 * 60_000);
    expect([...s.days.keys()]).toEqual([dayKey(T0), dayKey(T0 + 24 * 3600_000)]);
    expect(s.startedAt).toBe(T0);
  });

  it("falls back to the first prompt for a title, never a slash command", () => {
    const s = new TranscriptSummary();
    s.add(J({ ...base(0), type: "user", message: { role: "user", content: "<command-name>/clear</command-name>" } }));
    s.add(prompt(1, "Rename the   settings\npage"));
    expect(s.title(ID)).toEqual({ title: "Rename the settings page", source: "prompt" });
    expect(new TranscriptSummary().title(ID)).toEqual({ title: "Session 11111111", source: "id" });
  });

  it("ignores malformed lines", () => {
    const s = new TranscriptSummary();
    for (const l of ["", "not json", "{broken", "[1,2]", J({ type: "user" })]) s.add(l);
    expect(s.startedAt).toBe(0);
    expect(s.prompts).toBe(0);
  });
});

describe("history index", () => {
  it("lists sessions with their project, and reads only what was appended", async () => {
    fs.writeFileSync(fileOf(), SESSION.slice(0, 6).join("\n") + "\n" + SESSION[6]!.slice(0, 20)); // a partial last line
    const idx = new HistoryIndex({ projectsDir: tmp, yieldEvery: false, liveIds: () => new Set([ID]) });
    await idx.refresh(true);
    let list = idx.list();
    expect(list.sessions).toHaveLength(1);
    expect(list.sessions[0]).toMatchObject({ id: ID, projectName: "demo", toolCalls: 2, toolErrors: 1, state: "live", lastEvent: "tool_error" });
    expect(list.oldestAt).toBe(T0);

    // Finish the partial line and append the rest: nothing is counted twice.
    fs.appendFileSync(fileOf(), SESSION[6]!.slice(20) + "\n" + SESSION.slice(7).join("\n") + "\n");
    await idx.refresh(true);
    list = idx.list();
    expect(list.sessions[0]).toMatchObject({ prompts: 2, toolCalls: 2, replies: 1, lastEvent: "interrupted" });
    expect(list.sessions[0]!.usage?.responses).toBe(2);
    expect(list.scanning).toBeNull();
  });

  it("counts subagent transcripts and forgets deleted files", async () => {
    fs.writeFileSync(fileOf(), SESSION.join("\n") + "\n");
    const subDir = path.join(tmp, "C--work-demo", ID, "subagents");
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(subDir, "agent-a1.jsonl"), "");
    fs.writeFileSync(path.join(subDir, "agent-a2.jsonl"), "");
    const idx = new HistoryIndex({ projectsDir: tmp, yieldEvery: false });
    await idx.refresh(true);
    expect(idx.list().sessions[0]).toMatchObject({ subagents: 2, state: "ended" });
    expect(idx.fileOf(ID.toUpperCase())).toBe(fileOf());
    fs.rmSync(fileOf());
    await idx.refresh(true);
    expect(idx.list().sessions).toHaveLength(0);
    expect(idx.fileOf(ID)).toBeUndefined();
  });

  it("copes with a missing projects folder", async () => {
    const idx = new HistoryIndex({ projectsDir: path.join(tmp, "nope"), yieldEvery: false });
    await idx.refresh(true);
    expect(idx.list()).toEqual({ sessions: [], scanning: null, oldestAt: null });
  });
});

describe("timeline", () => {
  it("describes recorded events in order, PR links once", async () => {
    fs.writeFileSync(fileOf(), SESSION.join("\n") + "\n");
    const tl = await readTimeline(fileOf(), ID);
    expect(tl.events.map((e) => e.kind)).toEqual(["start", "prompt", "tool", "tool", "tool_error", "turn_end", "pr", "prompt", "interrupted"]);
    expect(tl.events[1]).toMatchObject({ text: "You sent a message", detail: "Please fix the login page" });
    expect(tl.events[4]).toMatchObject({ text: "Edit reported an error", detail: "String not found" });
    expect(tl.events[5]!.text).toBe("Reply finished (took 1m 30s)");
    expect(tl.omitted).toBe(0);
  });

  it("keeps the start and the latest events when there are too many", async () => {
    const lines = [prompt(0, "go")];
    for (let i = 1; i <= 30; i++) lines.push(toolUse(i, `m${i}`, `t${i}`, "Bash", { command: `echo ${i}` }));
    fs.writeFileSync(fileOf(), lines.join("\n"));
    const tl = await readTimeline(fileOf(), ID, 10);
    expect(tl.events).toHaveLength(10);
    expect(tl.events[0]!.kind).toBe("start");
    expect(tl.events[9]!.detail).toBe("$ echo 30");
    expect(tl.omitted).toBe(22);
  });

  it("names questions and subagents", () => {
    const st = newTimelineState();
    expect(timelineEventsOf(toolUse(0, "m", "q", "AskUserQuestion", { questions: [] }), st).map((e) => e.kind)).toEqual(["start", "question"]);
    expect(timelineEventsOf(toolUse(1, "m2", "a", "Agent", { subagent_type: "Explore", description: "find tests" }), st)[0]).toMatchObject({ kind: "subagent", detail: "Explore: find tests" });
  });
});

describe("history router", () => {
  it("only reads transcripts the index knows", async () => {
    fs.writeFileSync(fileOf(), SESSION.join("\n") + "\n");
    const idx = new HistoryIndex({ projectsDir: tmp, yieldEvery: false });
    const caller = createHistoryRouter(idx).createCaller({} as never);
    await expect(caller.timeline({ sessionId: "..\\..\\windows\\win.ini" })).rejects.toThrow();
    await expect(caller.timeline({ sessionId: "99999999-2222-3333-4444-555555555555" })).rejects.toThrow(/No transcript/);
    const tl = await caller.timeline({ sessionId: ID });
    expect(tl.events.length).toBeGreaterThan(3);
  });
});
