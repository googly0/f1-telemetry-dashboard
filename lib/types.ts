/** Types matching the real per-round rating snapshot dataset (lib/data/all_years.json),
 * built from actual 2015-2026 F1 results — see scripts/build_all_years.py in the
 * companion repo for exactly how these numbers are computed. */

export interface RoundInfo {
  round: number;
  name: string;
  date: string;
  sprint: boolean;
}

export interface LineupEntry {
  driverId: string;
  constructorId: string;
}

export interface FinalActual {
  champion_driver: string | null;
  champion_team: string | null;
  champion_driver_name: string | null;
  champion_team_name: string | null;
}

export interface YearData {
  rounds: RoundInfo[];
  gp_points: number[];
  sprint_points: number[] | null;
  fastest_lap_bonus: boolean;
  lineup: LineupEntry[];
  driver_elo_by_round: Record<string, number[]>;
  team_rating_by_round: Record<string, number[]>;
  driver_points_by_round: Record<string, number[]>;
  team_points_by_round: Record<string, number[]>;
  dnf_rate: Record<string, number>;
  race_results: Record<string, string[]>; // round(string) -> actual finishing order (top 10 driverIds)
  names: { drivers: Record<string, string>; constructors: Record<string, string> };
  final_actual: FinalActual;
  n_rounds: number;
  data_through: number;
  season_complete: boolean;
  // model outputs, one entry per round (index round-1); null = not available for that round
  pre_utility_by_round: Record<string, (number | null)[]>; // pre-qualifying model strength
  post_utility_by_round: Record<string, (number | null)[]>; // race-day model strength (needs qualifying)
  grid_by_round: Record<string, (number | null)[]>; // starting grid
  dnf_rate_by_round: Record<string, (number | null)[]>; // constructorId -> P(retire) entering the round
}

export type PredictionMode = "race-day" | "pre-qualifying";

export interface ModelBacktest {
  hit: number; // favourite actually won
  top3: number; // winner was among the model's 3 most likely winners
  podium: number; // share of predicted podium drivers who finished on the podium
  ll: number; // mean -ln P(actual winner)
}

export interface ModelInfo {
  trained_on: string;
  tested_on: string;
  data_through: string;
  built: string;
  race_day: { features: string[]; weights: number[] };
  pre_quali: { features: string[]; weights: number[] };
  backtest: { race_day: ModelBacktest; pre_quali: ModelBacktest; grid_only: ModelBacktest; races: number };
}

export interface AllYearsData {
  years: Record<string, YearData>;
  model: ModelInfo;
}

/* --------------------------- derived prediction types --------------------------- */

export interface PodiumEntry {
  position: 1 | 2 | 3;
  driverId: string;
  probability: number; // P(finishing exactly in this position), from Monte Carlo simulation
}

export interface HeadToHeadMetric {
  key: string;
  label: string;
  driverAValue: number; // 0-100, percentile within that round's full grid
  driverBValue: number;
}

export interface PointsProgressionPoint {
  round: number;
  isProjected: boolean;
  [driverId: string]: number | boolean;
}

export interface RacePrediction {
  year: number;
  round: number;
  raceName: string;
  isFutureRound: boolean; // true if this round hasn't been raced yet (prediction, not backtest)
  actualResult: { position: 1 | 2 | 3; driverId: string }[] | null; // real result, if this round already happened
  modelConfidence: number; // winner's win probability for this specific race
  podium: PodiumEntry[];
  winProbabilities: { driverId: string; probability: number }[]; // top 5 most likely winners
  predictionMode: PredictionMode; // which model produced this race's numbers
  qualifyingAvailable: boolean; // true once this round's qualifying/grid is known
  grid: Record<string, number | null>; // starting grid (race-day mode)
  driverPool: string[]; // full grid for the selected year, ordered by combined strength
  headToHead: Record<string, Record<string, HeadToHeadMetric[]>>;
  pointsProgression: PointsProgressionPoint[];
  standingsAtRound: { driverId: string; points: number; isProjected: boolean }[]; // full-field points standings, sorted
  driversChampionshipOdds: { id: string; probability: number }[]; // P(wins Drivers' title), full remaining season
  constructorsChampionshipOdds: { id: string; probability: number }[]; // P(wins Constructors' title)
  driverTeam: Record<string, string>; // driverId -> constructorId, for this year
  constructorNames: Record<string, string>;
  driverNames: Record<string, string>;
}
