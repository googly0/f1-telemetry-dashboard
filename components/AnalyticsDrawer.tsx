"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, BrainCircuit, Database, Target } from "lucide-react";
import { MODEL_INFO } from "@/lib/predictor";
import { pct } from "@/lib/utils";

interface AnalyticsDrawerProps {
  onToggle?: (variant: "confirm") => void;
}

const FEATURE_LABELS: Record<string, string> = {
  x_grid: "starting grid position",
  x_pole: "pole position",
  x_qgap: "qualifying gap to pole",
  x_sprint: "sprint result (sprint weekends)",
  x_team_form: "team points over the last 6 races",
  x_team_qgap: "team qualifying pace over the last 6 races",
  x_team_gain: "places the team gains on race day",
  x_tm: "form vs own teammate",
  x_elo_d: "driver Elo rating",
  x_elo_t: "team Elo rating",
};

const ROWS: { key: "hit" | "top3" | "podium" | "ll"; label: string; fmt: (v: number) => string }[] = [
  { key: "hit", label: "Favourite actually wins", fmt: (v) => pct(v) },
  { key: "top3", label: "Winner in model's top 3", fmt: (v) => pct(v) },
  { key: "podium", label: "Podium drivers predicted", fmt: (v) => pct(v) },
  { key: "ll", label: "Win log-loss (lower = better)", fmt: (v) => v.toFixed(2) },
];

export default function AnalyticsDrawer({ onToggle }: AnalyticsDrawerProps) {
  const [open, setOpen] = useState(false);
  const bt = MODEL_INFO.backtest;
  const cols = [
    { name: "Race-day", data: bt.race_day },
    { name: "Pre-quali", data: bt.pre_quali },
    { name: "Grid only", data: bt.grid_only },
  ];

  return (
    <div className="glass-panel overflow-hidden">
      <button
        onClick={() => {
          setOpen((v) => !v);
          onToggle?.("confirm");
        }}
        className="w-full flex items-center justify-between px-5 py-4 md:px-6 md:py-5 text-left"
      >
        <div className="flex items-center gap-2">
          <BrainCircuit size={16} className="text-slate-400" />
          <h2 className="section-title">How This Model Actually Works</h2>
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }}>
          <ChevronDown size={18} className="text-slate-500" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-5 md:px-6 pb-6 pt-1 grid md:grid-cols-2 gap-6">
              <div>
                <div className="label-mono mb-3 flex items-center gap-1.5">
                  <Database size={11} /> TWO MODELS, ONE SIMULATOR
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  <span className="text-slate-200">Race-day model</span>, used once qualifying is done:{" "}
                  {MODEL_INFO.race_day.features.map((f) => FEATURE_LABELS[f] ?? f).join(", ")}.
                </p>
                <p className="text-xs text-slate-400 leading-relaxed mt-2">
                  <span className="text-slate-200">Pre-qualifying model</span>, used before the grid is set and for the
                  season simulation: {MODEL_INFO.pre_quali.features.map((f) => FEATURE_LABELS[f] ?? f).join(", ")}.
                </p>
                <p className="text-xs text-slate-500 leading-relaxed mt-3">
                  Each race is simulated 6,000 times. Every car can retire at its team&apos;s recent DNF rate, and the
                  finishers are ordered with the Gumbel-max trick (an exact Plackett-Luce sample). Every input uses only
                  races run before that one. Weights fitted by maximum likelihood on {MODEL_INFO.trained_on}; data
                  through {MODEL_INFO.data_through}.
                </p>
              </div>

              <div>
                <div className="label-mono mb-3 flex items-center gap-1.5">
                  <Target size={11} /> HELD-OUT TEST · {MODEL_INFO.tested_on} · {bt.races} RACES THE FIT NEVER SAW
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="text-left font-normal pb-2" />
                      {cols.map((c) => (
                        <th key={c.name} className="text-right font-mono font-normal pb-2 pl-2">
                          {c.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ROWS.map((r) => (
                      <tr key={r.key} className="border-t border-white/5">
                        <td className="py-1.5 text-slate-400">{r.label}</td>
                        {cols.map((c) => (
                          <td key={c.name} className="py-1.5 text-right font-mono text-slate-200 pl-2">
                            {r.fmt(c.data[r.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
                  &quot;Grid only&quot; uses nothing but the starting grid, and it is a tough baseline. The race-day
                  model ties it on these seasons and beats it clearly on 2018–2023. F1 is noisy: a well-calibrated
                  favourite still loses around 4 races in 10, so &quot;winner in the top 3&quot; is the fairer headline.
                </p>
                <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">
                  Not modelled: weather, practice pace, tyre strategy, safety cars, per-circuit effects.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
