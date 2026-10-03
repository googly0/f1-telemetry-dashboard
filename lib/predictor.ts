import type { YearData, RacePrediction, PodiumEntry, HeadToHeadMetric, PointsProgressionPoint, PredictionMode } from "./types";
import { MODEL_INFO } from "./f1Data";

/* -----------------------------------------------------------------------
 * PREDICTOR ENGINE
 * -----------------------------------------------------------------------
 * Two Plackett-Luce models, fitted in Python (scripts/f1model.py) and baked into
 * lib/data/all_years.json as one strength number per driver per round:
 *
 *   RACE-DAY (after qualifying): starting grid, qualifying gap to pole, sprint
 *     result, and this-season team/teammate form.
 *   PRE-QUALIFYING: driver + team Elo ratings and this-season form. Used for
 *     races that haven't had qualifying yet, and for the season simulation.
 *
 * Each race is simulated by letting every car retire with its team's recent DNF
 * rate, then ordering the finishers with the Gumbel-max trick (an exact sample
 * from Plackett-Luce). The backtest in scripts/backtest.py runs the same process.
 * ---------------------------------------------------------------------- */

export { MODEL_INFO };

function gumbel(rand: () => number): number {
  return -Math.log(-Math.log(rand()));
}

/** Simple deterministic PRNG so re-renders with the same inputs (year/round) don't
 *  visually jitter between Monte Carlo batches — mulberry32. */
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export interface RatingSnapshot {
  driverIds: string[]; // drivers entered in this round (the ones the simulator races)
  driverElo: Record<string, number>; // driver Elo entering the round (display + pre-qualifying model)
  teamRating: Record<string, number>;
  driverTeam: Record<string, string>;
  dnfRate: Record<string, number>; // constructorId -> P(retire), from races before this one
  teammateFormAdj: Record<string, number>; // display only: points lead over teammate, elo-scale
  logScore: Record<string, number>; // Plackett-Luce strength the simulator uses
  mode: PredictionMode;
  grid: Record<string, number | null>; // starting grid, when qualifying has happened
}

const FORM_ELO_PER_POINT = 2.0;
const FORM_ELO_CAP = 200;

export function hasQualifying(yd: YearData, round: number): boolean {
  const post = yd.post_utility_by_round;
  if (!post) return false;
  return Object.values(post).some((arr) => arr[round - 1] !== null && arr[round - 1] !== undefined);
}

/** Model state entering a round. Uses the race-day model when that round's qualifying is
 *  known (and `useQualifying` is on); otherwise the pre-qualifying model. Rounds beyond the
 *  latest data use the most recent state carried forward. */
export function getRatingSnapshot(yd: YearData, round: number, useQualifying = true): RatingSnapshot {
  const ri = Math.max(0, Math.min(yd.n_rounds - 1, round - 1)); // per-round arrays (length n_rounds)
  const ei = Math.max(0, Math.min(yd.n_rounds, round - 1)); // rating arrays (index 0 = pre-season)
  const mode: PredictionMode = useQualifying && hasQualifying(yd, round) ? "race-day" : "pre-qualifying";
  const source = mode === "race-day" ? yd.post_utility_by_round : yd.pre_utility_by_round;

  const driverTeam: Record<string, string> = {};
  yd.lineup.forEach((l) => (driverTeam[l.driverId] = l.constructorId));

  const logScore: Record<string, number> = {};
  const grid: Record<string, number | null> = {};
  Object.entries(source).forEach(([id, arr]) => {
    const u = arr[ri];
    if (u !== null && u !== undefined) {
      logScore[id] = u;
      grid[id] = yd.grid_by_round?.[id]?.[ri] ?? null;
    }
  });
  const driverIds = Object.keys(logScore);

  const driverElo: Record<string, number> = {};
  const teamRating: Record<string, number> = {};
  driverIds.forEach((id) => (driverElo[id] = yd.driver_elo_by_round[id]?.[ei] ?? 1450));
  Object.keys(yd.team_rating_by_round).forEach((cid) => (teamRating[cid] = yd.team_rating_by_round[cid][ei]));

  const dnfRate: Record<string, number> = {};
  Object.keys(yd.dnf_rate).forEach((cid) => (dnfRate[cid] = yd.dnf_rate_by_round?.[cid]?.[ri] ?? yd.dnf_rate[cid]));

  const teammatesOf: Record<string, string[]> = {};
  driverIds.forEach((id) => (teammatesOf[driverTeam[id]] = [...(teammatesOf[driverTeam[id]] || []), id]));
  const teammateFormAdj: Record<string, number> = {};
  driverIds.forEach((id) => {
    const mates = (teammatesOf[driverTeam[id]] || []).filter((t) => t !== id);
    if (mates.length === 0) return (teammateFormAdj[id] = 0);
    const myPts = yd.driver_points_by_round[id]?.[ei] ?? 0;
    const matePts = mates.reduce((s, t) => s + (yd.driver_points_by_round[t]?.[ei] ?? 0), 0) / mates.length;
    teammateFormAdj[id] = Math.max(-FORM_ELO_CAP, Math.min(FORM_ELO_CAP, (myPts - matePts) * FORM_ELO_PER_POINT));
  });

  return { driverIds, driverElo, teamRating, driverTeam, dnfRate, teammateFormAdj, logScore, mode, grid };
}

/** Monte Carlo simulation of a single race, returning exact-position probabilities
 *  (P(driver finishes P1), P(P2), P(P3), ...) via the Gumbel-max Plackett-Luce trick. */
export function simulateSingleRace(
  snap: RatingSnapshot,
  pointsScale: number[],
  nSim: number,
  seed: string
) {
  const rand = mulberry32(hashSeed(seed));
  const { driverIds, logScore, driverTeam, dnfRate } = snap;
  const posCounts: Record<string, number[]> = {}; // driverId -> [count finishing P1, P2, P3, ...]
  const pointsSum: Record<string, number> = {};
  driverIds.forEach((id) => {
    posCounts[id] = new Array(driverIds.length).fill(0);
    pointsSum[id] = 0;
  });

  for (let s = 0; s < nSim; s++) {
    const noisy = driverIds.map((id) => ({ id, v: logScore[id] + gumbel(rand) }));
    noisy.sort((a, b) => b.v - a.v);
    const dnf = new Set<string>();
    driverIds.forEach((id) => {
      if (rand() < (dnfRate[driverTeam[id]] ?? 0.12)) dnf.add(id);
    });
    const classified = noisy.filter((d) => !dnf.has(d.id));
    classified.forEach((d, pos) => {
      posCounts[d.id][pos] += 1;
      if (pos < pointsScale.length) pointsSum[d.id] += pointsScale[pos];
    });
  }

  const posProb: Record<string, number[]> = {};
  const avgPoints: Record<string, number> = {};
  driverIds.forEach((id) => {
    posProb[id] = posCounts[id].map((c) => c / nSim);
    avgPoints[id] = pointsSum[id] / nSim;
  });
  return { posProb, avgPoints };
}

function percentile(values: number[], v: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const below = sorted.filter((x) => x < v).length;
  return Math.round((below / Math.max(1, sorted.length - 1)) * 100);
}

const METRIC_DEFS: { key: string; label: string }[] = [
  { key: "carPace", label: "Car Pace (Team Rating)" },
  { key: "driverSkill", label: "Career Driver Skill (Elo)" },
  { key: "vsTeammate", label: "Form vs. Own Teammate" },
  { key: "reliability", label: "Reliability" },
  { key: "seasonForm", label: "Points-Per-Race Form" },
  { key: "combined", label: "Combined Model Strength" },
];

function computeHeadToHead(
  yd: YearData,
  round: number,
  snap: RatingSnapshot,
  driverIds: string[]
): RacePrediction["headToHead"] {
  const idx = Math.max(0, Math.min(yd.n_rounds, round - 1));

  const carPaceVals = driverIds.map((id) => snap.teamRating[snap.driverTeam[id]]);
  const driverSkillVals = driverIds.map((id) => snap.driverElo[id]);
  const vsTeammateVals = driverIds.map((id) => snap.teammateFormAdj[id]);
  const reliabilityVals = driverIds.map((id) => -(snap.dnfRate[snap.driverTeam[id]] ?? 0.12));
  const combinedVals = driverIds.map((id) => snap.logScore[id]);
  const formVals = driverIds.map((id) => {
    const pts = yd.driver_points_by_round[id];
    const prevIdx = Math.max(0, idx - 3);
    return idx > 0 ? (pts[idx] - pts[prevIdx]) / Math.max(1, idx - prevIdx) : 0;
  });

  const valueOf: Record<string, number[]> = {
    carPace: carPaceVals,
    driverSkill: driverSkillVals,
    vsTeammate: vsTeammateVals,
    reliability: reliabilityVals,
    seasonForm: formVals,
    combined: combinedVals,
  };

  function metricsFor(a: string, b: string): HeadToHeadMetric[] {
    const ai = driverIds.indexOf(a);
    const bi = driverIds.indexOf(b);
    return METRIC_DEFS.map((m) => ({
      key: m.key,
      label: m.label,
      driverAValue: percentile(valueOf[m.key], valueOf[m.key][ai]),
      driverBValue: percentile(valueOf[m.key], valueOf[m.key][bi]),
    }));
  }

  const table: RacePrediction["headToHead"] = {};
  for (const a of driverIds) {
    table[a] = {};
    for (const b of driverIds) {
      if (a === b) continue;
      table[a][b] = metricsFor(a, b);
    }
  }
  return table;
}

function computePointsProgression(
  yd: YearData,
  round: number,
  driverIds: string[],
  nProjSim: number
): PointsProgressionPoint[] {
  const series: PointsProgressionPoint[] = [];
  const upTo = Math.min(round, yd.n_rounds);

  for (let r = 0; r <= upTo; r++) {
    const isProjected = r > yd.data_through;
    const point: PointsProgressionPoint = { round: r, isProjected };
    driverIds.forEach((id) => {
      point[id] = yd.driver_points_by_round[id][r];
    });
    series.push(point);
  }

  // extend past data_through with a lightweight expected-points projection using the
  // same real ratings + simulator, rather than a straight-line guess
  if (upTo > yd.data_through) {
    let running: Record<string, number> = {};
    driverIds.forEach((id) => (running[id] = yd.driver_points_by_round[id][yd.data_through]));
    for (let r = yd.data_through + 1; r <= upTo; r++) {
      const snap = getRatingSnapshot(yd, r);
      const isSprint = yd.rounds[r - 1]?.sprint;
      const { avgPoints } = simulateSingleRace(snap, yd.gp_points, nProjSim, `${r}-proj-gp`);
      driverIds.forEach((id) => {
        running[id] += avgPoints[id] ?? 0;
      });
      if (isSprint && yd.sprint_points) {
        const { avgPoints: sprintPts } = simulateSingleRace(snap, yd.sprint_points, nProjSim, `${r}-proj-sprint`);
        driverIds.forEach((id) => {
          running[id] += sprintPts[id] ?? 0;
        });
      }
      const seriesIdx = series.findIndex((p) => p.round === r);
      if (seriesIdx >= 0) {
        driverIds.forEach((id) => (series[seriesIdx][id] = Math.round(running[id] * 10) / 10));
      }
    }
  }

  return series;
}

export interface StandingEntry {
  driverId: string;
  points: number;
  isProjected: boolean;
}

/** Every driver's cumulative points at a given round — real if that round has already
 *  happened, otherwise projected forward from the last real round using the same
 *  simulator, run once per remaining round rather than per-driver (cheap). */
function computeFullStandings(
  yd: YearData,
  round: number,
  driverIds: string[],
  nProjSim: number
): StandingEntry[] {
  const upTo = Math.min(round, yd.n_rounds);
  const isProjected = upTo > yd.data_through;

  if (!isProjected) {
    return driverIds
      .map((id) => ({ driverId: id, points: yd.driver_points_by_round[id][upTo], isProjected: false }))
      .sort((a, b) => b.points - a.points);
  }

  const running: Record<string, number> = {};
  driverIds.forEach((id) => (running[id] = yd.driver_points_by_round[id][yd.data_through]));
  for (let r = yd.data_through + 1; r <= upTo; r++) {
    const snap = getRatingSnapshot(yd, r);
    const isSprint = yd.rounds[r - 1]?.sprint;
    const { avgPoints } = simulateSingleRace(snap, yd.gp_points, nProjSim, `${r}-fullstandings-gp`);
    driverIds.forEach((id) => (running[id] += avgPoints[id] ?? 0));
    if (isSprint && yd.sprint_points) {
      const { avgPoints: sprintPts } = simulateSingleRace(snap, yd.sprint_points, nProjSim, `${r}-fullstandings-sprint`);
      driverIds.forEach((id) => (running[id] += sprintPts[id] ?? 0));
    }
  }
  return driverIds
    .map((id) => ({ driverId: id, points: Math.round(running[id] * 10) / 10, isProjected: true }))
    .sort((a, b) => b.points - a.points);
}


/** Full remaining-season Monte Carlo: who actually wins the title, not just one race.
 *  This is the season-long simulation validated in the companion static dashboard,
 *  ported here — every remaining round (and sprint) is simulated, points accumulate
 *  on top of real current standings, and we tally how often each driver/constructor
 *  ends the season with the most points. */
export interface ChampionshipOddsEntry {
  id: string;
  probability: number;
}

function simulateSeasonChampionship(
  yd: YearData,
  round: number,
  nSim: number
): { drivers: ChampionshipOddsEntry[]; constructors: ChampionshipOddsEntry[] } {
  const driverIds = Object.keys(yd.driver_elo_by_round);
  const driverTeam: Record<string, string> = {};
  yd.lineup.forEach((l) => (driverTeam[l.driverId] = l.constructorId));
  const constructorIds = Array.from(new Set(driverIds.map((id) => driverTeam[id])));

  // Real points are known only through data_through. Viewing a future round must still
  // simulate every race not yet run (including the selected one), not skip them.
  const known = Math.min(round, yd.data_through, yd.n_rounds);
  const remaining = yd.rounds.filter((r) => r.round > known);
  const basePts: Record<string, number> = {};
  driverIds.forEach((id) => (basePts[id] = yd.driver_points_by_round[id][known]));

  if (remaining.length === 0) {
    // season's over — "odds" collapse to who actually won
    const finalPts = driverIds.map((id) => ({ id, pts: basePts[id] }));
    const winner = finalPts.reduce((a, b) => (b.pts > a.pts ? b : a));
    const teamPts: Record<string, number> = {};
    constructorIds.forEach((cid) => (teamPts[cid] = 0));
    driverIds.forEach((id) => (teamPts[driverTeam[id]] += basePts[id]));
    const teamWinner = Object.entries(teamPts).reduce((a, b) => (b[1] > a[1] ? b : a));
    return {
      drivers: driverIds.map((id) => ({ id, probability: id === winner.id ? 1 : 0 })).sort((a, b) => b.probability - a.probability),
      constructors: constructorIds.map((cid) => ({ id: cid, probability: cid === teamWinner[0] ? 1 : 0 })).sort((a, b) => b.probability - a.probability),
    };
  }

  const driverChampCount: Record<string, number> = {};
  const teamChampCount: Record<string, number> = {};
  driverIds.forEach((id) => (driverChampCount[id] = 0));
  constructorIds.forEach((cid) => (teamChampCount[cid] = 0));

  // Every remaining race uses the pre-qualifying model as it stood after round `known`, so title odds
  // "as of round X" never use ratings or form from later races.
  const nextSnap = getRatingSnapshot(yd, Math.min(known + 1, yd.n_rounds), false);
  const roundSnaps = remaining.map((r) => ({ round: r.round, sprint: r.sprint, snap: nextSnap }));

  for (let s = 0; s < nSim; s++) {
    const simPts: Record<string, number> = { ...basePts };
    for (const { round: r, sprint, snap } of roundSnaps) {
      const seed = `${r}-champsim-${s}`;
      const rand = mulberry32(hashSeed(seed));
      const raced = (rng: () => number, scale: number[]) => {
        // only drivers entered in this round race; retired cars score nothing
        const noisy = snap.driverIds.map((id) => ({ id, v: snap.logScore[id] + gumbel(rng) }));
        noisy.sort((a, b) => b.v - a.v);
        const out = new Set<string>();
        snap.driverIds.forEach((id) => {
          if (rng() < (snap.dnfRate[snap.driverTeam[id]] ?? 0.12)) out.add(id);
        });
        noisy
          .filter((d) => !out.has(d.id))
          .forEach((d, pos) => {
            if (pos < scale.length) simPts[d.id] = (simPts[d.id] ?? 0) + scale[pos];
          });
      };
      raced(rand, yd.gp_points);
      if (sprint && yd.sprint_points) raced(mulberry32(hashSeed(`${seed}-sprint`)), yd.sprint_points);
    }
    let champ = driverIds[0];
    driverIds.forEach((id) => {
      if (simPts[id] > simPts[champ]) champ = id;
    });
    driverChampCount[champ] += 1;

    const teamPts: Record<string, number> = {};
    constructorIds.forEach((cid) => (teamPts[cid] = 0));
    driverIds.forEach((id) => (teamPts[driverTeam[id]] += simPts[id]));
    let teamChamp = constructorIds[0];
    constructorIds.forEach((cid) => {
      if (teamPts[cid] > teamPts[teamChamp]) teamChamp = cid;
    });
    teamChampCount[teamChamp] += 1;
  }

  return {
    drivers: driverIds
      .map((id) => ({ id, probability: driverChampCount[id] / nSim }))
      .sort((a, b) => b.probability - a.probability),
    constructors: constructorIds
      .map((id) => ({ id, probability: teamChampCount[id] / nSim }))
      .sort((a, b) => b.probability - a.probability),
  };
}

export function buildRacePrediction(
  yd: YearData,
  year: number,
  round: number,
  nSim = 6000,
  useQualifying = true
): RacePrediction {
  const snap = getRatingSnapshot(yd, round, useQualifying);
  const raceInfo = yd.rounds[round - 1];
  const { posProb, avgPoints } = simulateSingleRace(snap, yd.gp_points, nSim, `${year}-${round}-podium`);

  // greedy podium assembly: fill P1 with whoever's most likely to actually win, then P2, then P3,
  // without repeating a driver, using each driver's own probability of landing that exact slot
  const used = new Set<string>();
  const podium: PodiumEntry[] = [];
  for (let pos = 0; pos < 3; pos++) {
    let best: string | null = null;
    let bestP = -1;
    snap.driverIds.forEach((id) => {
      if (used.has(id)) return;
      const p = posProb[id][pos] ?? 0;
      if (p > bestP) {
        bestP = p;
        best = id;
      }
    });
    if (best) {
      used.add(best);
      podium.push({ position: (pos + 1) as 1 | 2 | 3, driverId: best, probability: bestP });
    }
  }

  const driverPool = [...snap.driverIds].sort((a, b) => snap.logScore[b] - snap.logScore[a]);

  const isFutureRound = round > yd.data_through;
  const actualResultRaw = yd.race_results[String(round)];
  const actualResult = actualResultRaw
    ? actualResultRaw.slice(0, 3).map((driverId, i) => ({ position: (i + 1) as 1 | 2 | 3, driverId }))
    : null;

  const allDrivers = Object.keys(yd.driver_points_by_round);
  const standingsAtRound = computeFullStandings(yd, round, allDrivers, Math.max(300, Math.round(nSim / 8)));
  const winProbabilities = snap.driverIds
    .map((id) => ({ driverId: id, probability: posProb[id][0] ?? 0 }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 5);
  const championshipOdds = simulateSeasonChampionship(yd, round, Math.min(2500, nSim));

  return {
    year,
    round,
    raceName: raceInfo?.name ?? `Round ${round}`,
    isFutureRound,
    actualResult,
    modelConfidence: podium[0]?.probability ?? 0,
    podium,
    winProbabilities,
    predictionMode: snap.mode,
    qualifyingAvailable: hasQualifying(yd, round),
    grid: snap.grid,
    driverPool,
    headToHead: computeHeadToHead(yd, round, snap, driverPool),
    pointsProgression: computePointsProgression(yd, round, driverPool.slice(0, 8), Math.max(300, Math.round(nSim / 8))),
    standingsAtRound,
    driversChampionshipOdds: championshipOdds.drivers,
    constructorsChampionshipOdds: championshipOdds.constructors,
    driverTeam: snap.driverTeam,
    constructorNames: yd.names.constructors,
    driverNames: yd.names.drivers,
  };
}
