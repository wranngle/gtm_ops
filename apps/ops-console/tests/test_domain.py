"""Pure tests for ops-console/domain.py — no Streamlit dependency."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from domain import parse_results_file, summarize  # noqa: E402


FIXTURE = Path(__file__).resolve().parent.parent / "fixtures" / "evaluation-results.json"


def test_parses_the_checked_in_fixture() -> None:
    results = parse_results_file(FIXTURE)
    assert len(results) == 3
    assert results[0].conversation_id == "synth-001"
    assert results[0].passed is True
    assert {f.rule for f in results[0].findings} == {
        "turn-duration-cap",
        "agent-turn-ratio",
        "monotonic-timestamps",
    }


def test_summarize_counts_pass_fail_and_failing_rules() -> None:
    results = parse_results_file(FIXTURE)
    summary = summarize(results)
    assert summary.total == 3
    assert summary.passed == 1
    assert summary.failed == 2
    assert summary.failing_rules == {
        "agent-turn-ratio": 1,
        "turn-duration-cap": 1,
    }
    assert summary.pass_rate == pytest.approx(1 / 3)


def test_rejects_non_array_root(tmp_path: Path) -> None:
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps({"results": []}), encoding="utf-8")
    with pytest.raises(ValueError, match="must be a JSON array"):
        parse_results_file(bad)


def test_rejects_missing_required_string(tmp_path: Path) -> None:
    bad = tmp_path / "bad.json"
    bad.write_text(
        json.dumps(
            [
                {
                    "conversationId": "",
                    "evaluatedAt": "now",
                    "findings": [],
                    "passed": True,
                }
            ]
        ),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="conversationId"):
        parse_results_file(bad)


def test_rejects_non_boolean_passed(tmp_path: Path) -> None:
    bad = tmp_path / "bad.json"
    bad.write_text(
        json.dumps(
            [
                {
                    "conversationId": "a",
                    "evaluatedAt": "now",
                    "findings": [],
                    "passed": "yes",
                }
            ]
        ),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="passed"):
        parse_results_file(bad)
