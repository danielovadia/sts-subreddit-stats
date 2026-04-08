"""
Core card mention counting engine.

Loads cards.json, compiles regex patterns, and provides count_mentions()
which is a pure function used by both fetch_daily.py and backfill.py.
"""

import json
import re
from pathlib import Path
from typing import Dict, List, Tuple

# Path relative to repo root
CARDS_JSON = Path(__file__).parent.parent / "data" / "cards.json"


def load_cards(cards_path: Path = CARDS_JSON) -> List[dict]:
    with open(cards_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data["cards"]


def build_matchers(cards: List[dict]) -> List[Tuple[dict, re.Pattern]]:
    """Compile regex patterns for each card. Skip cards with strategy='skip'."""
    matchers = []
    for card in cards:
        strategy = card.get("match_strategy", "exact_phrase")
        if strategy == "skip":
            continue

        name = card["name"]
        # Escape regex special chars in the card name (handles e.g. "All-Out Attack")
        escaped = re.escape(name)

        # Both strategies use word-boundary matching; the difference is just
        # exact_word is for single-word names and exact_phrase is for multi-word.
        # Behavior is the same — word boundaries on each side.
        pattern = rf"(?i)\b{escaped}\b"
        try:
            compiled = re.compile(pattern)
            matchers.append((card, compiled))
        except re.error:
            # Shouldn't happen after re.escape, but be safe
            pass

    return matchers


def count_mentions(text: str, matchers: List[Tuple[dict, re.Pattern]]) -> Dict[str, int]:
    """
    Count card mentions in a single text (e.g. a Reddit comment body).

    Returns {card_id: count} for cards that appear at least once.
    Pure function — no I/O.
    """
    counts: Dict[str, int] = {}
    for card, pattern in matchers:
        matches = pattern.findall(text)
        if matches:
            counts[card["id"]] = len(matches)
    return counts


if __name__ == "__main__":
    # Quick smoke test
    cards = load_cards()
    matchers = build_matchers(cards)
    print(f"Loaded {len(cards)} cards, built {len(matchers)} matchers")

    test_comment = (
        "Snakebite is insane with Retain. I drafted Barricade and Corruption "
        "and the synergy was incredible. Feel No Pain with Dark Embrace is also "
        "really strong. Don't sleep on Hemokinesis either."
    )
    results = count_mentions(test_comment, matchers)
    print("\nTest comment mentions:")
    for card_id, count in sorted(results.items()):
        print(f"  {card_id}: {count}")
