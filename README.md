# STS2 Card Trends

A dashboard tracking which Slay the Spire 2 cards are being discussed on [r/slaythespire](https://www.reddit.com/r/slaythespire/), updated daily.

**Live site:** _(deploy to GitHub Pages — see setup below)_

---

## How it works

1. **GitHub Actions** runs once daily, fetching the previous day's comments from [Arctic Shift](https://github.com/ArthurHeitmann/arctic_shift) — a community-maintained Reddit archive
2. Each comment is scanned for card name mentions using word-boundary regex
3. Daily counts are saved as `data/daily/YYYY-MM-DD.json`
4. `data/summary.json` is regenerated and the dashboard is redeployed to GitHub Pages

No Reddit API credentials are needed at any step.

---

## Setup

### 1. Enable GitHub Pages

In your repo → **Settings → Pages** → Source: **GitHub Actions**

The `deploy-dashboard.yml` workflow deploys automatically on every push to main.

### 2. Historical backfill

Run this once locally to populate data before the daily job takes over:

```bash
pip install -r scripts/requirements.txt

python scripts/backfill.py --start 2025-04-01 --end 2026-04-07
```

Use `--skip-existing` to resume a partial backfill without re-fetching completed days.

That's it. Once pushed, GitHub Actions handles everything automatically.

---

## Local development

```bash
# Install dependencies
pip install -r scripts/requirements.txt

# Fetch a specific day's data
python scripts/fetch_daily.py --date 2026-04-06

# Fetch yesterday (default)
python scripts/fetch_daily.py

# Regenerate summary.json from existing daily files
python scripts/merge_data.py

# Run tests
python scripts/test_mentions.py

# Preview the dashboard — run from repo root, not from dashboard/
python -m http.server 8080
# Open http://localhost:8080/dashboard/
```

---

## Card list

`data/cards.json` covers ~320 cards across all 5 characters plus colorless and curses.

Each card has a `match_strategy`:
- `exact_phrase` — multi-word names, e.g. "Perfected Strike"
- `exact_word` — single-word names, e.g. "Barricade"
- `skip` — too generic to track reliably, e.g. "Strike", "Defend"

When new cards are added to the game, either edit `data/cards.json` manually or run the wiki scraper:

```bash
python scripts/scrape_cards.py   # fetches from slaythespire.wiki.gg, merges with existing
```

---

## Project structure

```
sts-subreddit-stats/
├── .github/workflows/
│   ├── daily-scrape.yml        # Cron: fetch yesterday's data, commit to repo
│   └── deploy-dashboard.yml    # Deploy dashboard to GitHub Pages on push
├── scripts/
│   ├── requirements.txt        # requests (only dependency)
│   ├── count_mentions.py       # Card mention matching engine (shared)
│   ├── fetch_daily.py          # Fetches one day via Arctic Shift (default: yesterday)
│   ├── backfill.py             # Bulk historical backfill via Arctic Shift
│   ├── merge_data.py           # Regenerates data/summary.json from daily files
│   ├── scrape_cards.py         # One-time helper to update cards.json from wiki
│   └── test_mentions.py        # Tests for the matching engine
├── data/
│   ├── cards.json              # Card list with match strategies
│   ├── daily/                  # Per-day mention counts (YYYY-MM-DD.json)
│   └── summary.json            # Aggregated time series consumed by the dashboard
└── dashboard/
    ├── index.html
    ├── style.css               # STS2 dark theme
    └── app.js                  # Chart.js trend charts + leaderboard
```

---

## Methodology & caveats

- Mentions are matched using **word-boundary regex** (`\bCardName\b`), case-insensitive
- Since all data comes from r/slaythespire, context is game-focused — false positives are minimal
- "Strike" and "Defend" are skipped — shared across all characters and too generic
- Arctic Shift typically has a 1–2 day lag, so the daily job fetches yesterday rather than today
- On very active days (2000+ comments), the 20-page fetch cap may miss some comments
