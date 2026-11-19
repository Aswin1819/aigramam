/** Settings → Display: motion, desktop notifications and time of day. */
import { useState } from "react";
import { notifyPermission, requestNotifyPermission, type NotifyPermission } from "@/lib/desktopNotify";
import { TIME_CHOICES, type TimeMode } from "../useDisplayPrefs";

export default function DisplayTab(p: {
  reducedMotion: boolean;
  onReducedMotion: (v: boolean) => void;
  desktopNotify: boolean;
  onDesktopNotify: (v: boolean) => void;
  time: TimeMode;
  onTime: (t: TimeMode) => void;
}) {
  return (
    <div className="space-y-4 text-sm">
      <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 p-3">
        <span>
          <span className="block font-semibold">Reduce motion</span>
          <span className="text-xs text-cream/55">Stops swaying, drifting, rain and particles; status changes still show.</span>
        </span>
        <input type="checkbox" checked={p.reducedMotion} onChange={(e) => p.onReducedMotion(e.target.checked)} className="h-5 w-5 accent-[#e3b04b]" />
      </label>
      <DesktopNotifyToggle on={p.desktopNotify} onChange={p.onDesktopNotify} />
      <div className="rounded-2xl border border-white/10 p-3">
        <div className="mb-2 font-semibold">Time of day</div>
        <div className="flex flex-wrap gap-1.5">
          {TIME_CHOICES.map(({ id, label }) => (
            <button key={id} onClick={() => p.onTime(id)} aria-pressed={p.time === id} className={`rounded-xl px-3 py-1.5 text-xs ${p.time === id ? "bg-brass font-semibold text-ink" : "bg-white/5 hover:bg-white/10"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Desktop notifications: asks the browser for permission on the click that turns them on. */
function DesktopNotifyToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  const [perm, setPerm] = useState<NotifyPermission>(notifyPermission);
  const toggle = async (want: boolean) => {
    if (!want) return onChange(false);
    const p = perm === "granted" ? perm : await requestNotifyPermission();
    setPerm(p);
    onChange(p === "granted");
  };
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 p-3">
      <span>
        <span className="block font-semibold">Desktop notifications</span>
        <span className="text-xs text-cream/55">
          While Ai Gramam is in the background: approvals, questions, errors and "your turn".
          {perm === "denied" && <span className="text-urgent"> Your browser blocks notifications for this page; allow them in the browser's site settings.</span>}
          {perm === "unsupported" && <span className="text-urgent"> This browser doesn't support them.</span>}
        </span>
      </span>
      <input type="checkbox" checked={on && perm === "granted"} disabled={perm === "unsupported"} onChange={(e) => toggle(e.target.checked)} className="h-5 w-5 accent-[#e3b04b]" />
    </label>
  );
}
