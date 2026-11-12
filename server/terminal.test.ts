import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import * as pty from "node-pty";
import { TERMINAL_LIMITS, type TerminalInfo } from "@shared/terminal";
import { TerminalManager, type PtyLike, type Spawn } from "./terminal/manager";

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gramam-term-"));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** A fake terminal process that records what happens to it. */
function fakeSpawn() {
  const made: Array<{ shell: string; cwd: string; cols: number; rows: number; writes: string[]; killed: boolean; emit: (d: string) => void; exit: (c: number) => void; resized: [number, number][] }> = [];
  const spawn: Spawn = (shell, _args, o) => {
    let onData: (d: string) => void = () => {};
    let onExit: (e: { exitCode: number }) => void = () => {};
    const rec = { shell, cwd: o.cwd, cols: o.cols, rows: o.rows, writes: [] as string[], killed: false, resized: [] as [number, number][], emit: (d: string) => onData(d), exit: (c: number) => onExit({ exitCode: c }) };
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

function setup() {
  const proj = { id: "p1", name: "app", root: tmp };
  const { spawn, made } = fakeSpawn();
  const outputs: Array<[string, string]> = [];
  const lists: TerminalInfo[][] = [];
  const m = new TerminalManager({ spawn, projects: () => [proj], onOutput: (id, d) => outputs.push([id, d]), onList: (l) => lists.push(l), flushMs: 1 });
  return { m, made, outputs, lists, proj };
}

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

describe("managed terminals", () => {
  it("only start in a known project's existing folder", () => {
    const { m, made } = setup();
    expect(m.create("C:\\Windows", 80, 24)).toMatchObject({ ok: false });
    expect(made).toHaveLength(0);
    const r = m.create("p1", 80, 24);
    expect(r.ok).toBe(true);
    expect(made[0]).toMatchObject({ shell: "powershell.exe", cwd: tmp, cols: 80, rows: 24 });

    const gone = new TerminalManager({ spawn: fakeSpawn().spawn, projects: () => [{ id: "x", name: "x", root: path.join(tmp, "missing") }], onOutput: () => {}, onList: () => {} });
    expect(gone.create("x", 80, 24)).toMatchObject({ ok: false, error: expect.stringContaining("no longer exists") });
  });

  it("clamps sizes and caps how many are open", () => {
    const { m, made } = setup();
    m.create("p1", 5, 9999);
    expect(made[0]).toMatchObject({ cols: TERMINAL_LIMITS.minCols, rows: TERMINAL_LIMITS.maxRows });
    for (let i = 1; i < TERMINAL_LIMITS.maxOpen; i++) expect(m.create("p1", 80, 24).ok).toBe(true);
    expect(m.create("p1", 80, 24)).toMatchObject({ ok: false, error: expect.stringContaining(`${TERMINAL_LIMITS.maxOpen}`) });
  });

  it("batches output, keeps a bounded scrollback, and passes input through", async () => {
    const { m, made, outputs } = setup();
    const r = m.create("p1", 80, 24);
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
    const r = m.create("p1", 80, 24);
    if (!r.ok) throw new Error(r.error);
    made[0]!.emit("before-attach");
    const replay = m.scrollback(r.id); // a tab attaches before the batch is flushed
    expect(replay).toBe("before-attach");
    expect(outputs).toEqual([[r.id, "before-attach"]]); // flushed to earlier viewers, not queued again
    await tick();
    expect(outputs).toHaveLength(1);
  });

  it("reports the exit code, refuses input after exit, and closes cleanly", () => {
    const { m, made, lists } = setup();
    const a = m.create("p1", 80, 24);
    const b = m.create("p1", 80, 24);
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
    const r = m.create("p", 100, 30);
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
