"use client";

import { useEffect, useRef, useState } from "react";
import { copyText } from "@/lib/clipboard";

/**
 * "add the skill" in lowercase Fira Code, at the left end of the toolbar's glass capsule. Hovering or focusing it
 * swaps the label for the install command and a copy icon that says what a click does, growing leftward so the
 * capsule's other buttons stay put; clicking copies the command. Touch screens have no hover, so there the first tap
 * does what hovering does, showing the command, and a second tap copies it (the label then says "copied"). Tapping
 * anywhere else, or waiting a few seconds, folds it back. The toolbar passes the command in, since it's built from
 * the site's address on the server.
 */
export function SkillInstall({ command }: { command: string }) {
  // "revealed" after a first tap on a touch screen; "copied"; or "select" when the browser refused to copy and the
  // command is selected for the person to copy.
  const [state, setState] = useState<"idle" | "revealed" | "copied" | "select">("idle");
  const code = useRef<HTMLElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // A revealed command folds back after a few seconds, or as soon as the person taps anywhere else.
  useEffect(() => {
    if (state !== "revealed") return;
    const timer = setTimeout(() => setState("idle"), 5000);
    const onDown = (e: PointerEvent) => {
      if (!button.current?.contains(e.target as Node)) setState("idle");
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [state]);

  const select = state === "select";
  const label = select ? (/Mac|iP(hone|ad)/.test(navigator.platform) ? "press ⌘C" : "press Ctrl+C") : state === "copied" ? "copied" : "add the skill";
  // While idle, the label and the command trade places on hover or focus (or a first tap, on touch screens): one
  // column eases shut as the other opens, so the chip only grows by the difference. Copied keeps the command open,
  // with a tick, and the label shut, except on phones, where the label says "copied" instead. A refused copy keeps
  // both open, the label saying what to press.
  const slide = "grid min-w-0 transition-[grid-template-columns] duration-300 ease-out";
  const labelCols =
    state === "idle"
      ? "grid-cols-[1fr] group-hover:grid-cols-[0fr] group-focus-visible:grid-cols-[0fr]"
      : state === "revealed"
        ? "grid-cols-[0fr]"
        : select
          ? "grid-cols-[1fr]"
          : "grid-cols-[1fr] sm:grid-cols-[0fr]";
  const commandCols =
    state === "idle"
      ? "grid-cols-[0fr] group-hover:grid-cols-[1fr] group-focus-visible:grid-cols-[1fr]"
      : state === "revealed" || select
        ? "grid-cols-[1fr]"
        : "grid-cols-[0fr] sm:grid-cols-[1fr]";
  return (
    <button
      ref={button}
      type="button"
      onClick={async () => {
        // On a touch screen the first tap only shows what a second tap will copy.
        if (state === "idle" && matchMedia("(hover: none)").matches) {
          setState("revealed");
          return;
        }
        if (await copyText(command)) {
          setState("copied");
          setTimeout(() => setState("idle"), 1600);
        } else if (code.current) {
          getSelection()?.selectAllChildren(code.current);
          setState("select");
        }
      }}
      onBlur={() => state === "select" && setState("idle")}
      aria-label={state === "copied" ? "Copied the install command" : state === "revealed" ? `Copy “${command}”` : `Add the agent skill: copy “${command}”`}
      title="Lets coding agents like Claude Code pick components from here as they build, and show you the alternatives"
      // Plain text in the capsule until hovered, when it gets the same pill as the icon buttons beside it. It keeps
      // the pill while "copied" or "press ⌘C" shows.
      className={`group flex h-9 min-w-0 items-center rounded-full px-3.5 font-[family-name:var(--font-fira)] text-[14px] font-medium text-ink transition-colors hover:bg-fill ${state === "idle" ? "" : "bg-fill"}`}
    >
      <span className={`${slide} ${labelCols}`}>
        <span className="min-w-0 overflow-hidden whitespace-nowrap">{label}</span>
      </span>
      {/* From tablet width up, the command stays open while its tick shows, so it's clear what was copied. */}
      <span className={`${slide} ${commandCols}`}>
        <span className="flex min-w-0 items-center overflow-hidden">
          <code ref={code} className={`block min-w-0 truncate text-[12.5px] font-normal text-ink/80 ${select ? "pl-2.5" : ""}`}>
            {command}
          </code>
          {/* Copy, then a tick once it's copied. */}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ml-2 shrink-0">
            {state === "copied" ? (
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            ) : (
              <>
                <rect x="8.5" y="8.5" width="12" height="12" rx="2.5" />
                <path d="M15.5 8.5V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" />
              </>
            )}
          </svg>
        </span>
      </span>
    </button>
  );
}
