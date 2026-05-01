import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  NoopMetricsSink,
  createOtlpHttpMetricsSink,
} from "../src/providers/metrics";

describe("NoopMetricsSink", () => {
  test("incrementCounter and flush are no-ops", async () => {
    NoopMetricsSink.incrementCounter("any", 5, { rule: "x" });
    await NoopMetricsSink.flush();
    expect(true).toBe(true);
  });
});

describe("OtlpHttpMetricsSink", () => {
  let captured: Array<{ url: string; body: any }> = [];
  let nextStatus = 200;

  beforeAll(() => {
    captured = [];
    nextStatus = 200;
  });

  afterAll(() => {
    captured = [];
  });

  function fakeFetch(): typeof fetch {
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const body = init?.body ? JSON.parse(init.body as string) : null;
      captured.push({ url, body });
      return new Response("", { status: nextStatus });
    }) as typeof fetch;
  }

  test("flush sends one OTLP payload with cumulative monotonic counters", async () => {
    captured = [];
    nextStatus = 200;

    const sink = createOtlpHttpMetricsSink({
      endpoint: "http://otel/v1/metrics",
      serviceName: "agent-evals-test",
      fetchImpl: fakeFetch(),
    });

    sink.incrementCounter("agent_evals_evaluations_total", 3);
    sink.incrementCounter("agent_evals_findings_failed_total", 1, {
      rule: "turn-duration-cap",
    });
    sink.incrementCounter("agent_evals_findings_failed_total", 1, {
      rule: "turn-duration-cap",
    });
    sink.incrementCounter("agent_evals_findings_failed_total", 1, {
      rule: "agent-turn-ratio",
    });

    await sink.flush();
    expect(captured).toHaveLength(1);

    const [hit] = captured;
    expect(hit?.url).toBe("http://otel/v1/metrics");
    expect(hit?.body.resourceMetrics).toHaveLength(1);

    const rm = hit?.body.resourceMetrics[0];
    expect(rm.resource.attributes).toEqual([
      { key: "service.name", value: { stringValue: "agent-evals-test" } },
    ]);

    const metrics = rm.scopeMetrics[0].metrics;
    const byName = Object.fromEntries(metrics.map((m: any) => [m.name, m]));

    expect(byName.agent_evals_evaluations_total.sum.aggregationTemporality).toBe(2);
    expect(byName.agent_evals_evaluations_total.sum.isMonotonic).toBe(true);
    expect(byName.agent_evals_evaluations_total.sum.dataPoints[0].asInt).toBe("3");

    const findingDataPoints =
      byName.agent_evals_findings_failed_total.sum.dataPoints;
    expect(findingDataPoints).toHaveLength(2);

    const turnDuration = findingDataPoints.find(
      (p: any) =>
        p.attributes.find((a: any) => a.key === "rule")?.value.stringValue ===
        "turn-duration-cap",
    );
    expect(turnDuration.asInt).toBe("2");

    const ratio = findingDataPoints.find(
      (p: any) =>
        p.attributes.find((a: any) => a.key === "rule")?.value.stringValue ===
        "agent-turn-ratio",
    );
    expect(ratio.asInt).toBe("1");
  });

  test("flush throws when the endpoint returns non-2xx", async () => {
    captured = [];
    nextStatus = 503;

    const sink = createOtlpHttpMetricsSink({
      endpoint: "http://otel/v1/metrics",
      fetchImpl: fakeFetch(),
    });

    sink.incrementCounter("c", 1);
    await expect(sink.flush()).rejects.toThrow(/metrics export failed: 503/);
  });

  test("flush is a no-op when no counters have been recorded", async () => {
    captured = [];
    nextStatus = 200;

    const sink = createOtlpHttpMetricsSink({
      endpoint: "http://otel/v1/metrics",
      fetchImpl: fakeFetch(),
    });

    await sink.flush();
    expect(captured).toHaveLength(0);
  });
});
