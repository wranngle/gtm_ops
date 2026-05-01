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

export interface PrometheusMetricsSinkOptions {
  /**
   * Endpoint that accepts Prometheus exposition format. For VictoriaMetrics:
   * `http://<host>:8428/api/v1/import/prometheus`.
   */
  endpoint: string;
  serviceName?: string;
  fetchImpl?: typeof fetch;
}

/**
 * @deprecated Renamed — kept as an alias so existing callers keep working.
 * The "OTLP" label was aspirational; the wire format we actually emit is
 * Prometheus exposition because both Vector's OTLP source and
 * VictoriaMetrics's OTLP intake reject JSON-encoded OTLP payloads.
 */
export const createOtlpHttpMetricsSink = createPrometheusMetricsSink;

export function createPrometheusMetricsSink(
  opts: PrometheusMetricsSinkOptions,
): MetricsSink {
  const startTime = Date.now() * 1_000_000;
  const startTimeNs = startTime.toString();
  const serviceName = opts.serviceName ?? "agent-evals";
  const fetchImpl = opts.fetchImpl ?? fetch;
  const counters = new Map<string, CounterPoint>();

  return {
    incrementCounter(name, value = 1, attributes = {}): void {
      const merged = { ...attributes, service_name: serviceName };
      const key = counterKey(name, merged);
      const existing = counters.get(key);
      if (existing) {
        existing.value += value;
        existing.timeUnixNano = (Date.now() * 1_000_000).toString();
      } else {
        counters.set(key, {
          name,
          value,
          attributes: merged,
          timeUnixNano: (Date.now() * 1_000_000).toString(),
          startTimeUnixNano: startTimeNs,
        });
      }
    },
    async flush(): Promise<void> {
      if (counters.size === 0) return;

      const payload = buildPrometheusPayload(Array.from(counters.values()));
      const response = await fetchImpl(opts.endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: payload,
      });
      if (!response.ok) {
        throw new Error(
          `metrics export failed: ${response.status} ${response.statusText}`,
        );
      }
      // Counters are cumulative — leave values in place for the next flush.
    },
  };
}

function buildPrometheusPayload(points: CounterPoint[]): string {
  const lines: string[] = [];
  const seenNames = new Set<string>();
  for (const point of points) {
    if (!seenNames.has(point.name)) {
      lines.push(`# TYPE ${point.name} counter`);
      seenNames.add(point.name);
    }
    const labelStr = Object.entries(point.attributes)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k.replace(/[^A-Za-z0-9_]/g, "_")}="${escapePromValue(v)}"`)
      .join(",");
    lines.push(`${point.name}{${labelStr}} ${point.value}`);
  }
  return lines.join("\n") + "\n";
}

function escapePromValue(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function counterKey(name: string, attributes: Record<string, string>): string {
  const sortedAttrs = Object.entries(attributes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  return `${name}{${sortedAttrs}}`;
}

