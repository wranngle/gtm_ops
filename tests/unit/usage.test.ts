/**
 * Unit Tests for lib/usage.ts
 *
 * Tests usage tracking functionality:
 * - Event tracking
 * - Usage summary aggregation
 * - Cost estimation
 * - Pagination
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB_PATH = path.join(__dirname, '..', '..', 'config', 'usage_test.db');

let UsageTracker: any;
let EventType: any;
let COST_CONFIG: any;

beforeEach(async () => {
  // Clean up test database
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  const module = await import('../../lib/usage.js');
  UsageTracker = module.UsageTracker;
  EventType = module.EventType;
  COST_CONFIG = module.COST_CONFIG;
});

afterEach(async () => {
  // Clean up test database
  if (fs.existsSync(TEST_DB_PATH)) {
    try {
      fs.unlinkSync(TEST_DB_PATH);
    } catch {
      // Ignore cleanup errors
    }
  }
});

describe('[P0] UsageTracker - Event Tracking', () => {
  it('[P0] should track pipeline started event', async () => {
    // GIVEN: A usage tracker
    const tracker = new UsageTracker(TEST_DB_PATH);

    // WHEN: Tracking a pipeline start
    const eventId = await tracker.trackPipelineStarted('exec-123', {
      input_type: 'text',
      input_size: 1000
    });

    // THEN: Event should be recorded
    expect(eventId).toBeGreaterThan(0);

    // Cleanup
    await tracker.close();
  });

  it('[P0] should track pipeline completed event with duration', async () => {
    // GIVEN: A usage tracker
    const tracker = new UsageTracker(TEST_DB_PATH);

    // WHEN: Tracking a pipeline completion
    const eventId = await tracker.trackPipelineCompleted('exec-123', 5000, {
      output_files: ['report.html', 'report.pdf']
    });

    // THEN: Event should be recorded
    expect(eventId).toBeGreaterThan(0);

    // Verify event was stored
    const detail = await tracker.getUsageDetail({ limit: 1 });
    expect(detail.events[0].event_type).toBe(EventType.PIPELINE_COMPLETED);
    expect(detail.events[0].metadata.duration_ms).toBe(5000);

    await tracker.close();
  });

  it('[P0] should track pipeline failed event with error', async () => {
    // GIVEN: A usage tracker
    const tracker = new UsageTracker(TEST_DB_PATH);

    // WHEN: Tracking a pipeline failure
    const eventId = await tracker.trackPipelineFailed('exec-123', 'API timeout', {
      stage: 'extraction'
    });

    // THEN: Event should be recorded
    expect(eventId).toBeGreaterThan(0);

    const detail = await tracker.getUsageDetail({ limit: 1 });
    expect(detail.events[0].event_type).toBe(EventType.PIPELINE_FAILED);
    expect(detail.events[0].metadata.error).toBe('API timeout');

    await tracker.close();
  });

  it('[P0] should track API call with token counts', async () => {
    // GIVEN: A usage tracker
    const tracker = new UsageTracker(TEST_DB_PATH);

    // WHEN: Tracking an API call
    const eventId = await tracker.trackApiCall('gemini', 'gemini-1.5-flash', 1000, 500, {
      execution_id: 'exec-123'
    });

    // THEN: Event should be recorded
    expect(eventId).toBeGreaterThan(0);

    const detail = await tracker.getUsageDetail({ limit: 1 });
    expect(detail.events[0].event_type).toBe(EventType.GEMINI_API_CALL);
    expect(detail.events[0].metadata.input_tokens).toBe(1000);
    expect(detail.events[0].metadata.output_tokens).toBe(500);

    await tracker.close();
  });

  it('[P0] should track PDF generation with page count', async () => {
    // GIVEN: A usage tracker
    const tracker = new UsageTracker(TEST_DB_PATH);

    // WHEN: Tracking PDF generation
    const eventId = await tracker.trackPdfGenerated('exec-123', 4, {
      file_size: 250_000
    });

    // THEN: Event should be recorded
    expect(eventId).toBeGreaterThan(0);

    const detail = await tracker.getUsageDetail({ limit: 1 });
    expect(detail.events[0].event_type).toBe(EventType.PUPPETEER_PDF);
    expect(detail.events[0].metadata.page_count).toBe(4);

    await tracker.close();
  });
});

describe('[P0] UsageTracker - Usage Summary', () => {
  it('[P0] should aggregate execution counts', async () => {
    // GIVEN: A usage tracker with events
    const tracker = new UsageTracker(TEST_DB_PATH);

    await tracker.trackPipelineStarted('exec-1');
    await tracker.trackPipelineCompleted('exec-1', 5000);
    await tracker.trackPipelineStarted('exec-2');
    await tracker.trackPipelineCompleted('exec-2', 3000);
    await tracker.trackPipelineStarted('exec-3');
    await tracker.trackPipelineFailed('exec-3', 'error');

    // WHEN: Getting usage summary
    const summary = await tracker.getUsageSummary();

    // THEN: Counts should be correct
    expect(summary.total_executions).toBe(3);
    expect(summary.successful_executions).toBe(2);
    expect(summary.failed_executions).toBe(1);

    await tracker.close();
  });

  it('[P0] should aggregate token counts', async () => {
    // GIVEN: A usage tracker with API calls
    const tracker = new UsageTracker(TEST_DB_PATH);

    await tracker.trackApiCall('gemini', 'flash', 1000, 500);
    await tracker.trackApiCall('gemini', 'flash', 2000, 800);
    await tracker.trackApiCall('gemini', 'flash', 500, 200);

    // WHEN: Getting usage summary
    const summary = await tracker.getUsageSummary();

    // THEN: Token counts should be summed
    expect(summary.total_api_calls).toBe(3);
    expect(summary.total_input_tokens).toBe(3500);
    expect(summary.total_output_tokens).toBe(1500);

    await tracker.close();
  });

  it('[P0] should calculate estimated cost', async () => {
    // GIVEN: A usage tracker with usage
    const tracker = new UsageTracker(TEST_DB_PATH);

    // 1M input tokens = $0.075, 1M output tokens = $0.30
    await tracker.trackApiCall('gemini', 'flash', 1_000_000, 100_000);
    await tracker.trackPdfGenerated('exec-1', 10);

    // WHEN: Getting usage summary
    const summary = await tracker.getUsageSummary();

    // THEN: Cost should be calculated
    // Input: 1M * $0.075/1M = $0.075
    // Output: 0.1M * $0.30/1M = $0.03
    // PDF: 10 pages * $0.001 = $0.01
    // Total: $0.115
    expect(summary.estimated_cost).toBeCloseTo(0.115, 2);

    await tracker.close();
  });

  it('[P1] should filter by workspace_id', async () => {
    // GIVEN: Events from different workspaces
    const tracker = new UsageTracker(TEST_DB_PATH);

    await tracker.trackEvent({
      event_type: EventType.PIPELINE_STARTED,
      workspace_id: 'ws-1'
    });
    await tracker.trackEvent({
      event_type: EventType.PIPELINE_STARTED,
      workspace_id: 'ws-2'
    });
    await tracker.trackEvent({
      event_type: EventType.PIPELINE_STARTED,
      workspace_id: 'ws-1'
    });

    // WHEN: Getting summary for specific workspace
    const summary = await tracker.getUsageSummary({ workspace_id: 'ws-1' });

    // THEN: Should only count ws-1 events
    expect(summary.total_executions).toBe(2);

    await tracker.close();
  });
});

describe('[P0] UsageTracker - Usage Detail', () => {
  it('[P0] should return paginated events', async () => {
    // GIVEN: Multiple events
    const tracker = new UsageTracker(TEST_DB_PATH);

    for (let i = 0; i < 10; i++) {
      await tracker.trackPipelineStarted(`exec-${i}`);
    }

    // WHEN: Getting first page
    const page1 = await tracker.getUsageDetail({ limit: 5, offset: 0 });

    // THEN: Should return correct pagination info
    expect(page1.events.length).toBe(5);
    expect(page1.total).toBe(10);
    expect(page1.has_more).toBe(true);
    expect(page1.pagination.limit).toBe(5);
    expect(page1.pagination.offset).toBe(0);

    // WHEN: Getting second page
    const page2 = await tracker.getUsageDetail({ limit: 5, offset: 5 });

    // THEN: Should return remaining events
    expect(page2.events.length).toBe(5);
    expect(page2.has_more).toBe(false);

    await tracker.close();
  });

  it('[P0] should filter by event_type', async () => {
    // GIVEN: Different event types
    const tracker = new UsageTracker(TEST_DB_PATH);

    await tracker.trackPipelineStarted('exec-1');
    await tracker.trackPipelineCompleted('exec-1', 5000);
    await tracker.trackApiCall('gemini', 'flash', 1000, 500);

    // WHEN: Filtering by API calls
    const detail = await tracker.getUsageDetail({
      event_type: EventType.GEMINI_API_CALL
    });

    // THEN: Should only return API call events
    expect(detail.total).toBe(1);
    expect(detail.events[0].event_type).toBe(EventType.GEMINI_API_CALL);

    await tracker.close();
  });

  it('[P1] should return events in descending timestamp order', async () => {
    // GIVEN: Events added in sequence
    const tracker = new UsageTracker(TEST_DB_PATH);

    await tracker.trackPipelineStarted('exec-1');
    await new Promise(r => setTimeout(r, 10)); // Small delay
    await tracker.trackPipelineStarted('exec-2');
    await new Promise(r => setTimeout(r, 10));
    await tracker.trackPipelineStarted('exec-3');

    // WHEN: Getting detail
    const detail = await tracker.getUsageDetail();

    // THEN: Most recent should be first
    expect(detail.events[0].resource_id).toBe('exec-3');
    expect(detail.events[2].resource_id).toBe('exec-1');

    await tracker.close();
  });
});

describe('[P1] UsageTracker - Cost Breakdown', () => {
  it('[P1] should break down costs by category', async () => {
    // GIVEN: Usage events
    const tracker = new UsageTracker(TEST_DB_PATH);

    await tracker.trackApiCall('gemini', 'flash', 100_000, 50_000);
    await tracker.trackPdfGenerated('exec-1', 5);

    // WHEN: Getting cost breakdown
    const costs = await tracker.getCostBreakdown();

    // THEN: Should have detailed breakdown
    expect(costs.gemini.input_tokens).toBe(100_000);
    expect(costs.gemini.output_tokens).toBe(50_000);
    expect(costs.gemini.input_cost).toBeGreaterThan(0);
    expect(costs.gemini.output_cost).toBeGreaterThan(0);
    expect(costs.puppeteer.pdf_pages).toBe(5);
    expect(costs.total_estimated_cost).toBeGreaterThan(0);

    await tracker.close();
  });

  it('[P1] should calculate cost per execution', async () => {
    // GIVEN: Multiple executions with usage
    const tracker = new UsageTracker(TEST_DB_PATH);

    await tracker.trackPipelineStarted('exec-1');
    await tracker.trackApiCall('gemini', 'flash', 100_000, 50_000);
    await tracker.trackPipelineCompleted('exec-1', 5000);

    await tracker.trackPipelineStarted('exec-2');
    await tracker.trackApiCall('gemini', 'flash', 100_000, 50_000);
    await tracker.trackPipelineCompleted('exec-2', 3000);

    // WHEN: Getting cost breakdown
    const costs = await tracker.getCostBreakdown();

    // THEN: Should calculate per-execution cost
    expect(costs.cost_per_execution).toBeGreaterThan(0);
    expect(costs.cost_per_execution).toBeLessThan(costs.total_estimated_cost);

    await tracker.close();
  });
});

describe('[P1] EventType Constants', () => {
  it('[P1] should have all required event types', () => {
    expect(EventType.PIPELINE_STARTED).toBe('pipeline.started');
    expect(EventType.PIPELINE_COMPLETED).toBe('pipeline.completed');
    expect(EventType.PIPELINE_FAILED).toBe('pipeline.failed');
    expect(EventType.GEMINI_API_CALL).toBe('gemini.api_call');
    expect(EventType.GROQ_API_CALL).toBe('groq.api_call');
    expect(EventType.PUPPETEER_PDF).toBe('puppeteer.pdf_generated');
  });
});

describe('[P1] COST_CONFIG Constants', () => {
  it('[P1] should have Gemini pricing configured', () => {
    expect(COST_CONFIG.gemini.inputCostPer1M).toBeGreaterThan(0);
    expect(COST_CONFIG.gemini.outputCostPer1M).toBeGreaterThan(0);
  });

  it('[P1] should have Puppeteer pricing configured', () => {
    expect(COST_CONFIG.puppeteer.costPerPage).toBeGreaterThan(0);
  });
});
