"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList, ResponsiveContainer } from "recharts";
import { ListOrdered } from "lucide-react";
import type { RacePrediction } from "@/lib/types";
import { teamColor } from "@/lib/teamColors";

interface StandingsBarChartProps {
  prediction: RacePrediction;
  dataThrough: number;
}

export default function StandingsBarChart({ prediction, dataThrough }: StandingsBarChartProps) {
  const isProjected = prediction.standingsAtRound.some((s) => s.isProjected);

  const data = prediction.standingsAtRound.map((s) => ({
    driverId: s.driverId,
    name: prediction.driverNames[s.driverId],
    points: s.points,
    team: prediction.constructorNames[prediction.driverTeam[s.driverId]],
  }));

  const height = Math.max(340, data.length * 26);

  return (
    <div className="glass-panel p-5 md:p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <ListOrdered size={16} className="text-slate-400" />
          <h2 className="section-title">Championship Standings</h2>
        </div>
      </div>
      <div className="label-mono mb-4">
        {isProjected ? `MODEL PROJECTION AS OF ROUND ${prediction.round} (REAL DATA THROUGH R${dataThrough})` : `REAL STANDINGS THROUGH ROUND ${prediction.round}`}
      </div>

      <div style={{ height }} className="flex-1 min-h-[340px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="#1d2430" horizontal={false} />
            <XAxis type="number" tick={{ fill: "#8a909c", fontSize: 10.5, fontFamily: "var(--font-plex-mono)" }} stroke="#22262f" />
            <YAxis
              type="category"
              dataKey="name"
              width={130}
              tick={{ fill: "#c8cdd5", fontSize: 11, fontFamily: "var(--font-plex-mono)" }}
              stroke="#22262f"
            />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.03)" }}
              contentStyle={{
                background: "#12151b",
                border: "1px solid #22262f",
                borderRadius: 8,
                fontFamily: "var(--font-plex-mono)",
                fontSize: 12,
              }}
              formatter={(value: number) => [`${value} pts`, ""]}
            />
            <Bar dataKey="points" radius={[0, 4, 4, 0]} isAnimationActive animationDuration={500}>
              {data.map((d) => (
                <Cell key={d.driverId} fill={teamColor(d.team)} fillOpacity={isProjected ? 0.55 : 0.9} />
              ))}
              <LabelList
                dataKey="points"
                position="right"
                formatter={(v: number) => `${Math.round(v)}`}
                style={{ fill: "#c8cdd5", fontSize: 10.5, fontFamily: "var(--font-plex-mono)" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
