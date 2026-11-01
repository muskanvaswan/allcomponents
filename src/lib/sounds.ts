// Interface sounds in the spirit of a games-console menu, written for this site:
// a short, low tick when you click something, and two-tick versions of it when
// the search menu opens and closes. Hovering is silent. They're synthesized with
// Web Audio, so there are no audio files, and they stay quiet.
//
// Browsers only allow audio after the person has interacted with the page, so
// nothing plays (and no AudioContext exists) until their first click or key.

export type Sound = "select" | "open" | "close";
export const SOUND_KEY = "lookbook:sounds";

const VOLUME = 0.16;
// The click's note, B4 (chosen by ear from a range of sounds and pitches). The search chimes are built around it.
const PITCH = 494;
// Only a touch of echo: the tick is meant to be dry.
const ECHO = 0.05;

type Voice =
  | { kind: "tone"; freq: number; at: number; dur: number; gain: number }
  | { kind: "tick"; band: number; at: number; dur: number; gain: number };

// One tick: a triangle-wave blip and a short burst of filtered noise for the strike, both gone in 30ms.
const tick = (freq: number, at: number, level: number): Voice[] => [
  { kind: "tone", freq, at, dur: 0.03, gain: 0.38 * level },
  { kind: "tick", band: freq * 2.8, at, dur: 0.008, gain: 0.22 * level },
];

const semitones = (n: number) => 2 ** (n / 12);

// The search chimes are two quick ticks: rising as the menu opens, falling as it closes.
const SOUNDS: Record<Sound, Voice[]> = {
  select: tick(PITCH, 0, 1),
  open: [...tick(PITCH * semitones(-4), 0, 0.75), ...tick(PITCH * semitones(3), 0.075, 0.67)],
  close: [...tick(PITCH * semitones(3), 0, 0.67), ...tick(PITCH * semitones(-2), 0.065, 0.58)],
};

let audio: { ctx: AudioContext; out: GainNode; noise: AudioBuffer } | null = null;
let unlocked = false;

function engine() {
  if (!audio) {
    const ctx = new AudioContext();
    const out = ctx.createGain();
    out.gain.value = VOLUME;
    out.connect(ctx.destination);
    // A short, dark echo gives each sound a little room around it.
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.085;
    const dark = ctx.createBiquadFilter();
    dark.type = "lowpass";
    dark.frequency.value = 2800;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.22;
    const wet = ctx.createGain();
    wet.gain.value = ECHO;
    out.connect(delay).connect(dark).connect(feedback).connect(delay);
    dark.connect(wet).connect(ctx.destination);
    const noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.05), ctx.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    audio = { ctx, out, noise };
  }
  if (audio.ctx.state === "suspended") void audio.ctx.resume();
  return audio;
}

/** Call on the person's first click or key press; until then sounds are skipped. */
export function unlockSounds() {
  unlocked = true;
}

export function soundsMuted() {
  try {
    return localStorage.getItem(SOUND_KEY) === "off";
  } catch {
    return false;
  }
}

export function playSound(sound: Sound) {
  if (!unlocked || soundsMuted()) return;
  const { ctx, out, noise } = engine();
  const t0 = ctx.currentTime + 0.005;
  for (const v of SOUNDS[sound]) {
    const start = t0 + v.at;
    // A near-instant strike and a soft exponential tail, so nothing clicks.
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(v.gain, start + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, start + v.dur);
    env.connect(out);
    if (v.kind === "tick") {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = v.band;
      band.Q.value = 0.9;
      src.connect(band).connect(env);
      src.start(start);
      src.stop(start + v.dur + 0.01);
    } else {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(v.freq, start);
      osc.connect(env);
      osc.start(start);
      osc.stop(start + v.dur + 0.02);
    }
  }
}
