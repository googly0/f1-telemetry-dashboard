"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ConfidenceGaugeProps {
  value: number; // 0-1
  size?: number;
  label?: string;
}

export default function ConfidenceGauge({ value, size = 96, label = "MODEL CONFIDENCE" }: ConfidenceGaugeProps) {
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(1, value));
  const offset = circumference * (1 - pct);

  const tier =
    pct >= 0.75 ? "high" : pct >= 0.5 ? "mid" : "low";
  const ringColor =
    tier === "high" ? "#27F4D2" : tier === "mid" ? "#D4AF37" : "#FF2A2A";

  return (
    <div className="flex items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#1d2430"
            strokeWidth={stroke}
            fill="none"
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={ringColor}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.1, ease: "easeOut" }}
            style={{ filter: `drop-shadow(0 0 6px ${ringColor}aa)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            key={pct}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn("font-mono font-semibold text-lg", tier === "high" && "neon-text-cyan")}
            style={{ color: tier !== "high" ? ringColor : undefined }}
          >
            {Math.round(pct * 100)}%
          </motion.span>
        </div>
      </div>
      <div className="label-mono leading-tight max-w-[86px]">{label}</div>
    </div>
  );
}
