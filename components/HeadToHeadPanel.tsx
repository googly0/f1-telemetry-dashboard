"use client";

import { useMemo, useState, useEffect } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Swords } from "lucide-react";
import type { RacePrediction } from "@/lib/types";
import { teamColor } from "@/lib/teamColors";
import { cn } from "@/lib/utils";

interface HeadToHeadPanelProps {
  prediction: RacePrediction;
  onSelect?: (variant: "select") => void;
}

export default function HeadToHeadPanel({ prediction, onSelect }: HeadToHeadPanelProps) {
  const pool = prediction.driverPool;
  const [driverA, setDriverA] = useState(pool[0]);
  const [driverB, setDriverB] = useState(pool[1]);

  useEffect(() => {
    setDriverA(pool[0]);
    setDriverB(pool[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prediction.year, prediction.round]);

  const metrics = useMemo(() => {
    if (driverA === driverB) return [];
    return prediction.headToHead[driverA]?.[driverB] ?? [];
  }, [prediction, driverA, driverB]);

  const chartData = metrics.map((m) => ({ metric: m.label, A: m.driverAValue, B: m.driverBValue }));

  const teamAName = prediction.constructorNames[prediction.driverTeam[driverA]];
  const teamBName = prediction.constructorNames[prediction.driverTeam[driverB]];
  const hexA = teamColor(teamAName);
  const hexB = teamColor(teamBName);

  return (
    <div className="glass-panel p-5 md:p-6 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-1">
        <Swords size={16} className="text-slate-400" />
        <h2 className="section-title">Head-to-Head</h2>
      </div>
      <div className="label-mono mb-4">PERCENTILE WITHIN {prediction.year} GRID · REAL RATINGS</div>

      <div className="flex items-center gap-3 mb-4">
        <DriverPicker
          label="DRIVER A"
          value={driverA}
          onChange={(v) => {
            setDriverA(v);
            onSelect?.("select");
          }}
          pool={pool}
          names={prediction.driverNames}
          accent={hexA}
        />
        <span className="font-mono text-slate-600 text-xs">VS</span>
        <DriverPicker
          label="DRIVER B"
          value={driverB}
          onChange={(v) => {
            setDriverB(v);
            onSelect?.("select");
          }}
          pool={pool}
          names={prediction.driverNames}
          accent={hexB}
        />
      </div>

      <div className="flex-1 min-h-[260px]">
        {driverA === driverB ? (
          <div className="h-full flex items-center justify-center label-mono text-center px-4">
            Pick two different drivers to compare
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={260}>
            <RadarChart data={chartData} outerRadius="70%">
              <PolarGrid stroke="#1d2430" />
              <PolarAngleAxis
                dataKey="metric"
                tick={{ fill: "#8a909c", fontSize: 10, fontFamily: "var(--font-plex-mono)" }}
              />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
              <Radar
                name={prediction.driverNames[driverA]}
                dataKey="A"
                stroke={hexA}
                fill={hexA}
                fillOpacity={0.28}
                strokeWidth={2}
              />
              <Radar
                name={prediction.driverNames[driverB]}
                dataKey="B"
                stroke={hexB}
                fill={hexB}
                fillOpacity={0.22}
                strokeWidth={2}
              />
              <Tooltip
                contentStyle={{
                  background: "#12151b",
                  border: "1px solid #22262f",
                  borderRadius: 8,
                  fontFamily: "var(--font-plex-mono)",
                  fontSize: 12,
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function DriverPicker({
  label,
  value,
  onChange,
  pool,
  names,
  accent,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  pool: string[];
  names: Record<string, string>;
  accent: string;
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="label-mono mb-1">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full bg-obsidian-700 border rounded-lg px-2.5 py-2 text-xs font-mono font-medium text-slate-100 focus:outline-none cursor-pointer truncate"
        )}
        style={{ borderColor: `${accent}55` }}
      >
        {pool.map((id) => (
          <option key={id} value={id} className="bg-obsidian-800">
            {names[id]}
          </option>
        ))}
      </select>
    </div>
  );
}
