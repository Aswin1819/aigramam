import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import * as pty from "node-pty";
import { CLAUDE_CLI_MISSING, TERMINAL_LIMITS, type TerminalInfo } from "@shared/terminal";
import type { SessionView } from "@shared/model";
import type { RegistryEntry } from "./monitor/registry";
import { TerminalManager, terminalEnv, type PtyLike, type Spawn, type TerminalManagerOptions } from "./terminal/manager";
import { attachTerminalIds, matchSessions, parseProcessJson, type ProcInfo } from "./terminal/links";

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gramam-term-"));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** A fake terminal process that records what happens to it. */
function fakeSpawn() {
  const made: Array<{ shell: string; args: string[]; cwd: string; cols: number; rows: number; writes: string[]; killed: boolean; emit: (d: string) => void; exit: (c: number) => void; resized: [number, number][] }> = [];
  const spawn: Spawn = (shell, args, o) => {
    let onData: (d: string) => void = () => {};
    let onExit: (e: { exitCode: number }) => void = () => {};
    const rec = { shell, args, cwd: o.cwd, cols: o.cols, rows: o.rows, writes: [] as string[], killed: false, resized: [] as [number, number][], emit: (d: string) => onData(d), exit: (c: number) => onExit({ exitCode: c }) };
    made.push(rec);
    const p: PtyLike = {
      pid: 1000 + made.length,
      write: (d) => rec.writes.push(d),
      resize: (c, r) => rec.resized.push([c, r]),
      kill: () => (rec.killed = true),
      onData: (cb) => (onData = cb),
      onExit: (cb) => (onExit = cb),
    };
    return p;
  };
  return { spawn, made };
}

function setup(extra: Partial<TerminalManagerOptions> = {}) {
  const proj = { id: "p1", name: "app", root: tmp };
  const { spawn, made } = fakeSpawn();
  const outputs: Array<[string, string]> = [];
  const lists: TerminalInfo[][] = [];
  const m = new TerminalManager({ spawn, projects: () => [proj], onOutput: (id, d) => outputs.push([id, d]), onList: (l) => lists.push(l), flushMs: 1, ...extra });
  return { m, made, outputs, lists, proj };
}

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

describe("managed terminals", () => {
  it("only start in a known project's existing folder", async () => {
    const { m, made } = setup();
    expect(await m.create("C:\\Windows", 80, 24)).toMatchObject({ ok: false });
    expect(made).toHaveLength(0);
    const r = await m.create("p1", 80, 24);
    expect(r.ok).toBe(true);
    expect(made[0]).toMatchObject({ shell: "powershell.exe", cwd: tmp, cols: 80, rows: 24 });

    const gone = new TerminalManager({ spawn: fakeSpawn().spawn, projects: () => [{ id: "x", name: "x", root: path.join(tmp, "missing") }], onOutput: () => {}, onList: () => {} });
    expect(await gone.create("x", 80, 24)).toMatchObject({ ok: false, error: expect.stringContaining("no longer exists") });
  });

  it("clamps sizes and caps how many are open", async () => {
    const { m, made } = setup();
    await m.create("p1", 5, 9999);
    expect(made[0]).toMatchObject({ cols: TERMINAL_LIMITS.minCols, rows: TERMINAL_LIMITS.maxRows });
    for (let i = 1; i < TERMINAL_LIMITS.maxOpen; i++) expect((await m.create("p1", 80, 24)).ok).toBe(true);
    expect(await m.create("p1", 80, 24)).toMatchObject({ ok: false, error: expect.stringContaining(`${TERMINAL_LIMITS.maxOpen}`) });
  });

  it("batches output, keeps a bounded scrollback, and passes input through", async () => {
    const { m, made, outputs } = setup();
    const r = await m.create("p1", 80, 24);
    if (!r.ok) throw new Error(r.error);
    made[0]!.emit("hel");
    made[0]!.emit("lo");
    await tick();
    expect(outputs).toEqual([[r.id, "hello"]]);
    expect(m.scrollback(r.id)).toBe("hello");
    const big = "x".repeat(70 * 1024);
    for (let i = 0; i < 5; i++) made[0]!.emit(big);
    expect(m.scrollback(r.id)!.length).toBeLessThanOrEqual(TERMINAL_LIMITS.scrollbackBytes);

    expect(m.input(r.id, "dir\r")).toBe(true);
    expect(m.input(r.id, "y".repeat(TERMINAL_LIMITS.maxInputBytes + 1))).toBe(false);
    expect(m.input("nope", "dir\r")).toBe(false);
    expect(made[0]!.writes).toEqual(["dir\r"]);
    expect(m.resize(r.id, 120, 40)).toBe(true);
    expect(made[0]!.resized).toEqual([[120, 40]]);
  });

  it("never sends the same output twice to a tab that opens mid-batch", async () => {
    const { m, made, outputs } = setup();
    const r = await m.create("p1", 80, 24);
    if (!r.ok) throw new Error(r.error);
    made[0]!.emit("before-attach");
    const replay = m.scrollback(r.id); // a tab attaches before the batch is flushed
    expect(replay).toBe("before-attach");
    expect(outputs).toEqual([[r.id, "before-attach"]]); // flushed to earlier viewers, not queued again
    await tick();
    expect(outputs).toHaveLength(1);
  });

  it("reports the exit code, refuses input after exit, and closes cleanly", async () => {
    const { m, made, lists } = setup();
    const a = await m.create("p1", 80, 24);
    const b = await m.create("p1", 80, 24);
    if (!a.ok || !b.ok) throw new Error("create failed");
    made[0]!.exit(3);
    expect(m.list().find((t) => t.id === a.id)).toMatchObject({ status: "exited", exitCode: 3 });
    expect(lists.at(-1)!.find((t) => t.id === a.id)?.status).toBe("exited");
    expect(m.input(a.id, "x")).toBe(false);
    expect(m.close(a.id)).toBe(true);
    expect(made[0]!.killed).toBe(false); // already exited: nothing to stop
    m.closeAll();
    expect(made[1]!.killed).toBe(true);
    expect(m.list()).toEqual([]);
  });

  it.runIf(process.platform === "win32")("runs a real PowerShell in the project folder", async () => {
    const outputs: string[] = [];
    let done: () => void = () => {};
    const exited = new Promise<void>((r) => (done = r));
    const m = new TerminalManager({
      spawn: (shell, args, o) => pty.spawn(shell, args, { name: "xterm-256color", cols: o.cols, rows: o.rows, cwd: o.cwd, env: o.env as Record<string, string>, useConpty: true }),
      projects: () => [{ id: "p", name: "p", root: tmp }],
      onOutput: (_id, d) => outputs.push(d),
      onList: (l) => l[0]?.status === "exited" && done(),
    });
    const r = await m.create("p", 100, 30);
    if (!r.ok) throw new Error(r.error);
    setTimeout(() => m.input(r.id, "Write-Output gramam-ok; Get-Location; exit 5\r"), 1500);
    await exited;
    const text = outputs.join("");
    expect(text).toContain("gramam-ok");
    expect(text.toLowerCase()).toContain(path.basename(tmp).toLowerCase());
    expect(m.list()[0]).toMatchObject({ status: "exited", exitCode: 5 });
    m.closeAll();
  }, 30_000);
});

const reg = (pid: number, sessionId: string, alive = true): RegistryEntry => ({ pid, sessionId, alive });
const proc = (pid: number, ppid: number, name = "x.exe"): ProcInfo => ({ pid, ppid, name });

describe("Start Claude Code in a managed terminal", () => {
  it("runs `claude` as PowerShell's start command and keeps the shell open", async () => {
    const asked: string[] = [];
    const { m, made } = setup({ findCli: async (n) => (asked.push(n), true) });
    const r = await m.create("p1", 80, 24, "claude");
    expect(r.ok).toBe(true);
    expect(asked).toEqual(["claude"]);
    expect(made[0]!.args).toEqual(["-NoLogo", "-NoExit", "-Command", "claude"]);
    expect(made[0]!.writes).toEqual([]); // nothing typed
    expect(m.list()[0]).toMatchObject({ started: "claude", sessionIds: [] });
    // The CLI check is cached.
    await m.create("p1", 80, 24, "claude");
    expect(asked).toHaveLength(1);
    // A plain terminal is unchanged and doesn't check the CLI.
    await m.create("p1", 80, 24);
    expect(made[2]!.args).toEqual(["-NoLogo"]);
    expect(m.list()[2]!.started).toBeUndefined();
    expect(asked).toHaveLength(1);
  });

  it("explains when the CLI is missing and starts nothing", async () => {
    const { m, made } = setup({ findCli: async () => false });
    expect(await m.create("p1", 80, 24, "claude")).toEqual({ ok: false, error: CLAUDE_CLI_MISSING });
    expect(made).toHaveLength(0);
    const broken = setup({
      findCli: async () => {
        throw new Error("where.exe failed");
      },
    });
    expect(await broken.m.create("p1", 80, 24, "claude")).toEqual({ ok: false, error: CLAUDE_CLI_MISSING });
  });

  it("gives terminals a fresh environment without an outer Claude Code session's markers", () => {
    const env = terminalEnv({ PATH: "x", CLAUDECODE: "1", CLAUDE_CODE_CHILD_SESSION: "1", Claude_Code_Session_Id: "abc", CLAUDE_CODE_MESSAGING_TOKEN: "t", ANTHROPIC_MODEL: "m", CLAUDE_CODE_USE_BEDROCK: "1" });
    expect(env).toEqual({ PATH: "x", ANTHROPIC_MODEL: "m", CLAUDE_CODE_USE_BEDROCK: "1", AI_GRAMAM_TERMINAL: "1" });
  });

  it("refuses any other start command", async () => {
    const { m, made } = setup({ findCli: async () => true });
    expect(await m.create("p1", 80, 24, "claude; Remove-Item x")).toMatchObject({ ok: false });
    expect(await m.create("p1", 80, 24, "bash")).toMatchObject({ ok: false });
    expect(made).toHaveLength(0);
  });
});

describe("linking sessions to terminals by process tree", () => {
  it("matches direct children and grandchildren by exact pid only", () => {
    const procs = [
      proc(200, 100, "claude.exe"), // child of shell 100
      proc(300, 101, "cmd.exe"), // child of shell 101 …
      proc(301, 300, "claude.exe"), // … whose child is Claude
      proc(302, 301, "node.exe"), // great-grandchild: too deep
      proc(400, 999, "claude.exe"), // unrelated parent
    ];
    const registry = [reg(200, "s-child"), reg(301, "s-grand"), reg(302, "s-deep"), reg(400, "s-other"), reg(500, "s-nowhere")];
    const links = matchSessions([100, 101, 102], procs, registry);
    expect(links.get(100)).toEqual(["s-child"]);
    expect(links.get(101)).toEqual(["s-grand"]);
    expect(links.get(102)).toEqual([]);
  });

  it("ignores dead registry entries", () => {
    const links = matchSessions([100], [proc(200, 100)], [reg(200, "s-dead", false)]);
    expect(links.get(100)).toEqual([]);
  });

  it("parses one, many or no processes from PowerShell", () => {
    expect(parseProcessJson("")).toEqual([]);
    expect(parseProcessJson('{"ProcessId":5,"ParentProcessId":4,"Name":"claude.exe"}')).toEqual([proc(5, 4, "claude.exe")]);
    expect(parseProcessJson('[{"ProcessId":5,"ParentProcessId":4,"Name":"a"},{"ProcessId":"x"}]')).toEqual([proc(5, 4, "a")]);
    expect(parseProcessJson("not json")).toEqual([]);
  });

  it("updates terminals' sessionIds and the session lookup, and skips the lookup when nothing runs", async () => {
    let procs: ProcInfo[] = [];
    let registry: RegistryEntry[] = [];
    const calls: number[][] = [];
    const { m, lists, made } = setup({
      findCli: async () => true,
      listProcesses: async (pids) => (calls.push(pids), procs),
      registry: () => registry,
    });
    await m.refreshLinks();
    expect(calls).toHaveLength(0); // no terminals: no process lookup

    const a = await m.create("p1", 80, 24, "claude");
    const b = await m.create("p1", 80, 24);
    if (!a.ok || !b.ok) throw new Error("create failed");
    const [pa, pb] = m.list().map((t) => t.pid);
    procs = [proc(5000, pa!, "claude.exe"), proc(6000, pb!, "notepad.exe")];
    registry = [reg(5000, "sess-1"), reg(7000, "sess-elsewhere")];
    const before = lists.length;
    await m.refreshLinks();
    expect(calls.at(-1)).toEqual([pa, pb]);
    expect(m.list().find((t) => t.id === a.id)!.sessionIds).toEqual(["sess-1"]);
    expect(m.list().find((t) => t.id === b.id)!.sessionIds).toEqual([]);
    expect(m.terminalForSession("sess-1")).toBe(a.id);
    expect(m.terminalForSession("sess-elsewhere")).toBeUndefined();
    expect(lists.length).toBe(before + 1);

    // No change: no new list broadcast.
    await m.refreshLinks();
    expect(lists.length).toBe(before + 1);

    // Claude exits (its registry entry goes): the link is dropped.
    registry = [];
    await m.refreshLinks();
    expect(m.list().find((t) => t.id === a.id)!.sessionIds).toEqual([]);
    expect(m.terminalForSession("sess-1")).toBeUndefined();

    // An exited shell loses its links and is no longer looked up.
    registry = [reg(5000, "sess-1")];
    await m.refreshLinks();
    expect(m.terminalForSession("sess-1")).toBe(a.id);
    made[0]!.exit(0);
    expect(m.terminalForSession("sess-1")).toBeUndefined();
    await m.refreshLinks();
    expect(calls.at(-1)).toEqual([pb]);
    m.close(b.id);
    const n = calls.length;
    await m.refreshLinks();
    expect(calls).toHaveLength(n);
  });

  it("sets terminalId on matching sessions in a snapshot and clears stale ones", () => {
    const sessions: Array<Pick<SessionView, "id" | "terminalId">> = [{ id: "s1" }, { id: "s2", terminalId: "old" }];
    attachTerminalIds(sessions, (id) => (id === "s1" ? "t1" : undefined));
    expect(sessions[0]!.terminalId).toBe("t1");
    expect("terminalId" in sessions[1]!).toBe(false);
  });
});
