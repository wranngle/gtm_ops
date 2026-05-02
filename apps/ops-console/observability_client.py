"""Pure-Python client for the local observability stack.

The Streamlit page should be able to render while Victoria* services are
stopped, so this module returns structured offline/error results instead of
raising transport exceptions.
"""

from __future__ import annotations

import json
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Generic, TypeVar


T = TypeVar("T")


@dataclass(frozen=True)
class QueryResult(Generic[T]):
    data: T
    ok: bool = True
    error: str | None = None
    url: str | None = None
    params: dict[str, str] = field(default_factory=dict)

    @property
    def offline(self) -> bool:
        return not self.ok


@dataclass(frozen=True)
class LogEvent:
    timestamp: str
    service: str
    level: str
    action: str
    message: str


@dataclass(frozen=True)
class MetricPoint:
    timestamp: float
    value: float
    series: str


@dataclass(frozen=True)
class SlowSpan:
    trace_id: str
    span_id: str
    operation: str
    service: str
    duration_ms: float
    start_time: int | None = None


class ObservabilityClient:
    def __init__(
        self,
        *,
        logs_base_url: str = "http://127.0.0.1:9428",
        metrics_base_url: str = "http://127.0.0.1:8428",
        traces_base_url: str = "http://127.0.0.1:10428",
        timeout_seconds: float = 2.0,
    ) -> None:
        self.logs_base_url = logs_base_url.rstrip("/")
        self.metrics_base_url = metrics_base_url.rstrip("/")
        self.traces_base_url = traces_base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    def recent_events(
        self, service: str = "wranngle-local-symphony", limit: int = 50
    ) -> QueryResult[list[LogEvent]]:
        safe_limit = max(1, min(limit, 500))
        query = f'service.name:"{_escape_logsql_value(service)}" | last {safe_limit}'
        url = f"{self.logs_base_url}/select/logsql/query"
        params = {"query": query}
        result = self._post(url, params)
        if not result.ok:
            return QueryResult([], ok=False, error=result.error, url=url, params=params)
        return QueryResult(
            [_parse_log_event(item) for item in _coerce_log_items(result.data)],
            url=url,
            params=params,
        )

    def series(
        self,
        metric: str = "rate(agent_evals_evaluations_total[5m])",
        range: int = 3600,
        step: str = "30s",
        *,
        end: float | None = None,
    ) -> QueryResult[list[MetricPoint]]:
        end_ts = int(end if end is not None else time.time())
        start_ts = end_ts - max(1, range)
        url = f"{self.metrics_base_url}/api/v1/query_range"
        params = {
            "query": metric,
            "start": str(start_ts),
            "end": str(end_ts),
            "step": step,
        }
        result = self._post(url, params)
        if not result.ok:
            return QueryResult([], ok=False, error=result.error, url=url, params=params)
        return QueryResult(_parse_metric_points(result.data), url=url, params=params)

    def slow_spans(
        self,
        service: str = "wranngle-local-symphony",
        threshold_ms: int = 2000,
        limit: int = 10,
    ) -> QueryResult[list[SlowSpan]]:
        url = f"{self.traces_base_url}/select/jaeger/api/traces"
        params = {
            "service": service,
            "minDuration": f"{max(1, threshold_ms)}ms",
            "limit": str(max(1, min(limit, 100))),
        }
        result = self._get(url, params)
        if not result.ok:
            return QueryResult([], ok=False, error=result.error, url=url, params=params)
        spans = sorted(
            _parse_slow_spans(result.data),
            key=lambda span: span.duration_ms,
            reverse=True,
        )
        return QueryResult(spans[: max(1, min(limit, 100))], url=url, params=params)

    def _post(self, url: str, params: dict[str, str]) -> QueryResult[Any]:
        encoded = urllib.parse.urlencode(params).encode("utf-8")
        request = urllib.request.Request(url, data=encoded, method="POST")
        request.add_header("Content-Type", "application/x-www-form-urlencoded")
        return self._open(request, url=url, params=params)

    def _get(self, url: str, params: dict[str, str]) -> QueryResult[Any]:
        full_url = f"{url}?{urllib.parse.urlencode(params)}"
        request = urllib.request.Request(full_url, method="GET")
        return self._open(request, url=url, params=params)

    def _open(
        self, request: urllib.request.Request, *, url: str, params: dict[str, str]
    ) -> QueryResult[Any]:
        try:
            with urllib.request.urlopen(
                request, timeout=self.timeout_seconds
            ) as response:
                body = response.read().decode("utf-8")
        except (
            TimeoutError,
            socket.timeout,
            urllib.error.HTTPError,
            urllib.error.URLError,
            OSError,
        ) as exc:
            return QueryResult(None, ok=False, error=str(exc), url=url, params=params)

        try:
            return QueryResult(_decode_body(body), url=url, params=params)
        except ValueError as exc:
            return QueryResult(None, ok=False, error=str(exc), url=url, params=params)


def _decode_body(body: str) -> Any:
    stripped = body.strip()
    if not stripped:
        return {}
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        items = []
        for line in stripped.splitlines():
            line = line.strip()
            if not line:
                continue
            items.append(json.loads(line))
        return items


def _escape_logsql_value(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _coerce_log_items(raw: Any) -> list[dict[str, Any]]:
    if isinstance(raw, list):
        return [item for item in raw if isinstance(item, dict)]
    if isinstance(raw, dict):
        for key in ("data", "result", "hits"):
            value = raw.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
        return [raw]
    return []


def _parse_log_event(raw: dict[str, Any]) -> LogEvent:
    return LogEvent(
        timestamp=str(raw.get("@timestamp") or raw.get("_time") or ""),
        service=str(raw.get("service.name") or raw.get("service") or ""),
        level=str(raw.get("log.level") or raw.get("level") or ""),
        action=str(raw.get("event.action") or raw.get("action") or ""),
        message=str(raw.get("message") or raw.get("_msg") or ""),
    )


def _parse_metric_points(raw: Any) -> list[MetricPoint]:
    matrix = raw.get("data", {}).get("result", []) if isinstance(raw, dict) else []
    points: list[MetricPoint] = []
    for series in matrix:
        if not isinstance(series, dict):
            continue
        metric = series.get("metric", {})
        label = _series_label(metric)
        for pair in series.get("values", []):
            if not isinstance(pair, list | tuple) or len(pair) != 2:
                continue
            try:
                points.append(MetricPoint(float(pair[0]), float(pair[1]), label))
            except (TypeError, ValueError):
                continue
    return points


def _series_label(metric: Any) -> str:
    if not isinstance(metric, dict) or not metric:
        return "value"
    if "__name__" in metric:
        return str(metric["__name__"])
    return ",".join(f"{key}={value}" for key, value in sorted(metric.items())) or "value"


def _parse_slow_spans(raw: Any) -> list[SlowSpan]:
    traces = raw.get("data", []) if isinstance(raw, dict) else []
    spans: list[SlowSpan] = []
    for trace in traces:
        if not isinstance(trace, dict):
            continue
        processes = trace.get("processes", {})
        for span in trace.get("spans", []):
            if not isinstance(span, dict):
                continue
            duration_ms = _duration_to_ms(span.get("duration"))
            process = processes.get(span.get("processID"), {})
            service = ""
            if isinstance(process, dict):
                service = str(process.get("serviceName") or "")
            spans.append(
                SlowSpan(
                    trace_id=str(span.get("traceID") or trace.get("traceID") or ""),
                    span_id=str(span.get("spanID") or ""),
                    operation=str(span.get("operationName") or ""),
                    service=service,
                    duration_ms=duration_ms,
                    start_time=_int_or_none(span.get("startTime")),
                )
            )
    return spans


def _duration_to_ms(raw: Any) -> float:
    try:
        return float(raw) / 1000.0
    except (TypeError, ValueError):
        return 0.0


def _int_or_none(raw: Any) -> int | None:
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None
