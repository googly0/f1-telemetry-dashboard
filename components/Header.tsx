"use client";

import { ChevronDown, Volume2, VolumeX, Gauge } from "lucide-react";
import ConfidenceGauge from "./ConfidenceGauge";
import { cn } from "@/lib/utils";
import type { RoundInfo } from "@/lib/types";

interface HeaderProps {
  year: number;
  years: number[];
  round: number;
  rounds: RoundInfo[];
  onYearChange: (y: number) => void;
  onRoundChange: (r: number) => void;
  confidence: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export default function Header({
  year,
  years,
  round,
  rounds,
  onYearChange,
  onRoundChange,
  confidence,
  soundEnabled,
  onToggleSound,
}: HeaderProps) {
  return (
    <header className="glass-panel px-5 py-4 md:px-7 md:py-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-team-mercedes/10 border border-team-mercedes/30 flex items-center justify-center shrink-0">
            <Gauge size={18} className="text-team-mercedes" />
          </div>
          <div>
            <div className="label-mono">FIA F1 · PREDICTION ENGINE</div>
            <h1 className="font-display font-bold text-xl md:text-2xl tracking-tight text-white">
              Pit Wall Telemetry
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 md:gap-4">
          <SelectField
            label="SEASON"
            value={String(year)}
            onChange={(v) => onYearChange(Number(v))}
            options={years.map((y) => ({ value: String(y), label: String(y) }))}
          />
          <SelectField
            label="GRAND PRIX"
            value={String(round)}
            onChange={(v) => onRoundChange(Number(v))}
            options={rounds.map((r) => ({
              value: String(r.round),
              label: `R${r.round} · ${r.name.replace(" Grand Prix", "")}`,
            }))}
          />

          <button
            onClick={onToggleSound}
            className={cn(
              "flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-colors font-mono text-[11px] uppercase tracking-wide",
              soundEnabled
                ? "border-team-mercedes/40 text-team-mercedes bg-team-mercedes/10"
                : "border-white/10 text-slate-500 hover:text-slate-300"
            )}
            aria-pressed={soundEnabled}
            title="Toggle telemetry click sounds"
          >
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            SFX
          </button>

          <div className="hidden md:block pl-2 border-l border-white/10">
            <ConfidenceGauge value={confidence} size={72} label="RACE WIN CONFIDENCE" />
          </div>
        </div>
      </div>
    </header>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-mono">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="appearance-none bg-obsidian-700 border border-white/10 rounded-lg pl-3 pr-8 py-2.5 text-sm font-mono font-medium text-slate-100 focus:outline-none focus:ring-1 focus:ring-team-mercedes/60 focus:border-team-mercedes/60 cursor-pointer min-w-[170px] hover:border-white/20 transition-colors"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-obsidian-800">
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
      </div>
    </div>
  );
}
