# F1 Pit Wall Telemetry Dashboard

A cyberpunk / pit-wall-telemetry-themed React dashboard (Next.js App Router + Tailwind + Framer Motion + Recharts) showing **real** F1 race predictions from two Plackett-Luce models and a Monte Carlo race simulator, built on actual 2015–2026 race data through the 2026 Azerbaijan GP. No random or mock numbers.

**Backtested honestly:** weights are fitted on 2016–2023, then every race from 2024 to Azerbaijan 2026 (63 races) is predicted blind, using only information available before lights out. On those races the race-day model put the eventual winner in its **top 3 picks 90.5%** of the time, and its favourite won **57.1%**. See [Backtest](#backtest), including the models that lost.

## Stack

| Package | Why |
|---|---|
| **Next.js 14 (App Router)** | React framework |
| **Tailwind CSS** | Utility styling, custom cyberpunk/telemetry theme tokens |
| **Framer Motion** | Entrance/hover micro-interactions, animated gauge, drawer expand |
| **Recharts** | Radar chart (head-to-head), line chart + Brush (points progression) |
| **Lucide React** | Icon set |
| **clsx** | Conditional className merging |

## Install & run

```bash
npm install
npm run dev      # http://localhost:3000
```

## The predictor

Two models, both **Plackett-Luce** (a driver's chance of beating everyone still in the race is proportional to exp(strength)), with strength a weighted sum of pre-race features:

| | Race-day model | Pre-qualifying model |
|---|---|---|
| Used for | Any race once qualifying is done (toggle on the podium card) | Races not yet qualified, and the season / title simulation |
| Features | Starting grid, pole, qualifying gap to pole, sprint result, team points / qualifying pace / places gained over the last 6 races, form vs teammate | Driver Elo, team Elo, plus the same this-season form features |
| Fitted on | Race winners, 2016–2023 | Whole finishing order, position *j* weighted 0.3^*j*, 2016–2023 |

- **Retirements** are modelled separately: each car retires with its team's DNF rate over its last ~30 starts (shrunk toward 12%), then the finishers are ordered by Plackett-Luce.
- **Simulation:** 6,000 races per view via the Gumbel-max trick (an exact Plackett-Luce sample). The Python backtest runs the identical process; the TypeScript and Python win probabilities agree to within simulation noise.
- **No look-ahead:** every feature for race *r* uses only races before *r*, plus that weekend's qualifying, grid and sprint. Title odds "as of round X" only use what was known after round X.
- **Pipeline:** `scripts/build_all_years.py` turns the Kaggle CSVs into `lib/data/all_years.json` (ratings, points, results and one model strength per driver per round). `scripts/f1model.py` holds the shared feature and model code.

### What's real vs. what's honestly still illustrative

- **Podium probabilities, confidence gauge, points progression** — fully real, computed from the model above.
- **"Actual result" comparison** on the podium panel — real, pulled from actual race results, shown whenever the selected round has already happened.
- **Head-to-head radar** — real signals only: car pace (team rating percentile), driver skill (Elo percentile), reliability (inverse DNF rate), recent points-per-race form, and combined model strength. The tyre-degradation/pit-strategy/overtake-probability axes from the original mock version were **removed** — the model has no real signal for those, so keeping them would just be more fake numbers dressed up nicely.
- **Circuit track outlines** — still stylized SVG shapes (hand-drawn for Monaco, Silverstone, Spa, Monza, Suzuka, Interlagos; generic fallback loop for the rest of the calendar). This is clearly a decorative/illustrative element in the UI — no prediction depends on it — but it's not real circuit geometry.
- **No track-specific modeling** — every circuit uses the same combined strength score. Monaco doesn't get a qualifying-pace bonus, Spa doesn't get a power-unit bonus, etc. This is a real limitation, not hidden anywhere — the Analytics drawer says it outright.

## Backtest

```bash
pip install numpy pandas scipy openpyxl
python scripts/backtest.py --xlsx docs/F1_Backtest.xlsx   # runs from the committed data/features.csv.gz
```

**Protocol.** Features and settings were chosen on *rolling validation* (each season 2018–2023 predicted by a model fit only on earlier seasons). Then the chosen models were fit once on 2016–2023 and scored on 2024–2026 (63 races, through Azerbaijan). Race-by-race results: [`docs/F1_Backtest.xlsx`](docs/F1_Backtest.xlsx).

**Model arena**: every candidate, including the losers:

| Model | Validation 2018–23: winner in top 3 | Val log-loss | **Test 2024–26: favourite wins** | **Winner in top 3** | **Podium** | **Test log-loss** |
|---|---|---|---|---|---|---|
| A. Grid only | 85.6% | 1.552 | 58.7% | 90.5% | 68.3% | 1.324 |
| B. Grid + quali gap + sprint | 86.4% | 1.497 | 55.6% | 88.9% | 67.2% | 1.419 |
| **C. Race-day (shipped)**: B + this-season form | 88.8% | 1.367 | **57.1%** | **90.5%** | **69.3%** | 1.360 |
| D. Race-day + Elo history | 90.4% | **1.184** | 46.0% | 87.3% | 64.0% | 1.443 |
| E. Pre-quali: this-season form only | 80.8% | 1.761 | 20.6% | 65.1% | 50.3% | 1.987 |
| **F. Pre-quali (shipped)**: form + Elo | 82.4% | 1.409 | 28.6% | 66.7% | 54.5% | 1.866 |

Uniform guessing scores a win log-loss of about 3.1. The previous dashboard model (no qualifying data) had a favourite-wins rate of 22% on the same seasons.

**What the arena shows:**
- **The starting grid is most of the signal.** No pre-race model here reliably beats "the grid only" on 2024–26. The shipped race-day model ties it (log-loss difference +0.04 ± 0.08) and beats it clearly on 2018–23.
- **Model D won validation and lost the test.** Elo history learned to trust dominant cars (Mercedes, then Red Bull). That broke when McLaren rose in 2024 and the 2026 rules reset the order, with D calling only 40% of 2026 winners against 67% for C. So the race-day model uses this-season form only.
- **Pre-qualifying prediction is genuinely hard.** With no grid, the favourite won 29% of held-out races, and only 20% in 2026, where Elo carried 2025's order into a reset year.
- **Tried and dropped** (they hurt rolling validation): green-flag race pace from lap times, a per-circuit grid-importance term, LightGBM LambdaRank (worse log-loss than the linear Plackett-Luce, since there are only ~170 training races).

**On "85% accuracy":** calling the exact winner tops out near 55–60% for any pre-race model in this era, because the pole-sitter alone wins about 57% of races. The honest 85%+ number is *winner among the model's top 3 picks*: 90.5% held out.

## Project structure

```
app/
  layout.tsx, globals.css, page.tsx
components/
  Dashboard.tsx        # orchestrator: year/round state, useMemo → buildRacePrediction()
  Header.tsx             # season + real GP-round selector, sound toggle, confidence gauge
  ConfidenceGauge.tsx
  PodiumPanel.tsx        # predicted podium, pre-quali / race-day toggle, grid slots, most likely winners
  HeadToHeadPanel.tsx     # Driver A vs B + Recharts radar, real Elo/rating-derived metrics
  CircuitMap.tsx          # stylized SVG track (decorative only)
  PointsProgression.tsx    # real cumulative points, dashed projection past the current round
  AnalyticsDrawer.tsx      # model description + held-out backtest table
lib/
  types.ts               # AllYearsData (real dataset shape) + RacePrediction (derived output)
  data/all_years.json      # per-round ratings, points, results and model strengths, 2015-2026
scripts/
  f1model.py               # features (Elo, form, qualifying), Plackett-Luce fit, simulation
  build_all_years.py       # Kaggle CSVs -> lib/data/all_years.json + data/features.csv.gz
  backtest.py, make_xlsx.py  # model arena + docs/F1_Backtest.xlsx
data/features.csv.gz       # pre-race feature table, so the backtest runs without the raw data
  predictor.ts             # the actual Monte Carlo engine
  f1Data.ts                # typed data loader + circuit shape matcher
  teamColors.ts             # real constructor name -> color, covers all historical teams
  useEngineSound.ts, utils.ts
```

## Regenerating the data

Data source: the Kaggle dataset [`jtrotman/formula-1-race-data`](https://www.kaggle.com/datasets/jtrotman/formula-1-race-data) (Ergast-format CSVs).

```bash
pip install kagglehub numpy pandas scipy
python -c "import kagglehub; print(kagglehub.dataset_download('jtrotman/formula-1-race-data'))"
python scripts/build_all_years.py --data <folder printed above>
```

Two source quirks the pipeline handles: from 2025 the dataset fills `position` for retired cars (classification is read from `positionText` instead), and two races have no starting grid (2025 Qatar, 2026 Azerbaijan), where qualifying position is used.

## Fonts

Loaded via a `<link>` tag in `app/layout.tsx` rather than `next/font/google`, so `next build` never depends on network access (useful for restricted CI/sandbox environments). See comment in `layout.tsx` for how to switch back if you don't need that.

## Sound effects

`lib/useEngineSound.ts` synthesizes short telemetry clicks/revs with the Web Audio API — no audio files shipped.

## Known limitations / next steps

- **Not modelled:** weather, practice pace, tyre strategy, safety cars, per-circuit effects. Practice long-run pace is the most promising missing signal, but it isn't in the dataset.
- **Pre-qualifying model is weak after regulation resets**, because Elo carries the old order forward. A better pre-season prior (e.g. testing pace) would help.
- **Forward test:** the remaining 2026 races (from round 16) are untouched by any fitting or model choice. Rebuild after each race and check them.
- **Mid-season team changes:** a driver who switched teams is shown with their latest team in that season.
- Circuit art is curated for 6 circuits; the rest use a generic shape. No 3D car or live telemetry.

## License

MIT.
