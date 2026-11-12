/**
 * Small sound cues, synthesised with the Web Audio API (no audio files):
 * - "urgent": two bright bell notes, when a session needs approval or asks a question;
 * - "soft": one low note, when a session finishes its turn and it's yours.
 *
 * Browsers only allow sound after the person has interacted with the page,
 * so the audio context is created on first use and resumed on the next click.
 */
export type Chime = "urgent" | "soft";

let ctx: AudioContext | null = null;
let lastAt = 0;
/** Several sessions changing at once still make one sound. */
const MIN_GAP_MS = 1500;

function audio(): AudioContext | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
    const resume = () => void ctx?.resume().catch(() => {});
    window.addEventListener("pointerdown", resume, { passive: true });
    window.addEventListener("keydown", resume);
  }
  return ctx;
}

/** A struck bell: a sine with a quick attack and a long exponential decay, plus a quiet overtone. */
function bell(ac: AudioContext, at: number, freq: number, peak: number, length: number) {
  for (const [mult, gainMult] of [[1, 1], [2.76, 0.18]] as const) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = freq * mult;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak * gainMult, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(gain).connect(ac.destination);
    osc.start(at);
    osc.stop(at + length + 0.05);
  }
}

/** Play a cue. Safe to call often: it's rate-limited, and silent until sound is allowed. */
export function playChime(kind: Chime, volume = 0.5) {
  const now = Date.now();
  if (now - lastAt < MIN_GAP_MS) return;
  const ac = audio();
  if (!ac || ac.state !== "running") {
    void ac?.resume().catch(() => {});
    return;
  }
  lastAt = now;
  const t = ac.currentTime + 0.02;
  const v = Math.max(0, Math.min(1, volume)) * 0.22;
  if (kind === "urgent") {
    bell(ac, t, 880, v, 0.9); // A5
    bell(ac, t + 0.16, 1318.5, v, 1.2); // E6
  } else {
    bell(ac, t, 523.25, v * 0.6, 1.1); // C5
  }
}
