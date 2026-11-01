"use client";

import { useEffect, useSyncExternalStore } from "react";
import { playSound, SOUND_KEY, soundsMuted, unlockSounds } from "@/lib/sounds";

// Anything you can click, as far as the sounds are concerned. Clicking plays a
// sound; hovering stays silent. An element can skip the click sound with
// data-sound="none" (the search button, whose menu plays its own chime).
const CLICKABLE = 'a, button, label, summary, select, [role="button"], [role="option"], input[type="checkbox"], input[type="radio"]';

/** Plays the interface sounds for the whole page. Rendered once, in the root layout. */
export function SoundEffects() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target.closest(CLICKABLE) : null;
      if (el && !el.matches(":disabled") && !el.closest("[data-sound='none']")) playSound("select");
    };
    const unlock = () => unlockSounds();
    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerdown", unlock, { capture: true, once: true });
    document.addEventListener("keydown", unlock, { capture: true, once: true });
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("keydown", unlock, true);
    };
  }, []);
  return null;
}

const listeners = new Set<() => void>();
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function SoundToggle() {
  const muted = useSyncExternalStore(subscribe, soundsMuted, () => false);
  const label = muted ? "Turn sounds on" : "Mute sounds";
  return (
    <button
      type="button"
      onClick={() => {
        try {
          localStorage.setItem(SOUND_KEY, muted ? "on" : "off");
        } catch {}
        listeners.forEach((l) => l());
        if (muted) playSound("select");
      }}
      // Its own click shouldn't play while muting; turning sounds on plays one to confirm.
      data-sound="none"
      aria-label={label}
      aria-pressed={muted}
      title={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-fill"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
        {muted ? <path d="M16 9.5l5 5M21 9.5l-5 5" /> : <path d="M15.8 9a4.2 4.2 0 0 1 0 6M18.4 6.6a7.6 7.6 0 0 1 0 10.8" />}
      </svg>
    </button>
  );
}
