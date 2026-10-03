"""Model arena + held-out backtest for the F1 predictor.

    python scripts/backtest.py                       # uses data/features.csv.gz (committed)
    python scripts/backtest.py --data <kaggle dir>   # rebuild features from the raw CSVs first
    python scripts/backtest.py --xlsx docs/F1_Backtest.xlsx

Protocol
  * Validation: rolling origin - for each season 2018-2023, fit on every earlier season
    (from 2016) and predict that season. Used to choose features and settings.
  * Test: fit once on 2016-2023, predict 2024-2026 (through the latest race). Reported once.
Every prediction uses only information available before lights out: ratings and form from
earlier races, plus that weekend's qualifying, starting grid and sprint.

Metrics (win probabilities from the same retire-then-Plackett-Luce simulation the dashboard runs)
  hit     the model's favourite won
  top3    the winner was one of the model's three most likely winners
  podium  share of the dashboard's predicted podium (greedy P1->P2->P3) that finished on the podium
  ll      win log-loss, -ln P(actual winner); lower is better
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import f1model as m  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
FEATURES = ROOT / "data/features.csv.gz"

RACE_DAY_FIT = m.FIT["race_day"]
PRE_FIT = m.FIT["pre_quali"]
ARENA = [
    ("A", "Grid only", ["x_grid", "x_pole"], RACE_DAY_FIT),
    ("B", "Weekend: grid + quali gap + sprint", ["x_grid", "x_pole", "x_qgap", "x_sprint"], RACE_DAY_FIT),
    ("C", "Race-day (shipped): weekend + this-season form", m.RACE_DAY, RACE_DAY_FIT),
    ("D", "Race-day + Elo history", ["x_grid", "x_qgap", "x_sprint", "x_elo_d", "x_elo_t", "x_team_gain", "x_tm"], RACE_DAY_FIT),
    ("E", "Pre-quali: this-season form only", ["x_team_form", "x_team_qgap", "x_team_gain", "x_tm"], PRE_FIT),
    ("F", "Pre-quali (shipped): form + Elo", m.PRE_QUALI, PRE_FIT),
]


def load_features(data_dir=None):
    if data_dir:
        df, _ = m.load(data_dir, first_year=2010)
        F, _ = m.build_features(df)
    else:
        F = pd.read_csv(FEATURES)
    F["classified"] = F["classified"].astype(bool)
    return m.transform(F[F.year >= 2016])


def run_arena(F):
    rows, per_race = [], {}
    a, b = m.TRAIN_YEARS
    train, test = F[(F.year >= a) & (F.year <= b)], F[F.year > b]
    for key, name, cols, fit_kw in ARENA:
        val = pd.concat([
            m.evaluate(m.races_from(F[F.year == y], cols), m.fit(m.races_from(F[F.year < y], cols), len(cols), **fit_kw), n=20000)
            for y in range(2018, b + 1)])
        beta = m.fit(m.races_from(train, cols), len(cols), **fit_kw)
        t = m.evaluate(m.races_from(test, cols), beta)
        per_race[key] = dict(beta=beta, cols=cols, test=t,
                             train=m.evaluate(m.races_from(train, cols), beta))
        rows.append(dict(key=key, model=name, val_hit=val.hit.mean(), val_top3=val.top3.mean(), val_ll=val.ll.mean(),
                         test_hit=t.hit.mean(), test_top3=t.top3.mean(), test_podium=t.podium.mean(), test_ll=t.ll.mean()))
    return pd.DataFrame(rows), per_race


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", help="Kaggle CSV folder; rebuild features instead of using data/features.csv.gz")
    ap.add_argument("--xlsx", help="also write the race-by-race workbook here")
    args = ap.parse_args()
    F = load_features(args.data)
    board, per_race = run_arena(F)
    n_test = F[F.year > m.TRAIN_YEARS[1]].raceId.nunique()
    print(f"Validation: rolling 2018-{m.TRAIN_YEARS[1]}   Test: fit {m.TRAIN_YEARS[0]}-{m.TRAIN_YEARS[1]}, "
          f"predict {m.TRAIN_YEARS[1] + 1}-{int(F.year.max())} ({n_test} races)\n")
    show = board.copy()
    for c in show.columns:
        if c.endswith(("hit", "top3", "podium")):
            show[c] = (show[c] * 100).map("{:.1f}%".format)
        elif c.endswith("ll"):
            show[c] = show[c].map("{:.3f}".format)
    print(show.to_string(index=False))
    for key in ("C", "F"):
        t = per_race[key]["test"]
        print(f"\n{key} by test season:")
        print(t.groupby("year")[["hit", "top3", "podium", "ll"]].mean().round(3).to_string())
    if args.xlsx:
        import make_xlsx
        make_xlsx.write(args.xlsx, F, board, per_race)
        print(f"\nwrote {args.xlsx}")


if __name__ == "__main__":
    main()
