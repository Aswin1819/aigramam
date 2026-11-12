import { Check, Shuffle } from "lucide-react";
import type { CharacterInfo } from "@shared/character";
import Avatar from "@/components/Avatar";

interface Props {
  projectName: string;
  cast: CharacterInfo[];
  /** The character chosen for this project, or null for automatic. */
  chosenId: string | null;
  onChoose: (characterId: string | null) => void;
}

/** Choose who a project's sessions appear as, in every world and art style. */
export default function CharacterPicker({ projectName, cast, chosenId, onChoose }: Props) {
  const option = (key: string, selected: boolean, onClick: () => void, children: React.ReactNode, label: string) => (
    <button
      key={key}
      onClick={onClick}
      aria-pressed={selected}
      title={label}
      className={`relative flex w-[76px] shrink-0 flex-col items-center gap-1 rounded-xl border px-1.5 pb-1.5 pt-1 text-center transition-colors ${selected ? "border-brass bg-brass/15" : "border-white/10 hover:bg-white/5"}`}
    >
      {selected && <Check size={12} className="absolute right-1 top-1 text-brass" />}
      {children}
      <span className={`line-clamp-2 text-[10.5px] leading-tight ${selected ? "font-semibold text-cream" : "text-cream/70"}`}>{label}</span>
    </button>
  );

  return (
    <div>
      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-brass/90">Character</h3>
      <p className="mb-2 text-[11.5px] text-cream/55">
        Every session in <span className="text-cream/85">{projectName}</span> appears as this character, in every world and art style.
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label={`Character for ${projectName}`}>
        {option(
          "auto",
          chosenId === null,
          () => onChoose(null),
          <span className="grid h-[52px] w-10 place-items-center text-cream/60"><Shuffle size={18} /></span>,
          "Automatic",
        )}
        {cast.map((c) =>
          option(
            c.id,
            chosenId === c.id,
            () => onChoose(c.id),
            <span className="grid h-[52px] w-10 place-items-end overflow-hidden"><Avatar character={c} size={48} /></span>,
            c.name,
          ),
        )}
      </div>
      {cast.length === 0 && <p className="text-[11.5px] text-cream/50">No character packs are installed.</p>}
    </div>
  );
}
