import { motion } from "motion/react";
import { X } from "lucide-react";
import type { WorldInfo } from "@shared/world";
import { STATIONS, STATION_LABEL, type Station } from "@shared/stations";

const LAMPS: Array<{ color: string; text: string; blink?: boolean }> = [
  { color: "#ffc24d", text: "Working" },
  { color: "#ff5a4f", text: "Needs your approval or answer", blink: true },
  { color: "#f5b33d", text: "Your turn" },
  { color: "#8b2b2b", text: "Stopped with an error" },
  { color: "transparent", text: "Resting" },
];

/** How to read the village: plots, stations and lamps. Shown once, then from the notice board. */
export default function VillageLegend({ world, onClose }: { world: WorldInfo | null; onClose: () => void }) {
  const props = world?.def.plots?.props ?? {};
  const url = (st: Station) => {
    const rel = props[st];
    return rel ? world?.urls[rel] : undefined;
  };
  return (
    <motion.div
      role="dialog"
      aria-label="How to read the village"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      className="pointer-events-auto absolute bottom-20 left-1/2 z-30 w-[min(640px,94vw)] -translate-x-1/2 rounded-2xl border border-[#6b4a22] bg-[linear-gradient(160deg,#3d2a15,#2a1c0d)] p-4 text-cream shadow-2xl"
    >
      <button onClick={onClose} className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-lg text-cream/60 hover:bg-white/10" aria-label="Close"><X size={15} /></button>
      <h2 className="font-display text-[16px] font-bold">How to read the village</h2>
      <p className="mt-1 text-[12.5px] text-cream/75">
        Each project has its own yard with its name board and colour. Every yard has the same stations, and a villager walks to one only when its work changes,
        so movement always means something.
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {STATIONS.map((st) => (
          <li key={st} className="flex items-center gap-2 rounded-xl bg-black/25 p-2">
            <span className="grid h-10 w-10 shrink-0 place-items-center">
              {url(st) ? <img src={url(st)} alt="" className="max-h-10 max-w-10 object-contain [image-rendering:auto]" /> : <span className="h-3 w-3 rounded-full bg-brass" />}
            </span>
            <span className="text-[11.5px] leading-snug text-cream/85">{STATION_LABEL[st]}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] text-cream/80" aria-label="Lamps">
        <span className="font-semibold text-brass">Lamps at the front, one per session:</span>
        {LAMPS.map((l) => (
          <span key={l.text} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full border border-[#b8862b] ${l.blink ? "animate-pulse" : ""}`} style={{ background: l.color }} aria-hidden />
            {l.text}
          </span>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <button onClick={onClose} className="rounded-xl bg-brass px-4 py-1.5 text-[13px] font-semibold text-ink hover:brightness-110">Got it</button>
      </div>
    </motion.div>
  );
}
