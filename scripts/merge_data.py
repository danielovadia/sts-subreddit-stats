"""
Generates data/summary.json by reading all data/daily/*.json files.

The summary is consumed directly by the dashboard frontend.
Run standalone or called by fetch_daily.py / backfill.py.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
DAILY_DIR = REPO_ROOT / "data" / "daily"
SUMMARY_FILE = REPO_ROOT / "data" / "summary.json"
CARDS_FILE = REPO_ROOT / "data" / "cards.json"


def load_card_meta() -> dict:
    """Returns {card_id: {name, character, rarity, type}} for the dashboard."""
    with open(CARDS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    return {
        card["id"]: {
            "name": card["name"],
            "character": card["character"],
            "rarity": card["rarity"],
            "type": card["type"],
        }
        for card in data["cards"]
        if card.get("match_strategy") != "skip"
    }


def regenerate_summary():
    card_meta = load_card_meta()

    # Collect all daily files, sorted by date
    daily_files = sorted(DAILY_DIR.glob("????-??-??.json"))
    if not daily_files:
        print("  No daily files found — writing empty summary")
        summary = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "date_range": {"start": None, "end": None},
            "dates": [],
            "total_comments_by_date": [],
            "cards": {},
        }
        with open(SUMMARY_FILE, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2)
        return

    dates = []
    total_comments_by_date = []
    # {card_id: [count_per_day, ...]}  aligned with dates
    card_counts: dict = {}

    for day_file in daily_files:
        with open(day_file, "r", encoding="utf-8") as f:
            day_data = json.load(f)

        date_str = day_data["date"]
        dates.append(date_str)
        total_comments_by_date.append(day_data.get("total_comments", 0))

        # Record counts for each tracked card
        mentions = day_data.get("mentions", {})
        for card_id in card_meta:
            if card_id not in card_counts:
                # Backfill zeros for all previous days
                card_counts[card_id] = [0] * (len(dates) - 1)
            card_counts[card_id].append(mentions.get(card_id, 0))

    # Build cards section — only include cards with at least one mention
    cards_out = {}
    for card_id, counts in card_counts.items():
        if any(c > 0 for c in counts):
            meta = card_meta.get(card_id, {})
            cards_out[card_id] = {
                "name": meta.get("name", card_id),
                "character": meta.get("character", "Unknown"),
                "rarity": meta.get("rarity", "Unknown"),
                "type": meta.get("type", "Unknown"),
                "counts": counts,
            }

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "date_range": {
            "start": dates[0] if dates else None,
            "end": dates[-1] if dates else None,
        },
        "dates": dates,
        "total_comments_by_date": total_comments_by_date,
        "cards": cards_out,
    }

    with open(SUMMARY_FILE, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, sort_keys=True)

    print(f"  summary.json: {len(dates)} days, {len(cards_out)} cards with mentions")


if __name__ == "__main__":
    regenerate_summary()
    print("Done.")
