/** Settings → Worlds and Characters: installed packs (with author and license), load errors, and adding new ones. */
import type { CharactersState } from "@shared/character";
import type { WorldsState } from "@shared/world";
import Avatar from "@/components/Avatar";
import { trpc } from "@/lib/trpc";
import PackUpload from "../PackUpload";
import { Errors } from "./parts";

export function WorldsTab(p: { worlds: WorldsState | null; activeWorldId?: string; onWorld: (id: string) => void }) {
  const folders = trpc.worlds.folders.useQuery();
  return (
    <>
      <div className="grid gap-2">
        {(p.worlds?.worlds ?? []).map((w) => (
          <button key={w.id} onClick={() => p.onWorld(w.id)} className={`rounded-2xl border p-3 text-left transition-colors ${w.id === p.activeWorldId ? "border-brass bg-brass/10" : "border-white/10 hover:bg-white/5"}`}>
            <div className="flex items-center justify-between">
              <span className="font-semibold">{w.name}</span>
              {w.id === p.activeWorldId && <span className="chip bg-brass text-ink">Showing</span>}
            </div>
            <div className="text-xs text-cream/55">by {w.author} · license {w.license} · {w.source === "builtin" ? "built in" : "your folder"}</div>
            {w.description && <div className="mt-1 text-xs text-cream/75">{w.description}</div>}
          </button>
        ))}
      </div>
      <Errors errors={p.worlds?.errors ?? []} />
      <a href="/styles" className="block rounded-2xl border border-dashed border-brass/40 p-3 text-sm hover:bg-brass/10">
        <span className="font-semibold text-brass">Style lab →</span> <span className="text-cream/70">compare 10 art and animation style prototypes, pick your favourites</span>
      </a>
      <PackUpload kind="world" />
      <p className="text-xs text-cream/60">Or put a folder with <code>world.json</code> and its images in <code className="text-work">{folders.data?.user ?? "~/.ai-gramam/worlds"}</code>. It appears within seconds, no restart.</p>
    </>
  );
}

export function CharactersTab(p: { characters: CharactersState | null }) {
  const folders = trpc.worlds.folders.useQuery();
  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(p.characters?.characters ?? []).map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-white/10 p-3">
            <div className="grid h-20 w-14 place-items-end rounded-xl bg-white/5"><Avatar character={c} size={72} /></div>
            <div className="min-w-0">
              <div className="font-semibold">{c.name}</div>
              <div className="text-xs capitalize text-brass/90">{c.role}</div>
              <div className="text-xs text-cream/55">by {c.author} · {c.license}</div>
              <div className="text-[11px] text-cream/60">{c.source === "builtin" ? "built in" : "your folder"}</div>
            </div>
          </div>
        ))}
      </div>
      <Errors errors={p.characters?.errors ?? []} />
      <PackUpload kind="character" />
      <p className="text-xs text-cream/60">Or put a folder with <code>pack.json</code> and <code>sprites.png</code> in <code className="text-work">{folders.data?.userCharacters ?? "~/.ai-gramam/characters"}</code>.</p>
    </>
  );
}
