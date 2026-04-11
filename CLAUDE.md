# CLAUDE.md — STS2 Card Trends

## Playwright visual verification (required for dashboard work)

Any time you make or consider changes to `dashboard/` files (`index.html`, `style.css`, `app.js`), you **must** use the Playwright MCP tools to verify visually. Do not report a task complete without doing this.

### Workflow

**Before making changes** — take a before screenshot so you can diff visually:
```
browser_navigate  →  https://danielovadia.github.io/sts-subreddit-stats/
browser_take_screenshot  (filename: .playwright-mcp/before-<slug>.png)
browser_console_messages  (level: error)   ← note any pre-existing errors
```

**After making changes** — verify the live site looks correct and no new errors appeared:
```
browser_navigate  →  https://danielovadia.github.io/sts-subreddit-stats/
browser_take_screenshot  (filename: .playwright-mcp/after-<slug>.png)
browser_console_messages  (level: error)   ← confirm no new errors vs before
```

The live site deploys automatically on push to master via GitHub Actions (`deploy-dashboard.yml`). Allow ~60 seconds for the deploy to complete before taking the after screenshot.

### Local preview (when you need to verify before pushing)

Spin up the local server from the repo root — **not** from `dashboard/`:
```bash
python -m http.server 8080
```
Then navigate to `http://localhost:8080/dashboard/`.

### What to look for in screenshots

- Header stats populate (`262 cards tracked`, `70000+ comments`, date range)
- "Sleeper of the Week" spotlight section shows a card name and % change
- Surging / Fading columns each have cards listed
- The chart canvas renders (not blank)
- All Cards browser grid has card tiles
- No layout breaks — dark dungeon theme intact, Cinzel font visible in the header
- Console errors: the `favicon.ico` 404 is pre-existing and harmless; flag anything else

### Known baseline state (as of 2026-04-11)

The live dashboard at the time this file was written:
- Shows **262 cards tracked**, **~70K comments analyzed**
- Has a working chart, Sleeper spotlight, and Surging/Fading panels
- One console error: `favicon.ico 404` — benign, pre-existing

---

## Project overview

| Layer | Detail |
|---|---|
| Pipeline | GitHub Actions → Arctic Shift API → `data/daily/YYYY-MM-DD.json` → `data/summary.json` |
| Dashboard | Pure static site, Chart.js, Cinzel/Crimson Pro fonts, STS2 dark theme |
| Live URL | https://danielovadia.github.io/sts-subreddit-stats/ |
| Local dev | `python -m http.server 8080` from repo root → `http://localhost:8080/dashboard/` |

**Key files:**
- `scripts/count_mentions.py` — core matching engine
- `data/cards.json` — 323 cards, 5 characters + colorless/curses, each with `match_strategy`
- `dashboard/app.js` — all frontend logic (Chart.js, filters, spotlight)
- `data/summary.json` — aggregated time series consumed by the dashboard
