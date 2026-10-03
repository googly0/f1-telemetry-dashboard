"""Build lib/data/all_years.json for the dashboard from the Kaggle F1 dataset.

    pip install kagglehub numpy pandas scipy
    python -c "import kagglehub; print(kagglehub.dataset_download('jtrotman/formula-1-race-data'))"
    python scripts/build_all_years.py --data <path printed above>

Per season it writes the schema the dashboard already used (ratings, points, results by
round) plus the model outputs the simulator needs:
  pre_utility_by_round   driverId -> [Plackett-Luce strength per round, pre-qualifying model]
  post_utility_by_round  driverId -> [strength per round, race-day model; null until qualifying]
  grid_by_round          driverId -> [starting grid per round; null until qualifying]
  dnf_rate_by_round      constructorId -> [team retirement probability entering each round]
Utilities and DNF rates are computed only from information available before that race.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import f1model as m  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
FIRST_OUTPUT_YEAR = 2015
GP_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]


def sprint_points(year):
    if year == 2021:
        return [3, 2, 1]
    return [8, 7, 6, 5, 4, 3, 2, 1] if year >= 2022 else None


def fastest_lap_bonus(year):
    return 2019 <= year <= 2024


def r4(x):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), 4)


def standings_by_round(path, id_col, races_year, ids, n_rounds, data_through):
    st = pd.read_csv(path, na_values=m.NA)
    st = st.merge(races_year[["raceId", "round"]], on="raceId")
    out = {}
    for i in ids:
        s = st[st[id_col] == i].set_index("round").points
        arr, last = [0.0], 0.0
        for r in range(1, n_rounds + 1):
            if r <= data_through and r in s.index:
                last = float(s.loc[r])
            arr.append(last)
        out[str(i)] = arr
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="folder with the Kaggle CSVs (races.csv, results.csv, ...)")
    ap.add_argument("--out", default=str(ROOT / "lib/data/all_years.json"))
    ap.add_argument("--features-out", default=str(ROOT / "data/features.csv.gz"))
    args = ap.parse_args()
    d = args.data.rstrip("/") + "/"

    df, _ = m.load(args.data, first_year=2010)
    races_all = pd.read_csv(d + "races.csv", na_values=m.NA)
    sprint_rids = set(pd.read_csv(d + "sprint_results.csv", na_values=m.NA).raceId)
    drivers = pd.read_csv(d + "drivers.csv", na_values=m.NA).set_index("driverId")
    constructors = pd.read_csv(d + "constructors.csv", na_values=m.NA).set_index("constructorId")

    # Walk every race once; record Elo state after each round (round 0 = pre-season).
    snaps = {}

    def hook(fb, yr, rnd):
        snaps[(yr, rnd)] = (dict(fb.elo_d), dict(fb.elo_t))

    F, fb = m.build_features(df, snapshot_hook=hook)
    F = m.transform(F)
    betas = m.fit_models(F[F.year >= 2016])

    # Pre-qualifying features for the NEXT race of the latest season, from the latest state.
    last_year = int(df.year.max())
    last_rid = df[df.year == last_year].sort_values("round").raceId.iloc[-1]
    last_race = df[df.raceId == last_rid]
    nxt = pd.DataFrame(fb.pre_race(last_year, list(zip(last_race.driverId, last_race.constructorId))))
    nxt = nxt.assign(raceId=-1, year=last_year, round=-1, grid=np.nan, qpos=np.nan, qgap=np.nan,
                     sprint_pos=np.nan, pos=np.nan, classified=False)
    nxt = m.transform(nxt)

    def util(frame, name):
        cols = m.RACE_DAY if name == "race_day" else m.PRE_QUALI
        return frame[cols].values @ betas[name]

    F["u_pre"] = util(F, "pre_quali")
    F["u_post"] = util(F, "race_day")
    nxt["u_pre"] = util(nxt, "pre_quali")

    years = {}
    for yr in range(FIRST_OUTPUT_YEAR, last_year + 1):
        ry = races_all[races_all.year == yr].sort_values("round")
        n_rounds = len(ry)
        dy = df[df.year == yr]
        data_through = int(dy["round"].max()) if len(dy) else 0
        rounds = [dict(round=int(r.round), name=r.name, date=str(r.date),
                       sprint=bool(r.raceId in sprint_rids or isinstance(r.sprint_date, str)))
                  for r in ry.itertuples(index=False)]
        last_team = dy.sort_values("round").groupby("driverId").constructorId.last()
        drv_ids = list(last_team.index)
        team_ids = sorted(set(dy.constructorId))

        def rating_arrays(which, ids, new):
            out = {}
            for i in ids:
                arr = []
                for r in range(0, n_rounds + 1):
                    rr = min(r, data_through)
                    state = snaps.get((yr, rr), ({}, {}))[which]
                    arr.append(round(state.get(i, new), 1))
                out[str(i)] = arr
            return out

        Fy = F[F.year == yr]
        def per_round(col, key="driverId", ids=None, future=None):
            out = {}
            for i in (ids if ids is not None else drv_ids):
                s = Fy[Fy[key] == i].drop_duplicates("round").set_index("round")[col]
                arr = []
                for r in range(1, n_rounds + 1):
                    if r <= data_through:
                        arr.append(r4(s.get(r, np.nan)))
                    else:
                        arr.append(r4(future.get(i, np.nan)) if future is not None else None)
                out[str(i)] = arr
            return out

        is_last = yr == last_year and data_through < n_rounds
        fut_pre = dict(zip(nxt.driverId, nxt.u_pre)) if is_last else None
        fut_dnf = dict(zip(nxt.constructorId, nxt.dnf_rate)) if is_last else None
        has_quali = set(dy[dy.qpos.notna() | dy.grid.notna()]["round"])
        post = per_round("u_post")
        grid = per_round("grid")
        for i in post:
            for r in range(1, n_rounds + 1):
                if r not in has_quali:
                    post[i][r - 1] = None; grid[i][r - 1] = None
            grid[i] = [None if g is None else int(g) for g in grid[i]]

        dnf_by_round = per_round("dnf_rate", key="constructorId", ids=team_ids, future=fut_dnf)
        latest_dnf = {}
        for t, arr in dnf_by_round.items():
            vals = [v for v in arr if v is not None]
            latest_dnf[t] = vals[-1] if vals else 0.12

        res_by_round = {}
        for r, g in dy.groupby("round"):
            res_by_round[str(int(r))] = [str(x) for x in g.sort_values("positionOrder").driverId.iloc[:10]]

        dpts = standings_by_round(d + "driver_standings.csv", "driverId", ry, drv_ids, n_rounds, data_through)
        tpts = standings_by_round(d + "constructor_standings.csv", "constructorId", ry, team_ids, n_rounds, data_through)
        complete = data_through == n_rounds
        final = dict(champion_driver=None, champion_team=None, champion_driver_name=None, champion_team_name=None)
        names_d = {str(i): f"{drivers.loc[i, 'forename']} {drivers.loc[i, 'surname']}" for i in drv_ids}
        names_c = {str(i): constructors.loc[i, "name"] for i in team_ids}
        if complete:
            cd = max(dpts, key=lambda k: dpts[k][-1]); ct = max(tpts, key=lambda k: tpts[k][-1])
            final = dict(champion_driver=cd, champion_team=ct, champion_driver_name=names_d[cd],
                         champion_team_name=names_c[ct])

        years[str(yr)] = dict(
            rounds=rounds, gp_points=GP_POINTS, sprint_points=sprint_points(yr),
            fastest_lap_bonus=fastest_lap_bonus(yr),
            lineup=[dict(driverId=str(i), constructorId=str(t)) for i, t in last_team.items()],
            driver_elo_by_round=rating_arrays(0, drv_ids, m.ELO["new_drv"]),
            team_rating_by_round=rating_arrays(1, team_ids, m.ELO["new_team"]),
            driver_points_by_round=dpts, team_points_by_round=tpts,
            dnf_rate=latest_dnf, dnf_rate_by_round=dnf_by_round,
            race_results=res_by_round,
            pre_utility_by_round=per_round("u_pre", future=fut_pre),
            post_utility_by_round=post, grid_by_round=grid,
            names=dict(drivers=names_d, constructors=names_c),
            final_actual=final, n_rounds=n_rounds, data_through=data_through, season_complete=complete,
        )

    # Held-out backtest numbers shown in the dashboard (same code as scripts/backtest.py).
    test = F[F.year >= 2024]
    bt = {}
    for name, cols in (("race_day", m.RACE_DAY), ("pre_quali", m.PRE_QUALI)):
        e = m.evaluate(m.races_from(test, cols), betas[name])
        bt[name] = {k: round(float(e[k].mean()), 3) for k in ("hit", "top3", "podium", "ll")}
    grid_cols = ["x_grid", "x_pole"]  # baseline: starting grid only
    tr = F[(F.year >= m.TRAIN_YEARS[0]) & (F.year <= m.TRAIN_YEARS[1])]
    gb = m.fit(m.races_from(tr, grid_cols), 2, **m.FIT["race_day"])
    e = m.evaluate(m.races_from(test, grid_cols), gb)
    bt["grid_only"] = {k: round(float(e[k].mean()), 3) for k in ("hit", "top3", "podium", "ll")}
    bt["races"] = int(test.raceId.nunique())
    model = dict(
        trained_on=f"{m.TRAIN_YEARS[0]}-{m.TRAIN_YEARS[1]}", tested_on=f"2024-{last_year}",
        data_through=f"{last_year} round {int(df[df.year == last_year]['round'].max())}",
        built=str(date.today()),
        race_day=dict(features=m.RACE_DAY, weights=[round(float(b), 4) for b in betas["race_day"]]),
        pre_quali=dict(features=m.PRE_QUALI, weights=[round(float(b), 4) for b in betas["pre_quali"]]),
        backtest=bt,
    )
    Path(args.out).write_text(json.dumps(dict(years=years, model=model), separators=(",", ":")))
    keep = ["raceId", "year", "round", "driverId", "constructorId", "elo_d", "elo_t", "team_form",
            "team_qgap_recent", "team_gain_recent", "tm_delta", "dnf_rate", "grid", "qpos", "qgap",
            "sprint_pos", "pos", "classified"]
    Path(args.features_out).parent.mkdir(parents=True, exist_ok=True)
    F[F.year >= 2016][keep].to_csv(args.features_out, index=False, float_format="%.5g")
    print(f"wrote {args.out} ({Path(args.out).stat().st_size // 1024} KB) and {args.features_out}")
    print("held-out backtest:", json.dumps(bt))


if __name__ == "__main__":
    main()
