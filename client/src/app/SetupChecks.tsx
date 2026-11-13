import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { setupChecks, type CheckLevel } from "./checkList";

const ICON: Record<CheckLevel, typeof Info> = { ok: CheckCircle2, info: Info, warn: AlertTriangle, bad: XCircle };
const TONE: Record<CheckLevel, string> = { ok: "text-work", info: "text-cream/60", warn: "text-wait", bad: "text-urgent" };
const WORD: Record<CheckLevel, string> = { ok: "OK", info: "Note", warn: "Check", bad: "Problem" };

/** The setup checks as a list: server, Claude Code, the mod, linked sessions. */
export default function SetupChecks({ connected, compact = false }: { connected: boolean; compact?: boolean }) {
  const status = trpc.setup.status.useQuery(undefined, { enabled: connected, refetchInterval: 5_000 });
  const checks = setupChecks(connected, connected ? status.data : undefined);
  return (
    <ul className="space-y-1.5" aria-label="Setup checks">
      {checks.map((c) => {
        const Icon = ICON[c.level];
        return (
          <li key={`${c.id}-${c.title}`} className="flex gap-2.5 rounded-xl border border-white/10 bg-black/25 p-2.5 text-left">
            <Icon size={16} className={`mt-0.5 shrink-0 ${TONE[c.level]}`} aria-hidden />
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold text-cream">
                <span className="sr-only">{WORD[c.level]}: </span>
                {c.title}
              </div>
              {!compact || c.level !== "ok" ? <div className="text-[12px] leading-snug text-cream/65">{c.detail}</div> : null}
            </div>
          </li>
        );
      })}
      {connected && status.isError && <li className="text-[12px] text-urgent">Couldn't run the setup checks: {status.error.message}</li>}
    </ul>
  );
}
