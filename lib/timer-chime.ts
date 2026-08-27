export type TimerChimeCue = "focus" | "break" | "finished";

type TimerSnapshot = {
  status: "IDLE" | "RUNNING" | "PAUSED" | "FINISHED";
  phase: "FOCUS" | "BREAK";
};

export function getTimerChimeCue(previous: TimerSnapshot, next: TimerSnapshot): TimerChimeCue | null {
  if (previous.status !== "RUNNING") return null;
  if (next.status === "FINISHED") return "finished";
  if (next.status !== "RUNNING" || previous.phase === next.phase) return null;
  return next.phase === "FOCUS" ? "focus" : "break";
}

function scheduleBellTone(context: AudioContext, frequency: number, startsAt: number, volume: number) {
  for (const harmonic of [{ ratio: 1, level: volume }, { ratio: 2.01, level: volume * 0.28 }]) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency * harmonic.ratio, startsAt);
    envelope.gain.setValueAtTime(0.0001, startsAt);
    envelope.gain.exponentialRampToValueAtTime(harmonic.level, startsAt + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startsAt + 0.72);
    oscillator.connect(envelope).connect(context.destination);
    oscillator.start(startsAt);
    oscillator.stop(startsAt + 0.74);
  }
}

export async function playTimerChime(cue: TimerChimeCue): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const AudioContextClass = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return false;

  let context: AudioContext | null = null;
  try {
    context = new AudioContextClass();
    if (context.state === "suspended") await context.resume();
    if (context.state !== "running") {
      await context.close();
      return false;
    }

    const notes = cue === "focus"
      ? [659.25, 880]
      : cue === "break"
        ? [783.99, 659.25]
        : [659.25, 783.99, 1046.5];
    const startedAt = context.currentTime + 0.025;
    notes.forEach((frequency, index) => {
      scheduleBellTone(context!, frequency, startedAt + index * 0.17, cue === "finished" ? 0.11 : 0.095);
    });

    const closeAfter = Math.ceil((notes.length * 0.17 + 0.8) * 1000);
    window.setTimeout(() => {
      if (context?.state !== "closed") void context?.close();
    }, closeAfter);
    return true;
  } catch {
    if (context?.state !== "closed") void context?.close();
    return false;
  }
}
