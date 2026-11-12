import { useState } from "react";
import { trpc } from "@/lib/trpc";

interface Props {
  onClose: () => void;
  lastEventAt?: number;
}

/**
 * Optional Claude Code hooks for exact "needs approval" alerts.
 * Shows exactly what will change in ~/.claude/settings.json and only writes
 * after the user confirms. A backup is saved first.
 */
export default function HooksPanel({ onClose, lastEventAt }: Props) {
  const utils = trpc.useUtils();
  const status = trpc.hooks.status.useQuery();
  const [mode, setMode] = useState<"install" | "uninstall" | null>(null);
  const preview = trpc.hooks.preview.useQuery({ mode: mode ?? "install" }, { enabled: mode !== null, retry: false });
  const apply = trpc.hooks.change.useMutation({
    onSuccess: () => {
      setMode(null);
      utils.hooks.status.invalidate();
    },
  });

  const st = status.data;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Hooks setup">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg border border-[#4B0082] bg-[#0d0a1a] text-sm text-gray-200">
        <div className="flex items-center justify-between border-b border-[#2a2440] px-4 py-3">
          <h2 className="font-bold text-[#fbbf24]">⚙️ Exact alerts with Claude Code hooks (optional)</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Close">✕</button>
        </div>

        <div className="min-h-0 space-y-3 overflow-y-auto px-4 py-3 text-xs leading-relaxed">
          <p>
            Without hooks, everything works from Claude Code's transcript files, except that a <b>permission prompt</b> can only be guessed
            ("may be waiting for approval"). With hooks, Claude Code tells this app the moment it needs your approval.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-gray-300">
            <li><b>Applies to every project</b>: hooks go in your user settings, so all Claude Code sessions in every folder send events.</li>
            <li>Events go only to <code className="text-sky-300">{st?.url ?? "http://127.0.0.1:…/api/hooks"}</code> on this computer, with a secret key. Nothing leaves your machine.</li>
            <li>They never change what Claude does: this app always answers with an empty reply. If the app isn't running, Claude Code just continues (each event waits at most 2 seconds).</li>
            <li>Your existing hooks are kept. Uninstall removes only the entries added here. A backup is saved to <code>~/.claude-dungeon/backups</code> before every change.</li>
          </ul>

          {status.isLoading && <p>Checking settings…</p>}
          {st && (
            <div className="rounded border border-[#2a2440] bg-[#120f22] p-2">
              <div>Settings file: <code className="break-all">{st.settingsPath}</code></div>
              <div>
                Status:{" "}
                {st.installed ? <b className="text-green-300">Installed</b> : <b className="text-gray-300">Not installed</b>}
                {st.installed && (lastEventAt ? <span className="text-gray-400"> · last event {new Date(lastEventAt).toLocaleTimeString()}</span> : <span className="text-gray-400"> · no events yet (start or continue a Claude Code session)</span>)}
              </div>
              {!st.readable && <div className="text-red-300">Can't read the settings file ({st.error}). Fix it by hand first; nothing will be changed.</div>}
              {st.blockedByAllowlist && <div className="text-amber-300">Your settings have <code>allowedHttpHookUrls</code> without this URL, so Claude Code would skip these hooks. Add the URL above to that list.</div>}
            </div>
          )}

          {mode && (
            <div className="space-y-2">
              <h3 className="font-bold text-white">{mode === "install" ? "Preview: install" : "Preview: uninstall"}</h3>
              {preview.error && <p className="text-red-300">{preview.error.message}</p>}
              {preview.data && (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-gray-400">Now</div>
                    <pre className="max-h-64 overflow-auto rounded bg-black/60 p-2 text-[10px]">{preview.data.before || "(file doesn't exist yet)"}</pre>
                  </div>
                  <div>
                    <div className="mb-1 text-gray-400">After</div>
                    <pre className="max-h-64 overflow-auto rounded bg-black/60 p-2 text-[10px]">{preview.data.after}</pre>
                  </div>
                </div>
              )}
            </div>
          )}
          {apply.error && <p className="text-red-300">{apply.error.message}</p>}
          {apply.data && (
            <p className="text-green-300">
              Done. {apply.data.backupPath ? <>Backup saved to <code className="break-all">{apply.data.backupPath}</code>.</> : null} New Claude Code sessions pick this up automatically.
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-[#2a2440] px-4 py-3">
          {!mode && st?.readable && (
            st.installed
              ? <button onClick={() => setMode("uninstall")} className="rounded border border-gray-500 px-3 py-1 text-xs hover:bg-gray-800">Uninstall…</button>
              : <button onClick={() => setMode("install")} className="rounded border border-[#fbbf24] px-3 py-1 text-xs text-[#fbbf24] hover:bg-[#fbbf24] hover:text-black">Install…</button>
          )}
          {mode && (
            <>
              <button onClick={() => setMode(null)} className="rounded border border-gray-600 px-3 py-1 text-xs hover:bg-gray-800">Cancel</button>
              <button
                disabled={!preview.data || apply.isPending}
                onClick={() => apply.mutate({ mode })}
                className="rounded bg-[#fbbf24] px-3 py-1 text-xs font-bold text-black disabled:opacity-40"
              >
                {mode === "install" ? "Yes, install hooks" : "Yes, remove hooks"}
              </button>
            </>
          )}
          {!mode && <button onClick={onClose} className="rounded border border-gray-600 px-3 py-1 text-xs hover:bg-gray-800">Close</button>}
        </div>
      </div>
    </div>
  );
}
