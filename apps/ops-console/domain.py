"""Pure parsing and aggregation for evaluation results.

Kept free of Streamlit so it stays unit-testable. The shape mirrors
`packages/agent-evals` `EvaluationResult` (camelCase JSON) but is
re-validated at the boundary instead of trusted by structural assumption.
"""

from __future__ import annotations

import json
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Finding:
    rule: str
    passed: bool
    detail: str


@dataclass(frozen=True)
class EvaluationResult:
    conversation_id: str
    evaluated_at: str
    findings: tuple[Finding, ...]
    passed: bool


@dataclass(frozen=True)
class Summary:
    total: int
    passed: int
    failed: int
    pass_rate: float
    failing_rules: dict[str, int] = field(default_factory=dict)


def parse_results_file(path: Path) -> list[EvaluationResult]:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise ValueError("results file must be a JSON array of EvaluationResult")
    return [_parse_result(item, index) for index, item in enumerate(raw)]


def summarize(results: list[EvaluationResult]) -> Summary:
    total = len(results)
    passed = sum(1 for r in results if r.passed)
    failed = total - passed
    pass_rate = (passed / total) if total else 0.0
    failing_counter: Counter[str] = Counter()
    for result in results:
        for finding in result.findings:
            if not finding.passed:
                failing_counter[finding.rule] += 1
    return Summary(
        total=total,
        passed=passed,
        failed=failed,
        pass_rate=pass_rate,
        failing_rules=dict(failing_counter),
    )


def _parse_result(raw: Any, index: int) -> EvaluationResult:
    if not isinstance(raw, dict):
        raise ValueError(f"results[{index}] must be an object")
    conversation_id = _require_str(raw, "conversationId", index)
    evaluated_at = _require_str(raw, "evaluatedAt", index)
    passed = _require_bool(raw, "passed", index)
    findings_raw = raw.get("findings")
    if not isinstance(findings_raw, list):
        raise ValueError(f"results[{index}].findings must be a list")
    findings = tuple(_parse_finding(f, index, i) for i, f in enumerate(findings_raw))
    return EvaluationResult(
        conversation_id=conversation_id,
        evaluated_at=evaluated_at,
        findings=findings,
        passed=passed,
    )


def _parse_finding(raw: Any, parent_index: int, finding_index: int) -> Finding:
    if not isinstance(raw, dict):
        raise ValueError(
            f"results[{parent_index}].findings[{finding_index}] must be an object"
        )
    return Finding(
        rule=_require_str(raw, "rule", f"{parent_index}.findings[{finding_index}]"),
        passed=_require_bool(
            raw, "passed", f"{parent_index}.findings[{finding_index}]"
        ),
        detail=str(raw.get("detail", "")),
    )


def _require_str(obj: dict[str, Any], key: str, ctx: Any) -> str:
    value = obj.get(key)
    if not isinstance(value, str) or not value:
        raise ValueError(f"results[{ctx}].{key} must be a non-empty string")
    return value


def _require_bool(obj: dict[str, Any], key: str, ctx: Any) -> bool:
    value = obj.get(key)
    if not isinstance(value, bool):
        raise ValueError(f"results[{ctx}].{key} must be a boolean")
    return value
