import type { SessionView } from "@shared/model";
import { STATUS_META, clockTime, elapsed } from "@/lib/status";

interface Props {
  session: SessionView;
  now: number;
}

/**
 * The session's subagents as Claude Code reports them (Agent/Task tool runs
 * and their own transcripts): what each was asked, what it's doing, how long
 * it ran. Running ones first. Nothing is shown that wasn't recorded.
 */
export default function SubagentsPanel({ session: s, now }: Props) {
  const list = [...s.subagents].sort(
    (a, b) => Number(b.status !== "finished") - Number(a.status !== "finished") || b.startedAt - a.startedAt,
  );
  if (list.length === 0) {
    return (
      <p className="p-4 text-[12.5px] leading-relaxed text-cream/55">
        No subagents for this session yet. When Claude hands work to a subagent (the Agent tool), it shows up here with what it was asked and what it's doing.
      </p>
    );
  }
  const running = list.filter((a) => a.status !== "finished").length;
  return (
    <div className="p-4">
      <p className="mb-2 text-[11.5px] text-cream/50">{running} running · {list.length - running} finished (only subagents seen while Ai Gramam was open)</p>
      <ul className="space-y-2">
        {list.map((a) => {
          const meta = STATUS_META[a.status];
          const end = a.finishedAt ?? (a.status === "finished" ? a.lastActivityAt : undefined);
          return (
            <li key={a.id} className={`rounded-xl border px-3 py-2 ${a.status === "finished" ? "border-white/8 bg-black/15" : "border-sky-300/20 bg-sky-950/30"}`}>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-cream">🤝 {a.agentType}</span>
                <span className="ml-auto text-[11.5px]" style={{ color: meta.color }}>{meta.emoji} {meta.label}</span>
              </div>
              {a.description && <div className="mt-0.5 text-[12px] text-cream/70">{a.description}</div>}
              {a.action && a.status !== "finished" && (
                <div className="mt-1 text-[12.5px] text-cream/90"><span aria-hidden>{a.action.emoji}</span> {a.action.label}</div>
              )}
              <div className="mt-1 flex flex-wrap gap-x-3 text-[10.5px] text-cream/40">
                <span>started {clockTime(a.startedAt)}</span>
                {end ? <span>ran {elapsed(a.startedAt, end)}</span> : <span>running for {elapsed(a.startedAt, now)}</span>}
                {!end && <span>last activity {elapsed(a.lastActivityAt, now)} ago</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
