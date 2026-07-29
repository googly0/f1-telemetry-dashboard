"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Header from "./Header";
import PodiumPanel from "./PodiumPanel";
import HeadToHeadPanel from "./HeadToHeadPanel";
import CircuitMap from "./CircuitMap";
import StandingsBarChart from "./StandingsBarChart";
import ChampionshipOddsPanel from "./ChampionshipOddsPanel";
import AnalyticsDrawer from "./AnalyticsDrawer";
import { YEARS, getYearData, getCircuitShape } from "@/lib/f1Data";
import { buildRacePrediction } from "@/lib/predictor";
import { useEngineSound } from "@/lib/useEngineSound";

const DEFAULT_YEAR = 2026;

export default function Dashboard() {
  const [year, setYear] = useState(DEFAULT_YEAR);
  const defaultYd = getYearData(DEFAULT_YEAR);
  const [round, setRound] = useState(
    defaultYd.season_complete ? defaultYd.n_rounds : Math.min(defaultYd.data_through + 1, defaultYd.n_rounds)
  );
  const { enabled: soundEnabled, toggle: toggleSound, playClick } = useEngineSound();

  const yd = useMemo(() => getYearData(year), [year]);

  // -----------------------------------------------------------------------
  // Real engine, not mock data: buildRacePrediction() runs a Monte Carlo
  // simulation (Gumbel-max Plackett-Luce) over real Elo/team-rating
  // snapshots for the selected year+round. See lib/predictor.ts.
  // -----------------------------------------------------------------------
  const prediction = useMemo(() => buildRacePrediction(yd, year, round, 6000), [yd, year, round]);
  const circuitShape = useMemo(() => getCircuitShape(prediction.raceName), [prediction.raceName]);

  const handleYearChange = (y: number) => {
    setYear(y);
    const newYd = getYearData(y);
    setRound(newYd.season_complete ? newYd.n_rounds : Math.min(newYd.data_through + 1, newYd.n_rounds));
    playClick("rev");
  };
  const handleRoundChange = (r: number) => {
    setRound(r);
    playClick("rev");
  };

  return (
    <main className="max-w-[1440px] mx-auto px-4 md:px-6 py-6 space-y-5">
      <Header
        year={year}
        years={YEARS}
        round={round}
        rounds={yd.rounds}
        onYearChange={handleYearChange}
        onRoundChange={handleRoundChange}
        confidence={prediction.modelConfidence}
        soundEnabled={soundEnabled}
        onToggleSound={() => {
          toggleSound();
          playClick("confirm");
        }}
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={`${year}-${round}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-5"
        >
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
            <div className="xl:col-span-3">
              <PodiumPanel prediction={prediction} onHover={playClick} />
            </div>
            <div className="xl:col-span-2">
              <CircuitMap raceName={prediction.raceName} shape={circuitShape} />
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
            <div className="xl:col-span-2">
              <HeadToHeadPanel prediction={prediction} onSelect={playClick} />
            </div>
            <div className="xl:col-span-3">
              <StandingsBarChart prediction={prediction} dataThrough={yd.data_through} />
            </div>
          </div>

          <ChampionshipOddsPanel prediction={prediction} />

          <AnalyticsDrawer onToggle={playClick} />
        </motion.div>
      </AnimatePresence>

      <footer className="label-mono text-center py-6">
        REAL MODEL · ELO + TEAM-STRENGTH RATINGS · MONTE CARLO PLACKETT-LUCE SIMULATION · 2015–2026
      </footer>
    </main>
  );
}
