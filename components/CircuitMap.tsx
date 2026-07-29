"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { MapPin, Zap } from "lucide-react";
import type { CircuitShape } from "@/lib/f1Data";

interface CircuitMapProps {
  raceName: string;
  shape: CircuitShape;
}

export default function CircuitMap({ raceName, shape }: CircuitMapProps) {
  const cycleSeconds = useMemo(() => 3.6, []);

  return (
    <div className="glass-panel p-5 md:p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin size={16} className="text-slate-400 shrink-0" />
          <h2 className="section-title truncate">{raceName}</h2>
        </div>
        {!shape.hasCuratedShape && (
          <div className="label-mono text-slate-600 shrink-0">STYLIZED</div>
        )}
      </div>

      <div className="flex-1 relative min-h-[220px]">
        <svg viewBox="0 0 500 260" className="w-full h-full">
          <defs>
            <filter id="trackGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <path d={shape.trackPath} fill="none" stroke="#1d2430" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
          <path d={shape.trackPath} fill="none" stroke="#2a3140" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />

          <motion.path
            d={shape.trackPath}
            fill="none"
            stroke="#27F4D2"
            strokeWidth={3}
            strokeLinecap="round"
            filter="url(#trackGlow)"
            strokeDasharray="24 900"
            animate={{ strokeDashoffset: [0, -924] }}
            transition={{ duration: cycleSeconds, repeat: Infinity, ease: "linear" }}
          />

          {shape.drsZones.map((zone) => (
            <DrsSegment key={zone.id} path={shape.trackPath} startPct={zone.startPct} endPct={zone.endPct} />
          ))}
        </svg>

        <div className="absolute bottom-0 left-0 flex flex-wrap gap-3">
          <Legend swatch="#27F4D2" label="Telemetry Trace" />
          <Legend swatch="#D4AF37" label="DRS Zone" icon />
          <Legend swatch="#2a3140" label={`${shape.sectors} Sectors`} />
        </div>
      </div>

      {!shape.hasCuratedShape && (
        <p className="text-[11px] text-slate-600 mt-3 leading-relaxed">
          No hand-drawn outline for this circuit yet — showing a generic loop. Track shape is
          illustrative either way; it isn&apos;t derived from real circuit geometry.
        </p>
      )}
    </div>
  );
}

function DrsSegment({ path, startPct, endPct }: { path: string; startPct: number; endPct: number }) {
  const segLen = endPct - startPct;
  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke="#D4AF37"
        strokeWidth={6}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={`${segLen} ${1 - segLen}`}
        strokeDashoffset={-startPct}
        opacity={0.9}
      />
      <motion.path
        d={path}
        fill="none"
        stroke="#D4AF37"
        strokeWidth={6}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={`${segLen} ${1 - segLen}`}
        strokeDashoffset={-startPct}
        animate={{ opacity: [0.35, 0.9, 0.35] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        filter="url(#trackGlow)"
      />
    </g>
  );
}

function Legend({ swatch, label, icon }: { swatch: string; label: string; icon?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 label-mono">
      {icon ? <Zap size={10} style={{ color: swatch }} /> : <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: swatch }} />}
      {label}
    </div>
  );
}
