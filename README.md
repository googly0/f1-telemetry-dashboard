# F1 Pit Wall Telemetry Dashboard

A cyberpunk / pit-wall-telemetry-themed React dashboard (Next.js App Router + Tailwind + Framer Motion + Recharts) visualizing **real** F1 race predictions — Elo driver ratings + team-strength ratings + a Monte Carlo (Plackett-Luce) race simulator, running on actual 2015–2026 race data. No random/mock numbers.

**Verified:** `npm run build` and `npm run start` both run clean — production build compiles, type-checks, and statically generates. Round 10 (Belgian GP) predictions were checked against the real 2026 result (Antonelli/Leclerc/Verstappen — correct).

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

## The real predictor (`lib/predictor.ts`)

Same model validated in the companion static dashboard:

1. **Driver skill rating** — long-run Elo across every classified finish since 2015, decayed so recent seasons count more.
2. **Team/car strength rating** — rebuilt mostly from that season's own results, since regulation changes reset who has the fastest car.
3. **Combined strength** = 30% driver Elo + 70% team rating — this is a hand-specified blend, not a trained model, and the Analytics drawer says so honestly rather than presenting it as ML "feature importance."
4. **Reliability** — each team's actual DNF rate over the last two seasons.
5. **Simulation** — race outcomes are sampled via the Gumbel-max trick, an exact way to draw from a Plackett-Luce ranking distribution, run 6,000 times per race to get real position probabilities.

`lib/data/all_years.json` holds the precomputed per-round rating snapshots (driver Elo, team rating, actual points, actual finishing order) for every season 2015–2026 — same pipeline as the sibling static-dashboard repo's `scripts/build_all_years.py`.

### What's real vs. what's honestly still illustrative

- **Podium probabilities, confidence gauge, points progression** — fully real, computed from the model above.
- **"Actual result" comparison** on the podium panel — real, pulled from actual race results, shown whenever the selected round has already happened.
- **Head-to-head radar** — real signals only: car pace (team rating percentile), driver skill (Elo percentile), reliability (inverse DNF rate), recent points-per-race form, and combined model strength. The tyre-degradation/pit-strategy/overtake-probability axes from the original mock version were **removed** — the model has no real signal for those, so keeping them would just be more fake numbers dressed up nicely.
- **Circuit track outlines** — still stylized SVG shapes (hand-drawn for Monaco, Silverstone, Spa, Monza, Suzuka, Interlagos; generic fallback loop for the rest of the calendar). This is clearly a decorative/illustrative element in the UI — no prediction depends on it — but it's not real circuit geometry.
- **No track-specific modeling** — every circuit uses the same combined strength score. Monaco doesn't get a qualifying-pace bonus, Spa doesn't get a power-unit bonus, etc. This is a real limitation, not hidden anywhere — the Analytics drawer says it outright.

### A finding worth knowing about

Because teammates share the same team-strength rating, the model differentiates them purely on long-run driver Elo — which means it currently favors **George Russell over Kimi Antonelli** for individual remaining 2026 races, even though Antonelli leads the championship. Antonelli's excellent rookie season hasn't had time to fully move his career-long Elo yet. This is a real, disclosed model limitation, not a bug.

## Project structure

```
app/
  layout.tsx, globals.css, page.tsx
components/
  Dashboard.tsx        # orchestrator: year/round state, useMemo → buildRacePrediction()
  Header.tsx             # season + real GP-round selector, sound toggle, confidence gauge
  ConfidenceGauge.tsx
  PodiumPanel.tsx        # real predicted P1/P2/P3 + actual result comparison for past rounds
  HeadToHeadPanel.tsx     # Driver A vs B + Recharts radar, real Elo/rating-derived metrics
  CircuitMap.tsx          # stylized SVG track (decorative only)
  PointsProgression.tsx    # real cumulative points, dashed projection past the current round
  AnalyticsDrawer.tsx      # honest documentation of the real model's weighting
lib/
  types.ts               # AllYearsData (real dataset shape) + RacePrediction (derived output)
  data/all_years.json      # real per-round rating snapshots, 2015-2026 (~190KB)
  predictor.ts             # the actual Monte Carlo engine
  f1Data.ts                # typed data loader + circuit shape matcher
  teamColors.ts             # real constructor name -> color, covers all historical teams
  useEngineSound.ts, utils.ts
```

## Regenerating the data

`lib/data/all_years.json` comes from the same pipeline as the companion static-dashboard repo. To refresh it with newer race results, update the raw Ergast-format CSVs and rerun `scripts/build_all_years.py` there, then copy the output here:

```bash
cp path/to/other-repo/data/all_years.json lib/data/all_years.json
```

## Fonts

Loaded via a `<link>` tag in `app/layout.tsx` rather than `next/font/google`, so `next build` never depends on network access (useful for restricted CI/sandbox environments). See comment in `layout.tsx` for how to switch back if you don't need that.

## Sound effects

`lib/useEngineSound.ts` synthesizes short telemetry clicks/revs with the Web Audio API — no audio files shipped.

## Known limitations / next steps

- **No track-specific modeling** (see above) — the natural next step if you want to push accuracy further.
- **No 3D car model** or **WebSocket live telemetry** — both flagged as stretch goals in the original spec, not built here; `PodiumPanel.tsx` and `Dashboard.tsx` are the natural mounting points respectively.
- Circuit list has curated art for 6 circuits; the rest of the real calendar uses a generic fallback shape — trivial to extend in `lib/f1Data.ts`.
- Accessibility pass not done — elements are native HTML (keyboard-accessible by default) but contrast/ARIA labeling hasn't been audited.

## License

MIT.
