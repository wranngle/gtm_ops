export interface MetricsSink {
  incrementCounter(name: string, value?: number, attributes?: Record<string, string>): void;
  flush(): Promise<void>;
}

export const NoopMetricsSink: MetricsSink = {
  incrementCounter(): void {},
  async flush(): Promise<void> {},
};

interface CounterPoint {
  name: string;
  value: number;
  attributes: Record<string, string>;
  timeUnixNano: string;
  startTimeUnixNano: string;
}

export interface OtlpHttpMetricsSinkOptions {
  endpoint: string;
  serviceName?: string;
  fetchImpl?: typeof fetch;
  flushIntervalMs?: number;
}

export function createOtlpHttpMetricsSink(opts: OtlpHttpMetricsSinkOptions): MetricsSink {
  const startTime = Date.now() * 1_000_000;
  const startTimeNs = startTime.toString();
  const serviceName = opts.serviceName ?? "agent-evals";
  const fetchImpl = opts.fetchImpl ?? fetch;
  const counters = new Map<string, CounterPoint>();

  return {
    incrementCounter(name, value = 1, attributes = {}): void {
      const key = counterKey(name, attributes);
      const existing = counters.get(key);
      if (existing) {
        existing.value += value;
        existing.timeUnixNano = (Date.now() * 1_000_000).toString();
      } else {
        counters.set(key, {
          name,
          value,
          attributes,
          timeUnixNano: (Date.now() * 1_000_000).toString(),
          startTimeUnixNano: startTimeNs,
        });
      }
    },
    async flush(): Promise<void> {
      if (counters.size === 0) return;

      const payload = buildOtlpPayload(serviceName, Array.from(counters.values()));
      const response = await fetchImpl(opts.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(
          `metrics export failed: ${response.status} ${response.statusText}`,
        );
      }
      // OTLP counters are cumulative — leave the values in place for the
      // next flush. Reset is not needed (and incorrect for cumulative
      // semantics); aggregationTemporality=2 = CUMULATIVE.
    },
  };
}

function counterKey(name: string, attributes: Record<string, string>): string {
  const sortedAttrs = Object.entries(attributes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  return `${name}{${sortedAttrs}}`;
}

interface OtlpResource {
  attributes: Array<{ key: string; value: { stringValue: string } }>;
}

interface OtlpScope {
  name: string;
}

interface OtlpDataPoint {
  attributes: Array<{ key: string; value: { stringValue: string } }>;
  startTimeUnixNano: string;
  timeUnixNano: string;
  asInt: string;
}

interface OtlpMetric {
  name: string;
  sum: {
    dataPoints: OtlpDataPoint[];
    aggregationTemporality: number;
    isMonotonic: boolean;
  };
}

interface OtlpScopeMetrics {
  scope: OtlpScope;
  metrics: OtlpMetric[];
}

interface OtlpResourceMetrics {
  resource: OtlpResource;
  scopeMetrics: OtlpScopeMetrics[];
}

interface OtlpPayload {
  resourceMetrics: OtlpResourceMetrics[];
}

function buildOtlpPayload(serviceName: string, points: CounterPoint[]): OtlpPayload {
  const grouped = new Map<string, CounterPoint[]>();
  for (const point of points) {
    const list = grouped.get(point.name) ?? [];
    list.push(point);
    grouped.set(point.name, list);
  }

  const metrics: OtlpMetric[] = [];
  for (const [name, group] of grouped) {
    metrics.push({
      name,
      sum: {
        dataPoints: group.map((p) => ({
          attributes: Object.entries(p.attributes).map(([k, v]) => ({
            key: k,
            value: { stringValue: v },
          })),
          startTimeUnixNano: p.startTimeUnixNano,
          timeUnixNano: p.timeUnixNano,
          asInt: p.value.toString(),
        })),
        aggregationTemporality: 2, // CUMULATIVE
        isMonotonic: true,
      },
    });
  }

  return {
    resourceMetrics: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: serviceName } },
          ],
        },
        scopeMetrics: [
          {
            scope: { name: "agent-evals" },
            metrics,
          },
        ],
      },
    ],
  };
}
