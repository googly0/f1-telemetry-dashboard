import type { YearData, RacePrediction, PodiumEntry, HeadToHeadMetric, PointsProgressionPoint } from "./types";

/* -----------------------------------------------------------------------
 * REAL PREDICTOR ENGINE
 * -----------------------------------------------------------------------
 * Same model as the validated static dashboard: a driver-skill Elo rating
 * (decayed across all seasons since 2015) blended with a team/car-strength
 * rating (rebuilt mostly from that season's own results), combined into a
 * single strength score and sampled via the Gumbel-max trick — an exact,
 * efficient way to draw from a Plackett-Luce ranking distribution.
 * No random mock numbers: every output here is a function of the real
 * ratings in lib/data/all_years.json.
 * ---------------------------------------------------------------------- */

/* Model parameters — fitted, not hand-picked. scripts/backtest.py --fit maximises the
 * Plackett-Luce likelihood of the real top-10 finishing order over 2016–2023 races, then
 * scores the result on 2024–2026 races it never saw. Previous hand-tuned values were
 * WD = 0.3, TEMPERATURE = 1, TEAM_FORM_WEIGHT = 0 (test win log-loss 2.072 → 1.956). */
const WD = 0.346; // driver skill weight
const WT = 1 - WD; // car/team strength weight
const TEMPERATURE = 1.203; // >1 sharpens the gap between strong and weak drivers
const TEAM_FORM_WEIGHT = 0.232; // log-strength bonus per unit of recent team form

/* Team recent form: how many points the team's drivers scored in the last few races
 * (most recent weighted most), scaled so 1.0 = a win every race. Team ratings update
 * slowly, which left the model backing Red Bull for all of 2024 after McLaren caught up;
 * this gives it a fast-reacting signal that only uses races already run. */
export const MODEL_PARAMS = { driverWeight: WD, teamWeight: WT, temperature: TEMPERATURE, teamFormWeight: TEAM_FORM_WEIGHT };
/* Held-out backtest (2024–2026, 59 races) — regenerate with: python scripts/backtest.py */
export const BACKTEST = { testRaces: 59, winLogLoss: 1.956, previousWinLogLoss: 2.072, uniformWinLogLoss: 3.108 };

const RECENT_PTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const RECENT_WINDOW = 6;
const RECENT_DECAY = 0.6;

function computeTeamRecentForm(
  yd: YearData,
  round: number,
  driverIds: string[],
  driverTeam: Record<string, string>
): Record<string, number> {
  const prevRounds = Object.keys(yd.race_results)
    .map(Number)
    .filter((r) => r < round)
    .sort((a, b) => a - b)
    .slice(-RECENT_WINDOW);

  const driverForm: Record<string, number> = {};
  driverIds.forEach((id) => (driverForm[id] = 0));
  let weightSum = 0;
  prevRounds.reverse().forEach((r, k) => {
    const w = Math.pow(RECENT_DECAY, k);
    weightSum += w;
    yd.race_results[String(r)].slice(0, 10).forEach((id, pos) => {
      if (id in driverForm) driverForm[id] += w * RECENT_PTS[pos];
    });
  });
  if (weightSum > 0) driverIds.forEach((id) => (driverForm[id] /= weightSum));

  const teamForm: Record<string, number> = {};
  const byTeam: Record<string, string[]> = {};
  driverIds.forEach((id) => (byTeam[driverTeam[id]] = [...(byTeam[driverTeam[id]] || []), id]));
  Object.entries(byTeam).forEach(([cid, ids]) => {
    teamForm[cid] = ids.reduce((s, id) => s + driverForm[id], 0) / ids.length / 25;
  });
  return teamForm;
}

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
  driverIds: string[];
  driverElo: Record<string, number>; // pure career Elo — unchanged, used for head-to-head display
  teamRating: Record<string, number>;
  driverTeam: Record<string, string>;
  dnfRate: Record<string, number>;
  teammateFormAdj: Record<string, number>; // in-season points-vs-teammate adjustment, elo-scale
  teamRecentForm: Record<string, number>; // constructorId -> decayed recent points, 1.0 = winning every race
  logScore: Record<string, number>; // what the simulator actually uses: career Elo + form adjustment
}

const FORM_ELO_PER_POINT = 2.0; // how many Elo points one real points-lead-over-teammate is worth
const FORM_ELO_CAP = 200; // clamp so a single early-season race can't swing this wildly

/** Ratings as they stood entering a given round (index round-1 in the snapshot arrays;
 *  index 0 = preseason. For rounds beyond data_through, this is simply the most recent
 *  known ratings carried forward — i.e. "predict the future using what we know now".
 *
 *  Career Elo alone can't tell two teammates apart quickly: they share the same car
 *  rating, so within a team the *only* differentiator is a career-long rating that
 *  updates slowly. A rookie having a career year (e.g. winning 6 of 11 races) won't
 *  out-rate a veteran teammate on career Elo for a long time, even while clearly
 *  outperforming them right now. To fix that, we add a bounded "in-season form vs
 *  teammate" adjustment based on real points earned this season — the cleanest
 *  same-car, same-machinery comparison available — on top of (not replacing) the
 *  career Elo, purely for the combined prediction score. */
export function getRatingSnapshot(yd: YearData, round: number): RatingSnapshot {
  const idx = Math.max(0, Math.min(yd.n_rounds, round - 1));
  const driverIds = Object.keys(yd.driver_elo_by_round);
  const driverElo: Record<string, number> = {};
  const teamRating: Record<string, number> = {};
  const driverTeam: Record<string, string> = {};
  yd.lineup.forEach((l) => (driverTeam[l.driverId] = l.constructorId));
  driverIds.forEach((id) => (driverElo[id] = yd.driver_elo_by_round[id][idx]));
  Object.keys(yd.team_rating_by_round).forEach(
    (cid) => (teamRating[cid] = yd.team_rating_by_round[cid][idx])
  );

  const teammatesOf: Record<string, string[]> = {};
  driverIds.forEach((id) => {
    teammatesOf[driverTeam[id]] = teammatesOf[driverTeam[id]] || [];
    teammatesOf[driverTeam[id]].push(id);
  });

  const teammateFormAdj: Record<string, number> = {};
  driverIds.forEach((id) => {
    const myPts = yd.driver_points_by_round[id][idx];
    const teammates = (teammatesOf[driverTeam[id]] || []).filter((t) => t !== id);
    if (teammates.length === 0) {
      teammateFormAdj[id] = 0;
      return;
    }
    const teammatePts = teammates.reduce((s, t) => s + yd.driver_points_by_round[t][idx], 0) / teammates.length;
    const raw = (myPts - teammatePts) * FORM_ELO_PER_POINT;
    teammateFormAdj[id] = Math.max(-FORM_ELO_CAP, Math.min(FORM_ELO_CAP, raw));
  });

  const teamRecentForm = computeTeamRecentForm(yd, round, driverIds, driverTeam);

  const logScore: Record<string, number> = {};
  driverIds.forEach((id) => {
    const adjustedDriverElo = driverElo[id] + teammateFormAdj[id];
    const combined = WD * adjustedDriverElo + WT * teamRating[driverTeam[id]];
    logScore[id] =
      ((combined * Math.log(10)) / 400) * TEMPERATURE + TEAM_FORM_WEIGHT * (teamRecentForm[driverTeam[id]] ?? 0);
  });
  return { driverIds, driverElo, teamRating, driverTeam, dnfRate: yd.dnf_rate, teammateFormAdj, teamRecentForm, logScore };
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

  const remaining = yd.rounds.filter((r) => r.round > round);
  const basePts: Record<string, number> = {};
  driverIds.forEach((id) => (basePts[id] = yd.driver_points_by_round[id][Math.min(round, yd.n_rounds)]));

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

  // precompute rating snapshots per remaining round once (not per sim — ratings don't change per sim)
  const roundSnaps = remaining.map((r) => ({ round: r.round, sprint: r.sprint, snap: getRatingSnapshot(yd, r.round) }));

  for (let s = 0; s < nSim; s++) {
    const simPts: Record<string, number> = { ...basePts };
    for (const { round: r, sprint, snap } of roundSnaps) {
      const seed = `${r}-champsim-${s}`;
      const rand = mulberry32(hashSeed(seed));
      const noisy = driverIds.map((id) => ({ id, v: snap.logScore[id] + gumbel(rand) }));
      noisy.sort((a, b) => b.v - a.v);
      const dnf = new Set<string>();
      driverIds.forEach((id) => {
        if (rand() < (snap.dnfRate[snap.driverTeam[id]] ?? 0.12)) dnf.add(id);
      });
      const classified = noisy.filter((d) => !dnf.has(d.id));
      classified.forEach((d, pos) => {
        if (pos < yd.gp_points.length) simPts[d.id] += yd.gp_points[pos];
      });
      if (sprint && yd.sprint_points) {
        const rand2 = mulberry32(hashSeed(`${seed}-sprint`));
        const noisy2 = driverIds.map((id) => ({ id, v: snap.logScore[id] + gumbel(rand2) }));
        noisy2.sort((a, b) => b.v - a.v);
        const dnf2 = new Set<string>();
        driverIds.forEach((id) => {
          if (rand2() < (snap.dnfRate[snap.driverTeam[id]] ?? 0.12)) dnf2.add(id);
        });
        const classified2 = noisy2.filter((d) => !dnf2.has(d.id));
        classified2.forEach((d, pos) => {
          if (pos < yd.sprint_points!.length) simPts[d.id] += yd.sprint_points![pos];
        });
      }
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
  nSim = 6000
): RacePrediction {
  const snap = getRatingSnapshot(yd, round);
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

  const standingsAtRound = computeFullStandings(yd, round, driverPool, Math.max(300, Math.round(nSim / 8)));
  const championshipOdds = simulateSeasonChampionship(yd, round, Math.min(2500, nSim));

  return {
    year,
    round,
    raceName: raceInfo?.name ?? `Round ${round}`,
    isFutureRound,
    actualResult,
    modelConfidence: podium[0]?.probability ?? 0,
    podium,
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
