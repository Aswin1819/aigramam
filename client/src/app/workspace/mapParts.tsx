/**
 * Pieces shared by the 3D Map and its 2D fallback: the header strip, the
 * session status board and the round map buttons. Styled like a dark
 * operations floor: charcoal panels, hairline borders, small spaced capitals
 * and serif figures. Only real data; nothing here is invented.
 */
import { useMemo, type ReactNode } from "react";
import { PanelRightClose } from "lucide-react";
import type { ProjectView, SessionView } from "@shared/model";
import { clockTime, elapsed } from "@/lib/status";
import { plainStatus, type Tone } from "./focus";
import { BOARD_FILTERS, boardCounts, boardList, type BoardFilter } from "./villageMap";

export const PANEL_W = 380;

/** Badge colours per state on the board (text is always there too). */
const BADGE: Record<Tone, string> = {
  urgent: "bg-urgent text-ink",
  turn: "bg-wait text-ink",
  error: "bg-[#ff8a80] text-ink",
  work: "bg-work/90 text-ink",
  quiet: "bg-white/15 text-cream",
  rest: "bg-white/10 text-cream/80",
};

export function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="map-panel grid h-10 w-10 place-items-center rounded-full text-cream/85 hover:text-cream">
      {children}
    </button>
  );
}

/** The map's top strip: name, where the data comes from, what needs the person, and the time. */
export function MapHeader({ total, projects, needsYou, demo, source, now }: { total: number; projects: number; needsYou: number; demo: boolean; source: string; now: number }) {
  return (
    <div className="map-panel pointer-events-auto flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl px-4 py-2 text-cream" data-no-pan>
      <span className="font-serif text-[19px] tracking-[0.04em]">
        AI GRAMAM <span className="text-[13px] text-[var(--map-grey)]">· village map</span>
      </span>
      <span className="map-label flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${demo ? "bg-brass" : "bg-work"}`} aria-hidden />
        {demo ? "Demo · simulated" : `Live · ${source}`}
      </span>
      <span className="map-label">
        {total} {total === 1 ? "villager" : "villagers"} · {projects} {projects === 1 ? "project" : "projects"}
      </span>
      <span className="ml-auto flex items-center gap-3">
        {needsYou > 0 && <span className="map-label rounded-full bg-urgent/15 px-2.5 py-1 text-urgent ring-1 ring-urgent/50">{needsYou === 1 ? "1 needs you" : `${needsYou} need you`}</span>}
        <span className="font-serif text-[19px] tabular-nums">{clockTime(now)}</span>
      </span>
    </div>
  );
}

export function Board(p: {
  onHide: () => void;
  sessions: SessionView[];
  projects: ProjectView[];
  now: number;
  demo: boolean;
  filter: BoardFilter;
  onFilter: (f: BoardFilter) => void;
  onFocus: (id: string) => void;
  /** When the map is looking at one project, the board shows only its sessions. */
  scopeProjectId?: string | null;
}) {
  const scoped = useMemo(() => (p.scopeProjectId ? p.sessions.filter((s) => s.projectId === p.scopeProjectId) : p.sessions), [p.sessions, p.scopeProjectId]);
  const counts = useMemo(() => boardCounts(scoped, p.now), [scoped, p.now]);
  const list = useMemo(() => boardList(scoped, p.filter, p.now), [scoped, p.filter, p.now]);
  const names = useMemo(() => new Map(p.projects.map((x) => [x.id, x.name])), [p.projects]);
  const scopeName = p.scopeProjectId ? (names.get(p.scopeProjectId) ?? "This project") : "Whole village";
  return (
    <aside className="map-panel pointer-events-auto flex h-full flex-col rounded-2xl" style={{ width: PANEL_W }} aria-label="Session status" data-no-pan>
      <header className="flex items-center gap-2 border-b border-[var(--map-line)] px-4 py-3">
        <h2 className="font-serif text-[17px] tracking-[0.05em] text-cream">SESSION STATUS</h2>
        <span className="map-label ml-auto truncate">{scopeName}</span>
        <button onClick={p.onHide} aria-label="Hide session status" title="Hide session status" className="rounded-lg p-1.5 text-cream/70 hover:bg-white/10 hover:text-cream">
          <PanelRightClose size={16} />
        </button>
      </header>
      <div className="flex flex-wrap gap-1.5 px-3.5 pt-3" role="group" aria-label="Show sessions">
        {BOARD_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => p.onFilter(f.id)}
            aria-pressed={p.filter === f.id}
            className={`map-label rounded-full px-2.5 py-1 ring-1 transition-colors ${p.filter === f.id ? "bg-[var(--map-ink)] text-[var(--map-bg)] ring-[var(--map-ink)]" : "ring-[var(--map-line)] hover:bg-white/5"} ${f.id === "needs" && counts.needs > 0 && p.filter !== f.id ? "text-urgent ring-urgent/50" : ""}`}
          >
            {f.label} <span className="font-serif text-[13px] normal-case tracking-normal">{counts[f.id]}</span>
          </button>
        ))}
      </div>
      <ul className="mt-2.5 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
        {list.length === 0 && <li className="px-1 py-6 text-center text-[13px] text-[var(--map-grey)]">Nothing here right now.</li>}
        {list.map((s) => {
          const st = plainStatus(s, p.now);
          return (
            <li key={s.id}>
              <button
                onClick={() => p.onFocus(s.id)}
                className={`flex w-full gap-2.5 rounded-xl px-3 py-2.5 text-left ring-1 transition-colors ${st.tone === "urgent" ? "bg-urgent/10 ring-urgent/45 hover:bg-urgent/18" : "ring-[var(--map-line)] hover:bg-white/[0.05]"}`}
              >
                <span className={`mt-0.5 h-fit shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] ${BADGE[st.tone]}`}>{st.headline}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate font-serif text-[15px] leading-snug text-cream">{s.title}</span>
                    <span className="shrink-0 text-[12px] text-[var(--map-grey)]">{elapsed(s.statusSince, p.now)}</span>
                  </span>
                  <span className="map-label mt-0.5 block truncate">{names.get(s.projectId) ?? "Other"}</span>
                  <span className="block truncate text-[12.5px] text-cream/75">{st.detail}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
