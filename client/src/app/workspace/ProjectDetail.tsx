import { useState } from "react";
import { Check, Copy, FolderGit2, GitBranch, Users } from "lucide-react";
import type { SessionView } from "@shared/model";
import { elapsed } from "@/lib/status";
import { attentionOf, type ProjectSummary } from "./attention";
import SessionRow from "./SessionRow";

interface Props {
  summary: ProjectSummary;
  now: number;
  selectedSessionId: string | null;
  onSelectSession: (id: string) => void;
}

/**
 * Everything Ai Gramam knows about one project: its folder, the branches its
 * sessions are on, and the sessions themselves, most urgent first. Shown on
 * the Projects page and when a building is clicked in the village.
 */
export default function ProjectDetail({ summary: pr, now, selectedSessionId, onSelectSession }: Props) {
  const [copied, setCopied] = useState(false);
  const a = attentionOf(pr.sessions, now);
  const ordered: SessionView[] = [...a.needsYou, ...a.yourTurn, ...a.errors, ...a.quiet, ...a.working, ...a.recentlyDone, ...a.idle];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pr.project.root);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div>
      <div className="flex items-start gap-2">
        <FolderGit2 size={18} className="mt-0.5 shrink-0 text-brass" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-[17px] font-bold text-cream">{pr.project.name}</h2>
          <button onClick={copy} className="group flex max-w-full items-center gap-1 text-left font-mono text-[11px] text-cream/50 hover:text-cream/80" title="Copy the folder path">
            <span className="truncate">{pr.project.root}</span>
            {copied ? <Check size={12} className="shrink-0 text-work" /> : <Copy size={12} className="shrink-0 opacity-0 group-hover:opacity-100" />}
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Fact label="Sessions" value={String(pr.sessions.length)} />
        <Fact label="Needs you" value={String(pr.needsYou)} tone={pr.needsYou ? "urgent" : undefined} />
        <Fact label="Working" value={String(pr.working)} tone={pr.working ? "work" : undefined} />
        <Fact label="Last activity" value={`${elapsed(pr.lastActivityAt, now)} ago`} />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-cream/65">
        <span className="flex items-center gap-1"><GitBranch size={13} /> {pr.branches.length ? pr.branches.join(", ") : "Branch not known (no git branch in the transcripts)"}</span>
        {pr.subagents > 0 && <span className="flex items-center gap-1"><Users size={13} /> {pr.subagents} subagent{pr.subagents > 1 ? "s" : ""} running</span>}
      </div>

      <h3 className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-brass/90">Sessions</h3>
      <div className="space-y-1.5">
        {ordered.map((s) => (
          <SessionRow key={s.id} s={s} project={pr.project.name} now={now} selected={s.id === selectedSessionId} onSelect={() => onSelectSession(s.id)} />
        ))}
      </div>
      <p className="mt-3 text-[11px] text-cream/40">Only sessions Ai Gramam can currently see are listed; closed sessions aren't kept.</p>
    </div>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: "urgent" | "work" }) {
  const color = tone === "urgent" ? "text-urgent" : tone === "work" ? "text-work" : "text-cream";
  return (
    <div className="rounded-xl border border-white/8 bg-black/20 px-2.5 py-1.5">
      <div className="text-[10.5px] uppercase tracking-wide text-cream/45">{label}</div>
      <div className={`truncate text-[14px] font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
