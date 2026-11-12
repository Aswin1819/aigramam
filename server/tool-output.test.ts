import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { parseRecord, toolDetail, toolOutput, TOOL_OUTPUT_MAX } from "./monitor/parser";
import { SessionStore } from "./monitor/store";
import { Monitor } from "./monitor/monitor";
import type { ChatItem } from "@shared/model";

const SID = "11111111-2222-4333-8444-555555555555";
const T0 = Date.parse("2026-11-12T10:00:00.000Z");
const iso = (ms: number) => new Date(T0 + ms).toISOString();
const CWD = "C:/work/chaya-app";

const use = (ms: number, id: string, name: string, input: object) => ({
  type: "assistant", uuid: `a-${id}`, cwd: CWD, sessionId: SID, timestamp: iso(ms),
  message: { content: [{ type: "tool_use", id, name, input }] },
});
const result = (ms: number, id: string, content: unknown, extra: object = {}) => ({
  type: "user", uuid: `r-${id}`, cwd: CWD, sessionId: SID, timestamp: iso(ms),
  message: { content: [{ type: "tool_result", tool_use_id: id, content, ...extra }] },
});
const feed = (s: SessionStore, ...recs: object[]) => { for (const r of recs) for (const e of parseRecord(r)) s.applyEvent(SID, e); };

let tmp: string;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gramam-tools-")); });
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("tool detail and output in the parser", () => {
  it("emits the key input with tool_start", () => {
    const [ev] = parseRecord(use(0, "b1", "Bash", { command: "npm test", description: "Run tests" })).filter((e) => e.t === "tool_start");
    expect(ev).toMatchObject({ t: "tool_start", name: "Bash", detail: "$ npm test" });
    expect(toolDetail("Read", { file_path: "C:/x/auth.ts" })).toBe("C:/x/auth.ts");
    expect(toolDetail("Grep", { pattern: "token", path: "src" })).toBe("token  in src");
    expect(toolDetail("WebFetch", { url: "https://example.com" })).toBe("https://example.com");
    expect(toolDetail("Agent", { subagent_type: "Explore", description: "Find auth" })).toBe("Explore: Find auth");
    expect(toolDetail("Write", { file_path: "a.ts", content: "SECRET FILE BODY" })).toBe("a.ts");
    expect(toolDetail("Bash", { command: "x".repeat(2000) })!.length).toBe(500);
  });

  it("emits Bash stdout, a Read result and an error with tool_end", () => {
    const bash = parseRecord(result(1, "b1", "PASS  3 tests\nall good", { is_error: false }));
    expect(bash[bash.length - 1]).toMatchObject({ t: "tool_end", id: "b1", isError: false, output: "PASS  3 tests\nall good" });
    const read = parseRecord(result(1, "r1", "     1\tconst a = 1;\n     2\texport default a;"));
    expect(read.find((e) => e.t === "tool_end")).toMatchObject({ output: "     1\tconst a = 1;\n     2\texport default a;" });
    const err = parseRecord(result(1, "e1", "Exit code 1\nnpm ERR! missing script: tset", { is_error: true }));
    expect(err.find((e) => e.t === "tool_end")).toMatchObject({ isError: true, output: "Exit code 1\nnpm ERR! missing script: tset" });
  });

  it("joins array-of-blocks results, replaces images and strips system reminders", () => {
    const evs = parseRecord(result(1, "s1", [
      { type: "text", text: "Screenshot taken" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } },
      { type: "text", text: "<system-reminder>hidden context</system-reminder>done" },
    ]));
    const end = evs.find((e) => e.t === "tool_end");
    expect(end).toMatchObject({ output: "Screenshot taken\n[image]\ndone" });
    expect(JSON.stringify(end)).not.toContain("iVBORw0KGgo");
    expect(JSON.stringify(end)).not.toContain("hidden context");
  });

  it("keeps the tail of long output and flags it", () => {
    const long = Array.from({ length: 2000 }, (_, i) => `line ${i}`).join("\n");
    const out = toolOutput(long)!;
    expect(out.clipped).toBe(true);
    expect(out.output.length).toBe(TOOL_OUTPUT_MAX);
    expect(out.output.endsWith("line 1999")).toBe(true);
    expect(out.output).not.toContain("line 0\n");
    const ev = parseRecord(result(1, "big", long)).find((e) => e.t === "tool_end");
    expect(ev).toMatchObject({ outputClipped: true });
    expect(toolOutput("short")).toEqual({ output: "short", clipped: false });
    expect(toolOutput(undefined)).toBeUndefined();
  });
});

describe("tool output in the store", () => {
  it("updates the tool's chat line on tool_end and pushes it", () => {
    const s = new SessionStore();
    const pushed: ChatItem[] = [];
    s.onChat = (_id, items) => pushed.push(...items);
    feed(s, use(0, "b1", "Bash", { command: "npm test" }));
    expect(s.chat(SID)[0]).toMatchObject({ kind: "tool", tool: "Bash", detail: "$ npm test" });
    expect(s.chat(SID)[0].output).toBeUndefined();
    feed(s, result(1500, "b1", "boom", { is_error: true }));
    const item = s.chat(SID)[0];
    expect(item).toMatchObject({ id: "tool:b1", output: "boom", isError: true, endedAt: T0 + 1500 });
    expect(pushed.at(-1)).toEqual(item);
    expect(s.chat(SID)).toHaveLength(1);
  });

  it("leaves output undefined for hook-only calls, and keeps it when the hook ends after the transcript", () => {
    const s = new SessionStore();
    s.applyHook({ hook_event_name: "PreToolUse", session_id: SID, cwd: CWD, tool_name: "Bash", tool_use_id: "h1", tool_input: { command: "ls" } }, T0);
    s.applyHook({ hook_event_name: "PostToolUse", session_id: SID, tool_name: "Bash", tool_use_id: "h1" }, T0 + 100);
    expect(s.chat(SID)[0]).toMatchObject({ detail: "$ ls", endedAt: T0 + 100, output: undefined });
    feed(s, result(200, "h1", "a.ts\nb.ts"));
    expect(s.chat(SID)[0]).toMatchObject({ endedAt: T0 + 100, output: "a.ts\nb.ts" });
    s.applyHook({ hook_event_name: "PostToolUse", session_id: SID, tool_name: "Bash", tool_use_id: "h1" }, T0 + 300);
    expect(s.chat(SID)[0].output).toBe("a.ts\nb.ts");
  });
});

describe("tool output in chat history", () => {
  it("attaches results to older tool calls when a chat is opened", async () => {
    const claude = path.join(tmp, ".claude");
    const proj = path.join(claude, "projects", "C--work-chaya-app");
    fs.mkdirSync(proj, { recursive: true });
    const now = Date.now();
    const at = (ms: number) => new Date(now - 60_000 + ms).toISOString();
    const lines: object[] = [
      { ...use(0, "old1", "Bash", { command: "git status" }), timestamp: at(0) },
      { ...result(10, "old1", "On branch main"), timestamp: at(10) },
      { ...use(20, "old2", "Read", { file_path: "a.ts" }), timestamp: at(20) },
      { ...result(30, "old2", "nope", { is_error: true }), timestamp: at(30) },
    ];
    const pad = "x".repeat(2000);
    for (let i = 0; i < 300; i++) lines.push({ type: "attachment", sessionId: SID, cwd: CWD, timestamp: at(40 + i), attachment: { pad } });
    fs.writeFileSync(path.join(proj, `${SID}.jsonl`), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");

    const m = new Monitor({ claudeDir: claude });
    m.scan();
    await m.loadChatHistory(SID);
    const tools = m.store.chat(SID).filter((c) => c.kind === "tool");
    expect(tools).toEqual([
      expect.objectContaining({ id: "tool:old1", detail: "$ git status", output: "On branch main", endedAt: Date.parse(at(10)) }),
      expect.objectContaining({ id: "tool:old2", detail: "a.ts", output: "nope", isError: true }),
    ]);
  });
});
