import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, GitBranch, GitCommitHorizontal, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface Props {
  projectId: string;
  projectName?: string;
}

type Area = "staged" | "unstaged" | "untracked";

interface FileChange {
  path: string;
  origPath?: string;
  status: string;
  letter: string;
  area: Area;
  additions: number | null;
  deletions: number | null;
  binary: boolean;
}

const AREAS: { area: Area; title: string }[] = [
  { area: "staged", title: "Staged" },
  { area: "unstaged", title: "Unstaged" },
  { area: "untracked", title: "Untracked" },
];

const STATUS_WORD: Record<string, string> = {
  modified: "Modified",
  added: "Added",
  deleted: "Deleted",
  renamed: "Renamed",
  copied: "Copied",
  typechange: "Type changed",
  untracked: "Untracked",
  conflicted: "Conflict",
};

function letterColor(f: FileChange): string {
  if (f.status === "conflicted") return "text-urgent";
  if (f.status === "deleted") return "text-urgent/85";
  if (f.status === "added" || f.status === "untracked") return "text-done";
  return "text-brass";
}

/**
 * Read-only Git view of a project's folder: branch, ahead/behind, last commit,
 * and the changed files with their diffs. Everything comes from `git` run on
 * the server against the project folder; nothing is changed.
 */
export default function ChangesPanel({ projectId, projectName }: Props) {
  const status = trpc.git.status.useQuery({ projectId }, { refetchInterval: 10_000, retry: false });
  const [selected, setSelected] = useState<{ path: string; area: Area } | null>(null);

  const data = status.data;
  const files = (data && data.available ? data.files : []) as FileChange[];

  // A file that's no longer changed (committed, reverted) closes its diff.
  useEffect(() => {
    if (selected && data?.available && !files.some((f) => f.path === selected.path && f.area === selected.area)) setSelected(null);
  }, [data, files, selected]);

  const groups = useMemo(() => AREAS.map((a) => ({ ...a, files: files.filter((f) => f.area === a.area) })).filter((g) => g.files.length > 0), [files]);

  return (
    <div className="text-[13px] text-cream">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-brass/90">
          Changes{projectName ? ` · ${projectName}` : ""}
        </h3>
        <button
          onClick={() => void status.refetch()}
          className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[11.5px] text-cream/75 hover:text-cream"
          title="Check Git again"
        >
          <RefreshCw size={12} className={status.isFetching ? "animate-spin" : ""} /> Refresh
        </button>
      </div>
      <p className="mb-3 text-[11px] text-cream/45">
        Read-only. Shows the project folder's Git state, not only what this session changed (several sessions can share a folder).
      </p>

      {status.isLoading ? (
        <Note>Checking Git…</Note>
      ) : status.error ? (
        <Note tone="error">Couldn't load changes: {status.error.message}</Note>
      ) : !data ? (
        <Note>No data.</Note>
      ) : !data.available ? (
        <Unavailable reason={data.reason} message={data.message} />
      ) : (
        <>
          <RepoSummary data={data} />
          {data.totalFiles === 0 ? (
            <Note>No changes. The working tree matches the last commit.</Note>
          ) : (
            <div className="mt-3 space-y-3">
              {groups.map((g) => (
                <section key={g.area}>
                  <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-cream/55">
                    {g.title} <span className="font-normal text-cream/40">({g.files.length})</span>
                  </h4>
                  <ul className="space-y-0.5">
                    {g.files.map((f) => {
                      const open = selected?.path === f.path && selected.area === f.area;
                      return (
                        <li key={`${f.area}:${f.path}`}>
                          <FileRow f={f} open={open} onClick={() => setSelected(open ? null : { path: f.path, area: f.area })} />
                          {open && <DiffView projectId={projectId} file={f} />}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
              {data.moreFiles > 0 && (
                <Note>
                  {data.moreFiles} more change{data.moreFiles === 1 ? "" : "s"} not listed (showing the first {data.files.length} of {data.totalFiles}).
                </Note>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RepoSummary({ data }: { data: { toplevel: string; branch: string | null; detached: boolean; upstream: string | null; ahead: number | null; behind: number | null; lastCommit: { hash: string; subject: string; author: string; relative: string } | null } }) {
  return (
    <div className="space-y-1 rounded-xl border border-white/8 bg-black/20 px-2.5 py-2 text-[12px] text-cream/75">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1">
          <GitBranch size={13} className="text-brass" />
          {data.detached ? "Detached HEAD (no branch)" : data.branch ?? "Unknown branch"}
        </span>
        {data.upstream ? (
          <span className="flex items-center gap-2 text-cream/60" title={`Compared with ${data.upstream} as last fetched; Ai Gramam never fetches`}>
            <span className="flex items-center gap-0.5"><ArrowUp size={12} /> {data.ahead ?? "?"} ahead</span>
            <span className="flex items-center gap-0.5"><ArrowDown size={12} /> {data.behind ?? "?"} behind</span>
            <span className="truncate text-cream/40">{data.upstream}</span>
          </span>
        ) : (
          !data.detached && <span className="text-cream/45">No upstream branch</span>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-1">
        <GitCommitHorizontal size={13} className="shrink-0 text-cream/50" />
        {data.lastCommit ? (
          <span className="min-w-0 truncate" title={`${data.lastCommit.subject} — ${data.lastCommit.author}`}>
            <span className="font-mono text-cream/55">{data.lastCommit.hash}</span> {data.lastCommit.subject}{" "}
            <span className="text-cream/45">· {data.lastCommit.author}, {data.lastCommit.relative}</span>
          </span>
        ) : (
          <span className="text-cream/45">No commits yet</span>
        )}
      </div>
      <div className="truncate font-mono text-[10.5px] text-cream/35" title="Repository folder">{data.toplevel}</div>
    </div>
  );
}

function FileRow({ f, open, onClick }: { f: FileChange; open: boolean; onClick: () => void }) {
  const counts =
    f.binary ? <span className="text-cream/45">binary</span>
    : f.additions === null && f.deletions === null ? null
    : (
      <>
        <span className="text-done">+{f.additions ?? 0}</span> <span className="text-urgent/85">−{f.deletions ?? 0}</span>
      </>
    );
  return (
    <button
      onClick={onClick}
      aria-expanded={open}
      className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-white/5 ${open ? "bg-white/5" : ""}`}
      title={`${STATUS_WORD[f.status] ?? f.status}: ${f.origPath ? `${f.origPath} → ` : ""}${f.path}. Click to ${open ? "hide" : "show"} the diff.`}
    >
      {open ? <ChevronDown size={13} className="shrink-0 text-cream/50" /> : <ChevronRight size={13} className="shrink-0 text-cream/50" />}
      <span className={`w-4 shrink-0 text-center font-mono font-bold ${letterColor(f)}`} aria-label={STATUS_WORD[f.status] ?? f.status}>{f.letter}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[12px]">
        {f.origPath && <span className="text-cream/45">{f.origPath} → </span>}
        {f.path}
      </span>
      <span className="shrink-0 font-mono text-[11px] tabular-nums">{counts}</span>
    </button>
  );
}

function DiffView({ projectId, file }: { projectId: string; file: FileChange }) {
  const diff = trpc.git.diff.useQuery(
    { projectId, file: file.path, staged: file.area === "staged" },
    { refetchInterval: 10_000, retry: false },
  );
  const d = diff.data;
  return (
    <div className="mb-2 ml-5 mt-1">
      {diff.isLoading ? (
        <Note>Loading the diff…</Note>
      ) : diff.error ? (
        <Note tone="error">Couldn't load the diff: {diff.error.message}</Note>
      ) : !d ? null : !d.available ? (
        <Note tone="error">{d.message}</Note>
      ) : d.kind === "binary" ? (
        <Note>Binary file. No text diff to show.</Note>
      ) : d.kind === "too-large" ? (
        <Note>This file is larger than 200 KB, so it isn't shown.</Note>
      ) : d.kind === "empty" ? (
        <Note>{d.untracked ? "Empty file." : "No text differences (only mode or metadata changed)."}</Note>
      ) : (
        <>
          <DiffText text={d.diff} />
          {d.clipped && <Note>The diff is longer than 200 KB; only the start is shown.</Note>}
        </>
      )}
    </div>
  );
}

/** Plain-text diff lines with added/removed colouring. Never rendered as HTML. */
function DiffText({ text }: { text: string }) {
  const lines = useMemo(() => text.replace(/\n$/, "").split("\n"), [text]);
  return (
    <pre className="max-h-[420px] overflow-auto rounded-lg border border-white/8 bg-black/35 py-1.5 font-mono text-[11.5px] leading-[1.45]">
      {lines.map((line, i) => (
        <div key={i} className={`whitespace-pre px-2 ${lineClass(line)}`}>{line || " "}</div>
      ))}
    </pre>
  );
}

function lineClass(line: string): string {
  if (line.startsWith("+++") || line.startsWith("---")) return "text-cream/55";
  if (line.startsWith("@@")) return "text-brass/85";
  if (line.startsWith("+")) return "bg-done/10 text-done";
  if (line.startsWith("-")) return "bg-urgent/10 text-urgent";
  if (/^(diff |index |new file|deleted file|similarity|rename |old mode|new mode|\\ )/.test(line)) return "text-cream/40";
  return "text-cream/75";
}

function Unavailable({ reason, message }: { reason: string; message: string }) {
  const text =
    reason === "not-a-repo" ? "Not a Git repository. This project folder isn't tracked by Git."
    : reason === "git-missing" ? "Git isn't installed or couldn't run. Install Git and make sure it's on PATH."
    : reason === "timeout" ? "Git took too long to answer (over 5 s). Try Refresh."
    : reason === "folder-missing" ? "The project folder doesn't exist any more."
    : `Git couldn't read this folder: ${message}`;
  return <Note tone={reason === "not-a-repo" ? undefined : "error"}>{text}</Note>;
}

function Note({ children, tone }: { children: React.ReactNode; tone?: "error" }) {
  return <p className={`text-[12px] ${tone === "error" ? "text-urgent/90" : "text-cream/55"}`}>{children}</p>;
}
