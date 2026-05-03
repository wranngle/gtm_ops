"""Streamlit entry point. Run via `streamlit run main.py -- <results.json>`.

Keeps the runtime layer thin: parses the JSON via domain, then renders.
Anything testable lives in domain.py.
"""

from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st

from domain import parse_results_file, summarize


def main() -> None:
    args = sys.argv[1:]
    default_fixture = Path(__file__).parent / "fixtures" / "evaluation-results.json"
    results_path = Path(args[0]) if args else default_fixture

    st.set_page_config(page_title="Wranngle Ops Console", layout="wide")
    st.title("Agent Evaluations")
    st.caption(f"Source: `{results_path}`")

    if not results_path.exists():
        st.error(f"results file not found: {results_path}")
        return

    try:
        results = parse_results_file(results_path)
    except ValueError as exc:
        st.error(f"failed to parse results: {exc}")
        return

    summary = summarize(results)

    cols = st.columns(4)
    cols[0].metric("Total", summary.total)
    cols[1].metric("Passed", summary.passed)
    cols[2].metric("Failed", summary.failed)
    cols[3].metric("Pass rate", f"{summary.pass_rate * 100:.1f}%")

    if summary.failing_rules:
        st.subheader("Failing rules")
        st.table(
            [
                {"rule": rule, "failures": count}
                for rule, count in sorted(
                    summary.failing_rules.items(), key=lambda kv: -kv[1]
                )
            ]
        )

    st.subheader("Conversations")
    for result in results:
        verdict = "PASS" if result.passed else "FAIL"
        with st.expander(f"{result.conversation_id} — {verdict}"):
            st.caption(f"Evaluated: {result.evaluated_at}")
            for finding in result.findings:
                marker = "✓" if finding.passed else "✗"
                st.write(f"{marker} **{finding.rule}** — {finding.detail}")


if __name__ == "__main__":
    main()
