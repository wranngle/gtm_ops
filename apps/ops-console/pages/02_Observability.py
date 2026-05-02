"""Streamlit observability panels for the local Victoria* stack."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable

import streamlit as st

from observability_client import MetricPoint, ObservabilityClient, QueryResult


DOC_URL = "../../docs/references/local-observability.md"
OFFLINE_MESSAGE = "stack offline (start `tools/observability/docker compose up -d`)"


def main() -> None:
    st.set_page_config(page_title="Observability", layout="wide")
    st.title("Observability")
    st.caption(f"Raw query cookbook: `{DOC_URL}`")

    with st.sidebar:
        service = st.text_input("Service", value="wranngle-local-symphony")
        event_limit = st.number_input(
            "Recent events", min_value=1, max_value=200, value=50
        )
        threshold_ms = st.number_input(
            "Slow span threshold (ms)", min_value=1, max_value=60_000, value=2_000
        )
        timeout_seconds = st.number_input(
            "Request timeout (seconds)", min_value=1.0, max_value=10.0, value=2.0
        )

    client = ObservabilityClient(timeout_seconds=float(timeout_seconds))

    st.subheader("Recent events")
    events = client.recent_events(service=service, limit=int(event_limit))
    _render_error(events)
    if events.ok and events.data:
        st.dataframe(
            [
                {
                    "time": event.timestamp,
                    "level": event.level,
                    "action": event.action,
                    "message": event.message,
                }
                for event in events.data
            ],
            use_container_width=True,
            hide_index=True,
        )
    elif events.ok:
        st.info("No recent events found for this service.")
    st.code(_curl(events), language="bash")

    st.subheader("Evaluation rate")
    metric = "rate(agent_evals_evaluations_total[5m])"
    series = client.series(metric=metric, range=3600, step="30s")
    _render_error(series)
    if series.ok and series.data:
        st.line_chart(_chart_rows(series.data), x="timestamp", y="value", color="series")
    elif series.ok:
        st.info("No metric samples found in the last hour.")
    st.code(_curl(series), language="bash")

    st.subheader("Slow spans")
    spans = client.slow_spans(service=service, threshold_ms=int(threshold_ms), limit=10)
    _render_error(spans)
    if spans.ok and spans.data:
        st.dataframe(
            [
                {
                    "duration_ms": span.duration_ms,
                    "operation": span.operation,
                    "service": span.service,
                    "trace_id": span.trace_id,
                    "span_id": span.span_id,
                }
                for span in spans.data
            ],
            use_container_width=True,
            hide_index=True,
        )
    elif spans.ok:
        st.info("No spans returned yet. STACK-070 still owns trace emission.")
    st.code(_curl(spans), language="bash")


def _render_error(result: QueryResult[object]) -> None:
    if result.ok:
        return
    st.warning(OFFLINE_MESSAGE)
    if result.error:
        st.caption(result.error)


def _chart_rows(points: Iterable[MetricPoint]) -> list[dict[str, object]]:
    rows = []
    for point in points:
        rows.append(
            {
                "timestamp": datetime.fromtimestamp(
                    point.timestamp, tz=timezone.utc
                ).isoformat(),
                "value": point.value,
                "series": point.series,
            }
        )
    return rows


def _curl(result: QueryResult[object]) -> str:
    if not result.url:
        return "# query unavailable"
    flags = " ".join(
        f"--data-urlencode '{key}={value}'" for key, value in result.params.items()
    )
    return f"curl -fsS '{result.url}' {flags}"


if __name__ == "__main__":
    main()
