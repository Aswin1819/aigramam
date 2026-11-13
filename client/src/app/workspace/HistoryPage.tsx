import { useMemo, useState, type ReactNode } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  Archive,
  CheckCircle2,
  GitPullRequest,
  Hand,
  HelpCircle,
  History,
  Loader2,
  MessageSquare,
  Play,
  Search,
  Users,
  Wrench,
} from "lucide-react";
import type { HistorySession, TimelineEvent, TimelineKind } from "@shared/history";
import { trpc } from "@/lib/trpc";
import {
  LAST_EVENT_LABEL,
  RANGE_LABEL,
  dailyTotals,
  dateTime,
  dayLabel,
  duration,
  filterHistory,
  historyProjects,
  localDay,
  tokens,
  type HistoryRange,
  type HistoryState,
} from "./history";

interface Props {
  now: number;
  demo: boolean;
  /** Ids of sessions shown live right now (they can be opened in the live drawer). */
  liveIds: Set<string>;
  onOpenLive: (id: string) => void;
}

const RANGES: HistoryRange[] = ["today", "7d", "30d", "all"];
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Past and current sessions counted from Claude Code's transcripts, with a daily summary and each session's recorded timeline. */
export default function HistoryPage(p: Props) {
  if (p.demo) {
    return (
      <section className="glass rounded-2xl p-6 text-center text-[13px] text-cream/60">
        History reads the real Claude Code transcripts on this computer, so the demo village has none. Switch to Live to see it.
      </section>
    );
  }
  return <HistoryLive {...p} />;
}

function HistoryLive(p: Props) {
  const list = trpc.history.list.useQuery(undefined, {
    // Poll quickly while transcripts are being read for the first time.
    refetchInterval: (q) => (q.state.data?.scanning ? 1500 : 30_000),
    refetchOnWindowFocus: false,
  });
  const [range, setRange] = useState<HistoryRange>("7d");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [state, setState] = useState<HistoryState>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const all = list.data?.sessions ?? [];
  const sessions = useMemo(() => filterHistory(all, { range, projectId, state, query }, p.now), [all, range, projectId, state, query, p.now]);
  const days = useMemo(() => dailyTotals(sessions, range, p.now), [sessions, range, p.now]);
  const projects = useMemo(() => historyProjects(all), [all]);
  const current = sessions.find((s) => s.id === selected) ?? null;
  const scanning = list.data?.scanning;

  return (
    <div className="space-y-3">
      <section className="glass rounded-2xl p-3">
        <p className="flex items-start gap-2 text-[12px] leading-relaxed text-cream/60">
          <History size={15} className="mt-0.5 shrink-0 text-brass" />
          <span>
            Counted from Claude Code&apos;s own transcripts on this computer; Ai Gramam reads them and stores nothing.
            {list.data?.oldestAt ? ` They go back to ${new Date(list.data.oldestAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : ""}
            {list.data?.oldestAt ? " (Claude Code deletes transcripts after 30 days unless its cleanupPeriodDays setting says otherwise)." : ""}
          </span>
        </p>
        {scanning && (
          <p className="mt-2 flex items-center gap-2 text-[12px] text-cream/70" role="status">
            <Loader2 size={14} className="animate-spin text-brass" /> Reading transcripts… {scanning.done} of {scanning.total}
          </p>
        )}
        {list.error && <p className="mt-2 text-[12px] text-urgent">Couldn&apos;t read history: {list.error.message}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex gap-1" role="radiogroup" aria-label="Time range">
            {RANGES.map((r) => (
              <button
                key={r}
                role="radio"
                aria-checked={range === r}
                onClick={() => setRange(r)}
                className={`rounded-full border px-2.5 py-1 text-[12px] ${range === r ? "border-brass bg-brass/20 text-cream" : "border-white/12 text-cream/75 hover:bg-white/5"}`}
              >
                {RANGE_LABEL[r]}
              </button>
            ))}
          </div>
          <select value={projectId ?? ""} onChange={(e) => setProjectId(e.target.value || null)} aria-label="Filter by project" className="rounded-xl border border-white/10 bg-black/25 px-2.5 py-1.5 text-[13px] text-cream outline-none focus:border-brass/60">
            <option value="">All projects</option>
            {projects.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
          </select>
          <select value={state} onChange={(e) => setState(e.target.value as HistoryState)} aria-label="Filter by status" className="rounded-xl border border-white/10 bg-black/25 px-2.5 py-1.5 text-[13px] text-cream outline-none focus:border-brass/60">
            <option value="all">Live and ended</option>
            <option value="live">Live now</option>
            <option value="ended">Ended</option>
          </select>
          <label className="flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-2.5 py-1.5 focus-within:border-brass/60">
            <Search size={14} className="text-cream/45" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search titles, projects, branches…" aria-label="Search history" className="w-full bg-transparent text-[13px] text-cream outline-none placeholder:text-cream/35" />
          </label>
        </div>
      </section>

      <DailySummary days={days} now={p.now} />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_440px]">
        <section className="glass rounded-2xl p-2" aria-label="Sessions">
          <div className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-brass/90">
            Sessions <span className="tabular-nums text-cream/45">{sessions.length}</span>
          </div>
          <div className="space-y-1">
            {sessions.map((s) => (
              <HistoryRow key={s.id} s={s} selected={s.id === selected} onSelect={() => setSelected(s.id === selected ? null : s.id)} />
            ))}
            {sessions.length === 0 && (
              <p className="py-6 text-center text-[12.5px] text-cream/45">{list.isLoading || scanning ? "Reading transcripts…" : all.length === 0 ? "No Claude Code transcripts found on this computer." : "No session matches these filters."}</p>
            )}
          </div>
        </section>
        <div className="lg:sticky lg:top-2 lg:self-start">
          {current ? (
            <SessionHistoryDetail s={current} live={p.liveIds.has(current.id)} onOpenLive={() => p.onOpenLive(current.id)} />
          ) : (
            <section className="glass rounded-2xl p-5 text-center text-[12.5px] text-cream/50">Pick a session to see its figures and recorded timeline.</section>
          )}
        </div>
      </div>
    </div>
  );
}

function DailySummary({ days, now }: { days: ReturnType<typeof dailyTotals>; now: number }) {
  if (days.length === 0) return null;
  const maxActive = Math.max(1, ...days.map((d) => d.activeMs));
  return (
    <section className="glass overflow-x-auto rounded-2xl p-3" aria-label="Daily summary">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-brass/90">Daily summary</div>
      <table className="w-full min-w-[620px] text-left text-[12.5px]">
        <thead className="text-[11px] text-cream/50">
          <tr>
            <th className="py-1 font-medium">Day</th>
            <th className="py-1 text-right font-medium">Sessions</th>
            <th className="py-1 text-right font-medium">Messages you sent</th>
            <th className="py-1 text-right font-medium">Tool calls</th>
            <th className="py-1 text-right font-medium">Tool errors</th>
            <th className="py-1 pl-4 font-medium" title="Time between recorded events that were at most 5 minutes apart">Active time</th>
            <th className="py-1 text-right font-medium" title="Output tokens reported by the API (main conversations)">Output tokens</th>
          </tr>
        </thead>
        <tbody className="tabular-nums text-cream/85">
          {days.slice(0, 31).map((d) => (
            <tr key={d.day} className="border-t border-white/6">
              <td className="py-1.5">{dayLabel(d.day, now)}</td>
              <td className="py-1.5 text-right">{d.sessions}</td>
              <td className="py-1.5 text-right">{d.prompts}</td>
              <td className="py-1.5 text-right">{d.toolCalls}</td>
              <td className={`py-1.5 text-right ${d.toolErrors ? "text-amber-200" : "text-cream/45"}`}>{d.toolErrors}</td>
              <td className="py-1.5 pl-4">
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-24 overflow-hidden rounded-full bg-white/8" aria-hidden>
                    <span className="block h-full rounded-full bg-work/70" style={{ width: `${(d.activeMs / maxActive) * 100}%` }} />
                  </span>
                  {duration(d.activeMs)}
                </span>
              </td>
              <td className="py-1.5 text-right">{tokens(d.outputTokens)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-cream/45">Active time counts the gaps between recorded events that were at most 5 minutes apart, so long silent waits aren&apos;t included. A session that spans several days counts on each.</p>
    </section>
  );
}

function HistoryRow({ s, selected, onSelect }: { s: HistorySession; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={`block w-full rounded-xl px-3 py-2 text-left transition ${selected ? "bg-white/10 ring-1 ring-brass/50" : "hover:bg-white/5"}`}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-cream" title={s.title}>{s.title}</span>
        {s.state === "live" ? (
          <span className="chip bg-work/15 text-work">Live</span>
        ) : (
          <span className="chip bg-white/8 text-cream/60">Ended</span>
        )}
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px] tabular-nums text-cream/55">
        <span>{s.projectName}{s.gitBranch ? ` · ⎇ ${s.gitBranch}` : ""}</span>
        <span>{dateTime(s.startedAt)} → {localDay(s.startedAt) === localDay(s.lastActivityAt) ? new Date(s.lastActivityAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : dateTime(s.lastActivityAt)}</span>
        <span title="Time between recorded events that were at most 5 minutes apart">active {duration(s.activeMs)}</span>
        <span>{plural(s.prompts, "message")} · {plural(s.toolCalls, "tool call")}{s.toolErrors ? ` · ${plural(s.toolErrors, "error")}` : ""}</span>
      </div>
    </button>
  );
}

function Fact({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div title={hint}>
      <div className="text-[10.5px] uppercase tracking-[0.1em] text-cream/45">{label}</div>
      <div className="text-[13px] tabular-nums text-cream">{value}</div>
    </div>
  );
}

function SessionHistoryDetail({ s, live, onOpenLive }: { s: HistorySession; live: boolean; onOpenLive: () => void }) {
  const [showTools, setShowTools] = useState(true);
  const tl = trpc.history.timeline.useQuery({ sessionId: s.id }, { staleTime: 15_000, refetchOnWindowFocus: false });
  const events = (tl.data?.events ?? []).filter((e) => showTools || (e.kind !== "tool" && e.kind !== "turn_end"));
  return (
    <section className="glass max-h-[calc(100vh-96px)] overflow-y-auto rounded-2xl" aria-label="Session history">
      <div className="border-b border-white/8 p-3">
        <h3 className="font-display text-[15px] font-bold leading-snug text-cream">{s.title}</h3>
        <div className="mt-0.5 text-[11.5px] text-cream/55">
          {s.projectName}{s.gitBranch ? ` · ⎇ ${s.gitBranch}` : ""} · <span className="font-mono">{s.id.slice(0, 8)}</span>
        </div>
        <div className="mt-1 text-[11.5px] text-cream/60">{s.state === "live" ? "Shown live now. " : "Not running now. "}{LAST_EVENT_LABEL[s.lastEvent]}.</div>
        <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2">
          <Fact label="Started" value={dateTime(s.startedAt)} />
          <Fact label="Last activity" value={dateTime(s.lastActivityAt)} />
          <Fact label="Span" value={duration(s.lastActivityAt - s.startedAt)} hint="From the first to the last recorded event" />
          <Fact label="Active" value={duration(s.activeMs)} hint="Time between recorded events that were at most 5 minutes apart" />
          <Fact label="Messages" value={s.prompts} hint="Messages you sent (not counting slash-command notices or tool results)" />
          <Fact label="Tool calls" value={s.toolCalls} />
          <Fact label="Tool errors" value={s.toolErrors} />
          <Fact label="Files edited" value={s.filesEdited} hint="Distinct files changed with Write, Edit or NotebookEdit" />
          <Fact label="Subagents" value={s.subagents} hint="Subagent transcripts saved next to this session's" />
          {s.interrupts > 0 && <Fact label="Interrupted" value={s.interrupts} />}
          {s.compactions > 0 && <Fact label="Compacted" value={s.compactions} />}
          {s.apiErrors > 0 && <Fact label="API errors" value={s.apiErrors} />}
        </div>
        {s.usage ? (
          <div className="mt-3 rounded-xl bg-black/20 p-2.5 text-[12px] text-cream/75">
            <div className="text-[10.5px] uppercase tracking-[0.1em] text-cream/45">Tokens reported by the API</div>
            <div className="mt-1 grid grid-cols-2 gap-x-3 tabular-nums">
              <span>Input {tokens(s.usage.input)}</span>
              <span>Output {tokens(s.usage.output)}</span>
              <span>Cache read {tokens(s.usage.cacheRead)}</span>
              <span>Cache write {tokens(s.usage.cacheWrite)}</span>
            </div>
            <div className="mt-1 text-[11px] text-cream/45">
              From {s.usage.responses} responses in the main conversation{s.subagents ? "; subagents' own usage isn't included" : ""}.{s.models.length ? ` Model: ${s.models.join(", ")}.` : ""} No cost is shown: it depends on your plan.
            </div>
          </div>
        ) : (
          <p className="mt-3 text-[11.5px] text-cream/45">This transcript has no token figures.</p>
        )}
        {s.topTools.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {s.topTools.map(([name, n]) => (
              <span key={name} className="chip bg-white/8 text-cream/70">{name} <span className="tabular-nums text-cream/45">{n}</span></span>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {live && <button onClick={onOpenLive} className="rounded-lg border border-brass/50 bg-brass/15 px-2.5 py-1 text-[12px] text-cream hover:bg-brass/25">Open live view</button>}
          {s.prUrl && <a href={s.prUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg border border-white/12 px-2.5 py-1 text-[12px] text-cream/80 hover:bg-white/10"><GitPullRequest size={13} /> Pull request</a>}
          <label className="ml-auto flex items-center gap-1.5 text-[12px] text-cream/65">
            <input type="checkbox" checked={showTools} onChange={(e) => setShowTools(e.target.checked)} className="accent-[#e3b04b]" /> Show tool calls
          </label>
        </div>
      </div>
      <div className="p-3" aria-label="Recorded timeline">
        {tl.isLoading && <p className="flex items-center gap-2 text-[12px] text-cream/60"><Loader2 size={14} className="animate-spin" /> Reading the transcript…</p>}
        {tl.error && <p className="text-[12px] text-urgent">Couldn&apos;t read the timeline: {tl.error.message}</p>}
        {tl.data && tl.data.omitted > 0 && <p className="mb-2 text-[11px] text-cream/45">{tl.data.omitted} earlier events aren&apos;t shown; this is the start and the latest {tl.data.events.length - 1}.</p>}
        <Timeline events={events} />
        {tl.data && <p className="mt-3 text-[11px] text-cream/40">Approval requests aren&apos;t written to transcripts, so they don&apos;t appear here.</p>}
      </div>
    </section>
  );
}

const KIND_META: Record<TimelineKind, { Icon: typeof Play; color: string }> = {
  start: { Icon: Play, color: "text-work" },
  prompt: { Icon: MessageSquare, color: "text-brass" },
  tool: { Icon: Wrench, color: "text-cream/50" },
  question: { Icon: HelpCircle, color: "text-amber-200" },
  subagent: { Icon: Users, color: "text-sky-300" },
  tool_error: { Icon: AlertTriangle, color: "text-amber-300" },
  interrupted: { Icon: Hand, color: "text-cream/70" },
  compacted: { Icon: Archive, color: "text-cream/60" },
  turn_end: { Icon: CheckCircle2, color: "text-emerald-300" },
  api_error: { Icon: AlertOctagon, color: "text-urgent" },
  pr: { Icon: GitPullRequest, color: "text-violet-300" },
};

function Timeline({ events }: { events: TimelineEvent[] }) {
  let lastDay = "";
  return (
    <ol className="space-y-0.5">
      {events.map((e, i) => {
        const day = localDay(e.at);
        const header = day !== lastDay;
        lastDay = day;
        const { Icon, color } = KIND_META[e.kind];
        return (
          <li key={i}>
            {header && <div className="mb-1 mt-2 text-[11px] font-semibold text-cream/50 first:mt-0">{new Date(e.at).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</div>}
            <div className="flex gap-2 rounded-lg px-1 py-0.5 text-[12px]">
              <span className="w-[62px] shrink-0 whitespace-nowrap pt-px tabular-nums text-cream/40">{new Date(e.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
              <Icon size={13} className={`mt-0.5 shrink-0 ${color}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <span className={e.kind === "tool" ? "text-cream/70" : "text-cream"}>{e.text}</span>
                {e.detail && <div className="truncate font-mono text-[11px] text-cream/45" title={e.detail}>{e.detail}</div>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
