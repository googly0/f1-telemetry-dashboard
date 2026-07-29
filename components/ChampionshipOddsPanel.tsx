"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList, ResponsiveContainer } from "recharts";
import { Crown } from "lucide-react";
import type { RacePrediction } from "@/lib/types";
import { teamColor } from "@/lib/teamColors";

interface ChampionshipOddsPanelProps {
  prediction: RacePrediction;
}

export default function ChampionshipOddsPanel({ prediction }: ChampionshipOddsPanelProps) {
  const driverData = prediction.driversChampionshipOdds.slice(0, 10).map((d) => ({
    id: d.id,
    name: prediction.driverNames[d.id],
    team: prediction.constructorNames[prediction.driverTeam[d.id]],
    probability: Math.round(d.probability * 1000) / 10, // percent, 1 decimal
  }));

  const teamData = prediction.constructorsChampionshipOdds.map((c) => ({
    id: c.id,
    name: prediction.constructorNames[c.id],
    probability: Math.round(c.probability * 1000) / 10,
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="glass-panel p-5 md:p-6">
        <PanelHeader title="Drivers' Championship" subtitle="WIN PROBABILITY · TOP 10 · FULL REMAINING SEASON" />
        <OddsBars
          data={driverData}
          colorFor={(d) => teamColor(d.team)}
          height={Math.max(280, driverData.length * 30)}
        />
      </div>
      <div className="glass-panel p-5 md:p-6">
        <PanelHeader title="Constructors' Championship" subtitle="WIN PROBABILITY · ALL TEAMS · FULL REMAINING SEASON" />
        <OddsBars
          data={teamData}
          colorFor={(d) => teamColor(d.name)}
          height={Math.max(280, teamData.length * 30)}
        />
      </div>
    </div>
  );
}

function PanelHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <Crown size={16} style={{ color: "#D4AF37" }} />
        <h2 className="section-title">{title}</h2>
      </div>
      <div className="label-mono mt-1">{subtitle}</div>
    </div>
  );
}

function OddsBars<T extends { id: string; name: string; probability: number }>({
  data,
  colorFor,
  height,
}: {
  data: T[];
  colorFor: (d: T) => string;
  height: number;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="#1d2430" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, "dataMax"]}
            tick={{ fill: "#8a909c", fontSize: 10.5, fontFamily: "var(--font-plex-mono)" }}
            stroke="#22262f"
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={128}
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
            formatter={(value: number) => [`${value}%`, "Title chance"]}
          />
          <Bar dataKey="probability" radius={[0, 4, 4, 0]} isAnimationActive animationDuration={500}>
            {data.map((d) => (
              <Cell key={d.id} fill={colorFor(d)} />
            ))}
            <LabelList
              dataKey="probability"
              position="right"
              formatter={(v: number) => `${v}%`}
              style={{ fill: "#c8cdd5", fontSize: 10.5, fontFamily: "var(--font-plex-mono)" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
