"use client";

import { motion } from "framer-motion";
import { Trophy, TrendingUp, CheckCircle2 } from "lucide-react";
import type { RacePrediction } from "@/lib/types";
import { teamColor, driverCode } from "@/lib/teamColors";
import { pct, cn } from "@/lib/utils";

interface PodiumPanelProps {
  prediction: RacePrediction;
  onHover?: (variant: "select") => void;
}

const ORDER_DISPLAY = [1, 0, 2]; // show P2, P1, P3 left-to-right, podium-style

export default function PodiumPanel({ prediction, onHover }: PodiumPanelProps) {
  const { podium, driverTeam, driverNames, constructorNames, actualResult, isFutureRound, raceName } = prediction;

  return (
    <div className="glass-panel p-5 md:p-6 h-full">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Trophy size={16} style={{ color: "#D4AF37" }} />
          <h2 className="section-title">Predicted Podium</h2>
        </div>
        <div className="label-mono text-right">
          {raceName}
          {!isFutureRound && actualResult && (
            <span className="ml-2 text-team-mercedes inline-flex items-center gap-1">
              <CheckCircle2 size={11} /> RACE COMPLETE
            </span>
          )}
          {isFutureRound && <span className="ml-2 text-slate-500">NOT YET RACED</span>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 items-end">
        {ORDER_DISPLAY.map((idx, col) => {
          const entry = podium[idx];
          if (!entry) return <div key={col} />;
          const name = driverNames[entry.driverId];
          const teamName = constructorNames[driverTeam[entry.driverId]];
          const hex = teamColor(teamName);
          const isP1 = entry.position === 1;
          const actualHere = actualResult?.find((a) => a.position === entry.position);
          const correct = actualHere && actualHere.driverId === entry.driverId;

          return (
            <motion.div
              key={entry.driverId}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.45, delay: col * 0.08, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ y: -6, scale: 1.02 }}
              onHoverStart={() => onHover?.("select")}
              className={cn(
                "relative rounded-xl border p-4 flex flex-col items-center text-center overflow-hidden",
                isP1 ? "pb-6" : "pb-4"
              )}
              style={{
                background: `linear-gradient(180deg, ${hex}14, rgba(15,19,26,0.5))`,
                borderColor: `${hex}40`,
                boxShadow: isP1 ? `0 0 30px -8px ${hex}66` : undefined,
              }}
            >
              <div
                className="absolute top-0 left-0 right-0 h-[2px]"
                style={{ background: `linear-gradient(90deg, transparent, ${hex}, transparent)` }}
              />
              <div className="font-mono text-[11px] text-slate-500 mb-2">P{entry.position}</div>
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center font-display font-bold text-sm mb-3 border-2"
                style={{ borderColor: hex, color: hex, background: `${hex}12` }}
              >
                {driverCode(name)}
              </div>
              <div className="font-display font-semibold text-sm md:text-base text-white leading-tight">
                {name}
              </div>
              <div className="label-mono mt-1" style={{ color: hex }}>
                {teamName}
              </div>

              <div
                className="mt-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-mono text-[11px] font-semibold"
                style={{ borderColor: `${hex}55`, color: hex, background: `${hex}10` }}
              >
                <TrendingUp size={11} />
                {pct(entry.probability)} {isP1 ? "Win Chance" : "Chance"}
              </div>

              {!isFutureRound && actualHere && (
                <div
                  className={cn(
                    "mt-2 text-[10.5px] font-mono px-2 py-0.5 rounded-full",
                    correct ? "text-team-mercedes bg-team-mercedes/10" : "text-slate-500 bg-white/5"
                  )}
                >
                  Actual: {driverNames[actualHere.driverId]} {correct ? "✓" : ""}
                </div>
              )}

              {isP1 && (
                <motion.div
                  className="absolute inset-0 pointer-events-none rounded-xl"
                  animate={{ opacity: [0.15, 0.35, 0.15] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                  style={{ boxShadow: `inset 0 0 40px ${hex}55` }}
                />
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
