"""Walk-forward backtest for the F1 predictor in lib/predictor.ts.

For every race 2016-2026 it predicts using ONLY the ratings that existed before
that race (snapshot index round-1), then scores the prediction against the real
result. Train = 2016-2023 (used to fit weights with --fit), Test = 2024-2026
(never used for fitting). 2015 is skipped because Elo has no history yet.

Metrics
  win log-loss   -ln(probability the model gave the actual winner). Lower = better.
                 Uniform guessing over ~20 drivers scores ~3.0.
  winner hit     share of races where the model's favourite actually won.
  podium         share of the 3 podium spots the model's top-3 got right.
  PL NLL         Plackett-Luce negative log-likelihood of the full top-10 order
                 (this is what --fit minimises).

Usage
  python scripts/backtest.py          # score the current vs new parameters
  python scripts/backtest.py --fit    # re-fit the new parameters on 2016-2023

Needs: numpy (and scipy for --fit).
"""
import json
import math
import sys
from pathlib import Path

import numpy as np

DATA = json.loads((Path(__file__).resolve().parent.parent / "lib/data/all_years.json").read_text())["years"]

# Must match lib/predictor.ts
RECENT_PTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]
RECENT_WINDOW = 6
RECENT_DECAY = 0.6
FORM_ELO_PER_POINT = 2.0
FORM_ELO_CAP = 200

# (driver weight, temperature, team recent-form weight)
CURRENT = (0.3, 1.0, 0.0)
NEW = (0.346, 1.203, 0.232)  # fitted on 2016-2023 with --fit


def build_races():
    races = []
    for year, yd in DATA.items():
        team = {l["driverId"]: l["constructorId"] for l in yd["lineup"]}
        ids = list(yd["driver_elo_by_round"].keys())
        results = {int(r): order for r, order in yd["race_results"].items()}
        for rnd in sorted(results):
            idx = max(0, min(yd["n_rounds"], rnd - 1))
            elo = np.array([yd["driver_elo_by_round"][i][idx] for i in ids])
            tr = np.array([yd["team_rating_by_round"].get(team.get(i), [1500.0] * 99)[idx] for i in ids])
            pts = np.array([yd["driver_points_by_round"][i][idx] for i in ids])

            # in-season points vs teammate (same as getRatingSnapshot)
            tm = np.zeros(len(ids))
            for k, i in enumerate(ids):
                mates = [j for j, x in enumerate(ids) if x != i and team.get(x) == team.get(i)]
                if mates:
                    tm[k] = pts[k] - np.mean(pts[mates])

            # team recent form: decayed GP points over the last RECENT_WINDOW races before this one
            prev = [r for r in sorted(results) if r < rnd][-RECENT_WINDOW:]
            drv = {i: 0.0 for i in ids}
            wsum = 0.0
            for k, r in enumerate(reversed(prev)):
                w = RECENT_DECAY ** k
                wsum += w
                for pos, d in enumerate(results[r][:10]):
                    if d in drv:
                        drv[d] += w * RECENT_PTS[pos]
            if wsum:
                drv = {i: v / wsum for i, v in drv.items()}
            team_form = np.array(
                [np.mean([drv[x] for x in ids if team.get(x) == team.get(i)]) / 25 for i in ids]
            )

            order = [ids.index(d) for d in results[rnd] if d in ids]
            races.append(dict(year=int(year), round=rnd, elo=elo, tr=tr, tm=tm, tf=team_form, order=order, n=len(ids)))
    return races


def scores(race, params):
    wd, temp, wf = params
    adj = np.clip(race["tm"] * FORM_ELO_PER_POINT, -FORM_ELO_CAP, FORM_ELO_CAP)
    combined = wd * (race["elo"] + adj) + (1 - wd) * race["tr"]
    return combined * math.log(10) / 400 * temp + wf * race["tf"]


def evaluate(races, params):
    out = dict(win_logloss=0.0, winner_hit=0.0, podium=0.0, pl_nll=0.0, uniform=0.0)
    for race in races:
        s = scores(race, params)
        e = np.exp(s - s.max())
        p_win = e / e.sum()
        winner = race["order"][0]
        out["win_logloss"] += -math.log(p_win[winner])
        out["winner_hit"] += float(np.argmax(p_win) == winner)
        out["podium"] += len(set(np.argsort(-s)[:3]) & set(race["order"][:3])) / 3
        out["uniform"] += math.log(race["n"])
        remaining = e.copy()
        for d in race["order"]:
            out["pl_nll"] += -math.log(remaining[d] / remaining.sum())
            remaining[d] = 0
    return {k: v / len(races) for k, v in out.items()}


def fit(train):
    from scipy.optimize import minimize

    def objective(v):
        if not (0 <= v[0] <= 1 and v[1] > 0):
            return 1e9
        return evaluate(train, tuple(v))["pl_nll"]

    res = minimize(objective, NEW, method="Nelder-Mead", options=dict(maxiter=800))
    return tuple(round(float(x), 3) for x in res.x)


def main():
    races = [r for r in build_races() if r["year"] >= 2016]
    train = [r for r in races if r["year"] <= 2023]
    test = [r for r in races if r["year"] >= 2024]
    new = fit(train) if "--fit" in sys.argv else NEW
    print(f"races: {len(races)} (train {len(train)}, test {len(test)})")
    print(f"current params {CURRENT}  new params {new}\n")
    print(f"{'set':<10}{'model':<9}{'win LL':>8}{'uniform':>9}{'hit':>7}{'podium':>8}{'PL NLL':>8}")
    groups = [("train", train), ("test", test)] + [(str(y), [r for r in races if r["year"] == y]) for y in (2024, 2025, 2026)]
    for name, rs in groups:
        for label, p in (("current", CURRENT), ("new", new)):
            m = evaluate(rs, p)
            print(f"{name:<10}{label:<9}{m['win_logloss']:>8.3f}{m['uniform']:>9.3f}{m['winner_hit']:>7.1%}{m['podium']:>8.1%}{m['pl_nll']:>8.2f}")


if __name__ == "__main__":
    main()
