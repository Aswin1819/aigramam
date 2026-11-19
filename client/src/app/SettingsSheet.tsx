/**
 * Settings: the dialog shell and its list of sections. Each section is its own
 * component in ./settings/.
 */
import { useRef } from "react";
import { useModal } from "@/hooks/useModal";
import { AnimatePresence, motion } from "motion/react";
import { Bell, Cable, Globe2, Link2, MonitorCog, Users, Wand2, X } from "lucide-react";
import type { WorldsState } from "@shared/world";
import type { CharactersState } from "@shared/character";
import type { TimeMode } from "./useDisplayPrefs";
import AlertsTab from "./settings/AlertsTab";
import BridgeTab from "./settings/BridgeTab";
import DisplayTab from "./settings/DisplayTab";
import LinkTab from "./settings/LinkTab";
import { CharactersTab, WorldsTab } from "./settings/PackTabs";
import SkillsTab from "./settings/SkillsTab";

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
  desktopNotify: boolean;
  onDesktopNotify: (v: boolean) => void;
  time: TimeMode;
  onTime: (t: TimeMode) => void;
  onOpenSkills: () => void;
  connected: boolean;
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

export default function SettingsSheet(p: Props) {
  const dialog = useRef<HTMLDivElement>(null);
  useModal(dialog, p.onClose);
  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <motion.div
        ref={dialog}
        tabIndex={-1}
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
            <button key={id} onClick={() => p.onTab(id)} aria-current={p.tab === id ? "page" : undefined} className="relative flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm">
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

              {p.tab === "link" && <LinkTab connected={p.connected} />}
              {p.tab === "alerts" && <AlertsTab lastHookAt={p.lastHookAt} />}
              {p.tab === "worlds" && <WorldsTab worlds={p.worlds} activeWorldId={p.activeWorldId} onWorld={p.onWorld} />}
              {p.tab === "characters" && <CharactersTab characters={p.characters} />}
              {p.tab === "display" && <DisplayTab reducedMotion={p.reducedMotion} onReducedMotion={p.onReducedMotion} desktopNotify={p.desktopNotify} onDesktopNotify={p.onDesktopNotify} time={p.time} onTime={p.onTime} />}
              {p.tab === "bridge" && <BridgeTab />}
              {p.tab === "skills" && <SkillsTab onOpenSkills={p.onOpenSkills} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
