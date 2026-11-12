import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { gitDiff, gitStatus, isSafeRepoPath, parseNumstat, parsePorcelainV2, MAX_DIFF_BYTES } from "./git/status";
import { createGitRouter } from "./routers/git";

const ctx = { req: {} as never, res: {} as never };

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", ...args], { cwd, windowsHide: true, encoding: "utf8" });
}

let tmp: string;
let repo: string;
let plain: string;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aig-git-"));
  repo = path.join(tmp, "repo");
  plain = path.join(tmp, "plain");
  fs.mkdirSync(repo);
  fs.mkdirSync(plain);
  git(repo, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(repo, "a.txt"), "one\ntwo\nthree\n");
  fs.writeFileSync(path.join(repo, "staged.txt"), "base\n");
  fs.writeFileSync(path.join(repo, "gone.txt"), "bye\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "first commit");
  // Unstaged edit, a staged edit, a deletion, an untracked text file and binary file.
  fs.writeFileSync(path.join(repo, "a.txt"), "one\nTWO\nthree\nfour\n");
  fs.writeFileSync(path.join(repo, "staged.txt"), "base\nmore\n");
  git(repo, "add", "staged.txt");
  fs.rmSync(path.join(repo, "gone.txt"));
  fs.mkdirSync(path.join(repo, "dir with space"));
  fs.writeFileSync(path.join(repo, "dir with space", "new file.md"), "hello\nworld");
  fs.writeFileSync(path.join(repo, "blob.bin"), Buffer.from([1, 2, 0, 3, 4]));
  fs.writeFileSync(path.join(repo, "big.txt"), "x".repeat(MAX_DIFF_BYTES + 10));
});

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("gitStatus", () => {
  it("reports branch, last commit and changes by area with line counts", async () => {
    const s = await gitStatus(repo);
    if (!s.available) throw new Error(s.message);
    expect(s.branch).toBe("main");
    expect(s.detached).toBe(false);
    expect(s.upstream).toBeNull();
    expect(s.lastCommit?.subject).toBe("first commit");
    expect(s.lastCommit?.author).toBe("Test");
    expect(s.lastCommit?.hash).toMatch(/^[0-9a-f]{4,}$/);

    const find = (p: string, area: string) => s.files.find((f) => f.path === p && f.area === area);
    expect(find("a.txt", "unstaged")).toMatchObject({ status: "modified", letter: "M", additions: 2, deletions: 1 });
    expect(find("staged.txt", "staged")).toMatchObject({ status: "modified", additions: 1, deletions: 0 });
    expect(find("staged.txt", "unstaged")).toBeUndefined();
    expect(find("gone.txt", "unstaged")).toMatchObject({ status: "deleted", letter: "D", deletions: 1 });
    expect(find("dir with space/new file.md", "untracked")).toMatchObject({ status: "untracked", letter: "?" });
    expect(find("blob.bin", "untracked")).toBeTruthy();
    expect(s.totalFiles).toBe(s.files.length);
    expect(s.moreFiles).toBe(0);
  });

  it("doesn't write to the repository", async () => {
    const indexPath = path.join(repo, ".git", "index");
    const before = fs.statSync(indexPath).mtimeMs;
    await gitStatus(repo);
    expect(fs.existsSync(path.join(repo, ".git", "index.lock"))).toBe(false);
    expect(fs.statSync(indexPath).mtimeMs).toBe(before);
  });

  it("not a repo → available:false", async () => {
    const s = await gitStatus(plain);
    expect(s).toMatchObject({ available: false, reason: "not-a-repo" });
  });

  it("missing folder → available:false", async () => {
    expect(await gitStatus(path.join(tmp, "nope"))).toMatchObject({ available: false, reason: "folder-missing" });
  });

  it("git not installed → available:false", async () => {
    const s = await gitStatus(repo, { gitBin: path.join(tmp, "no-such-git-binary") });
    expect(s).toMatchObject({ available: false, reason: "git-missing" });
  });
});

describe("gitDiff", () => {
  it("unstaged diff of a tracked file", async () => {
    const d = await gitDiff(repo, "a.txt", false);
    if (!d.available) throw new Error(d.message);
    expect(d.kind).toBe("text");
    expect(d.diff).toContain("-two");
    expect(d.diff).toContain("+TWO");
    expect(d.diff).toContain("+four");
    expect(d.clipped).toBe(false);
  });

  it("staged diff only with staged=true", async () => {
    const d = await gitDiff(repo, "staged.txt", true);
    expect(d).toMatchObject({ available: true, kind: "text", staged: true });
    if (d.available) expect(d.diff).toContain("+more");
    // No unstaged change to staged.txt
    expect(await gitDiff(repo, "staged.txt", false)).toMatchObject({ available: false });
  });

  it("untracked text file as an all-added diff", async () => {
    const d = await gitDiff(repo, "dir with space/new file.md", false);
    if (!d.available) throw new Error(d.message);
    expect(d.untracked).toBe(true);
    expect(d.kind).toBe("text");
    expect(d.diff).toContain("+hello\n+world");
    expect(d.diff).toContain("@@ -0,0 +1,2 @@");
    expect(d.diff).toContain("No newline at end of file");
  });

  it("untracked binary and oversized files aren't shown", async () => {
    expect(await gitDiff(repo, "blob.bin", false)).toMatchObject({ available: true, kind: "binary", diff: "" });
    expect(await gitDiff(repo, "big.txt", false)).toMatchObject({ available: true, kind: "too-large", clipped: true, diff: "" });
  });

  it("rejects traversal and files that aren't changed", async () => {
    for (const bad of ["../outside.txt", "/etc/passwd", "C:\\Windows\\win.ini", "a/../../x", "./a.txt", "nope.txt"]) {
      expect(await gitDiff(repo, bad, false)).toMatchObject({ available: false });
    }
  });
});

describe("parsers", () => {
  it("parse porcelain v2 with renames and conflicts", () => {
    const out = [
      "# branch.oid abc",
      "# branch.head feat",
      "# branch.upstream origin/feat",
      "# branch.ab +2 -1",
      "2 R. N... 100644 100644 100644 aaa bbb R100 new name.txt",
      "old name.txt",
      "u UU N... 100644 100644 100644 100644 a b c conflict.txt",
      "? untracked.txt",
      "",
    ].join("\0");
    const p = parsePorcelainV2(out);
    expect(p).toMatchObject({ branch: "feat", upstream: "origin/feat", ahead: 2, behind: 1 });
    expect(p.files).toEqual([
      expect.objectContaining({ path: "new name.txt", origPath: "old name.txt", status: "renamed", area: "staged" }),
      expect.objectContaining({ path: "conflict.txt", status: "conflicted", letter: "U" }),
      expect.objectContaining({ path: "untracked.txt", status: "untracked" }),
    ]);
  });

  it("parse numstat with binary and renames", () => {
    const m = parseNumstat(["3\t1\ta.txt", "-\t-\tb.png", "0\t0\t", "old.txt", "new.txt", ""].join("\0"));
    expect(m.get("a.txt")).toEqual({ additions: 3, deletions: 1, binary: false });
    expect(m.get("b.png")).toEqual({ additions: null, deletions: null, binary: true });
    expect(m.get("new.txt")).toEqual({ additions: 0, deletions: 0, binary: false });
  });

  it("isSafeRepoPath", () => {
    expect(isSafeRepoPath("src/a.ts")).toBe(true);
    expect(isSafeRepoPath(".gitignore")).toBe(true);
    for (const bad of ["", "..", "../a", "a/../b", "/abs", "C:/x", "\\\\server\\share", "a\0b"]) expect(isSafeRepoPath(bad)).toBe(false);
  });
});

describe("git router", () => {
  const projects = () => [
    { id: "p-repo", name: "repo", root: repo },
    { id: "p-plain", name: "plain", root: plain },
  ];
  const caller = () => createGitRouter({ projects }).createCaller(ctx);

  it("resolves the folder from a known projectId", async () => {
    const s = await caller().status({ projectId: "p-repo" });
    expect(s.available).toBe(true);
    expect(await caller().status({ projectId: "p-plain" })).toMatchObject({ available: false, reason: "not-a-repo" });
  });

  it("rejects an unknown projectId", async () => {
    await expect(caller().status({ projectId: "nope" })).rejects.toThrow(/Unknown project/);
    await expect(caller().diff({ projectId: "nope", file: "a.txt", staged: false })).rejects.toThrow(/Unknown project/);
  });

  it("serves diffs only for changed files", async () => {
    const d = await caller().diff({ projectId: "p-repo", file: "a.txt", staged: false });
    expect(d).toMatchObject({ available: true, kind: "text" });
    await expect(caller().diff({ projectId: "p-repo", file: "../../etc/passwd", staged: false })).rejects.toThrow(/Not a changed file/);
    await expect(caller().diff({ projectId: "p-repo", file: "staged.txt", staged: false })).rejects.toThrow(/Not a changed file/);
  });

  it("has no mutations", () => {
    const procs = createGitRouter({ projects })._def.procedures as Record<string, { _def: { type: string } }>;
    expect(Object.values(procs).every((p) => p._def.type === "query")).toBe(true);
  });
});
