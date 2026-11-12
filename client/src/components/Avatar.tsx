import type { CharacterInfo } from "@shared/character";

interface Props {
  character: CharacterInfo | null;
  /** Rendered height in CSS pixels. */
  size?: number;
  anim?: "idle" | "wait" | "celebrate" | "error" | "read";
  className?: string;
}

/** First frame of a character's animation, drawn from its sprite sheet with crisp pixels. */
export default function Avatar({ character, size = 48, anim = "idle", className = "" }: Props) {
  if (!character) return <div className={`rounded-full bg-white/10 ${className}`} style={{ width: size * 0.66, height: size }} />;
  const { frame, animations, sheet } = character.def;
  const url = character.urls[sheet.split("\\").join("/")];
  const row = (animations[anim] ?? animations.idle)!.row;
  const k = size / frame.height;
  const rows = Math.max(...Object.values(animations).map((a) => (a ? a.row + 1 : 1)));
  return (
    <div
      role="img"
      aria-label={character.name}
      className={className}
      style={{
        width: frame.width * k,
        height: size,
        backgroundImage: `url(${url})`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: `0px ${-row * frame.height * k}px`,
        backgroundSize: `auto ${rows * frame.height * k}px`,
        imageRendering: "pixelated",
      }}
    />
  );
}
