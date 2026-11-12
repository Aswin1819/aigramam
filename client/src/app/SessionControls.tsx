import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Link2Off, Send, ShieldQuestion, Square, X } from "lucide-react";
import type { SessionView } from "@shared/model";
import type { CommandOutcome } from "@/hooks/useLiveSessions";
import { elapsed } from "@/lib/status";

interface Props {
  session: SessionView;
  now: number;
  demo: boolean;
  command: (type: "session-message" | "session-stop" | "approval-decide", payload: Record<string, unknown>) => Promise<CommandOutcome>;
  onSetupLink: () => void;
}

/** Talk to a live session through the Ai Gramam mod: approve, message, stop. */
export default function SessionControls({ session: s, now, demo, command, onSetupLink }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const linked = !!s.link?.connected;
  const approval = s.link?.approval;

  const run = async (key: string, type: Parameters<Props["command"]>[0], payload: Record<string, unknown>, okText: string) => {
    setBusy(key);
    setNote(null);
    const r = await command(type, payload);
    setBusy(null);
    setNote({ ok: r.ok, text: r.ok ? okText : r.error ?? "Something went wrong." });
    return r.ok;
  };

  if (demo) {
    return <p className="text-[12px] text-cream/50">In the demo village nothing is sent. Switch to Live to message real sessions.</p>;
  }
  if (!linked) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-black/20 p-3 text-[12px] text-cream/70">
        <Link2Off size={15} className="mt-0.5 shrink-0 text-cream/40" />
        <div>
          This session isn't linked. With the <b className="text-cream">Ai Gramam mod</b> installed, you can message it, stop it and answer its permission requests from here.{" "}
          <button onClick={onSetupLink} className="text-brass underline underline-offset-2">How to link sessions</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AnimatePresence>
        {approval && (
          <motion.div
            key={approval.id}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            className="rounded-2xl border border-urgent/50 bg-urgent/12 p-3 shadow-[0_0_24px_rgba(255,90,79,0.18)]"
            role="alert"
          >
            <div className="flex items-center gap-2 text-[12px] font-semibold text-red-100">
              <ShieldQuestion size={16} className="text-urgent" /> Claude asks to run
              <span className="ml-auto font-normal tabular-nums text-red-100/60">{elapsed(approval.since, now)}</span>
            </div>
            <div className="mt-1.5 break-words rounded-lg bg-black/30 px-2 py-1.5 font-mono text-[11.5px] text-cream">{approval.label}</div>
            <div className="mt-2 flex gap-2">
              <button
                disabled={!!busy}
                onClick={() => run("allow", "approval-decide", { approvalId: approval.id, decision: "allow" }, "Approved. Claude carries on.")}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-work px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:brightness-110 disabled:opacity-50"
              >
                <Check size={15} /> Approve once
              </button>
              <button
                disabled={!!busy}
                onClick={() => run("deny", "approval-decide", { approvalId: approval.id, decision: "deny" }, "Denied. Claude was told no.")}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/20 px-3 py-1.5 text-[12.5px] font-semibold text-cream hover:bg-white/10 disabled:opacity-50"
              >
                <X size={15} /> Deny
              </button>
            </div>
            <p className="mt-1.5 text-[10.5px] text-red-100/55">No answer within 45 s and the question appears in the terminal instead.</p>
          </motion.div>
        )}
      </AnimatePresence>

      <form
        onSubmit={async (ev) => {
          ev.preventDefault();
          if (!text.trim() || busy) return;
          if (await run("send", "session-message", { sessionId: s.id, text }, s.status === "working" ? "Queued: it runs when this turn ends." : "Sent.")) setText("");
        }}
        className="rounded-2xl border border-white/10 bg-black/25 p-2 focus-within:border-brass/60"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) (e.currentTarget.form as HTMLFormElement).requestSubmit();
          }}
          rows={2}
          maxLength={8000}
          placeholder={`Message ${s.title}…`}
          aria-label={`Message to ${s.title}`}
          className="w-full resize-none bg-transparent px-1.5 py-1 text-[13px] text-cream outline-none placeholder:text-cream/35"
        />
        <div className="flex items-center gap-2">
          <span className="px-1 text-[10.5px] text-cream/40">
            {s.link?.queued ? `${s.link.queued} waiting to send` : "Ctrl+Enter to send · sent as your own message"}
          </span>
          <span className="ml-auto" />
          {s.status === "working" && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => run("stop", "session-stop", { sessionId: s.id }, "Stopping…")}
              className="flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1 text-[12px] text-cream/85 hover:bg-white/10 disabled:opacity-50"
              title="Interrupt what Claude is doing (like Esc in the terminal)"
            >
              <Square size={12} /> Stop
            </button>
          )}
          <button
            type="submit"
            disabled={!text.trim() || !!busy}
            className="flex items-center gap-1 rounded-lg bg-brass px-3 py-1 text-[12px] font-semibold text-ink hover:bg-brass/90 disabled:opacity-40"
          >
            <Send size={12} /> Send
          </button>
        </div>
      </form>
      <AnimatePresence>
        {note && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`text-[11.5px] ${note.ok ? "text-work" : "text-urgent"}`}>
            {note.text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
