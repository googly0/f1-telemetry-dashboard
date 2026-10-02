"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, BrainCircuit, Database } from "lucide-react";
import { MODEL_PARAMS, BACKTEST } from "@/lib/predictor";

interface AnalyticsDrawerProps {
  onToggle?: (variant: "confirm") => void;
}

const WEIGHTS = [
  { label: "Car / Team Strength", weight: MODEL_PARAMS.teamWeight, description: "Rebuilt mostly from that season's own race results — new regulations reset who has the fastest car, so this carries only a small decayed memory from the year before (and an even smaller one in known regulation-overhaul years like 2017, 2022, 2026) — plus a fast-reacting bonus for points the team scored in its last 6 races, so the model notices a car that has just got quicker." },
  { label: "Driver Skill (Elo)", weight: MODEL_PARAMS.driverWeight, description: "A long-run Elo rating built from every classified finish since 2015, decayed so recent seasons count far more than old ones — plus a bounded in-season adjustment based on real points earned versus your own teammate, since teammates share a car rating and career Elo alone reacts too slowly to a driver clearly outperforming their teammate right now." },
];

export default function AnalyticsDrawer({ onToggle }: AnalyticsDrawerProps) {
  const [open, setOpen] = useState(false);

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
                  <Database size={11} /> DATA & SIMULATION
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Every race prediction on this dashboard is a fresh Monte Carlo simulation (6,000
                  runs) sampled via the Gumbel-max trick — an exact way to draw finishing orders from
                  a Plackett-Luce ranking model — using real Elo and team-strength ratings computed
                  from race results, 2015–2026. Reliability is modeled from each team&apos;s actual
                  DNF rate over the last two seasons. Nothing here is randomly generated to look
                  plausible; it&apos;s a deterministic function of real historical results.
                </p>
                <p className="text-xs text-slate-500 leading-relaxed mt-3">
                  The weights on the right were fitted, not hand-picked: they maximise how well the
                  model explains real finishing orders from 2016–2023, then were checked on 2024–2026
                  races the fit never saw. On those {BACKTEST.testRaces} held-out races the win log-loss is{" "}
                  {BACKTEST.winLogLoss.toFixed(2)} (previous hand-tuned model {BACKTEST.previousWinLogLoss.toFixed(2)},
                  blind guessing {BACKTEST.uniformWinLogLoss.toFixed(2)}; lower is better). F1 is noisy — even a
                  well-calibrated favourite usually wins well under half the time.
                </p>
              </div>

              <div>
                <div className="label-mono mb-3">MODEL WEIGHTING (REAL)</div>
                <div className="space-y-3">
                  {WEIGHTS.map((f) => (
                    <div key={f.label} title={f.description}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-300">{f.label}</span>
                        <span className="font-mono text-[11px] text-slate-500">{Math.round(f.weight * 100)}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-obsidian-700 overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-team-mercedes"
                          initial={{ width: 0 }}
                          animate={{ width: `${f.weight * 100}%` }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{f.description}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-600 mt-4 leading-relaxed">
                  No track-specific modeling yet — every circuit uses the same combined strength
                  score. Grid position, weather, and per-circuit driver history aren&apos;t factored
                  in today.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
