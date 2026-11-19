/** Small pieces shared by the Settings tabs. */
import { Check, Copy } from "lucide-react";
import { useCopy } from "@/hooks/useCopy";

/** Packs that failed to load, with why (a broken pack never stops the app). */
export function Errors({ errors }: { errors: Array<{ folder: string; source: string; messages: string[] }> }) {
  if (!errors.length) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-urgent">Couldn't load {errors.length} pack{errors.length > 1 ? "s" : ""}</h4>
      {errors.map((e) => (
        <div key={`${e.source}/${e.folder}`} className="rounded-xl border border-urgent/30 bg-urgent/10 p-3 text-xs">
          <div className="font-semibold text-cream">{e.folder} <span className="font-normal text-cream/50">({e.source === "builtin" ? "built in" : "your folder"})</span></div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-red-100/90">{e.messages.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}

/** A command or value with a copy button. */
export function CopyLine({ text, label }: { text: string; label: string }) {
  const { copied: done, copy } = useCopy();
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-2">
      <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-cream/85">{text}</code>
      <button
        onClick={() => copy(text)}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-cream/70 hover:bg-white/10"
        aria-label={`Copy ${label}`}
      >
        {done ? <Check size={14} className="text-work" /> : <Copy size={14} />}
      </button>
    </div>
  );
}
