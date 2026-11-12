import { useState } from "react";
import { motion } from "motion/react";
import { Check, CircleHelp, ShieldQuestion, Terminal, X } from "lucide-react";
import type { LinkQuestion, SessionView } from "@shared/model";
import type { CommandOutcome } from "@/hooks/useLiveSessions";
import { elapsed } from "@/lib/status";

type Approval = NonNullable<NonNullable<SessionView["link"]>["approval"]>;
type Command = (type: "approval-decide", payload: Record<string, unknown>) => Promise<CommandOutcome>;

interface Props {
  approval: Approval;
  now: number;
  command: Command;
}

const FALLBACK_NOTE = "No answer within 45 s and it appears in the terminal instead.";

/**
 * A request from a linked session, shown inline in its chat: approve/deny a
 * tool, or answer Claude's multiple-choice questions.
 */
export default function RequestCard({ approval, now, command }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: "allow" | "deny", answers?: Record<string, string>) => {
    setBusy(true);
    setError(null);
    const r = await command("approval-decide", { approvalId: approval.id, decision, ...(answers ? { answers } : {}) });
    setBusy(false);
    if (!r.ok) setError(r.error ?? "Couldn't send your answer.");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className={`my-2 ml-9 rounded-2xl border p-3 ${approval.questions ? "border-wait/50 bg-wait/10 shadow-[0_0_24px_rgba(245,179,61,0.15)]" : "border-urgent/50 bg-urgent/12 shadow-[0_0_24px_rgba(255,90,79,0.18)]"}`}
      role="alert"
    >
      {approval.questions ? (
        <QuestionForm questions={approval.questions} since={approval.since} now={now} busy={busy} onAnswer={(a) => decide("allow", a)} onSkip={() => decide("deny")} />
      ) : (
        <>
          <div className="flex items-center gap-2 text-[12px] font-semibold text-red-100">
            <ShieldQuestion size={16} className="text-urgent" /> Claude asks to run
            <span className="ml-auto font-normal tabular-nums text-red-100/60">{elapsed(approval.since, now)}</span>
          </div>
          <div className="mt-1.5 break-words rounded-lg bg-black/30 px-2 py-1.5 font-mono text-[11.5px] text-cream">{approval.label}</div>
          <div className="mt-2 flex gap-2">
            <button disabled={busy} onClick={() => decide("allow")} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-work px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:brightness-110 disabled:opacity-50">
              <Check size={15} /> Approve once
            </button>
            <button disabled={busy} onClick={() => decide("deny")} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/20 px-3 py-1.5 text-[12.5px] font-semibold text-cream hover:bg-white/10 disabled:opacity-50">
              <X size={15} /> Deny
            </button>
          </div>
          <p className="mt-1.5 text-[10.5px] text-red-100/55">{FALLBACK_NOTE}</p>
        </>
      )}
      {error && <p className="mt-1.5 text-[11.5px] text-urgent">{error}</p>}
    </motion.div>
  );
}

interface FormProps {
  questions: LinkQuestion[];
  since: number;
  now: number;
  busy: boolean;
  onAnswer: (answers: Record<string, string>) => void;
  onSkip: () => void;
}

/** One block per question: options as choice chips (one or many), plus a typed answer. */
function QuestionForm({ questions, since, now, busy, onAnswer, onSkip }: FormProps) {
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});

  const answerOf = (q: LinkQuestion) => (typed[q.question]?.trim() ? typed[q.question]!.trim() : (picked[q.question] ?? []).join(", "));
  const answers = Object.fromEntries(questions.map((q) => [q.question, answerOf(q)]).filter(([, a]) => a));
  const complete = questions.every((q) => answerOf(q));

  const toggle = (q: LinkQuestion, label: string) => {
    setTyped((t) => ({ ...t, [q.question]: "" }));
    setPicked((p) => {
      const cur = p[q.question] ?? [];
      if (!q.multiSelect) return { ...p, [q.question]: [label] };
      return { ...p, [q.question]: cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label] };
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (complete && !busy) onAnswer(answers);
      }}
    >
      <div className="flex items-center gap-2 text-[12px] font-semibold text-amber-100">
        <CircleHelp size={16} className="text-wait" /> Claude asks {questions.length > 1 ? `${questions.length} questions` : "a question"}
        <span className="ml-auto font-normal tabular-nums text-amber-100/60">{elapsed(since, now)}</span>
      </div>
      <div className="mt-2 space-y-3">
        {questions.map((q) => {
          const sel = picked[q.question] ?? [];
          return (
            <fieldset key={q.question}>
              <legend className="text-[12.5px] leading-snug text-cream">
                {q.header && <span className="mr-1.5 rounded-md bg-wait/20 px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-wide text-wait">{q.header}</span>}
                {q.question}
              </legend>
              <div className="mt-1.5 grid gap-1.5" role={q.multiSelect ? "group" : "radiogroup"}>
                {q.options.map((o) => {
                  const on = sel.includes(o.label) && !typed[q.question]?.trim();
                  return (
                    <button
                      key={o.label}
                      type="button"
                      role={q.multiSelect ? "checkbox" : "radio"}
                      aria-checked={on}
                      onClick={() => toggle(q, o.label)}
                      className={`rounded-xl border px-2.5 py-1.5 text-left text-[12px] transition-colors ${on ? "border-wait bg-wait/20 text-cream" : "border-white/12 bg-black/20 text-cream/85 hover:bg-white/5"}`}
                    >
                      <span className="flex items-center gap-2 font-semibold">
                        <span className={`grid h-3.5 w-3.5 shrink-0 place-items-center border ${q.multiSelect ? "rounded" : "rounded-full"} ${on ? "border-wait bg-wait text-ink" : "border-white/30"}`}>{on && <Check size={10} strokeWidth={3} />}</span>
                        {o.label}
                      </span>
                      {o.description && <span className="mt-0.5 block pl-5.5 text-[11px] font-normal text-cream/55">{o.description}</span>}
                    </button>
                  );
                })}
                <input
                  value={typed[q.question] ?? ""}
                  onChange={(e) => setTyped((t) => ({ ...t, [q.question]: e.target.value }))}
                  maxLength={2000}
                  placeholder="Or type your own answer…"
                  aria-label={`Your own answer to: ${q.question}`}
                  className="rounded-xl border border-white/12 bg-black/25 px-2.5 py-1.5 text-[12px] text-cream outline-none placeholder:text-cream/35 focus:border-wait/60"
                />
              </div>
              {q.multiSelect && <p className="mt-1 text-[10.5px] text-cream/40">Pick any that apply.</p>}
            </fieldset>
          );
        })}
      </div>
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={busy || !complete} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-wait px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:brightness-110 disabled:opacity-40">
          <Check size={15} /> {questions.length > 1 ? "Send answers" : "Send answer"}
        </button>
        <button type="button" disabled={busy} onClick={onSkip} className="flex items-center justify-center gap-1.5 rounded-xl border border-white/20 px-3 py-1.5 text-[12px] text-cream hover:bg-white/10 disabled:opacity-50" title="Show the question in the terminal instead">
          <Terminal size={14} /> Answer in terminal
        </button>
      </div>
      <p className="mt-1.5 text-[10.5px] text-amber-100/50">{FALLBACK_NOTE}</p>
    </form>
  );
}
