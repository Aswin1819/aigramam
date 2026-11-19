import { useRef } from "react";
import { useModal } from "@/hooks/useModal";
import { motion } from "motion/react";
import { X } from "lucide-react";
import type { WorldInfo } from "@shared/world";
import { STATIONS, STATION_LABEL, type Station } from "@shared/stations";

/** The same stations, as the areas of an office in the Office world. */
const OFFICE_AREA: Record<Station, string> = {
  study: "Library (reading, searching)",
  desk: "Own desk (writing code, delegating)",
  works: "Server racks (commands, tests)",
  gate: "Web window (the web)",
  porch: "Front counter with the bell (needs you)",
  bench: "Lounge sofa (your turn, resting)",
};

const LAMPS: Array<{ color: string; text: string; blink?: boolean }> = [
  { color: "#ffc24d", text: "Working" },
  { color: "#ff5a4f", text: "Needs your approval or answer", blink: true },
  { color: "#f5b33d", text: "Your turn" },
  { color: "#8b2b2b", text: "Stopped with an error" },
  { color: "transparent", text: "Resting" },
];

/** How to read the village: plots, stations and lamps. Shown once, then from the notice board. */
export default function VillageLegend({ world, office = false, onClose }: { world: WorldInfo | null; office?: boolean; onClose: () => void }) {
  const props = world?.def.plots?.props ?? {};
  const panel = useRef<HTMLDivElement>(null);
  useModal(panel, onClose, { trap: false });
  const url = (st: Station) => {
    const rel = props[st];
    return rel ? world?.urls[rel] : undefined;
  };
  return (
    <motion.div
      ref={panel}
      role="dialog"
      aria-label={office ? "How to read the office" : "How to read the village"}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      className="pointer-events-auto absolute bottom-20 left-1/2 z-30 w-[min(640px,94vw)] -translate-x-1/2 woodboard rounded-2xl p-4 text-cream"
    >
      <button onClick={onClose} className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-lg text-cream/60 hover:bg-white/10" aria-label="Close"><X size={15} /></button>
      <h2 className="font-display text-[16px] font-bold">{office ? "How to read the office" : "How to read the village"}</h2>
      <p className="mt-1 text-[12.5px] text-cream/75">
        {office
          ? "Each project is an office with its name on the wall; each session is an employee with their own desk, and helpers (subagents) stand beside them while they run. Every office has the same areas, and an employee walks to one only when their work changes, so movement always means something. \u201c\u2026\u201d over a head means thinking, \u201c!\u201d an error."
          : "Each project has its own yard with its name board and colour. Every yard has the same stations, and a villager walks to one only when its work changes, so movement always means something."}
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {STATIONS.map((st) => (
          <li key={st} className="flex items-center gap-2 rounded-xl bg-black/25 p-2">
            <span className="grid h-10 w-10 shrink-0 place-items-center">
              {!office && url(st) ? <img src={url(st)} alt="" className="max-h-10 max-w-10 object-contain [image-rendering:auto]" /> : <span className="h-3 w-3 rounded-full bg-brass" />}
            </span>
            <span className="text-[11.5px] leading-snug text-cream/85">{office ? OFFICE_AREA[st] : STATION_LABEL[st]}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] text-cream/80" aria-label="Lamps">
        <span className="font-semibold text-brass">{office ? "Lamp over each employee:" : "Lamps at the front, one per session:"}</span>
        {LAMPS.map((l) => (
          <span key={l.text} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full border border-[#b8862b] ${l.blink ? "animate-pulse" : ""}`} style={{ background: l.color }} aria-hidden />
            {l.text}
          </span>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <button onClick={onClose} className="btn btn-primary">Got it</button>
      </div>
    </motion.div>
  );
}
