"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Lightweight synthesized "telemetry" click / engine-blip sound using the Web Audio API,
 * so the sound toggle works out-of-the-box with zero audio assets to ship. Swap the
 * oscillator params for a real sample (e.g. new Audio('/sounds/click.mp3').play()) any time.
 */
export function useEngineSound() {
  const [enabled, setEnabled] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC();
    }
    return ctxRef.current;
  }, []);

  const playClick = useCallback(
    (variant: "select" | "confirm" | "rev" = "select") => {
      if (!enabled) return;
      const ctx = getCtx();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (variant === "rev") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(720, now + 0.18);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (variant === "confirm") {
        osc.type = "square";
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else {
        osc.type = "square";
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.035, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
      }
    },
    [enabled, getCtx]
  );

  const toggle = useCallback(() => {
    setEnabled((v) => {
      const next = !v;
      if (next) {
        // unlock/resume audio context on the user gesture that enables sound
        const ctx = getCtx();
        ctx?.resume?.();
      }
      return next;
    });
  }, [getCtx]);

  return { enabled, toggle, playClick };
}
