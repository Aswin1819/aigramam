/**
 * Read-only Git helpers for the "Changes" view.
 *
 * Every call is `execFile("git", [...])` — never a shell — and only runs
 * commands that read: rev-parse, status, diff, log. Nothing here fetches,
 * stages, checks out, stashes, commits or changes config.
 *
 * Safety flags on every call:
 *   --no-optional-locks       status won't refresh/write the index
 *   -c core.quotepath=false   paths come back as real UTF-8
 *   -c core.fsmonitor=false   a repo's config can't make us run its fsmonitor hook
 *   diff: --no-ext-diff --no-textconv  no external diff or textconv programs
 *
 * When Git can't answer (not a repo, git not installed, timed out, folder
 * gone) the result is `{ available: false, reason, message }` — never a guess.
 */
import { execFile } from "child_process";
import fs from "fs";
import path from "path";

export const GIT_TIMEOUT_MS = 5000;
export const GIT_MAX_BUFFER = 2 * 1024 * 1024;
export const MAX_FILES = 500;
export const MAX_DIFF_BYTES = 200 * 1024;

export interface GitOptions {
  /** The git executable (tests point it at a missing binary). */
  gitBin?: string;
  timeoutMs?: number;
}

export type UnavailableReason = "not-a-repo" | "git-missing" | "timeout" | "folder-missing" | "error";

export interface GitUnavailable {
  available: false;
  reason: UnavailableReason;
  message: string;
}

export type ChangeStatus = "modified" | "added" | "deleted" | "renamed" | "copied" | "typechange" | "untracked" | "conflicted";
export type ChangeArea = "staged" | "unstaged" | "untracked";

export interface GitFileChange {
  /** Path relative to the repository top level, forward slashes. */
  path: string;
  /** For renames/copies: the old path. */
  origPath?: string;
  status: ChangeStatus;
  /** One letter for the list: M A D R C T ? U. */
  letter: string;
  area: ChangeArea;
  /** Line counts from numstat; null when unknown (untracked) or binary. */
  additions: number | null;
  deletions: number | null;
  binary: boolean;
}

export interface GitLastCommit {
  hash: string;
  subject: string;
  author: string;
  relative: string;
}

export interface GitStatusOk {
  available: true;
  /** The repository top level (may be a parent of the project folder). */
  toplevel: string;
  branch: string | null;
  detached: boolean;
  upstream: string | null;
  ahead: number | null;
  behind: number | null;
  lastCommit: GitLastCommit | null;
  files: GitFileChange[];
  totalFiles: number;
  /** How many changes weren't listed because of the MAX_FILES cap. */
  moreFiles: number;
}

export type GitStatusResult = GitStatusOk | GitUnavailable;

export interface GitDiffOk {
  available: true;
  file: string;
  staged: boolean;
  untracked: boolean;
  kind: "text" | "binary" | "empty" | "too-large";
  diff: string;
  clipped: boolean;
}

export type GitDiffResult = GitDiffOk | GitUnavailable;

// ── Running git ───────────────────────────────────────────────────────────────

const BASE_ARGS = ["--no-optional-locks", "-c", "core.quotepath=false", "-c", "core.fsmonitor=false", "-c", "color.ui=false"];

interface RunOk {
  ok: true;
  stdout: string;
  /** Output hit maxBuffer; stdout holds what was read. */
  overflow: boolean;
}
interface RunFail {
  ok: false;
  kind: "missing" | "timeout" | "exit";
  code: number | null;
  stderr: string;
  message: string;
}

function runGit(cwd: string, args: string[], opts: GitOptions = {}): Promise<RunOk | RunFail> {
  return new Promise((resolve) => {
    execFile(
      opts.gitBin ?? "git",
      [...BASE_ARGS, ...args],
      {
        cwd,
        timeout: opts.timeoutMs ?? GIT_TIMEOUT_MS,
        maxBuffer: GIT_MAX_BUFFER,
        windowsHide: true,
        encoding: "utf8",
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" },
      },
      (err, stdout, stderr) => {
        if (!err) return resolve({ ok: true, stdout: String(stdout), overflow: false });
        const e = err as NodeJS.ErrnoException & { killed?: boolean; signal?: string | null; code?: unknown };
        if (e.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
          return resolve({ ok: true, stdout: String(stdout ?? ""), overflow: true });
        }
        if (e.code === "ENOENT") {
          return resolve({ ok: false, kind: "missing", code: null, stderr: "", message: "Git isn't installed or isn't on PATH." });
        }
        if (e.killed || e.signal || e.code === "ETIMEDOUT") {
          return resolve({ ok: false, kind: "timeout", code: null, stderr: String(stderr ?? ""), message: `Git took longer than ${Math.round((opts.timeoutMs ?? GIT_TIMEOUT_MS) / 1000)} s.` });
        }
        const code = typeof e.code === "number" ? e.code : null;
        const errText = String(stderr ?? "").trim();
        resolve({ ok: false, kind: "exit", code, stderr: errText, message: errText.split(/\r?\n/)[0] || e.message });
      },
    );
  });
}

function unavailable(fail: RunFail, fallback: UnavailableReason = "error"): GitUnavailable {
  if (fail.kind === "missing") return { available: false, reason: "git-missing", message: fail.message };
  if (fail.kind === "timeout") return { available: false, reason: "timeout", message: fail.message };
  return { available: false, reason: fallback, message: fail.message };
}

interface Repo {
  toplevel: string;
}

async function openRepo(root: string, opts: GitOptions): Promise<Repo | GitUnavailable> {
  let isDir = false;
  try {
    isDir = fs.statSync(root).isDirectory();
  } catch {}
  // A missing cwd makes spawn fail with ENOENT too; say what really happened.
  if (!isDir) return { available: false, reason: "folder-missing", message: "The project folder doesn't exist any more." };
  const r = await runGit(root, ["rev-parse", "--show-toplevel"], opts);
  if (!r.ok) {
    if (r.kind === "exit") return { available: false, reason: "not-a-repo", message: "Not a Git repository." };
    return unavailable(r);
  }
  const top = r.stdout.trim();
  if (!top) return { available: false, reason: "not-a-repo", message: "Not a Git repository." };
  return { toplevel: path.resolve(top) };
}

// ── Parsing ───────────────────────────────────────────────────────────────────

const LETTER_STATUS: Record<string, ChangeStatus> = {
  M: "modified",
  A: "added",
  D: "deleted",
  R: "renamed",
  C: "copied",
  T: "typechange",
};

interface ParsedStatus {
  branch: string | null;
  detached: boolean;
  upstream: string | null;
  ahead: number | null;
  behind: number | null;
  files: GitFileChange[];
}

/** Parse `git status --porcelain=v2 --branch -z`. Exported for tests. */
export function parsePorcelainV2(out: string): ParsedStatus {
  const res: ParsedStatus = { branch: null, detached: false, upstream: null, ahead: null, behind: null, files: [] };
  const parts = out.split("\0");
  const entry = (p: string, status: ChangeStatus, letter: string, area: ChangeArea, origPath?: string): GitFileChange => ({
    path: p,
    ...(origPath !== undefined ? { origPath } : {}),
    status,
    letter,
    area,
    additions: null,
    deletions: null,
    binary: false,
  });
  for (let i = 0; i < parts.length; i++) {
    const line = parts[i];
    if (!line) continue;
    if (line.startsWith("# ")) {
      const [, key, ...rest] = line.split(" ");
      const val = rest.join(" ");
      if (key === "branch.head") {
        if (val === "(detached)") res.detached = true;
        else res.branch = val;
      } else if (key === "branch.upstream") res.upstream = val;
      else if (key === "branch.ab") {
        const m = /^\+(\d+) -(\d+)$/.exec(val);
        if (m) {
          res.ahead = Number(m[1]);
          res.behind = Number(m[2]);
        }
      }
      continue;
    }
    const kind = line[0];
    if (kind === "?") {
      res.files.push(entry(line.slice(2), "untracked", "?", "untracked"));
      continue;
    }
    if (kind === "!") continue;
    if (kind === "1" || kind === "2") {
      // 1 XY sub mH mI mW hH hI path   |   2 XY sub mH mI mW hH hI Xscore path \0 origPath
      const fieldCount = kind === "1" ? 8 : 9;
      const fields = line.split(" ");
      const xy = fields[1] ?? "..";
      const p = fields.slice(fieldCount).join(" ");
      const orig = kind === "2" ? parts[++i] : undefined;
      const [x, y] = [xy[0], xy[1]];
      if (x && x !== ".") res.files.push(entry(p, LETTER_STATUS[x] ?? "modified", x, "staged", orig));
      if (y && y !== ".") res.files.push(entry(p, LETTER_STATUS[y] ?? "modified", y, "unstaged"));
      continue;
    }
    if (kind === "u") {
      // u XY sub m1 m2 m3 mW h1 h2 h3 path
      const p = line.split(" ").slice(10).join(" ");
      res.files.push(entry(p, "conflicted", "U", "unstaged"));
    }
  }
  return res;
}

interface NumStat {
  additions: number | null;
  deletions: number | null;
  binary: boolean;
}

/** Parse `git diff --numstat -z`: keyed by the (new) path. Exported for tests. */
export function parseNumstat(out: string): Map<string, NumStat> {
  const map = new Map<string, NumStat>();
  const parts = out.split("\0");
  for (let i = 0; i < parts.length; i++) {
    const rec = parts[i];
    if (!rec) continue;
    const m = /^(-|\d+)\t(-|\d+)\t(.*)$/s.exec(rec);
    if (!m) continue;
    let p = m[3];
    if (p === "") {
      // Rename/copy: "<a>\t<d>\t\0<old>\0<new>"
      i += 2;
      p = parts[i] ?? "";
    }
    const binary = m[1] === "-" && m[2] === "-";
    map.set(p, { additions: binary ? null : Number(m[1]), deletions: binary ? null : Number(m[2]), binary });
  }
  return map;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function gitStatus(root: string, opts: GitOptions = {}): Promise<GitStatusResult> {
  const repo = await openRepo(root, opts);
  if ("available" in repo) return repo;
  const cwd = repo.toplevel;

  const [st, unstagedNum, stagedNum, log] = await Promise.all([
    runGit(cwd, ["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all", "--ignore-submodules=dirty"], opts),
    runGit(cwd, ["diff", "--numstat", "-z", "--no-ext-diff", "--no-textconv", "--no-color"], opts),
    runGit(cwd, ["diff", "--cached", "--numstat", "-z", "--no-ext-diff", "--no-textconv", "--no-color"], opts),
    runGit(cwd, ["log", "-1", "--format=%h%x00%s%x00%an%x00%ar"], opts),
  ]);
  if (!st.ok) return unavailable(st);

  const parsed = parsePorcelainV2(st.stdout);
  const unstaged = unstagedNum.ok ? parseNumstat(unstagedNum.stdout) : new Map<string, NumStat>();
  const staged = stagedNum.ok ? parseNumstat(stagedNum.stdout) : new Map<string, NumStat>();
  for (const f of parsed.files) {
    const n = f.area === "staged" ? staged.get(f.path) : f.area === "unstaged" ? unstaged.get(f.path) : undefined;
    if (n) {
      f.additions = n.additions;
      f.deletions = n.deletions;
      f.binary = n.binary;
    }
  }

  let lastCommit: GitLastCommit | null = null;
  if (log.ok && log.stdout.trim()) {
    const [hash, subject, author, relative] = log.stdout.replace(/\r?\n$/, "").split("\0");
    if (hash) lastCommit = { hash, subject: subject ?? "", author: author ?? "", relative: relative ?? "" };
  }

  const totalFiles = parsed.files.length;
  return {
    available: true,
    toplevel: cwd,
    branch: parsed.branch,
    detached: parsed.detached,
    upstream: parsed.upstream,
    ahead: parsed.ahead,
    behind: parsed.behind,
    lastCommit,
    files: parsed.files.slice(0, MAX_FILES),
    totalFiles,
    moreFiles: Math.max(0, totalFiles - MAX_FILES),
  };
}

/** A repo-relative path that can't climb out or be absolute. */
export function isSafeRepoPath(p: string): boolean {
  if (typeof p !== "string" || p.length === 0 || p.length > 4096 || p.includes("\0")) return false;
  if (path.isAbsolute(p) || path.win32.isAbsolute(p) || /^[A-Za-z]:/.test(p)) return false;
  return !p.split(/[\\/]+/).some((s) => s === ".." || s === ".");
}

function clip(text: string): { text: string; clipped: boolean } {
  if (Buffer.byteLength(text, "utf8") <= MAX_DIFF_BYTES) return { text, clipped: false };
  let cut = Buffer.from(text, "utf8").subarray(0, MAX_DIFF_BYTES).toString("utf8");
  // Don't end on half a line (or a broken UTF-8 character).
  const nl = cut.lastIndexOf("\n");
  if (nl > 0) cut = cut.slice(0, nl + 1);
  return { text: cut.replace(/�$/, ""), clipped: true };
}

/**
 * The unified diff for one changed file. `file` must be a path that
 * `gitStatus` reported for this root (the caller checks; this re-checks).
 */
export async function gitDiff(root: string, file: string, staged: boolean, opts: GitOptions = {}): Promise<GitDiffResult> {
  if (!isSafeRepoPath(file)) return { available: false, reason: "error", message: "Not a changed file in this project." };
  const status = await gitStatus(root, opts);
  if (!status.available) return status;
  const change = findChange(status, file, staged);
  if (!change) return { available: false, reason: "error", message: "Not a changed file in this project." };

  if (change.area === "untracked") return untrackedDiff(status.toplevel, change.path);

  const args = ["diff", ...(staged ? ["--cached"] : []), "--no-color", "--no-ext-diff", "--no-textconv", "-M", "--"];
  args.push(change.path);
  if (change.origPath) args.push(change.origPath);
  const r = await runGit(status.toplevel, args, opts);
  if (!r.ok) return unavailable(r);
  const c = clip(r.stdout);
  const body = c.text;
  const binary = /^Binary files .* differ$/m.test(body) || /^GIT binary patch$/m.test(body);
  return {
    available: true,
    file: change.path,
    staged,
    untracked: false,
    kind: binary ? "binary" : body.trim() ? "text" : "empty",
    diff: binary ? "" : body,
    clipped: c.clipped || r.overflow,
  };
}

/** The change `file` refers to, by new or old path, preferring the requested area. */
export function findChange(status: GitStatusOk, file: string, staged: boolean): GitFileChange | undefined {
  const norm = file.replace(/\\/g, "/");
  const matches = status.files.filter((f) => f.path === norm || f.origPath === norm);
  if (staged) return matches.find((f) => f.area === "staged");
  return matches.find((f) => f.area === "unstaged") ?? matches.find((f) => f.area === "untracked");
}

function untrackedDiff(toplevel: string, rel: string): GitDiffResult {
  const base = path.resolve(toplevel);
  const abs = path.resolve(base, ...rel.split("/"));
  const back = path.relative(base, abs);
  if (!back || back.startsWith("..") || path.isAbsolute(back)) {
    return { available: false, reason: "error", message: "Not a changed file in this project." };
  }
  const result = (kind: GitDiffOk["kind"], diff = "", clipped = false): GitDiffOk => ({ available: true, file: rel, staged: false, untracked: true, kind, diff, clipped });
  let st: fs.Stats;
  try {
    st = fs.lstatSync(abs);
  } catch {
    return { available: false, reason: "error", message: "The file couldn't be read (it may have just been removed)." };
  }
  if (!st.isFile()) return result("binary");
  if (st.size > MAX_DIFF_BYTES) return result("too-large", "", true);
  let buf: Buffer;
  try {
    buf = fs.readFileSync(abs);
  } catch {
    return { available: false, reason: "error", message: "The file couldn't be read." };
  }
  if (buf.subarray(0, 8000).includes(0)) return result("binary");
  if (buf.length === 0) return result("empty");
  const text = buf.toString("utf8");
  const lines = text.split(/\r?\n/);
  const noFinalNewline = !/\n$/.test(text);
  if (!noFinalNewline) lines.pop();
  const out = [`--- /dev/null`, `+++ b/${rel}`, `@@ -0,0 +1,${lines.length} @@`, ...lines.map((l) => `+${l}`)];
  if (noFinalNewline) out.push("\\ No newline at end of file");
  return result("text", out.join("\n") + "\n");
}
