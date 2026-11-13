import type { ReactNode } from "react";
import { AlertTriangle, Bell, CheckCircle2, Clock, FolderGit2, GitBranch, Link2, MessageCircleQuestion, Moon, Play, Unplug, Users, Zap } from "lucide-react";
import type { ProjectView, SessionView } from "@shared/model";
import SetupChecks from "../SetupChecks";
import { elapsed } from "@/lib/status";
import SessionRow from "./SessionRow";
import type { AppMode } from "@/hooks/useLiveSessions";
import { QUIET_AFTER_MS, RECENT_MS, attentionOf, projectSummaries } from "./attention";

interface Props {
  sessions: SessionView[];
  projects: ProjectView[];
  now: number;
  mode: AppMode;
  connected: boolean;
  hooksInstalled: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDecide: (approvalId: string, decision: "allow" | "deny") => void;
  onSettings: (tab?: string) => void;
  /** Open a project on the Projects page. */
  onOpenProject: (projectId: string) => void;
}

const minutes = (ms: number) => Math.round(ms / 60_000);

/**
 * Workspace Mode's first page: what's running, what needs you, what went
 * wrong and what finished, across every project. Only live data from the
 * monitor; empty sections say so instead of showing placeholders.
 */
export default function Overview(p: Props) {
  const a = attentionOf(p.sessions, p.now);
  const projects = projectSummaries(p.projects, p.sessions);
  const linked = p.sessions.filter((s) => s.link?.connected).length;
  const projectName = (s: SessionView) => p.projects.find((x) => x.id === s.projectId)?.name ?? s.cwd.split(/[\\/]/).filter(Boolean).pop() ?? "";

  const row = (s: SessionView, extra?: ReactNode) => (
    <SessionRow key={s.id} s={s} project={projectName(s)} now={p.now} selected={s.id === p.selectedId} onSelect={() => p.onSelect(s.id)} extra={extra} />
  );

  return (
    <div>
        {/* Where the data comes from, and whether it's flowing at all. */}
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
          {!p.connected ? (
            <span className="chip bg-urgent/20 text-urgent"><Unplug size={13} /> Not connected to the Ai Gramam server. Is it still running?</span>
          ) : p.mode === "demo" ? (
            <span className="chip bg-brass/20 text-brass">Demo village: simulated sessions, nothing here is real</span>
          ) : (
            <span className="chip bg-work/15 text-work"><Zap size={13} /> Live · {p.hooksInstalled ? "transcripts + hooks" : "transcripts only"}</span>
          )}
          {p.mode === "live" && p.sessions.length > 0 && (
            <button onClick={() => p.onSettings("link")} className="chip bg-white/5 text-cream/70 hover:bg-white/10" title="Linked sessions can be messaged, stopped, approved and answered from here">
              <Link2 size={13} /> {linked} of {p.sessions.length} sessions linked to the mod
            </button>
          )}
        </div>

        {/* The numbers at a glance. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Tile icon={<FolderGit2 size={16} />} label="Projects" value={projects.length} hint="with a session open" />
          <Tile icon={<Play size={16} />} label="Working" value={a.working.length + a.quiet.length} hint={a.quiet.length ? `${a.quiet.length} with no recent activity` : "active now"} tone="work" />
          <Tile icon={<Bell size={16} />} label="Needs you" value={a.needsYou.length} hint="approvals and questions" tone={a.needsYou.length ? "urgent" : undefined} href="#needs-you" />
          <Tile icon={<MessageCircleQuestion size={16} />} label="Your turn" value={a.yourTurn.length} hint="waiting for your next message" tone={a.yourTurn.length ? "wait" : undefined} href="#your-turn" />
          <Tile icon={<AlertTriangle size={16} />} label="Errors" value={a.errors.length} hint="stopped with an error" tone={a.errors.length ? "urgent" : undefined} href="#errors" />
          <Tile icon={<CheckCircle2 size={16} />} label="Recently done" value={a.recentlyDone.length} hint={`in the last ${minutes(RECENT_MS) / 60} h`} href="#done" />
        </div>

        {p.sessions.length === 0 ? (
          <div className="glass mt-4 rounded-2xl p-6 text-center">
            <div className="font-display text-lg font-semibold">{p.mode !== "live" ? "The demo village is empty" : !p.connected ? "Can't reach the Ai Gramam server" : "No Claude Code sessions are running"}</div>
            <p className="mx-auto mt-1 max-w-md text-[13px] text-cream/60">
              {p.mode === "live" && !p.connected
                ? "Sessions can't be shown until this page reconnects; this doesn't mean none are running."
                : "Start Claude Code in any project folder and it shows up here within a few seconds. Sessions are read from your local Claude Code files; nothing leaves this computer."}
            </p>
            {p.mode === "live" && <div className="mx-auto mt-4 max-w-lg"><SetupChecks connected={p.connected} compact /></div>}
          </div>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <Section id="needs-you" title="Needs you" icon={<Bell size={15} />} tone="urgent" empty="Nothing is waiting for you.">
                {a.needsYou.map((s) =>
                  row(
                    s,
                    s.link?.approval && !s.link.approval.questions ? (
                      <span className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => p.onDecide(s.link!.approval!.id, "allow")} className="rounded-lg bg-work px-2.5 py-1 text-[12px] font-semibold text-ink hover:brightness-110">Approve</button>
                        <button onClick={() => p.onDecide(s.link!.approval!.id, "deny")} className="rounded-lg border border-white/20 px-2.5 py-1 text-[12px] text-cream hover:bg-white/10">Deny</button>
                      </span>
                    ) : (
                      <span className="rounded-lg bg-wait px-2.5 py-1 text-[12px] font-semibold text-ink">{s.link?.approval?.questions ? "Answer" : s.link?.connected ? "Open" : "Answer in terminal"}</span>
                    ),
                  ),
                )}
              </Section>
              {a.yourTurn.length > 0 && (
                <Section id="your-turn" title="Your turn" icon={<MessageCircleQuestion size={15} />} tone="wait">
                  {a.yourTurn.map((s) => row(s))}
                </Section>
              )}
              <Section id="working" title="Working now" icon={<Play size={15} />} tone="work" empty="No session is working right now.">
                {a.working.map((s) => row(s))}
              </Section>
              {a.quiet.length > 0 && (
                <Section
                  id="quiet"
                  title="No recent activity"
                  icon={<Moon size={15} />}
                  note={`Working, but nothing recorded for over ${minutes(QUIET_AFTER_MS)} minutes. It may be running a long command, waiting on something, or stalled: open it to check.`}
                >
                  {a.quiet.map((s) => row(s, <span className="text-[11.5px] text-cream/55">last activity {elapsed(s.lastActivityAt, p.now)} ago</span>))}
                </Section>
              )}
              {a.errors.length > 0 && (
                <Section id="errors" title="Errors" icon={<AlertTriangle size={15} />} tone="urgent">
                  {a.errors.map((s) => row(s))}
                </Section>
              )}
              <Section id="done" title="Recently done" icon={<CheckCircle2 size={15} />} empty={`Nothing finished in the last ${minutes(RECENT_MS) / 60} hours.`}>
                {a.recentlyDone.map((s) => row(s))}
              </Section>
              {a.idle.length > 0 && (
                <Section id="idle" title="Idle" icon={<Clock size={15} />}>
                  {a.idle.map((s) => row(s))}
                </Section>
              )}
            </div>

            <Section id="projects" title="Projects" icon={<FolderGit2 size={15} />} empty="No projects yet.">
              {projects.map((pr) => (
                <button
                  key={pr.project.id}
                  onClick={() => p.onOpenProject(pr.project.id)}
                  className="w-full rounded-xl border border-white/8 bg-black/15 px-3 py-2 text-left hover:bg-white/5"
                  title={pr.project.root}
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-semibold text-cream">{pr.project.name}</span>
                    {pr.needsYou > 0 && <span className="chip bg-urgent text-white">{pr.needsYou} needs you</span>}
                    {pr.errors > 0 && <span className="chip bg-urgent/20 text-urgent">{pr.errors} error</span>}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10.5px] text-cream/40">{pr.project.root}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-cream/60">
                    <span>{pr.sessions.length} session{pr.sessions.length > 1 ? "s" : ""}</span>
                    {pr.working > 0 && <span className="text-work">{pr.working} working</span>}
                    {pr.subagents > 0 && <span className="flex items-center gap-1"><Users size={11} /> {pr.subagents} subagent{pr.subagents > 1 ? "s" : ""}</span>}
                    {pr.branches.slice(0, 2).map((b) => <span key={b} className="flex items-center gap-1"><GitBranch size={11} /> {b}</span>)}
                    <span className="ml-auto text-cream/40">active {elapsed(pr.lastActivityAt, p.now)} ago</span>
                  </div>
                </button>
              ))}
            </Section>
          </div>
        )}
    </div>
  );
}

function Tile({ icon, label, value, hint, tone, href }: { icon: ReactNode; label: string; value: number; hint: string; tone?: "work" | "wait" | "urgent"; href?: string }) {
  const color = tone === "urgent" ? "text-urgent" : tone === "wait" ? "text-wait" : tone === "work" ? "text-work" : "text-cream";
  const body = (
    <>
      <div className={`flex items-center gap-1.5 text-[12px] font-semibold ${tone ? color : "text-cream/70"}`}>{icon} {label}</div>
      <div className={`mt-1 font-display text-[26px] font-bold leading-none tabular-nums ${color}`}>{value}</div>
      <div className="mt-1 truncate text-[11px] text-cream/45">{hint}</div>
    </>
  );
  const cls = `glass block rounded-2xl px-3 py-2.5 ${tone === "urgent" && value ? "ring-1 ring-urgent/60" : ""}`;
  return href && value ? <a href={href} className={`${cls} hover:bg-white/5`}>{body}</a> : <div className={cls}>{body}</div>;
}

function Section({ id, title, icon, tone, note, empty, children }: { id: string; title: string; icon: ReactNode; tone?: "work" | "wait" | "urgent"; note?: string; empty?: string; children: ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  const color = tone === "urgent" ? "text-urgent" : tone === "wait" ? "text-wait" : tone === "work" ? "text-work" : "text-brass";
  return (
    <section id={id} className="glass scroll-mt-20 rounded-2xl p-3">
      <h2 className={`mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] ${color}`}>
        {icon} {title} {items.length > 0 && <span className="text-cream/40">· {items.length}</span>}
      </h2>
      {note && <p className="mb-2 text-[11.5px] text-cream/55">{note}</p>}
      {items.length > 0 ? <div className="space-y-1.5">{children}</div> : empty ? <p className="text-[12px] text-cream/45">{empty}</p> : null}
    </section>
  );
}
