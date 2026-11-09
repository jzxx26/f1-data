<h1 align="center">🏁 Apex F1 Live</h1>

A production-ready Formula 1 telemetry dashboard built with **Next.js 15**, **React Query**, **Recharts**, and the **OpenF1 API**. Track live race pace, monitor tyre strategy, and deep-dive into historical telemetry with a modern, responsive dark UI.

## ✨ Features

- **Live Dashboard** – Real-time speed traces, leaderboard, tyre compounds, and animated nav powered by React Query polling.
- **Race Archive** – Search past meetings by year, circuit, or driver and compare two drivers’ telemetry with stint summaries.
- **Responsive & Touch-Friendly** – Fluid layouts, hover/tap tooltips, and auto-resizing charts across mobile, tablet, and desktop.
- **Accessible Dark Mode** – High-contrast palette, focus outlines, and semantic markup for keyboard navigation.
- **Robust Data Layer** – OpenF1 REST data with automatic FastF1 fallback, caching, and configurable refetch intervals.
- **Unit Tested Components** – Critical UI primitives covered with Jest + React Testing Library.

## 🚀 Getting Started

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) to access the dashboard. You’ll be redirected to `/live`; the archive view is available at `/archive`.

## 🧪 Testing

Run the Jest suite (includes DOM environment, React Query providers, and component tests):

```bash
npm test
```

## 🛠️ Tech Stack

- **Framework**: Next.js 15 (App Router, Server Components where possible)
- **Language**: TypeScript (strict mode)
- **State/Data**: @tanstack/react-query, SWR-like caching, suspense-ready hooks
- **Charts**: Recharts for responsive telemetry visualisations
- **Animation**: Framer Motion for transitions and interactive navigation
- **Styling**: Tailwind (via `@tailwindcss/postcss`) + handcrafted dark theme
- **Testing**: Jest, React Testing Library, `@testing-library/jest-dom`

## 📦 Project Structure

```
src/
	app/          # App Router pages (live + archive)
	components/   # UI primitives and feature modules
	hooks/        # Data-fetching and domain hooks
	lib/          # API clients, utility helpers, colour maps
```

## 📡 Data Notes

- OpenF1 endpoints are polled every few seconds; historical endpoints revalidate manually.
- The telemetry layer gracefully falls back to a FastF1-compatible mirror when OpenF1 is unavailable.
- Speed traces default to the latest race session if live data is not streaming.

## 📄 License

This repository is for demo purposes. Data supplied by [OpenF1](https://openf1.org); all trademarks belong to their respective owners.

## 📡 Live timing (local only)

The **Live** page (`/live`) shows the timing tower, tyres, car telemetry, a track map, race control
and a pit **Strategy** card while a session is on air. The backend holds one connection to F1's
SignalR Core live timing hub; the browser only polls your backend, never F1.

**Run it on your own machine.** Live is off unless `F1_LIVE_ENABLED=1`, and the backend should
listen only on localhost (uvicorn's default), so nothing else can use your F1TV access.

```bash
cd backend
uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r requirements-dev.txt
cat > .env <<'ENV'
F1_LIVE_ENABLED=1
F1TV_SUBSCRIPTION_TOKEN=<your F1TV token or login-session cookie value>
ENV
.venv/bin/python -m uvicorn main:app --port 8000
```

Then `npm run dev` and open `http://localhost:3000/live`. Press **Go live** during a session.

- **F1TV token.** Car telemetry (`CarData.z`) and positions (`Position.z`) need it; timing, tyres,
  race control and pit times do not. It stays in `backend/.env` (git-ignored), is sent
  only to F1 as a Bearer header and is never returned by the API. The page shows when it expires;
  the token lasts a few days, so renew it before a race weekend.
- **Local only.** `/live` answers only on localhost and only to your frontend's origin (`http://localhost:3000` by default; set `F1_LIVE_ALLOWED_ORIGINS` for another port), since the API allows any origin for the archive endpoints.
- **Replay.** "Replay São Paulo 2026" streams a recording of that race (laps 38–57, timing only:
  it was recorded without a token) through the same ingest path at 1–60x, for trying the page
  between sessions.
- **Strategy card.** Where the focused car would rejoin if it pitted now, from the live order:
  lapped cars placed by chaining intervals, cars in the pit lane or with no gap give a position
  range rather than a guess, safety car / VSC / red flag are reported as unsupported. It adds an
  **estimated net pit loss** that you set: the pit lane time minus the time the same stretch takes
  on track. The feed does not report net loss, so it is an assumption (20 s is a generic starting
  point, not a figure for the circuit). The race's observed pit lane times are shown for reference
  only. Margins to the next place and ±2 s scenarios come from the same calculation.
- **Net pit loss from past races.** Next to the slider, the card shows the net loss measured at
  this circuit in the three seasons before (in-lap + out-lap minus two of the driver's normal
  green-flag laps; stops under SC/VSC/yellow left out), with the middle half of the stops and a
  **Use** button. Las Vegas 2023–2025: 22.4 s (21.5–24.4, 69 stops). The first lookup for a
  circuit loads three races (a few seconds with the cache, longer without); the answer is kept in
  `backend/cache/circuit_pit_loss.json`. It needs the F1TV token too (the archive needs it).

- **Race pace panel.** One least-squares model over the race's clean laps (green all lap, no stop,
  not lap 1, over 1.5 s behind the car ahead): lap time = driver pace + compound offset + wear per
  lap of tyre age + fuel effect per lap. It ranks drivers by underlying pace (free of tyre age,
  compound and fuel), shows wear per compound, and marks cars whose last laps run quicker or
  slower than the model expects. The fuel effect is measured, not assumed; it is shown only once
  stops make it separable from wear (until then wear includes it). Checked on Las Vegas 2024/2025
  and São Paulo 2025: fuel 0.03–0.08 s/lap, pace order close to the result.

- **One-screen dashboard.** `/live` is a grid that always fits the window: timing tower, pit rejoin,
  driver focus, telemetry, track map, gap chart, tyre stints, race control and weather. Press
  **Edit** to add, remove, drag and resize panels (locked otherwise, so a stray click mid-race moves
  nothing), pick a preset (Race, Strategy, Driver focus) or save your own; layouts are kept in the
  browser. Pick the focused driver in the top bar or by clicking the tower.
- **Recordings.** Go live records every session to `backend/recordings/<session>/` (git-ignored;
  `F1_LIVE_AUTORECORD=0` turns it off). A race with car data is a few hundred MB. Any recording
  can be replayed from the top bar, with pause, speed and jump-to-lap.
- **Archive and your token.** F1's timing archive now needs the F1TV token too: the backend hands
  it to FastF1 at startup, so archive sessions not already cached load only while it is valid.

Backend tests: `cd backend && .venv/bin/python -m pytest tests`.

The feed client, state merging, parsers and strategy maths in `backend/live/` are adapted from
[F1-Telemetry-Dashboard](https://github.com/mricero/F1-Telemetry-Dashboard) (MIT, see
`backend/live/LICENSE-F1-Telemetry-Dashboard`).
