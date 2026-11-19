/** Settings → Alerts (hooks): what the optional Claude Code hooks do, their status, and install/uninstall with a preview. */
import { useState } from "react";
import { trpc } from "@/lib/trpc";

export default function AlertsTab({ lastHookAt }: { lastHookAt?: number }) {
  const utils = trpc.useUtils();
  const status = trpc.hooks.status.useQuery();
  const [mode, setMode] = useState<"install" | "uninstall" | null>(null);
  const preview = trpc.hooks.preview.useQuery({ mode: mode ?? "install" }, { enabled: mode !== null, retry: false });
  const change = trpc.hooks.change.useMutation({ onSuccess: () => { setMode(null); utils.hooks.status.invalidate(); } });
  const st = status.data;
  return (
    <div className="space-y-4 text-[13px] leading-relaxed text-cream/85">
      <p>
        Without hooks, Ai Gramam reads Claude Code's transcripts and can only <i>guess</i> when a permission prompt is open. With hooks,
        Claude Code tells it the moment it needs your approval.
      </p>
      <ul className="space-y-1.5 text-[12.5px]">
        <li>• <b className="text-cream">Applies to every project</b>: hooks live in your user settings, so all Claude Code sessions send events.</li>
        <li>• Events go only to <code className="text-work">{st?.url ?? "http://127.0.0.1:…/api/hooks"}</code> with a secret key. Nothing leaves this computer.</li>
        <li>• They never change what Claude does. If Ai Gramam isn't running, Claude Code simply continues (at most 2 s per event).</li>
        <li>• Your existing hooks are kept. Uninstall removes only these entries. A backup is saved to <code>~/.ai-gramam/backups</code> first.</li>
      </ul>
      {st && (
        <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-xs">
          <div>Settings file: <code className="break-all text-cream/70">{st.settingsPath}</code></div>
          <div className="mt-1">
            Status: {st.installed ? <b className="text-work">Installed</b> : <b className="text-cream">Not installed</b>}
            {st.installed && <span className="text-cream/50"> · {lastHookAt ? `last event ${new Date(lastHookAt).toLocaleTimeString()}` : "no events yet"}</span>}
          </div>
          {!st.readable && <div className="mt-1 text-urgent">Can't read the settings file ({st.error}). Nothing will be changed.</div>}
          {st.blockedByAllowlist && <div className="mt-1 text-wait">Your settings have <code>allowedHttpHookUrls</code> without this URL, so Claude Code would skip these hooks.</div>}
        </div>
      )}
      {mode && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-cream">{mode === "install" ? "Preview: install" : "Preview: uninstall"}</h4>
          {preview.error && <p className="text-xs text-urgent">{preview.error.message}</p>}
          {preview.data && (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {(["before", "after"] as const).map((k) => (
                <div key={k}>
                  <div className="mb-1 text-[11px] text-cream/60">{k === "before" ? "Now" : "After"}</div>
                  <pre className="max-h-56 overflow-auto rounded-xl bg-black/40 p-2 font-mono text-[10px] text-cream/80">{preview.data![k] || "(file doesn't exist yet)"}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {change.error && <p className="text-xs text-urgent">{change.error.message}</p>}
      {change.data && <p className="text-xs text-work">Done. {change.data.backupPath ? `Backup saved to ${change.data.backupPath}.` : ""}</p>}
      <div className="flex flex-wrap gap-2">
        {!mode && st?.readable && (st.installed
          ? <button onClick={() => setMode("uninstall")} className="rounded-xl border border-white/15 px-3 py-1.5 text-xs hover:bg-white/10">Uninstall…</button>
          : <button onClick={() => setMode("install")} className="rounded-xl bg-brass px-3 py-1.5 text-xs font-semibold text-ink hover:bg-brass/90">Install hooks…</button>)}
        {mode && (
          <>
            <button onClick={() => setMode(null)} className="rounded-xl border border-white/15 px-3 py-1.5 text-xs hover:bg-white/10">Cancel</button>
            <button disabled={!preview.data || change.isPending} onClick={() => change.mutate({ mode })} className="rounded-xl bg-brass px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-40">
              {mode === "install" ? "Yes, install hooks" : "Yes, remove hooks"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
