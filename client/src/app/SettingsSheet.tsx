import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bell, Globe2, Users, Cable, MonitorCog, Wand2, X, Copy, Check, Link2 } from "lucide-react";
import type { WorldsState } from "@shared/world";
import type { CharactersState } from "@shared/character";
import { trpc } from "@/lib/trpc";
import Avatar from "@/components/Avatar";
import type { TimeMode } from "./useDisplayPrefs";
import PackUpload from "./PackUpload";

export type SettingsTab = "link" | "alerts" | "worlds" | "characters" | "bridge" | "display" | "skills";

interface Props {
  tab: SettingsTab;
  onTab: (t: SettingsTab) => void;
  onClose: () => void;
  worlds: WorldsState | null;
  activeWorldId?: string;
  onWorld: (id: string) => void;
  characters: CharactersState | null;
  lastHookAt?: number;
  reducedMotion: boolean;
  onReducedMotion: (v: boolean) => void;
  time: TimeMode;
  onTime: (t: TimeMode) => void;
  onOpenSkills: () => void;
  linkedCount: number;
  sessionCount: number;
}

const TABS: Array<{ id: SettingsTab; label: string; Icon: typeof Bell }> = [
  { id: "link", label: "Session link", Icon: Link2 },
  { id: "alerts", label: "Alerts (hooks)", Icon: Bell },
  { id: "worlds", label: "Worlds", Icon: Globe2 },
  { id: "characters", label: "Characters", Icon: Users },
  { id: "display", label: "Display", Icon: MonitorCog },
  { id: "bridge", label: "Remote bridge", Icon: Cable },
  { id: "skills", label: "Skills & agents", Icon: Wand2 },
];

function Errors({ errors }: { errors: Array<{ folder: string; source: string; messages: string[] }> }) {
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

function CopyLine({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-2">
      <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-cream/85">{text}</code>
      <button
        onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch {} }}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-cream/70 hover:bg-white/10"
        aria-label={`Copy ${label}`}
      >
        {done ? <Check size={14} className="text-work" /> : <Copy size={14} />}
      </button>
    </div>
  );
}

function AlertsTab({ lastHookAt }: { lastHookAt?: number }) {
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
                  <div className="mb-1 text-[11px] text-cream/50">{k === "before" ? "Now" : "After"}</div>
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

function LinkTab({ linked, total }: { linked: number; total: number }) {
  const folder = trpc.worlds.folders.useQuery().data?.app ?? "<the aigramam folder>";
  return (
    <div className="space-y-3 text-[13px] leading-relaxed text-cream/85">
      <p>
        The <b className="text-cream">Ai Gramam mod</b> runs inside each Claude Code session and links it to this village. A linked session can be{" "}
        <b className="text-cream">messaged</b>, <b className="text-cream">stopped</b> and have its <b className="text-cream">permission requests approved</b> from here, and it reports exactly what it's doing.
      </p>
      <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-xs">
        <b className={linked ? "text-work" : "text-cream"}>{linked} of {total}</b> live session{total === 1 ? "" : "s"} linked right now.
        {total > linked && <span className="text-cream/55"> Sessions started before the mod was installed link after they restart.</span>}
      </div>
      <div className="text-xs text-cream/60">Install it once (it then loads in every new Claude Code session). In a terminal:</div>
      <CopyLine label="add marketplace" text={`claude plugin marketplace add ${folder}`} />
      <CopyLine label="install" text="claude plugin install ai-gramam@aigramam" />
      <ul className="space-y-1 text-[12px] text-cream/70">
        <li>• Messages are sent as your own words and run when the session is free. Stop works like Esc.</li>
        <li>• Permission requests come here first only when they would have asked <i>you</i>; with no answer in 45 s the normal prompt appears in the terminal.</li>
        <li>• Questions Claude asks you are answered in the session's chat (choices or your own words); "Answer in terminal", or no answer in 45 s, and the question appears there instead.</li>
        <li>• Plan approvals stay in the terminal. If another plugin answers permission requests first, those stay in the terminal too.</li>
        <li>• Only small details (file paths, commands) are sent, only to 127.0.0.1, with your local key. Uninstall: <code>claude plugin uninstall ai-gramam</code>.</li>
      </ul>
    </div>
  );
}

function BridgeTab() {
  const { data: key } = trpc.agents.bridgeApiKey.useQuery();
  const { data: status } = trpc.agents.connectionStatus.useQuery();
  const origin = window.location.origin;
  return (
    <div className="space-y-3 text-[13px] text-cream/85">
      <p>Only needed to show Claude Code sessions from <b className="text-cream">another computer</b>. Sessions on this computer appear automatically.</p>
      <div className="text-xs text-cream/60">1. Download the bridge script</div>
      <CopyLine label="download command" text={`curl -O ${origin}/bridge/ai-gramam-bridge.mjs`} />
      <div className="text-xs text-cream/60">2. Run it on that computer (Node.js 18+)</div>
      <CopyLine label="run command" text={key?.apiKey ? `AI_GRAMAM_SERVER=${origin} AI_GRAMAM_API_KEY=${key.apiKey} node ai-gramam-bridge.mjs` : "Loading…"} />
      {status && (
        <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-cream/70">
          Watching <code>{status.projectsDir}</code> · {status.trackedProjects} projects · {status.totalSessions} transcripts
        </div>
      )}
    </div>
  );
}

export default function SettingsSheet(p: Props) {
  const folders = trpc.worlds.folders.useQuery();
  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        initial={{ y: 24, scale: 0.97, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 24, scale: 0.97, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="glass-strong flex h-[min(640px,88vh)] w-[min(880px,96vw)] overflow-hidden rounded-3xl text-cream"
      >
        <nav className="flex w-52 shrink-0 flex-col gap-0.5 border-r border-white/8 p-3" aria-label="Settings sections">
          <div className="mb-2 px-2 font-display text-lg font-bold">Settings</div>
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => p.onTab(id)} className="relative flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm">
              {p.tab === id && <motion.span layoutId="settings-tab" className="absolute inset-0 rounded-xl bg-white/10" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
              <Icon size={15} className={`relative ${p.tab === id ? "text-brass" : "text-cream/55"}`} />
              <span className={`relative ${p.tab === id ? "font-semibold" : "text-cream/75"}`}>{label}</span>
              {id === "worlds" && !!p.worlds?.errors.length && <span className="relative ml-auto chip bg-urgent/20 text-urgent">{p.worlds.errors.length}</span>}
              {id === "characters" && !!p.characters?.errors.length && <span className="relative ml-auto chip bg-urgent/20 text-urgent">{p.characters.errors.length}</span>}
            </button>
          ))}
        </nav>
        <div className="relative min-w-0 flex-1 overflow-y-auto p-6">
          <button onClick={p.onClose} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-xl text-cream/60 hover:bg-white/10" aria-label="Close settings"><X size={17} /></button>
          <AnimatePresence mode="wait">
            <motion.div key={p.tab} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.18 }} className="space-y-4 pr-6">
              <h2 className="font-display text-xl font-bold">{TABS.find((t) => t.id === p.tab)?.label}</h2>

              {p.tab === "link" && <LinkTab linked={p.linkedCount} total={p.sessionCount} />}
              {p.tab === "alerts" && <AlertsTab lastHookAt={p.lastHookAt} />}

              {p.tab === "worlds" && (
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
              )}

              {p.tab === "characters" && (
                <>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {(p.characters?.characters ?? []).map((c) => (
                      <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-white/10 p-3">
                        <div className="grid h-20 w-14 place-items-end rounded-xl bg-white/5"><Avatar character={c} size={72} /></div>
                        <div className="min-w-0">
                          <div className="font-semibold">{c.name}</div>
                          <div className="text-xs capitalize text-brass/90">{c.role}</div>
                          <div className="text-xs text-cream/55">by {c.author} · {c.license}</div>
                          <div className="text-[11px] text-cream/40">{c.source === "builtin" ? "built in" : "your folder"}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Errors errors={p.characters?.errors ?? []} />
                  <PackUpload kind="character" />
                  <p className="text-xs text-cream/60">Or put a folder with <code>pack.json</code> and <code>sprites.png</code> in <code className="text-work">{folders.data?.userCharacters ?? "~/.ai-gramam/characters"}</code>.</p>
                </>
              )}

              {p.tab === "display" && (
                <div className="space-y-4 text-sm">
                  <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 p-3">
                    <span>
                      <span className="block font-semibold">Reduce motion</span>
                      <span className="text-xs text-cream/55">Stops swaying, drifting, rain and particles; status changes still show.</span>
                    </span>
                    <input type="checkbox" checked={p.reducedMotion} onChange={(e) => p.onReducedMotion(e.target.checked)} className="h-5 w-5 accent-[#e3b04b]" />
                  </label>
                  <div className="rounded-2xl border border-white/10 p-3">
                    <div className="mb-2 font-semibold">Time of day</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(["auto", "dawn", "day", "dusk", "night"] as const).map((t) => (
                        <button key={t} onClick={() => p.onTime(t)} className={`rounded-xl px-3 py-1.5 text-xs capitalize ${p.time === t ? "bg-brass font-semibold text-ink" : "bg-white/5 hover:bg-white/10"}`}>
                          {t === "auto" ? "Follow my clock" : t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {p.tab === "bridge" && <BridgeTab />}

              {p.tab === "skills" && (
                <div className="space-y-3 text-sm text-cream/85">
                  <p>View and edit your Claude Code skills (<code>~/.claude/skills</code>) and subagents (<code>~/.claude/agents</code>), globally or per project.</p>
                  <button onClick={p.onOpenSkills} className="rounded-xl bg-brass px-4 py-2 text-sm font-semibold text-ink">Open skills & agents</button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
