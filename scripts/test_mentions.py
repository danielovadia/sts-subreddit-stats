"""Basic tests for the count_mentions engine."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from count_mentions import load_cards, build_matchers, count_mentions


def setup():
    cards = load_cards()
    matchers = build_matchers(cards)
    return matchers


def test_basic_match():
    matchers = setup()
    result = count_mentions("Snakebite is amazing this patch", matchers)
    assert "regent_snakebite" in result, "Should detect Snakebite"
    assert result["regent_snakebite"] == 1


def test_case_insensitive():
    matchers = setup()
    result = count_mentions("snakebite snakeBITE SNAKEBITE", matchers)
    assert result.get("regent_snakebite") == 3, "Should be case-insensitive"


def test_multi_word_card():
    matchers = setup()
    result = count_mentions("Feel No Pain is a great power card", matchers)
    assert "ironclad_feel_no_pain" in result


def test_no_partial_match():
    matchers = setup()
    # "Barricades" should not match "Barricade" (word boundary)
    result = count_mentions("The barricades were everywhere", matchers)
    # "barricades" has an extra 's', so \bBarricade\b should NOT match
    assert result.get("ironclad_barricade", 0) == 0, "Should not match partial words"


def test_skip_strategy():
    matchers = setup()
    # Cards marked skip should not appear in the matcher list
    card_ids = {card["id"] for card, _ in matchers}
    # The basic shared "Strike" (id would be e.g. ironclad_strike) should be skipped
    # Cards like "Perfected Strike" (id: ironclad_perfected_strike) ARE tracked — that's correct
    assert "ironclad_strike" not in card_ids, "Plain Ironclad Strike should be skipped"
    assert "silent_strike" not in card_ids, "Plain Silent Strike should be skipped"


def test_multiple_mentions():
    matchers = setup()
    result = count_mentions("Snakebite Snakebite Snakebite", matchers)
    assert result.get("regent_snakebite") == 3


def test_hyphenated_card():
    matchers = setup()
    # "All-Out Attack" has a hyphen
    result = count_mentions("All-Out Attack is a Silent card", matchers)
    assert "silent_all_out_attack" in result


def run_all():
    tests = [
        test_basic_match,
        test_case_insensitive,
        test_multi_word_card,
        test_no_partial_match,
        test_skip_strategy,
        test_multiple_mentions,
        test_hyphenated_card,
    ]
    passed = 0
    failed = 0
    for t in tests:
        try:
            t()
            print(f"  PASS  {t.__name__}")
            passed += 1
        except AssertionError as e:
            print(f"  FAIL  {t.__name__}: {e}")
            failed += 1
        except Exception as e:
            print(f"  ERROR {t.__name__}: {e}")
            failed += 1
    print(f"\n{passed} passed, {failed} failed")
    return failed == 0


if __name__ == "__main__":
    success = run_all()
    sys.exit(0 if success else 1)
