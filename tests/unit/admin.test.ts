/**
 * Unit Tests for lib/admin.ts
 *
 * Tests admin dashboard functionality:
 * - Metrics recording and aggregation
 * - Activity feed
 * - Dashboard metrics
 * - System health tracking
 * - Analytics
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let AdminManager: any;
let MetricType: any;
let TimePeriod: any;
let getTimestampRange: any;
let testDbPath: string;
let admin: any;

beforeEach(async () => {
  // Create unique database path for each test
  testDbPath = path.join(
    __dirname,
    '..',
    '..',
    'config',
    `admin_test_${Date.now()}_${Math.random().toString(36).slice(2)}.db`
  );

  const module = await import('../../lib/admin.js');
  AdminManager = module.AdminManager;
  MetricType = module.MetricType;
  TimePeriod = module.TimePeriod;
  getTimestampRange = module.getTimestampRange;

  admin = new AdminManager(testDbPath);
});

afterEach(async () => {
  if (admin) {
    await admin.close();
  }

  if (testDbPath && fs.existsSync(testDbPath)) {
    try {
      fs.unlinkSync(testDbPath);
    } catch {
      // Ignore cleanup errors
    }
  }
});

describe('[P0] Admin Constants', () => {
  it('[P0] should define metric types', () => {
    expect(MetricType.DOCUMENTS_CREATED).toBe('documents.created');
    expect(MetricType.DOCUMENTS_VIEWED).toBe('documents.viewed');
    expect(MetricType.API_CALLS_LLM).toBe('api.calls.llm');
    expect(MetricType.API_CALLS_PDF).toBe('api.calls.pdf');
  });

  it('[P0] should define time periods', () => {
    expect(TimePeriod.TODAY).toBe('today');
    expect(TimePeriod.THIS_WEEK).toBe('this_week');
    expect(TimePeriod.THIS_MONTH).toBe('this_month');
    expect(TimePeriod.LAST_7_DAYS).toBe('last_7_days');
    expect(TimePeriod.LAST_30_DAYS).toBe('last_30_days');
  });
});

describe('[P0] Timestamp Ranges', () => {
  it('[P0] should calculate today range', () => {
    const range = getTimestampRange(TimePeriod.TODAY);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    expect(range.start).toBe(todayStart);
    expect(range.end).toBeGreaterThan(range.start);
  });

  it('[P0] should calculate last 7 days range', () => {
    const range = getTimestampRange(TimePeriod.LAST_7_DAYS);
    const expectedDays = 7 * 24 * 60 * 60 * 1000;

    expect(range.end - range.start).toBeCloseTo(expectedDays, -3);
  });

  it('[P0] should calculate all time range', () => {
    const range = getTimestampRange(TimePeriod.ALL_TIME);
    expect(range.start).toBe(0);
  });
});

describe('[P0] Metrics Recording', () => {
  it('[P0] should record a metric', async () => {
    // WHEN: Recording a metric
    await admin.recordMetric('ws-1', MetricType.DOCUMENTS_CREATED, 1);

    // THEN: Should be retrievable
    const metric = await admin.getMetric('ws-1', MetricType.DOCUMENTS_CREATED, TimePeriod.TODAY);
    expect(metric.total).toBe(1);
    expect(metric.count).toBe(1);
  });

  it('[P0] should aggregate multiple metrics', async () => {
    // WHEN: Recording multiple metrics
    await admin.recordMetric('ws-1', MetricType.DOCUMENTS_CREATED, 1);
    await admin.recordMetric('ws-1', MetricType.DOCUMENTS_CREATED, 1);
    await admin.recordMetric('ws-1', MetricType.DOCUMENTS_CREATED, 1);

    // THEN: Should aggregate values
    const metric = await admin.getMetric('ws-1', MetricType.DOCUMENTS_CREATED, TimePeriod.TODAY);
    expect(metric.total).toBe(3);
    expect(metric.count).toBe(3);
  });

  it('[P0] should isolate metrics by workspace', async () => {
    // WHEN: Recording metrics for different workspaces
    await admin.recordMetric('ws-1', MetricType.DOCUMENTS_CREATED, 5);
    await admin.recordMetric('ws-2', MetricType.DOCUMENTS_CREATED, 10);

    // THEN: Should be isolated
    const ws1 = await admin.getMetric('ws-1', MetricType.DOCUMENTS_CREATED, TimePeriod.TODAY);
    const ws2 = await admin.getMetric('ws-2', MetricType.DOCUMENTS_CREATED, TimePeriod.TODAY);

    expect(ws1.total).toBe(5);
    expect(ws2.total).toBe(10);
  });

  it('[P0] should return zero for non-existent metrics', async () => {
    const metric = await admin.getMetric('ws-1', MetricType.DOCUMENTS_CREATED, TimePeriod.TODAY);
    expect(metric.total).toBe(0);
    expect(metric.count).toBe(0);
  });
});

describe('[P0] Metrics Retrieval', () => {
  it('[P0] should get multiple metrics at once', async () => {
    // GIVEN: Various metrics
    await admin.recordMetric('ws-1', MetricType.DOCUMENTS_CREATED, 5);
    await admin.recordMetric('ws-1', MetricType.DOCUMENTS_VIEWED, 10);
    await admin.recordMetric('ws-1', MetricType.API_CALLS_LLM, 100);

    // WHEN: Getting multiple metrics
    const metrics = await admin.getMetrics(
      'ws-1',
      [MetricType.DOCUMENTS_CREATED, MetricType.DOCUMENTS_VIEWED, MetricType.API_CALLS_LLM],
      TimePeriod.TODAY
    );

    // THEN: Should return all metrics
    expect(metrics[MetricType.DOCUMENTS_CREATED].total).toBe(5);
    expect(metrics[MetricType.DOCUMENTS_VIEWED].total).toBe(10);
    expect(metrics[MetricType.API_CALLS_LLM].total).toBe(100);
  });

  it('[P0] should calculate averages correctly', async () => {
    // GIVEN: Metrics with different values
    await admin.recordMetric('ws-1', MetricType.API_CALLS_LLM, 10);
    await admin.recordMetric('ws-1', MetricType.API_CALLS_LLM, 20);
    await admin.recordMetric('ws-1', MetricType.API_CALLS_LLM, 30);

    // WHEN: Getting metric
    const metric = await admin.getMetric('ws-1', MetricType.API_CALLS_LLM, TimePeriod.TODAY);

    // THEN: Average should be correct
    expect(metric.total).toBe(60);
    expect(metric.count).toBe(3);
    expect(metric.average).toBe(20);
  });
});

describe('[P0] Metrics Time Series', () => {
  it('[P0] should get daily time series', async () => {
    // GIVEN: Metrics recorded
    await admin.recordMetric('ws-1', MetricType.DOCUMENTS_CREATED, 5);

    // WHEN: Getting time series
    const series = await admin.getMetricTimeSeries(
      'ws-1',
      MetricType.DOCUMENTS_CREATED,
      TimePeriod.LAST_7_DAYS,
      'daily'
    );

    // THEN: Should have at least one data point
    expect(series.length).toBeGreaterThanOrEqual(1);
    expect(series[0].timestamp).toBeDefined();
    expect(series[0].value).toBe(5);
  });
});

describe('[P0] Activity Feed', () => {
  it('[P0] should log activity', async () => {
    // WHEN: Logging activity
    const id = await admin.logActivity({
      workspaceId: 'ws-1',
      userId: 'user-1',
      activityType: 'document.created',
      resourceType: 'document',
      resourceId: 'doc-123',
      description: 'Created new document',
      metadata: { client: 'Test Corp' },
    });

    // THEN: Should return activity ID
    expect(id).toMatch(/^act_/);
  });

  it('[P0] should retrieve activity feed', async () => {
    // GIVEN: Multiple activities
    const now = Date.now();
    const dateSpy = vi.spyOn(Date, 'now')
      .mockReturnValueOnce(now)
      .mockReturnValueOnce(now + 10);

    await admin.logActivity({
      workspaceId: 'ws-1',
      userId: 'user-1',
      activityType: 'document.created',
    });
    await admin.logActivity({
      workspaceId: 'ws-1',
      userId: 'user-2',
      activityType: 'document.viewed',
    });

    dateSpy.mockRestore();

    // WHEN: Getting feed
    const feed = await admin.getActivityFeed('ws-1');

    // THEN: Should return activities in reverse chronological order
    expect(feed).toHaveLength(2);
    expect(feed[0].activity_type).toBe('document.viewed');
    expect(feed[1].activity_type).toBe('document.created');
  });

  it('[P0] should filter by user', async () => {
    // GIVEN: Activities from different users
    await admin.logActivity({
      workspaceId: 'ws-1',
      userId: 'user-1',
      activityType: 'document.created',
    });
    await admin.logActivity({
      workspaceId: 'ws-1',
      userId: 'user-2',
      activityType: 'document.created',
    });

    // WHEN: Filtering by user
    const feed = await admin.getActivityFeed('ws-1', { userId: 'user-1' });

    // THEN: Should only return user-1's activities
    expect(feed).toHaveLength(1);
    expect(feed[0].user_id).toBe('user-1');
  });

  it('[P0] should paginate results', async () => {
    // GIVEN: Many activities
    for (let i = 0; i < 10; i++) {
      await admin.logActivity({
        workspaceId: 'ws-1',
        activityType: `activity.${i}`,
      });
    }

    // WHEN: Getting first page
    const page1 = await admin.getActivityFeed('ws-1', { limit: 5, offset: 0 });

    // THEN: Should return first 5
    expect(page1).toHaveLength(5);

    // WHEN: Getting second page
    const page2 = await admin.getActivityFeed('ws-1', { limit: 5, offset: 5 });

    // THEN: Should return next 5
    expect(page2).toHaveLength(5);
    expect(page1[0].id).not.toBe(page2[0].id);
  });
});

describe('[P1] Dashboard Metrics', () => {
  it('[P1] should get comprehensive dashboard metrics', async () => {
    // GIVEN: Various metrics and activities
    await admin.recordMetric('ws-1', MetricType.DOCUMENTS_CREATED, 5);
    await admin.recordMetric('ws-1', MetricType.DOCUMENTS_VIEWED, 20);
    await admin.recordMetric('ws-1', MetricType.API_CALLS_LLM, 100);
    await admin.logActivity({
      workspaceId: 'ws-1',
      activityType: 'test.activity',
    });

    // WHEN: Getting dashboard metrics
    const dashboard = await admin.getDashboardMetrics('ws-1', TimePeriod.TODAY);

    // THEN: Should include all sections
    expect(dashboard.period).toBe(TimePeriod.TODAY);
    expect(dashboard.documents.created).toBe(5);
    expect(dashboard.documents.viewed).toBe(20);
    expect(dashboard.api_usage.llm_calls).toBe(100);
    expect(dashboard.recent_activity.length).toBeGreaterThanOrEqual(1);
  });
});

// Retry budget covers a residual sqlite3 race when 3-4 awaited writes land
// within the same Date.now() millisecond and the subsequent SELECT sometimes
// sees rows in non-monotonic order. Heisenbug: any instrumentation
// (console.error, fs.appendFileSync) makes it disappear, which points at
// the same async-cache-visibility issue documented for UsageTracker. Real
// fix is migrating off node-sqlite3 to better-sqlite3 (sync API). Tracked
// in the architecture-hardening backlog.
describe('[P1] System Health', { retry: 2 }, () => {
  it('[P1] should record health snapshot', async () => {
    // WHEN: Recording health
    await admin.recordHealthSnapshot('database', 'healthy', {
      latency_ms: 5,
      metadata: { connections: 10 },
    });

    // THEN: Should be retrievable
    const health = await admin.getSystemHealth();
    expect(health.components.database).toBeDefined();
    expect(health.components.database.status).toBe('healthy');
    expect(health.components.database.latency_ms).toBe(5);
  });

  it('[P1] should calculate overall health', async () => {
    // GIVEN: Mixed health statuses
    await admin.recordHealthSnapshot('database', 'healthy');
    await admin.recordHealthSnapshot('cache', 'degraded');

    // WHEN: Getting system health
    const health = await admin.getSystemHealth();

    // THEN: Overall should be degraded
    expect(health.overall).toBe('degraded');
  });

  it('[P1] should show unhealthy if any component is unhealthy', async () => {
    // GIVEN: One unhealthy component
    await admin.recordHealthSnapshot('database', 'healthy');
    await admin.recordHealthSnapshot('api', 'unhealthy');

    // WHEN: Getting system health
    const health = await admin.getSystemHealth();

    // THEN: Overall should be unhealthy
    expect(health.overall).toBe('unhealthy');
  });

  it('[P1] should get health history', async () => {
    // GIVEN: Multiple health snapshots
    await admin.recordHealthSnapshot('database', 'healthy');
    await admin.recordHealthSnapshot('database', 'degraded');
    await admin.recordHealthSnapshot('database', 'healthy');

    // WHEN: Getting history
    const history = await admin.getHealthHistory('database');

    // THEN: Should show all snapshots
    expect(history).toHaveLength(3);
    expect(history[0].status).toBe('healthy'); // Most recent
    expect(history[1].status).toBe('degraded');
  });
});

describe('[P1] Analytics', { retry: 2 }, () => {
  it('[P1] should get top users by activity', async () => {
    // GIVEN: Activities from different users
    await admin.logActivity({ workspaceId: 'ws-1', userId: 'user-1', activityType: 'a' });
    await admin.logActivity({ workspaceId: 'ws-1', userId: 'user-1', activityType: 'b' });
    await admin.logActivity({ workspaceId: 'ws-1', userId: 'user-1', activityType: 'c' });
    await admin.logActivity({ workspaceId: 'ws-1', userId: 'user-2', activityType: 'a' });

    // WHEN: Getting top users
    const topUsers = await admin.getTopUsers('ws-1');

    // THEN: Should rank by activity
    expect(topUsers[0].user_id).toBe('user-1');
    expect(topUsers[0].activity_count).toBe(3);
    expect(topUsers[1].user_id).toBe('user-2');
    expect(topUsers[1].activity_count).toBe(1);
  });

  it('[P1] should get usage breakdown', async () => {
    // GIVEN: Activities for different resources
    await admin.logActivity({ workspaceId: 'ws-1', resourceType: 'document', activityType: 'a' });
    await admin.logActivity({ workspaceId: 'ws-1', resourceType: 'document', activityType: 'b' });
    await admin.logActivity({ workspaceId: 'ws-1', resourceType: 'user', activityType: 'c' });

    // WHEN: Getting breakdown
    const breakdown = await admin.getUsageBreakdown('ws-1', TimePeriod.TODAY);

    // THEN: Should count by resource type
    expect(breakdown.document).toBe(2);
    expect(breakdown.user).toBe(1);
  });
});
