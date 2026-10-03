import rawData from "./data/all_years.json";
import type { AllYearsData } from "./types";

export const ALL_YEARS = rawData as unknown as AllYearsData;
export const MODEL_INFO = ALL_YEARS.model;

export const YEARS = Object.keys(ALL_YEARS.years)
  .map(Number)
  .sort((a, b) => a - b);

export function getYearData(year: number) {
  return ALL_YEARS.years[String(year)];
}

/* -------------------------------------------------------------------------
 * Stylized circuit outlines for the track-map visual. These are hand-drawn
 * approximations (not geographically precise) for a handful of well-known
 * circuits; every other round on the calendar falls back to a generic
 * closed-loop shape so the panel always has something to render. This is
 * a decorative/illustrative element, not a data source — no prediction on
 * this dashboard depends on these coordinates.
 * ---------------------------------------------------------------------- */

export interface CircuitShape {
  trackPath: string;
  drsZones: { id: string; startPct: number; endPct: number }[];
  sectors: 3;
  hasCuratedShape: boolean;
}

const CURATED_SHAPES: Record<string, Omit<CircuitShape, "sectors" | "hasCuratedShape">> = {
  monaco: {
    trackPath:
      "M60,180 C40,150 40,110 70,90 C100,70 120,90 110,110 C100,130 130,140 150,120 C170,100 160,70 190,60 C230,45 280,50 310,70 C340,90 320,120 350,130 C390,145 430,120 440,90 C450,60 420,40 380,45 C340,50 330,80 300,90 C270,100 250,80 260,55 C270,30 240,20 200,25 C150,32 130,60 100,70 C70,80 55,60 70,40",
    drsZones: [{ id: "drs1", startPct: 0.62, endPct: 0.74 }],
  },
  silverstone: {
    trackPath:
      "M50,150 C50,110 90,90 130,95 C160,99 155,130 185,135 C220,141 240,110 280,105 C320,100 340,130 380,125 C420,120 440,90 420,65 C400,42 350,45 330,70 C312,92 280,80 270,55 C260,30 210,25 170,40 C135,53 140,85 110,95 C75,107 50,110 50,150 Z",
    drsZones: [
      { id: "drs1", startPct: 0.08, endPct: 0.22 },
      { id: "drs2", startPct: 0.55, endPct: 0.68 },
    ],
  },
  spa: {
    trackPath:
      "M40,90 C40,60 70,40 110,45 C140,49 135,75 160,80 C190,86 195,50 230,40 C270,29 320,35 340,60 C355,80 335,95 355,115 C378,138 420,135 435,110 C448,88 430,60 400,65 C375,69 370,95 345,100 C315,106 300,80 280,95 C255,113 260,150 230,165 C195,182 150,175 120,155 C95,138 100,110 75,105 C55,101 40,100 40,90 Z",
    drsZones: [{ id: "drs1", startPct: 0.28, endPct: 0.46 }],
  },
  monza: {
    trackPath:
      "M40,130 L280,130 C310,130 310,90 280,90 L230,90 C215,90 215,70 230,70 L400,70 C430,70 430,110 400,110 L370,110 C355,110 355,150 370,150 L440,150 C455,150 455,180 440,180 L90,180 C60,180 55,160 60,150 C64,142 40,140 40,130 Z",
    drsZones: [
      { id: "drs1", startPct: 0.02, endPct: 0.18 },
      { id: "drs2", startPct: 0.5, endPct: 0.62 },
    ],
  },
  suzuka: {
    trackPath:
      "M60,80 C90,55 140,55 165,75 C185,91 175,110 195,120 C220,132 250,110 240,85 C232,64 260,45 295,50 C325,54 330,80 310,95 C285,113 300,145 335,150 C375,156 410,130 400,100 C392,76 420,55 445,70 C465,82 460,110 435,120 C400,134 405,170 370,180 C330,191 290,175 275,150 C260,126 225,135 210,160 C193,188 150,190 120,170 C95,153 105,125 80,115 C55,105 40,100 60,80 Z",
    drsZones: [{ id: "drs1", startPct: 0.4, endPct: 0.55 }],
  },
  interlagos: {
    trackPath:
      "M70,70 C110,55 160,60 175,90 C188,116 220,110 225,85 C230,58 270,45 305,60 C335,73 325,100 350,115 C380,132 420,115 420,85 C420,58 385,45 360,60 C338,73 340,100 315,110 C285,122 260,100 260,130 C260,165 220,180 180,175 C140,170 130,140 100,140 C75,140 55,120 60,95 C63,83 60,75 70,70 Z",
    drsZones: [{ id: "drs1", startPct: 0.05, endPct: 0.2 }],
  },
};

// Match a real GP name to a curated shape by keyword; falls back to a generic loop otherwise.
const NAME_MATCHERS: { test: RegExp; key: keyof typeof CURATED_SHAPES }[] = [
  { test: /monaco/i, key: "monaco" },
  { test: /british|silverstone/i, key: "silverstone" },
  { test: /belgian|spa/i, key: "spa" },
  { test: /italian|monza/i, key: "monza" },
  { test: /japanese|suzuka/i, key: "suzuka" },
  { test: /brazil|s(a|ã)o paulo|interlagos/i, key: "interlagos" },
];

const GENERIC_SHAPE: Omit<CircuitShape, "sectors" | "hasCuratedShape"> = {
  trackPath:
    "M80,130 C80,80 140,50 250,50 C360,50 420,80 420,130 C420,180 360,210 250,210 C140,210 80,180 80,130 Z",
  drsZones: [{ id: "drs1", startPct: 0.05, endPct: 0.22 }],
};

export function getCircuitShape(raceName: string): CircuitShape {
  const match = NAME_MATCHERS.find((m) => m.test.test(raceName));
  if (match) {
    return { ...CURATED_SHAPES[match.key], sectors: 3, hasCuratedShape: true };
  }
  return { ...GENERIC_SHAPE, sectors: 3, hasCuratedShape: false };
}
