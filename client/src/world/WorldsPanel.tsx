import type { WorldsState } from "@shared/world";
import { trpc } from "@/lib/trpc";

interface Props {
  state: WorldsState | null;
  activeId?: string;
  onChoose: (id: string) => void;
  onClose: () => void;
}

/** Installed worlds (with author and license), broken packs and their errors, and where to add new ones. */
export default function WorldsPanel({ state, activeId, onChoose, onClose }: Props) {
  const folders = trpc.worlds.folders.useQuery();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Worlds">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border border-[#4B0082] bg-[#0d0a1a] text-sm text-gray-200">
        <div className="flex items-center justify-between border-b border-[#2a2440] px-4 py-3">
          <h2 className="font-bold text-[#fbbf24]">🌍 Worlds</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Close">✕</button>
        </div>
        <div className="min-h-0 space-y-4 overflow-y-auto px-4 py-3 text-xs">
          <ul className="space-y-2">
            {(state?.worlds ?? []).map((w) => (
              <li key={w.id} className={`rounded border p-2 ${w.id === activeId ? "border-[#fbbf24] bg-[#1d1630]" : "border-[#2a2440]"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-white">{w.name}</div>
                    <div className="text-gray-400">
                      by {w.author} · license {w.license} · {w.source === "builtin" ? "built in" : "your folder"}
                    </div>
                    {w.description && <div className="mt-1 text-gray-300">{w.description}</div>}
                  </div>
                  {w.id === activeId ? (
                    <span className="shrink-0 text-[#fbbf24]">Showing</span>
                  ) : (
                    <button onClick={() => onChoose(w.id)} className="shrink-0 rounded border border-[#fbbf24] px-2 py-1 text-[#fbbf24] hover:bg-[#fbbf24] hover:text-black">Show</button>
                  )}
                </div>
              </li>
            ))}
            {state && state.worlds.length === 0 && <li className="text-red-300">No valid worlds found.</li>}
          </ul>

          {state && state.errors.length > 0 && (
            <div>
              <h3 className="mb-1 font-bold text-red-300">⚠️ Couldn't load {state.errors.length} world{state.errors.length > 1 ? "s" : ""}</h3>
              <ul className="space-y-2">
                {state.errors.map((e) => (
                  <li key={`${e.source}/${e.folder}`} className="rounded border border-red-900 bg-red-950/40 p-2">
                    <div className="font-bold text-red-200">{e.folder} <span className="font-normal text-red-300/70">({e.source === "builtin" ? "built in" : "your folder"})</span></div>
                    <ul className="mt-1 list-disc pl-5 text-red-100/90">
                      {e.messages.map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded border border-[#2a2440] bg-[#120f22] p-2 text-gray-300">
            <div className="font-bold text-white">Add a world</div>
            <p className="mt-1">
              Put a folder with a <code>world.json</code> and its images in{" "}
              <code className="break-all text-sky-300">{folders.data?.user ?? "~/.claude-dungeon/worlds"}</code>. It appears here within a few seconds,
              with no restart. See <code>docs/WORLDS.md</code>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
