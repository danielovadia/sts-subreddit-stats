"""
Historical backfill using the Arctic Shift API.

Fetches all /r/slaythespire comments for a given date range and writes
daily JSON files. Run once locally after setting up the repo.

Usage:
    python scripts/backfill.py --start 2025-04-01 --end 2026-04-07
    python scripts/backfill.py --start 2025-04-01 --end 2026-04-07 --dry-run
    python scripts/backfill.py --start 2025-04-01 --end 2026-04-07 --skip-existing

Arctic Shift API reference:
    https://github.com/ArthurHeitmann/arctic_shift/blob/master/api/README.md
    Base URL: https://arctic-shift.photon-reddit.com/api
    Endpoint: /comments/search
    Key params:
      subreddit  - community name
      after      - ISO date string, e.g. "2026-03-05"
      before     - ISO date string, e.g. "2026-03-06"
      limit      - int 1-100, or "auto" (returns 100-1000)
      sort       - "asc" or "desc" (sorts by created_utc)
"""

import argparse
import json
import sys
import time
from datetime import date, timedelta
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).parent))
from count_mentions import load_cards, build_matchers, count_mentions
from merge_data import regenerate_summary

REPO_ROOT       = Path(__file__).parent.parent
DAILY_DIR       = REPO_ROOT / "data" / "daily"
SEARCH_ENDPOINT = "https://arctic-shift.photon-reddit.com/api/comments/search"
SUBREDDIT       = "slaythespire"
PAGE_SIZE       = 100
MAX_PAGES       = 20    # safety cap (= 2000 comments/day max)
RATE_LIMIT_SLEEP = 1.5  # seconds between requests (be polite)

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "sts2-card-tracker/1.0 (backfill; read-only)"})


def fetch_comments_for_day(day: date) -> list:
    """Fetch all comments for a single UTC day from Arctic Shift."""
    # after/before are ISO date strings (not timestamps)
    after_str  = day.isoformat()               # e.g. "2026-03-05"
    before_str = (day + timedelta(days=1)).isoformat()  # e.g. "2026-03-06"

    all_comments = []
    after_cursor = after_str
    page = 0

    while page < MAX_PAGES:
        page += 1
        params = {
            "subreddit": SUBREDDIT,
            "after":     after_cursor,
            "before":    before_str,
            "limit":     PAGE_SIZE,
            "sort":      "asc",
        }

        try:
            resp = SESSION.get(SEARCH_ENDPOINT, params=params, timeout=(10, 30))
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as e:
            print(f"\n    API error on page {page}: {e} — stopping here")
            break

        comments = data.get("data", [])
        if not isinstance(comments, list):
            print(f"\n    Unexpected response: {str(data)[:120]}")
            break

        if not comments:
            break

        all_comments.extend(comments)
        print(f"\r    page {page}: {len(all_comments)} comments so far...", end="", flush=True)

        if len(comments) < PAGE_SIZE:
            break  # last page

        # Advance cursor past the last comment (+1s to avoid re-fetching it)
        from datetime import datetime, timezone
        last_ts = comments[-1].get("created_utc", 0)
        if isinstance(last_ts, str):
            last_ts = int(last_ts)
        after_cursor = datetime.fromtimestamp(last_ts + 1, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")

        time.sleep(RATE_LIMIT_SLEEP)

    return all_comments


def process_day(day: date, matchers, dry_run: bool = False) -> dict:
    comments = fetch_comments_for_day(day)
    daily_mentions: dict = {}

    for comment in comments:
        body = comment.get("body", "")
        if not body or body in ("[deleted]", "[removed]"):
            continue
        for card_id, count in count_mentions(body, matchers).items():
            daily_mentions[card_id] = daily_mentions.get(card_id, 0) + count

    result = {
        "date": day.isoformat(),
        "total_comments": len(comments),
        "mentions": daily_mentions,
    }

    if not dry_run:
        day_file = DAILY_DIR / f"{day.isoformat()}.json"
        with open(day_file, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, sort_keys=True)

    return result


def main():
    parser = argparse.ArgumentParser(description="Backfill historical Reddit comment data via Arctic Shift")
    parser.add_argument("--start",          required=True, help="Start date YYYY-MM-DD (inclusive)")
    parser.add_argument("--end",            required=True, help="End date YYYY-MM-DD (inclusive)")
    parser.add_argument("--dry-run",        action="store_true", help="Don't write files, just print counts")
    parser.add_argument("--skip-existing",  action="store_true", help="Skip days that already have a data file")
    args = parser.parse_args()

    start = date.fromisoformat(args.start)
    end   = date.fromisoformat(args.end)

    if start > end:
        print("Error: --start must be before --end")
        sys.exit(1)

    print(f"Backfilling {start} → {end} ({'DRY RUN' if args.dry_run else 'writing files'})")
    print(f"Endpoint: {SEARCH_ENDPOINT}\n")

    cards    = load_cards()
    matchers = build_matchers(cards)
    print(f"Loaded {len(matchers)} card matchers\n")

    DAILY_DIR.mkdir(parents=True, exist_ok=True)

    current   = start
    total_days = (end - start).days + 1
    day_num   = 0

    while current <= end:
        day_num += 1
        day_file = DAILY_DIR / f"{current.isoformat()}.json"

        if args.skip_existing and day_file.exists():
            print(f"  [{day_num}/{total_days}] {current} — skipped (file exists)")
            current += timedelta(days=1)
            continue

        print(f"  [{day_num}/{total_days}] {current} ...", flush=True)
        result = process_day(current, matchers, dry_run=args.dry_run)
        total_m = sum(result["mentions"].values())
        print(f"\r  [{day_num}/{total_days}] {current} — {result['total_comments']} comments, {total_m} mentions across {len(result['mentions'])} cards")

        current += timedelta(days=1)
        time.sleep(RATE_LIMIT_SLEEP)

    if not args.dry_run:
        print("\nRegenerating summary.json...")
        regenerate_summary()

    print("\nBackfill complete.")


if __name__ == "__main__":
    main()
