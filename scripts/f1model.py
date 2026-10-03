"""Shared feature + model code for the F1 predictor.

Data: the Kaggle "Formula 1 Race Data" dataset (jtrotman/formula-1-race-data), Ergast-format CSVs.

Two Plackett-Luce models, both linear in pre-race features:

  RACE-DAY (post-qualifying) - used once qualifying has happened:
      starting grid, qualifying gap to pole, sprint result, and this-season form.
  PRE-QUALIFYING - used for races that haven't had qualifying yet (and the season simulation):
      driver/team Elo ratings plus this-season form.

Every feature for race r uses only races before r, plus that weekend's qualifying,
starting grid and sprint (all known before lights out). Retirements are modelled
separately: each car retires with its team's recent DNF rate, and the classified
finishers are ordered by Plackett-Luce.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.optimize import minimize

NA = ["\\N"]
REG_RESET_YEARS = {2014, 2017, 2022, 2026}  # big regulation changes: team ratings mostly reset

ELO = dict(k_drv=64.0, k_team=128.0, carry_drv=0.85, carry_team=0.4, carry_team_reset=0.15,
           new_drv=1450.0, new_team=1450.0)
FORM_WINDOW, FORM_DECAY = 6, 0.6

RACE_DAY = ["x_grid", "x_pole", "x_qgap", "x_sprint", "x_team_form", "x_team_qgap", "x_team_gain", "x_tm"]
PRE_QUALI = ["x_elo_d", "x_elo_t", "x_team_form", "x_team_qgap", "x_team_gain", "x_tm"]

# Fitting setup (chosen on rolling validation 2018-2023, see README):
#   race-day: winner-only likelihood (k=1)
#   pre-qualifying: whole finishing order, position j weighted 0.3**j (it also drives
#   the season simulation, so mid-field order matters)
FIT = {"race_day": dict(k=1, gamma=None, l2=1e-2), "pre_quali": dict(k=22, gamma=0.3, l2=1e-2)}
TRAIN_YEARS = (2016, 2023)


def _tsec(s):
    if not isinstance(s, str) or ":" not in s:
        return np.nan
    m, sec = s.split(":")
    try:
        return int(m) * 60 + float(sec)
    except ValueError:
        return np.nan


def load(data_dir: str, first_year: int = 2010):
    d = data_dir.rstrip("/") + "/"
    races = pd.read_csv(d + "races.csv", na_values=NA)
    res = pd.read_csv(d + "results.csv", na_values=NA, dtype={"positionText": str})
    q = pd.read_csv(d + "qualifying.csv", na_values=NA)
    sp = pd.read_csv(d + "sprint_results.csv", na_values=NA)
    st = pd.read_csv(d + "status.csv", na_values=NA)
    races = races[races.year >= first_year]
    df = res.merge(races[["raceId", "year", "round", "circuitId", "name", "date"]], on="raceId")
    df = df.merge(st, on="statusId", how="left")
    q = q[q.raceId.isin(races.raceId)].copy()
    for c in ["q1", "q2", "q3"]:
        q[c + "s"] = q[c].map(_tsec)
    q["best"] = q[["q1s", "q2s", "q3s"]].min(axis=1)
    q["qgap"] = (q.best - q.groupby("raceId").best.transform("min")) / q.groupby("raceId").best.transform("min") * 100
    q = q.rename(columns={"position": "qpos"})[["raceId", "driverId", "qpos", "qgap"]]
    df = df.merge(q, on=["raceId", "driverId"], how="left")
    sp = sp.rename(columns={"positionOrder": "sprint_pos"})[["raceId", "driverId", "sprint_pos"]]
    df = df.merge(sp, on=["raceId", "driverId"], how="left")
    # Classified = numeric positionText (R/D/E/W/F/N = retired, disqualified, ...).
    # From 2025 the source also fills `position` for retirements, so don't rely on it.
    df["classified"] = df.positionText.astype(str).str.isdigit()
    # Starting grid: 0 = pit-lane start -> back. Missing grid (source gap) -> qualifying position.
    g = df.grid.where(df.grid.notna(), df.qpos).fillna(21)
    df["grid_eff"] = g.where(g > 0, 21)
    df = df.sort_values(["year", "round", "positionOrder"]).reset_index(drop=True)
    return df, races


def _pairwise_elo(ratings: dict, ordered_ids: list, k: float, new: float):
    n = len(ordered_ids)
    if n < 2:
        return
    R = np.array([ratings.get(i, new) for i in ordered_ids])
    E = 1 / (1 + 10 ** ((R[None, :] - R[:, None]) / 400))
    np.fill_diagonal(E, 0)
    S = np.where(np.arange(n)[:, None] < np.arange(n)[None, :], 1.0, 0.0)  # row beat column
    delta = k / (n - 1) * (S.sum(1) - E.sum(1))
    for i, dv in zip(ordered_ids, delta):
        ratings[i] = ratings.get(i, new) + dv


class FeatureBuilder:
    """Walks races in date order, emitting pre-race features then updating state."""

    def __init__(self, elo=None):
        self.p = dict(ELO, **(elo or {}))
        self.elo_d, self.elo_t, self.hist = {}, {}, []
        self.cur_year = None

    def start_season(self, yr):
        if yr == self.cur_year:
            return
        p = self.p
        if self.elo_d:
            md = np.mean(list(self.elo_d.values()))
            self.elo_d = {k: md + p["carry_drv"] * (v - md) for k, v in self.elo_d.items()}
        if self.elo_t:
            mt = np.mean(list(self.elo_t.values()))
            c = p["carry_team_reset"] if yr in REG_RESET_YEARS else p["carry_team"]
            self.elo_t = {k: mt + c * (v - mt) for k, v in self.elo_t.items()}
        self.cur_year = yr

    def pre_race(self, yr, pairs):
        """Features from history only, for (driverId, constructorId) pairs entering a race in year yr."""
        p = self.p
        prev = [h for h in self.hist if h["year"] == yr][-FORM_WINDOW:]
        out = []
        for d, t in pairs:
            num = den = qn = qd = gn = gd = tn = td = 0.0
            for k, h in enumerate(reversed(prev)):
                w = FORM_DECAY ** k
                den += w
                num += w * h["team_pts"].get(t, 0.0) / 2
                if t in h["team_qgap"]:
                    qn += w * h["team_qgap"][t]; qd += w
                if t in h["team_gain"]:
                    gn += w * h["team_gain"][t]; gd += w
                if d in h["tm_delta"]:
                    tn += w * h["tm_delta"][d]; td += w
            starts = dnfs = 0
            for h in reversed(self.hist):
                if t in h["team_dnf"]:
                    s, f = h["team_dnf"][t]; starts += s; dnfs += f
                if starts >= 30:
                    break
            out.append(dict(
                driverId=d, constructorId=t,
                elo_d=self.elo_d.get(d, p["new_drv"]), elo_t=self.elo_t.get(t, p["new_team"]),
                team_form=(num / den / 25) if den else 0.0,
                team_qgap_recent=(qn / qd) if qd else np.nan,
                team_gain_recent=(gn / gd) if gd else 0.0,
                tm_delta=(tn / td) if td else 0.0,
                dnf_rate=(dnfs + 0.12 * 10) / (starts + 10),  # shrunk toward 12%
            ))
        return out

    def post_race(self, g: pd.DataFrame, yr: int, rnd: int):
        p = self.p
        cls = g[g.classified].sort_values("positionOrder")
        _pairwise_elo(self.elo_d, list(cls.driverId), p["k_drv"], p["new_drv"])
        tbest = cls.groupby("constructorId").positionOrder.min().sort_values()
        _pairwise_elo(self.elo_t, list(tbest.index), p["k_team"], p["new_team"])
        gc = g[g.classified]
        tm_delta = {}
        for t, x in g.groupby("constructorId"):
            if len(x) == 2:
                a, b = x.positionOrder.values
                da, db = x.driverId.values
                tm_delta[da] = float(b - a); tm_delta[db] = float(a - b)
        self.hist.append(dict(
            year=yr, round=rnd,
            team_pts=g.groupby("constructorId").points.sum().to_dict(),
            team_qgap=g.dropna(subset=["qgap"]).groupby("constructorId").qgap.mean().to_dict(),
            team_gain=(gc.grid_eff - gc.positionOrder).groupby(gc.constructorId).mean().to_dict(),
            team_dnf={t: (len(x), int((~x.classified).sum())) for t, x in g.groupby("constructorId")},
            tm_delta=tm_delta,
        ))


def build_features(df: pd.DataFrame, elo=None, snapshot_hook=None):
    """Feature table, one row per (race, driver). snapshot_hook(fb, yr, rnd) is called after
    each race's update (used by the dashboard builder to record per-round ratings)."""
    fb = FeatureBuilder(elo)
    rows = []
    order = df[["raceId", "year", "round"]].drop_duplicates().sort_values(["year", "round"])
    for rid, yr, rnd in order.itertuples(index=False):
        g = df[df.raceId == rid]
        if fb.cur_year != yr and snapshot_hook:
            fb.start_season(yr); snapshot_hook(fb, yr, 0)
        fb.start_season(yr)
        feats = fb.pre_race(yr, list(zip(g.driverId, g.constructorId)))
        for f, row in zip(feats, g.itertuples(index=False)):
            f.update(raceId=rid, year=yr, round=rnd, grid=row.grid_eff, qpos=row.qpos, qgap=row.qgap,
                     sprint_pos=row.sprint_pos, pos=row.positionOrder, classified=row.classified)
            rows.append(f)
        fb.post_race(g, yr, rnd)
        if snapshot_hook:
            snapshot_hook(fb, yr, rnd)
    return pd.DataFrame(rows), fb


def transform(F: pd.DataFrame) -> pd.DataFrame:
    F = F.copy()
    F["x_grid"] = -np.log(F.grid.clip(1, 22))
    F["x_pole"] = (F.grid == 1).astype(float)
    q = F.qgap.fillna(F.groupby("raceId").qgap.transform("max")).fillna(5.0)
    F["x_qgap"] = -q.clip(0, 5)
    F["x_sprint"] = (-np.log(F.sprint_pos.clip(1, 22))).fillna(0.0)
    F["x_elo_d"] = F.elo_d / 100
    F["x_elo_t"] = F.elo_t / 100
    F["x_team_form"] = F.team_form
    tq = F.team_qgap_recent.fillna(F.groupby("raceId").team_qgap_recent.transform("max")).fillna(3.0)
    F["x_team_qgap"] = -tq.clip(0, 5)
    F["x_team_gain"] = F.team_gain_recent / 5
    F["x_tm"] = F.tm_delta / 5
    return F


# ----------------------------------------------------------------------------- model
def races_from(F: pd.DataFrame, cols):
    out = []
    for rid, g in F.groupby("raceId", sort=False):
        g = g.reset_index(drop=True)
        cls = g[g.classified].sort_values("pos")
        out.append(dict(raceId=rid, year=int(g.year.iloc[0]), round=int(g["round"].iloc[0]),
                        X=g[cols].values.astype(float), order=list(cls.index),
                        winner=int(g.index[g.pos == g.pos.min()][0]), podium=list(cls.index[:3]),
                        dnf=g.dnf_rate.values, ids=g.driverId.values))
    return out


def _nll_grad(beta, races, k, l2, gamma):
    tot, grad = 0.0, np.zeros_like(beta)
    for r in races:
        X = r["X"][r["order"]]
        u = X @ beta
        e = np.exp(u - u.max())
        kk = min(k, len(u))
        w = np.ones(kk) if gamma is None else gamma ** np.arange(kk)
        tail = np.cumsum(e[::-1])[::-1]
        tailX = np.cumsum((e[:, None] * X)[::-1], axis=0)[::-1]
        tot += -(w * (np.log(e[:kk]) - np.log(tail[:kk]))).sum()
        grad += -(w[:, None] * (X[:kk] - tailX[:kk] / tail[:kk, None])).sum(0)
    n = len(races)
    return tot / n + l2 * (beta ** 2).sum(), grad / n + 2 * l2 * beta


def fit(races, ncol, k=1, l2=1e-2, gamma=None):
    """Maximum-likelihood Plackett-Luce weights over each race's classified finishing order."""
    res = minimize(_nll_grad, np.zeros(ncol), args=(races, k, l2, gamma), jac=True, method="L-BFGS-B")
    return res.x


def simulate(u, dnf, n=50000, rng=None):
    """P(finishing P1), P(P2), P(P3) per driver: each car retires with its DNF rate and the
    finishers are ordered by Plackett-Luce (Gumbel-max trick) - the same process the
    dashboard runs in lib/predictor.ts."""
    rng = rng or np.random.default_rng(0)
    G = rng.gumbel(size=(n, len(u))) + u
    G[rng.random((n, len(u))) < dnf] = -np.inf
    order = np.argsort(-G, axis=1)
    return np.stack([np.bincount(order[:, j], minlength=len(u)) / n for j in range(3)])


def greedy_podium(pos_prob):
    """Dashboard podium: P1 = most likely winner, then the most likely P2 among the rest, then P3."""
    used = []
    for j in range(3):
        p = pos_prob[j].copy()
        p[used] = -1
        used.append(int(np.argmax(p)))
    return used


def evaluate(races, beta, n=50000, seed=42):
    rng = np.random.default_rng(seed)
    rows = []
    for r in races:
        pos = simulate(r["X"] @ beta, np.clip(r["dnf"], 0, 0.9), n, rng)
        win = pos[0]
        w = r["winner"]
        picks = np.argsort(-win)
        pod = greedy_podium(pos)
        rows.append(dict(raceId=r["raceId"], year=r["year"], round=r["round"],
                         pick=r["ids"][picks[0]], p_pick=win[picks[0]],
                         pick2=r["ids"][picks[1]], pick3=r["ids"][picks[2]],
                         winner=r["ids"][w], p_winner=win[w],
                         podium_pick=",".join(str(r["ids"][i]) for i in pod),
                         podium_actual=",".join(str(r["ids"][i]) for i in r["podium"]),
                         hit=float(picks[0] == w), top3=float(w in picks[:3]),
                         podium=len(set(pod) & set(r["podium"])) / 3,
                         ll=-np.log(max(win[w], 1e-4))))
    return pd.DataFrame(rows)


def fit_models(F: pd.DataFrame):
    a, b = TRAIN_YEARS
    tr = F[(F.year >= a) & (F.year <= b)]
    betas = {}
    for name, cols in (("race_day", RACE_DAY), ("pre_quali", PRE_QUALI)):
        betas[name] = fit(races_from(tr, cols), len(cols), **FIT[name])
    return betas
