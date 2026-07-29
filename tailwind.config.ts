import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: "#050608",
          900: "#0a0c10",
          800: "#0f131a",
          700: "#161b24",
          600: "#1d2430",
        },
        team: {
          mercedes: "#27F4D2",
          ferrari: "#FF2A2A",
          redbull: "#3671C6",
          redbullGold: "#D4AF37",
          mclaren: "#FF8000",
          astonmartin: "#229971",
          alpine: "#FF87BC",
          williams: "#64C4FF",
          haas: "#B6BABD",
          rb: "#6C98FF",
          audi: "#B10000",
          cadillac: "#D4AF37",
        },
      },
      fontFamily: {
        display: ["var(--font-rajdhani)", "sans-serif"],
        mono: ["var(--font-plex-mono)", "monospace"],
        body: ["var(--font-inter)", "sans-serif"],
      },
      backgroundImage: {
        "carbon-fiber":
          "repeating-linear-gradient(45deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 6px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 6px)",
        "grid-glow":
          "linear-gradient(rgba(39,244,210,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(39,244,210,0.04) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "36px 36px",
      },
      boxShadow: {
        "glow-cyan": "0 0 24px -4px rgba(39,244,210,0.45)",
        "glow-red": "0 0 24px -4px rgba(255,42,42,0.45)",
        "glow-gold": "0 0 24px -4px rgba(212,175,55,0.45)",
        "inset-panel": "inset 0 1px 0 0 rgba(255,255,255,0.04)",
      },
      keyframes: {
        scan: {
          "0%": { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "0 36px" },
        },
        pulseGlow: {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        scan: "scan 3s linear infinite",
        "pulse-glow": "pulseGlow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
