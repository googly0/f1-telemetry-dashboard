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
}

export interface AllYearsData {
  years: Record<string, YearData>;
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
