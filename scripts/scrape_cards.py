"""
One-time helper to scaffold/update data/cards.json from the STS2 wiki.

Attempts to fetch card data from slaythespire.wiki.gg using the MediaWiki
Cargo API. If that fails (e.g. the tables aren't set up), falls back to
printing instructions for manual curation.

Usage:
    python scripts/scrape_cards.py [--dry-run]
    python scripts/scrape_cards.py --output data/new_cards.json

The output is a scaffold — you should review and curate it, especially the
match_strategy field for single-word cards that may produce false positives.

Match strategy guide:
  exact_phrase — multi-word card name, e.g. "Perfected Strike" → use this
  exact_word   — single-word card name, e.g. "Barricade" → use this
  skip         — too generic (shared basics like "Strike", "Defend") → use this
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path

import requests

REPO_ROOT    = Path(__file__).parent.parent
CARDS_FILE   = REPO_ROOT / "data" / "cards.json"
WIKI_API     = "https://slaythespire.wiki.gg/api.php"
REQUEST_DELAY = 0.5  # seconds between API requests

# Common English words that are too generic to match reliably.
# Single-word card names in this set will get match_strategy="skip"
SKIP_WORDS = {
    "strike", "defend", "attack", "block", "draw", "power", "skill",
    "energy", "curse", "status", "hit", "cut", "slash", "bash",
    "deal", "gain", "lose", "add", "play", "use", "end", "start",
    "act", "run", "pain", "burn", "fire", "ice", "cold", "dark",
    "light", "storm", "wind", "rain", "fog", "void",
}


def classify_strategy(name: str) -> str:
    """Auto-classify match strategy based on card name."""
    words = name.lower().split()
    if len(words) > 1:
        return "exact_phrase"
    # Single word — check if it's too generic
    clean = re.sub(r"[^a-z]", "", words[0])
    if clean in SKIP_WORDS:
        return "skip"
    return "exact_word"


def make_card_id(character: str, name: str) -> str:
    """Generate a stable card ID from character and name."""
    char_slug = character.lower().replace(" ", "_")
    name_slug = re.sub(r"[^a-z0-9_]", "_", name.lower()).strip("_")
    name_slug = re.sub(r"_+", "_", name_slug)
    return f"{char_slug}_{name_slug}"


def try_cargo_api() -> list | None:
    """Try to fetch cards from the wiki's Cargo API."""
    # The STS2 wiki may expose a Cargo table called "Cards" or similar.
    # This is a best-effort attempt — the table names may differ.
    params = {
        "action": "cargoquery",
        "tables": "Cards",
        "fields": "Name,Character,Rarity,Type",
        "limit": 500,
        "format": "json",
        "offset": 0,
    }

    all_cards = []
    print("Trying MediaWiki Cargo API...")

    while True:
        try:
            resp = requests.get(WIKI_API, params=params, timeout=15)
            resp.raise_for_status()
            data = resp.json()
        except (requests.RequestException, ValueError) as e:
            print(f"  Cargo API error: {e}")
            return None

        if "cargoquery" not in data:
            print(f"  Cargo API returned unexpected response (no 'cargoquery' key)")
            return None

        rows = data["cargoquery"]
        if not rows:
            break

        for row in rows:
            fields = row.get("title", {})
            name      = fields.get("Name", "").strip()
            character = fields.get("Character", "Unknown").strip()
            rarity    = fields.get("Rarity", "Common").strip()
            card_type = fields.get("Type", "Unknown").strip()
            if name:
                all_cards.append({
                    "name": name,
                    "character": character,
                    "rarity": rarity,
                    "type": card_type,
                })

        params["offset"] += 500
        if len(rows) < 500:
            break
        time.sleep(REQUEST_DELAY)

    print(f"  Fetched {len(all_cards)} cards from Cargo API")
    return all_cards if all_cards else None


def build_cards_json(raw_cards: list) -> dict:
    """Convert raw card list to cards.json format."""
    # Deduplicate by (name, character)
    seen = set()
    cards = []
    for c in raw_cards:
        key = (c["name"].lower(), c["character"].lower())
        if key in seen:
            continue
        seen.add(key)
        card_id = make_card_id(c["character"], c["name"])
        strategy = classify_strategy(c["name"])
        cards.append({
            "id":             card_id,
            "name":           c["name"],
            "character":      c["character"],
            "rarity":         c.get("rarity", "Common"),
            "type":           c.get("type", "Unknown"),
            "match_strategy": strategy,
        })

    # Sort by character, then rarity order, then name
    rarity_order = {"Basic": 0, "Common": 1, "Uncommon": 2, "Rare": 3, "Curse": 4}
    cards.sort(key=lambda c: (
        c["character"],
        rarity_order.get(c["rarity"], 9),
        c["name"],
    ))

    skipped  = sum(1 for c in cards if c["match_strategy"] == "skip")
    phrases  = sum(1 for c in cards if c["match_strategy"] == "exact_phrase")
    words    = sum(1 for c in cards if c["match_strategy"] == "exact_word")
    print(f"\nCard breakdown:")
    print(f"  {len(cards)} total | {phrases} exact_phrase | {words} exact_word | {skipped} skip")

    return {
        "meta": {
            "last_updated": __import__("datetime").date.today().isoformat(),
            "source": "slaythespire.wiki.gg (scraped)",
            "note": "Review match_strategy for single-word cards that may produce false positives",
        },
        "cards": cards,
    }


def merge_with_existing(new_data: dict) -> dict:
    """Merge scraped cards with existing cards.json, preserving manual edits."""
    if not CARDS_FILE.exists():
        return new_data

    with open(CARDS_FILE, "r", encoding="utf-8") as f:
        existing = json.load(f)

    existing_by_id = {c["id"]: c for c in existing.get("cards", [])}
    new_cards = []

    for card in new_data["cards"]:
        if card["id"] in existing_by_id:
            # Keep existing entry (preserves manual match_strategy edits)
            existing_card = existing_by_id[card["id"]]
            # Update fields that might change (rarity, type) but not match_strategy
            existing_card.update({k: v for k, v in card.items() if k not in ("match_strategy",)})
            new_cards.append(existing_card)
        else:
            # New card from scrape
            new_cards.append(card)
            print(f"  + New card: {card['name']} ({card['character']})")

    removed = set(existing_by_id) - {c["id"] for c in new_data["cards"]}
    for rid in removed:
        print(f"  - Removed from wiki (kept in json): {existing_by_id[rid]['name']}")
        new_cards.append(existing_by_id[rid])

    new_data["cards"] = new_cards
    return new_data


def main():
    parser = argparse.ArgumentParser(description="Scaffold cards.json from STS2 wiki")
    parser.add_argument("--output", default=str(CARDS_FILE),
                        help="Output JSON path (default: data/cards.json)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print results without writing file")
    parser.add_argument("--no-merge", action="store_true",
                        help="Overwrite existing cards.json instead of merging")
    args = parser.parse_args()

    # Try Cargo API first
    raw = try_cargo_api()

    if raw is None:
        print("\nCargo API unavailable. Options:")
        print("  1. Check the wiki's Cargo tables at: https://slaythespire.wiki.gg/Special:CargoTables")
        print("  2. Try: https://sts2.wiki/cards/ or https://spire-codex.com/cards")
        print("  3. Manually add cards to data/cards.json following the existing format")
        print("\nThe existing data/cards.json already has a good starting scaffold.")
        sys.exit(1)

    data = build_cards_json(raw)

    if not args.no_merge:
        data = merge_with_existing(data)

    if args.dry_run:
        print(f"\nDry run — would write {len(data['cards'])} cards to {args.output}")
        print(json.dumps(data['cards'][:3], indent=2))
        return

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"\nWritten {len(data['cards'])} cards to {out_path}")
    print("Review the file and adjust match_strategy as needed:")
    print("  exact_phrase → multi-word card names (no changes usually needed)")
    print("  exact_word   → single-word card names (check for ambiguous ones)")
    print("  skip         → too generic to track reliably")


if __name__ == "__main__":
    main()
