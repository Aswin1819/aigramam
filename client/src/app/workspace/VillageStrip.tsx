/**
 * The village in a strip, for Workspace → Focus: each project as its signboard
 * (in its yard colour from the village), its villagers in front with their
 * lamp. Clicking a villager opens it in the queue. Words carry the meaning;
 * the picture adds recognition.
 */
import type { CharacterAssignments, CharacterInfo } from "@shared/character";
import type { ProjectView, SessionView } from "@shared/model";
import type { WorldInfo } from "@shared/world";
import { projectAccent } from "@shared/stations";
import Avatar from "@/components/Avatar";
import { pickCharacter } from "@/world/characters";
import { plainStatus, type Tone } from "./focus";

export interface Cast {
  world: WorldInfo | null;
  cast: CharacterInfo[];
  assignments?: CharacterAssignments;
}

export const TONE_TEXT: Record<Tone, string> = { urgent: "text-urgent", turn: "text-wait", work: "text-work", quiet: "text-cream/70", error: "text-red-300", rest: "text-cream/55" };
export const TONE_BG: Record<Tone, string> = { urgent: "bg-urgent", turn: "bg-wait", work: "bg-work", quiet: "bg-cream/40", error: "bg-red-400", rest: "bg-cream/25" };

export function characterOf(c: Cast, s: SessionView): CharacterInfo | null {
  return pickCharacter(s, c.world, c.cast, c.assignments);
}

/** A villager's face with its lamp (the state is always also written next to it). */
export function Face({ c, s, now, size = 44 }: { c: Cast; s: SessionView; now: number; size?: number }) {
  const tone = plainStatus(s, now).tone;
  const anim = tone === "urgent" || tone === "turn" ? "wait" : tone === "error" ? "error" : tone === "work" ? "read" : "idle";
  const lamp = Math.max(7, size * 0.16);
  return (
    <span className="relative inline-flex shrink-0 items-end justify-center rounded-xl bg-[radial-gradient(circle_at_50%_70%,rgba(227,176,75,0.18),transparent_70%)]" style={{ width: size * 0.9, height: size }}>
      <Avatar character={characterOf(c, s)} size={size} anim={anim} />
      <span className={`absolute right-0 top-0 rounded-full ring-2 ring-[#13221e] ${TONE_BG[tone]} ${tone === "urgent" ? "animate-pulse" : ""}`} style={{ width: lamp, height: lamp }} aria-hidden />
    </span>
  );
}

export function StatusLine({ s, now, className = "" }: { s: SessionView; now: number; className?: string }) {
  const p = plainStatus(s, now);
  return (
    <span className={`block min-w-0 truncate ${className}`}>
      <span className={`text-[12.5px] font-semibold ${TONE_TEXT[p.tone]}`}>{p.headline}</span>
      <span className="text-[12.5px] text-cream/70"> · {p.detail}</span>
    </span>
  );
}

/** Sky by local hour (dawn, day, dusk, night), like the village. */
function skyFor(hour: number): string {
  if (hour < 5 || hour >= 20) return "linear-gradient(180deg,#0b1430,#1d2b4a)";
  if (hour < 8) return "linear-gradient(180deg,#f6b38a,#a9c9e8)";
  if (hour < 17) return "linear-gradient(180deg,#8ec5f0,#cfe6f5)";
  return "linear-gradient(180deg,#f08a5d,#6c5b9e)";
}

interface Props {
  c: Cast;
  sessions: SessionView[];
  projects: ProjectView[];
  now: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onProject: (projectId: string) => void;
  empty: string;
}

export default function VillageStrip({ c, sessions, projects, now, selectedId, onSelect, onProject, empty }: Props) {
  const groups = projects.map((p) => ({ p, list: sessions.filter((s) => s.projectId === p.id) })).filter((g) => g.list.length);
  // Sessions whose project isn't listed yet still show.
  const orphans = sessions.filter((s) => !projects.some((p) => p.id === s.projectId));
  if (orphans.length) groups.push({ p: { id: "_", name: "Other", root: "" } as ProjectView, list: orphans });
  const hour = new Date(now).getHours();
  const night = hour < 5 || hour >= 20;
  return (
    <div className="relative h-[118px] overflow-hidden rounded-2xl border border-white/10" style={{ background: skyFor(hour) }} aria-label="The village">
      <div className="absolute inset-x-0 bottom-0 h-[36%] bg-[linear-gradient(180deg,#2f6b4f,#1d4a37)]" />
      <div className="absolute inset-x-0 bottom-[36%] h-[9%] bg-[linear-gradient(180deg,#3c8a9a,#2b6f7d)] opacity-80" />
      {night && <div className="absolute inset-0 bg-[#0b1430]/30" />}
      <div className="relative flex h-full items-end gap-6 overflow-x-auto px-5 pb-2">
        {groups.length === 0 && <p className="m-auto rounded-lg bg-black/40 px-3 py-1.5 text-[12.5px] text-cream">{empty}</p>}
        {groups.map(({ p, list }) => (
          <div key={p.id} className="flex shrink-0 flex-col items-center">
            <button
              onClick={() => p.id !== "_" && onProject(p.id)}
              title={p.root ? `${p.root}\nOpen on the Projects page` : undefined}
              className="mb-1 max-w-[180px] truncate rounded-md border border-[#6b4a22] bg-[#4a331a]/90 px-2 py-0.5 text-[11.5px] font-semibold leading-tight text-cream shadow hover:brightness-125"
              style={{ borderTop: `3px solid ${p.id === "_" ? "#6b4a22" : projectAccent(p.id)}` }}
            >
              {p.name}
            </button>
            <div className="flex items-end gap-1">
              {list.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onSelect(s.id)}
                  title={`${s.title}: ${plainStatus(s, now).headline}`}
                  aria-label={`${s.title}: ${plainStatus(s, now).headline}`}
                  className={`rounded-xl p-0.5 transition-transform hover:-translate-y-0.5 ${selectedId === s.id ? "ring-2 ring-brass" : ""}`}
                >
                  <Face c={c} s={s} now={now} size={50} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
