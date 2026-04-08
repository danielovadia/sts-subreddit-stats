"""
Daily comment fetcher using Arctic Shift API.

Fetches yesterday's (UTC) comments from /r/slaythespire via Arctic Shift,
counts card mentions, and writes/merges data/daily/YYYY-MM-DD.json.

No Reddit credentials needed — Arctic Shift is a public archive.

Run via GitHub Actions cron (once daily) or locally:
    python scripts/fetch_daily.py
    python scripts/fetch_daily.py --date 2026-04-07   # specific date
"""

import argparse
import json
import sys
import time
from datetime import date, datetime, timedelta, timezone
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
MAX_PAGES       = 20
RATE_LIMIT_SLEEP = 1.5

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "sts2-card-tracker/1.0 (daily fetch; read-only)"})


def fetch_comments_for_day(day: date) -> list:
    after_str  = day.isoformat()
    before_str = (day + timedelta(days=1)).isoformat()

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
            print(f"  API error on page {page}: {e}")
            break

        comments = data.get("data", [])
        if not isinstance(comments, list) or not comments:
            break

        all_comments.extend(comments)
        print(f"\r  page {page}: {len(all_comments)} comments...", end="", flush=True)

        if len(comments) < PAGE_SIZE:
            break

        last_ts = comments[-1].get("created_utc", 0)
        if isinstance(last_ts, str):
            last_ts = int(last_ts)
        after_cursor = datetime.fromtimestamp(last_ts + 1, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")

        time.sleep(RATE_LIMIT_SLEEP)

    if all_comments:
        print()  # newline after \r progress
    return all_comments


def load_existing_day(day_file: Path) -> dict:
    if day_file.exists():
        with open(day_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def merge_counts(existing: dict, new_mentions: dict, new_count: int):
    merged = dict(existing.get("mentions", {}))
    for card_id, count in new_mentions.items():
        merged[card_id] = max(merged.get(card_id, 0), count)
    return merged, max(existing.get("total_comments", 0), new_count)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", help="Date to fetch (YYYY-MM-DD). Defaults to yesterday UTC.")
    args = parser.parse_args()

    if args.date:
        target = date.fromisoformat(args.date)
    else:
        target = datetime.now(timezone.utc).date() - timedelta(days=1)

    print(f"Fetching comments for {target} via Arctic Shift...")

    cards    = load_cards()
    matchers = build_matchers(cards)
    print(f"Loaded {len(matchers)} card matchers")

    raw = fetch_comments_for_day(target)
    print(f"Retrieved {len(raw)} comments")

    daily_mentions: dict = {}
    for c in raw:
        body = c.get("body", "")
        if not body or body in ("[deleted]", "[removed]"):
            continue
        for card_id, count in count_mentions(body, matchers).items():
            daily_mentions[card_id] = daily_mentions.get(card_id, 0) + count

    print(f"Found mentions for {len(daily_mentions)} distinct cards")

    day_file = DAILY_DIR / f"{target.isoformat()}.json"
    existing = load_existing_day(day_file)
    merged_mentions, merged_total = merge_counts(existing, daily_mentions, len(raw))

    DAILY_DIR.mkdir(parents=True, exist_ok=True)
    with open(day_file, "w", encoding="utf-8") as f:
        json.dump({
            "date": target.isoformat(),
            "total_comments": merged_total,
            "mentions": merged_mentions,
        }, f, indent=2, sort_keys=True)
    print(f"Written: {day_file}")

    print("Regenerating summary.json...")
    regenerate_summary()
    print("Done.")


if __name__ == "__main__":
    main()
