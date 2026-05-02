"""Unit tests for observability_client.py with no live HTTP calls."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any
from unittest.mock import patch
from urllib.error import URLError
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from observability_client import ObservabilityClient  # noqa: E402


class FakeResponse:
    def __init__(self, payload: Any) -> None:
        self.payload = payload

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


def test_recent_events_posts_logsql_query_and_parses_events() -> None:
    payload = [
        {
            "@timestamp": "2026-05-02T12:00:00Z",
            "service.name": "wranngle-local-symphony",
            "log.level": "info",
            "event.action": "symphony.dispatch",
            "message": "dispatching issue",
        }
    ]

    with patch("urllib.request.urlopen", return_value=FakeResponse(payload)) as opened:
        client = ObservabilityClient(logs_base_url="http://logs.local", timeout_seconds=4)
        result = client.recent_events("wranngle-local-symphony", limit=25)

    request = opened.call_args.args[0]
    assert request.full_url == "http://logs.local/select/logsql/query"
    assert opened.call_args.kwargs["timeout"] == 4
    assert parse_qs(request.data.decode("utf-8")) == {
        "query": ['service.name:"wranngle-local-symphony" | last 25']
    }
    assert result.ok is True
    assert result.data[0].action == "symphony.dispatch"
    assert result.data[0].message == "dispatching issue"


def test_series_posts_promql_query_range_and_returns_chart_friendly_points() -> None:
    payload = {
        "status": "success",
        "data": {
            "resultType": "matrix",
            "result": [
                {
                    "metric": {"job": "agent-evals"},
                    "values": [[1000, "1.5"], [1030, "2"]],
                }
            ],
        },
    }

    with patch("urllib.request.urlopen", return_value=FakeResponse(payload)) as opened:
        client = ObservabilityClient(metrics_base_url="http://metrics.local")
        result = client.series("rate(agent_evals_evaluations_total[5m])", 3600, "30s", end=2000)

    request = opened.call_args.args[0]
    assert request.full_url == "http://metrics.local/api/v1/query_range"
    assert parse_qs(request.data.decode("utf-8")) == {
        "query": ["rate(agent_evals_evaluations_total[5m])"],
        "start": ["-1600"],
        "end": ["2000"],
        "step": ["30s"],
    }
    assert [(point.timestamp, point.value, point.series) for point in result.data] == [
        (1000.0, 1.5, "job=agent-evals"),
        (1030.0, 2.0, "job=agent-evals"),
    ]


def test_slow_spans_gets_jaeger_endpoint_and_sorts_by_duration() -> None:
    payload = {
        "data": [
            {
                "traceID": "trace-1",
                "processes": {"p1": {"serviceName": "wranngle-local-symphony"}},
                "spans": [
                    {
                        "traceID": "trace-1",
                        "spanID": "span-fast",
                        "processID": "p1",
                        "operationName": "turn",
                        "duration": 1000,
                        "startTime": 10,
                    },
                    {
                        "traceID": "trace-1",
                        "spanID": "span-slow",
                        "processID": "p1",
                        "operationName": "turn",
                        "duration": 3000000,
                        "startTime": 20,
                    },
                ],
            }
        ]
    }

    with patch("urllib.request.urlopen", return_value=FakeResponse(payload)) as opened:
        client = ObservabilityClient(traces_base_url="http://traces.local")
        result = client.slow_spans("wranngle-local-symphony", threshold_ms=2000, limit=10)

    request = opened.call_args.args[0]
    parsed = urlparse(request.full_url)
    assert f"{parsed.scheme}://{parsed.netloc}{parsed.path}" == (
        "http://traces.local/select/jaeger/api/traces"
    )
    assert parse_qs(parsed.query) == {
        "service": ["wranngle-local-symphony"],
        "minDuration": ["2000ms"],
        "limit": ["10"],
    }
    assert [span.span_id for span in result.data] == ["span-slow", "span-fast"]
    assert result.data[0].duration_ms == 3000.0


def test_client_returns_offline_result_on_transport_error() -> None:
    with patch("urllib.request.urlopen", side_effect=URLError("connection refused")):
        result = ObservabilityClient(logs_base_url="http://logs.local").recent_events()

    assert result.ok is False
    assert result.offline is True
    assert result.data == []
    assert "connection refused" in (result.error or "")
