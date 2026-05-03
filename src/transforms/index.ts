/**
 * Transforms - Consolidated TypeScript Module
 *
 * Consolidates all document transformation functionality:
 * - AI Audit Report (transform_audit)
 * - Project Plan (transform_project_plan)
 * - Proposal (transform_proposal)
 *
 * @module src/transforms
 */

import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import Mustache from 'mustache';

// External dependencies (remain as JS imports until migrated)
import { calculatePricing, calculateROI } from '../../lib/pricing_calculator.js';
import { buildPhases, calculateTotalDuration } from '../../lib/milestone_builder.js';
import { validateProjectPlan, formatValidationErrors } from '../../lib/validate.js';
import { generateFootnotesHtml } from '../../lib/citations.js';
import { slugify } from '../../lib/file_utils.js';
import {
  generateProjectIdentity,
  formatDateDisplay,
  formatCurrency as formatCurrencyUnified
} from '../../lib/project_identity.js';

// ============================================================================
// Type Definitions
// ============================================================================

export type DocumentType = 'audit' | 'project_plan' | 'proposal';

export interface TransformOptions {
  debug?: boolean;
  skipValidation?: boolean;
  templateOverrides?: Record<string, unknown>;
  integrationResearch?: unknown[];
  platform?: string;
  valid_days?: number;
}

export interface TransformResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  warnings: string[];
  timing: {
    startedAt: Date;
    completedAt: Date;
    durationMs: number;
  };
}

export interface UnifiedTransformInput {
  intake: Record<string, unknown>;
  estimate?: Record<string, unknown>;
  research?: Record<string, unknown>;
}

interface AuditConfig {
  producer: {
    name: string;
    email: string;
    company: string;
  };
  brand: {
    brand_name: string;
    logo_uri: string;
    primary_domain: string;
  };
  offer: {
    sku_code: string;
    sku_name: string;
    display_in_footer: boolean;
  };
  cta: {
    link: string;
    link_display: string;
    call_duration_minutes: number;
  };
  rendering: {
    mode: string;
    page_size: string;
    margins: { top: number; right: number; bottom: number; left: number };
    max_pages: number;
  };
}

interface ProposalConfig {
  brand: {
    brand_name: string;
    logo_uri: string;
    primary_domain: string;
  };
  producer: {
    producer_name: string;
    producer_email: string;
  };
  defaults: {
    valid_days: number;
    platform: string;
    warranty_days: number;
  };
  cta: {
    book_call_link: string;
    approve_link_template: string;
  };
}

interface Measurement {
  id: string;
  name: string;
  metric_type: string;
  value: number;
  value_display: string;
  unit?: string;
  status?: string;
  status_reason?: string;
  source?: string;
  threshold?: {
    direction?: string;
    healthy_max?: number;
    warning_max?: number;
    healthy_min?: number;
    warning_min?: number;
    target?: number;
    target_display?: string;
  };
  evidence?: Array<{ type?: string; summary: string }>;
}

interface MeasurementsData {
  measurements: Measurement[];
  item_type?: string; // e.g., "appointments", "orders", "leads" - derived from workflow name
  bleed_total?: {
    value: number;
    currency?: string;
    period?: string;
    display?: string;
  };
  bleed_assumptions?: Array<{
    id: string;
    label: string;
    value: number;
    value_display?: string;
    source?: string;
  }>;
  bleed_calculations?: Array<{
    id: string;
    label: string;
    formula: string;
    inputs?: string[];
    result: number;
  }>;
}

// ============================================================================
// Default Configurations
// ============================================================================

const DEFAULT_AUDIT_CONFIG: AuditConfig = {
  producer: {
    name: "",
    email: "",
    company: "Wranngle Systems LLC"
  },
  brand: {
    brand_name: "Wranngle Systems LLC",
    logo_uri: "https://i.ibb.co/WWFmbjKJ/wranngle-wordmark-4096w.png",
    primary_domain: ""
  },
  offer: {
    sku_code: "WR-AI-AUDIT-100",
    sku_name: "AI Process Audit (Phase 1)",
    display_in_footer: true
  },
  cta: {
    link: "",
    link_display: "",
    call_duration_minutes: 30
  },
  rendering: {
    mode: "conversion",
    page_size: "letter",
    margins: { top: 0.35, right: 0.35, bottom: 0.45, left: 0.35 },
    max_pages: 1
  }
};

const DEFAULT_PROPOSAL_CONFIG: ProposalConfig = {
  brand: {
    brand_name: process.env.PRODUCER_NAME || 'Wranngle Systems LLC',
    logo_uri: process.env.LOGO_URI || 'https://i.ibb.co/WWFmbjKJ/wranngle-wordmark-4096w.png',
    primary_domain: process.env.PRODUCER_DOMAIN || 'wranngle.com'
  },
  producer: {
    producer_name: process.env.PRODUCER_NAME || 'Wranngle Systems LLC',
    producer_email: process.env.PRODUCER_EMAIL || ''
  },
  defaults: {
    valid_days: parseInt(process.env.DEFAULT_VALIDITY_DAYS || '14') || 14,
    platform: process.env.DEFAULT_PLATFORM || 'direct',
    warranty_days: 30
  },
  cta: {
    book_call_link: process.env.CTA_BOOK_CALL_LINK || '',
    approve_link_template: process.env.APPROVE_LINK_TEMPLATE || ''
  }
};

const LOGO_URL = 'https://i.ibb.co/WWFmbjKJ/wranngle-wordmark-4096w.png';

// ============================================================================
// Utility Functions
// ============================================================================

function getYear(isoString: string): string {
  return new Date(isoString).getFullYear().toString();
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatCurrency(value: number | string): string {
  if (typeof value !== 'number') return value as string;
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function normalizeDurationUnit(unit?: string): string {
  if (!unit) return 'd';
  const lower = unit.toLowerCase().trim();

  const unitMap: Record<string, string> = {
    's': 's', 'sec': 's', 'secs': 's', 'second': 's', 'seconds': 's',
    'm': 'm', 'min': 'm', 'mins': 'm', 'minute': 'm', 'minutes': 'm',
    'h': 'h', 'hr': 'h', 'hrs': 'h', 'hour': 'h', 'hours': 'h',
    'd': 'd', 'day': 'd', 'days': 'd', 'business day': 'd', 'business days': 'd',
    'w': 'w', 'wk': 'w', 'wks': 'w', 'week': 'w', 'weeks': 'w',
    'mo': 'mo', 'month': 'mo', 'months': 'mo',
    'y': 'y', 'yr': 'y', 'yrs': 'y', 'year': 'y', 'years': 'y'
  };

  return unitMap[lower] || 'd';
}

// ============================================================================
// Audit Transform - Helper Functions
// ============================================================================

function deriveStatus(measurement: Measurement): string {
  if (measurement.status) return measurement.status;

  const threshold = measurement.threshold;
  if (!threshold) return 'warning';

  const value = measurement.value;
  const direction = threshold.direction || 'lower_is_better';

  if (direction === 'lower_is_better') {
    if (threshold.healthy_max !== undefined && value <= threshold.healthy_max) return 'healthy';
    if (threshold.warning_max !== undefined && value <= threshold.warning_max) return 'warning';
    return 'critical';
  } else {
    if (threshold.healthy_min !== undefined && value >= threshold.healthy_min) return 'healthy';
    if (threshold.warning_min !== undefined && value >= threshold.warning_min) return 'warning';
    return 'critical';
  }
}

type SystemType = 'crm' | 'marketing_automation' | 'email' | 'sms' | 'forms' |
  'call_tracking' | 'ticketing' | 'spreadsheet' | 'database' | 'payment' | 'calendar' | 'custom_app' | 'other';

function inferSystemType(name: string): SystemType {
  const lower = name.toLowerCase();
  if (lower.includes('crm') || lower.includes('hubspot') || lower.includes('salesforce')) return 'crm';
  if (lower.includes('email') || lower.includes('outlook') || lower.includes('gmail') || lower.includes('mail')) return 'email';
  if (lower.includes('calendar') || lower.includes('google calendar') || lower.includes('outlook calendar')) return 'calendar';
  if (lower.includes('excel') || lower.includes('spreadsheet') || lower.includes('sheets') || lower.includes('airtable')) return 'spreadsheet';
  if (lower.includes('phone') || lower.includes('call') || lower.includes('twilio') || lower.includes('ringcentral')) return 'call_tracking';
  if (lower.includes('portal') || lower.includes('app')) return 'custom_app';
  if (lower.includes('ticket') || lower.includes('zendesk') || lower.includes('freshdesk')) return 'ticketing';
  if (lower.includes('sms') || lower.includes('text')) return 'sms';
  if (lower.includes('form') || lower.includes('typeform') || lower.includes('jotform')) return 'forms';
  if (lower.includes('database') || lower.includes('sql') || lower.includes('postgres') || lower.includes('mysql')) return 'database';
  if (lower.includes('payment') || lower.includes('stripe') || lower.includes('paypal')) return 'payment';
  if (lower.includes('marketing') || lower.includes('mailchimp') || lower.includes('klaviyo')) return 'marketing_automation';
  return 'other';
}

function buildSystemsInvolved(intake: Record<string, unknown>): Array<{ system_name: string; system_type: SystemType; environment: string }> {
  const sectionC = intake.section_c_systems_handoffs as Record<string, unknown> | undefined;
  const systems = (sectionC?.q10_systems_involved as string[]) || [];
  return systems.map((name) => ({
    system_name: name.split('(')[0].trim(),
    system_type: inferSystemType(name),
    environment: "prod"
  }));
}

function buildWorkflowSteps(intake: Record<string, unknown>): Array<{ step_id: string; sequence: number; name: string; owner_type: string }> {
  const steps: Array<{ step_id: string; sequence: number; name: string; owner_type: string }> = [];
  let seq = 1;

  const sectionA = intake.section_a_workflow_definition as Record<string, unknown> | undefined;
  const sectionC = intake.section_c_systems_handoffs as Record<string, unknown> | undefined;

  // Step 1: Trigger
  steps.push({
    step_id: `step-${seq}`,
    sequence: seq++,
    name: (sectionA?.q02_trigger_event as string) || "Trigger event",
    owner_type: "automation"
  });

  // Manual transfers
  const manualTransfers = sectionC?.q11_manual_data_transfers as string;
  if (manualTransfers) {
    steps.push({
      step_id: `step-${seq}`,
      sequence: seq++,
      name: "Manual data transfer",
      owner_type: "human"
    });
  }

  // Human gates
  const humanGates = sectionC?.q12_human_decision_gates as string;
  if (humanGates) {
    steps.push({
      step_id: `step-${seq}`,
      sequence: seq++,
      name: "Human review/decision",
      owner_type: "human"
    });
  }

  // End condition
  steps.push({
    step_id: `step-${seq}`,
    sequence: seq++,
    name: (sectionA?.q04_end_condition as string) || "Workflow complete",
    owner_type: "human"
  });

  return steps;
}

function buildMeasurementValue(m: Measurement): Record<string, unknown> {
  switch (m.metric_type) {
    case 'latency':
      return {
        kind: 'duration',
        duration: {
          value: m.value,
          unit: normalizeDurationUnit(m.unit),
          display: m.value_display
        }
      };
    case 'error_rate':
    case 'quality':
      return {
        kind: 'percentage',
        value: m.value,
        scale: 'percent',
        display: m.value_display
      };
    case 'complexity':
      return {
        kind: 'count',
        value: m.value,
        display: m.value_display
      };
    default:
      return {
        kind: 'count',
        value: m.value,
        display: m.value_display
      };
  }
}

function buildWorkflowMeasurements(measurements: MeasurementsData): Array<Record<string, unknown>> {
  return measurements.measurements.filter(m => m && getMeasurementName(m)).map(m => ({
    measurement_id: m.id,
    name: getMeasurementName(m),
    metric_type: m.metric_type,
    value: buildMeasurementValue(m),
    value_display: m.value_display,
    ...(m.threshold?.target_display ? { target: m.threshold.target_display } : {}),
    method: m.source?.includes('intake') ? 'stakeholder_interview' : 'system_analysis',
    evidence: m.evidence?.map(e => ({
      evidence_id: `ev-${randomUUID().slice(0, 8)}`,
      source_id: "src-intake-call",
      evidence_type: e.type || "client_statement",
      summary: e.summary
    })) || []
  }));
}

// Helper to get measurement name (handles both 'name' and 'metric_name' fields)
function getMeasurementName(m: Measurement | null | undefined): string {
  if (!m) return '';
  // @ts-ignore - metric_name is used in structured input path
  return m.name || m.metric_name || '';
}

function isBaselineMetric(m: Measurement): boolean {
  if (m === null || m === undefined) return false;
  const nameValue = getMeasurementName(m);
  if (!nameValue) return false;
  const name = nameValue.toLowerCase();
  const id = m.id?.toLowerCase() || '';

  const baselinePatterns = [
    'lifetime value', 'ltv', 'hourly cost', 'hourly rate',
    'volume', 'count', 'target time', 'goal', 'target sla'
  ];

  if (m.status === 'healthy' && m.status_reason?.toLowerCase().includes('baseline')) {
    return true;
  }

  if (baselinePatterns.some(p => name.includes(p) || id.includes(p))) {
    if (m.threshold && m.status && m.status !== 'healthy') {
      return false;
    }
    return true;
  }

  return false;
}

function generateDefaultTarget(m: Measurement): string {
  const metricType = m.metric_type;
  const value = m.value;
  const name = m.name?.toLowerCase() || '';
  const unit = m.unit || '';
  const isCurrency = unit === 'dollars' || unit === 'USD' || unit === '$' || m.value_display?.startsWith('$');

  if (metricType === 'cost' || isCurrency) {
    const improved = Math.round(value * 0.5);
    return `< $${improved}`;
  }

  if (metricType === 'error_rate' || name.includes('error') || name.includes('rate')) {
    return '< 5%';
  }

  if (metricType === 'quality' || name.includes('quality') || name.includes('accuracy')) {
    return '> 95%';
  }

  if (name.includes('sla') || name.includes('completion') || name.includes('on-time')) {
    return '> 95%';
  }

  if (metricType === 'latency' || name.includes('time') || name.includes('delay') || name.includes('response')) {
    if (unit === 'h' || unit.includes('hour')) {
      const hours = parseFloat(String(value));
      if (hours > 24) return '< 24h';
      if (hours > 4) return '< 4h';
      if (hours > 1) return '< 1h';
      return '< 30m';
    }
    if (unit === 'd' || unit.includes('day')) {
      const days = parseFloat(String(value));
      if (days > 7) return '< 7d';
      if (days > 3) return '< 3d';
      if (days > 1) return '< 24h';
      return '< 1d';
    }
    if (unit === 'm' || unit.includes('min')) {
      const mins = parseFloat(String(value));
      if (mins > 30) return '< 30m';
      if (mins > 15) return '< 15m';
      return '< 5m';
    }
    return `< ${Math.round(value * 0.5)}${unit}`;
  }

  if (metricType === 'complexity' || name.includes('step') || name.includes('handoff') || name.includes('system')) {
    return `< ${Math.max(1, Math.round(value * 0.5))}`;
  }

  if (name.includes('fail') || name.includes('miss') || name.includes('drop')) {
    return '< 10%';
  }

  if (typeof value === 'number') {
    const improved = Math.round(value * 0.5);
    if (m.value_display?.includes('%')) {
      return `< ${improved}%`;
    }
    if (unit === 'dollars' || unit === 'USD' || unit === '$' || m.value_display?.startsWith('$')) {
      return `< $${improved}`;
    }
    return `< ${improved}${unit}`;
  }

  return 'Industry Benchmark';
}

function buildScorecardRows(measurements: MeasurementsData, maxRows = 3): Array<Record<string, unknown>> {
  const actionableMeasurements = measurements.measurements.filter(m => {
    if (!m || !getMeasurementName(m)) return false;
    const status = deriveStatus(m);
    if (status === 'healthy') return false;
    if (isBaselineMetric(m)) return false;
    return true;
  });

  const sorted = actionableMeasurements.sort((a, b) => {
    const statusA = deriveStatus(a);
    const statusB = deriveStatus(b);
    if (statusA === 'critical' && statusB !== 'critical') return -1;
    if (statusB === 'critical' && statusA !== 'critical') return 1;
    return 0;
  });

  const limited = sorted.slice(0, maxRows);

  return limited.map(m => {
    const status = deriveStatus(m);
    const hasTarget = m.threshold?.target_display || m.threshold?.target != null;

    const metrics = [
      {
        label: "Your metric",
        value_display: m.value_display,
        measurement_id: m.id,
        is_benchmark: false
      }
    ];

    if (hasTarget) {
      metrics.push({
        label: "Target",
        value_display: m.threshold?.target_display || String(m.threshold?.target),
        measurement_id: `${m.id}-target`,
        is_benchmark: true
      });
    } else {
      const defaultTarget = generateDefaultTarget(m);
      metrics.push({
        label: "Target",
        value_display: defaultTarget,
        measurement_id: `${m.id}-target`,
        is_benchmark: true
      });
    }

    const measName = getMeasurementName(m);
    return {
      row_id: `row-${m.id}`,
      category: measName,
      status: status,
      status_is_critical: status === 'critical',
      has_metrics: true,
      finding: {
        summary: `[LLM_PLACEHOLDER: finding_summary for ${measName}]`,
        risk: status !== 'healthy' ? `[LLM_PLACEHOLDER: finding_risk for ${measName}]` : null
      },
      metrics: metrics,
      measurement_ids: [m.id]
    };
  });
}

function buildBleed(measurements: MeasurementsData): Record<string, unknown> {
  const bleedData = measurements.bleed_total || { value: 0, currency: 'USD', period: 'month' };
  const assumptions = measurements.bleed_assumptions || [];
  const calculations = measurements.bleed_calculations || [];
  // Get item_type from measurements (e.g., "appointments", "orders", "leads")
  const itemType = measurements.item_type || 'items';

  const annualBleed = bleedData.value * 12;
  const annualDisplay = `$${annualBleed.toLocaleString()}`;

  return {
    currency: bleedData.currency || 'USD',
    period: bleedData.period || 'month',
    item_type: itemType,
    period_display: bleedData.period === 'month' ? 'Per Month' : `Per ${bleedData.period}`,
    total: {
      amount: bleedData.value,
      currency: bleedData.currency || 'USD',
      period: 'monthly',
      display: bleedData.display || `$${bleedData.value.toLocaleString()}`,
      amount_display: `$${bleedData.value.toLocaleString()}`
    },
    annual_amount: annualBleed,
    annual_display: annualDisplay,
    breakdown: [{
      item_id: "bleed-primary",
      label: "Primary Bleed",
      status: "critical",
      amount: {
        amount: bleedData.value,
        currency: bleedData.currency || 'USD',
        period: 'monthly',
        display: bleedData.display || `$${bleedData.value.toLocaleString()}`
      },
      driver_measurement_ids: measurements.measurements.filter(m => m && m.status === 'critical').map(m => m.id)
    }],
    assumptions: assumptions.map(a => ({
      assumption_id: a.id,
      name: a.label,
      value: a.value,
      unit: a.value_display?.replace(String(a.value), '').trim() || '',
      source_or_basis: a.source || 'Client-provided estimate',
      confidence: 'medium'
    })),
    calculations: calculations.map(c => ({
      calc_id: c.id,
      label: c.label,
      formula: c.formula,
      inputs: c.inputs || [],
      result_amount: {
        amount: c.result,
        currency: 'USD',
        period: 'monthly'
      },
      attribution_breakdown_item_id: "bleed-primary"
    })),
    math_defender_text: "[LLM_PLACEHOLDER: math_defender_text]"
  };
}

interface FixGroup {
  label: string;
  measurements: Measurement[];
  priority: number;
}

function groupMeasurementsForFixes(measurements: Measurement[]): Record<string, FixGroup> {
  const groups: Record<string, FixGroup> = {
    sla_latency: { label: 'SLA/Latency Issues', measurements: [], priority: 1 },
    automation: { label: 'Manual Process Automation', measurements: [], priority: 2 },
    visibility: { label: 'Process Visibility', measurements: [], priority: 3 },
    quality: { label: 'Quality Issues', measurements: [], priority: 4 }
  };

  measurements.forEach(m => {
    const nameVal = getMeasurementName(m);
    if (!m || !nameVal) return;
    const name = nameVal.toLowerCase();

    if (isBaselineMetric(m)) return;

    if (name.includes('sla') || name.includes('delay') || name.includes('time') ||
        m.metric_type === 'latency') {
      groups.sla_latency.measurements.push(m);
    } else if (name.includes('manual') || name.includes('sync') || name.includes('wasted') ||
               name.includes('systems')) {
      groups.automation.measurements.push(m);
    } else if (name.includes('visibility') || name.includes('miss rate') ||
               m.metric_type === 'error_rate') {
      groups.visibility.measurements.push(m);
    } else {
      groups.quality.measurements.push(m);
    }
  });

  return groups;
}

function buildFixes(intake: Record<string, unknown>, measurements: MeasurementsData, maxFixes = 4): Record<string, unknown> {
  const criticalMeasurements = measurements.measurements.filter(m =>
    m && getMeasurementName(m) && deriveStatus(m) === 'critical' && !isBaselineMetric(m)
  );

  const bleedPeriod = measurements.bleed_total?.period || 'month';
  const totalBleed = measurements.bleed_total?.value || 0;

  const groups = groupMeasurementsForFixes(criticalMeasurements);

  const activeGroups = Object.entries(groups)
    .filter(([_, g]) => g.measurements.length > 0)
    .sort((a, b) => a[1].priority - b[1].priority)
    .slice(0, maxFixes);

  const totalWeight = activeGroups.reduce((sum, [_, g]) => sum + g.measurements.length, 0);

  const items = activeGroups.map(([key, group], idx) => {
    const relatedIds = group.measurements.map(m => m.id);
    const impactShare = relatedIds.length / totalWeight;
    const recoveryAmount = Math.round(totalBleed * impactShare);

    return {
      fix_id: `fix-${idx + 1}`,
      status: "proposed",
      severity: "critical",
      bleed_period: bleedPeriod,
      problem: `[LLM_PLACEHOLDER: fix_problem for ${group.label}]`,
      solution: `[LLM_PLACEHOLDER: fix_solution for ${group.label}]`,
      quick_win: idx === 0,
      impact: {
        estimated_recovery: {
          amount: recoveryAmount,
          currency: "USD",
          period: "monthly",
          display: `$${recoveryAmount.toLocaleString()}`
        },
        basis: "[LLM_PLACEHOLDER: impact_basis]",
        maps_to_breakdown_item_ids: ["bleed-primary"],
        tier: impactShare > 0.3 ? "high" : "medium"
      },
      effort: {
        tier: idx === 0 ? "low" : (relatedIds.length > 2 ? "high" : "medium"),
        estimated_hours_range: {
          min_hours: idx === 0 ? 8 : (relatedIds.length > 2 ? 24 : 16),
          most_likely_hours: idx === 0 ? 16 : (relatedIds.length > 2 ? 40 : 24),
          max_hours: idx === 0 ? 24 : (relatedIds.length > 2 ? 60 : 40)
        },
        skills_required: ["automation", "API"]
      },
      turnaround: {
        label: idx === 0 ? "7-14 Days" : (relatedIds.length > 2 ? "30-45 Days" : "14-21 Days"),
        business_days_min: idx === 0 ? 7 : (relatedIds.length > 2 ? 30 : 14),
        business_days_max: idx === 0 ? 14 : (relatedIds.length > 2 ? 45 : 21)
      },
      dependencies: [],
      acceptance_criteria: ["[LLM_PLACEHOLDER: acceptance_criteria]"],
      related_measurement_ids: relatedIds
    };
  });

  return {
    quick_win_fix_id: items[0]?.fix_id || null,
    items
  };
}

function buildAuditCTA(config: AuditConfig): Record<string, unknown> {
  return {
    phases: [
      { phase_id: "phase_1_audit", label: "Phase 1: Audit", state: "complete", is_last: false },
      { phase_id: "phase_2_stabilize", label: "Phase 2: Stabilize", state: "current", is_last: false },
      { phase_id: "phase_3_scale", label: "Phase 3: Scale", state: "upcoming", is_last: true }
    ],
    current_phase: "phase_2_stabilize",
    completed_phase_ids: ["phase_1_audit"],
    headline: "[LLM_PLACEHOLDER: cta_headline]",
    subtext: "[LLM_PLACEHOLDER: cta_subtext]",
    link: config.cta.link,
    link_display: config.cta.link_display,
    call_duration_minutes: config.cta.call_duration_minutes
  };
}

// ============================================================================
// Audit Transform - Main Function
// ============================================================================

/**
 * Transform intake and measurements into AI Audit Report JSON
 * @param intake - Intake packet data
 * @param measurements - Extracted measurements
 * @param userConfig - Optional config overrides
 * @returns Report JSON with LLM placeholders
 */
export function transform(
  intake: Record<string, unknown>,
  measurements: MeasurementsData,
  userConfig: Partial<AuditConfig> = {}
): Record<string, unknown> {
  const config = { ...DEFAULT_AUDIT_CONFIG, ...userConfig } as AuditConfig;
  const now = new Date().toISOString();
  const sectionA = intake.section_a_workflow_definition as Record<string, unknown> | undefined;
  const workflowName = (sectionA?.q01_workflow_name as string) || "Unnamed Workflow";

  const scorecardRows = buildScorecardRows(measurements);

  const statusCounts = { critical: 0, warning: 0, healthy: 0 };
  scorecardRows.forEach(row => {
    const status = row.status as string;
    if (status in statusCounts) {
      statusCounts[status as keyof typeof statusCounts]++;
    }
  });

  const preparedFor = intake.prepared_for as Record<string, unknown> | undefined;

  return {
    schema_version: "1.0.0",
    document: {
      document_id: randomUUID(),
      created_at: now,
      report_date: formatDateDisplay(now),
      report_year: getYear(now),
      title: `Phase 1: AI Process Audit — ${workflowName}`,
      subtitle: "",
      confidentiality: "confidential",
      locale: "en-US",
      timezone: "America/Indiana/Indianapolis",
      brand: config.brand
    },
    prepared_for: {
      account_id: preparedFor?.account_id || "unknown",
      account_name: preparedFor?.account_name || "Unknown Client",
      industry: "Unknown",
      primary_contact: {
        name: "Unknown",
        title: "Unknown",
        email: "unknown@example.com",
        role_in_decision: "economic_buyer"
      }
    },
    prepared_by: {
      producer_name: config.producer.name,
      producer_email: config.producer.email,
      producer_company: config.producer.company
    },
    project_identity: generateProjectIdentity(intake, { documentType: 'audit' }),
    audit: {
      audit_id: `audit-${getYear(now)}-${randomUUID().slice(0, 8)}`,
      scope: {
        scope_statement: "[LLM_PLACEHOLDER: scope_statement]",
        in_scope: ["[LLM_PLACEHOLDER: scope_items]"],
        out_of_scope: ["[LLM_PLACEHOLDER: out_of_scope]"],
        systems_involved: buildSystemsInvolved(intake),
        time_window: {
          start: new Date(Date.now() - 30*24*60*60*1000).toISOString(),
          end: now,
          timezone: "America/Indiana/Indianapolis"
        }
      },
      methodology: {
        methods: [{
          method_type: "stakeholder_interview",
          details: "30-minute intake call",
          sample_size: 1
        }],
        data_sources: [{
          source_id: "src-intake-call",
          source_type: "interview",
          source_label: `Intake interview (${formatDateDisplay(now)})`
        }],
        limitations: ["[LLM_PLACEHOLDER: limitations]"],
        confidence: {
          rating: "medium",
          rationale: "Client-provided estimates without system log validation"
        }
      },
      workflows: [{
        workflow_id: `wf-${randomUUID().slice(0, 8)}`,
        name: workflowName,
        trigger: (sectionA?.q02_trigger_event as string) || "Unknown trigger",
        objective: (sectionA?.q03_business_objective as string) || "Unknown objective",
        primary_kpi: `${measurements.measurements[0]?.name || 'Primary metric'} target`,
        steps: buildWorkflowSteps(intake),
        measurements: buildWorkflowMeasurements(measurements)
      }]
    },
    scorecard: {
      executive_summary: {
        body: "[LLM_PLACEHOLDER: executive_summary]",
        generated_by: "pending_llm"
      },
      rows: scorecardRows,
      overall: {
        status_distribution: statusCounts
      }
    },
    bleed: buildBleed(measurements),
    fixes: buildFixes(intake, measurements),
    cta: buildAuditCTA(config),
    benchmarks: [],
    sources: [],
    rendering: {
      mode: config.rendering.mode,
      is_conversion_mode: config.rendering.mode === "conversion",
      page: {
        size: config.rendering.page_size,
        margins_in: config.rendering.margins
      },
      layout_guards: {
        max_pages: config.rendering.max_pages
      }
    },
    offer: config.offer
  };
}

/**
 * Get list of LLM placeholder fields in a report
 */
export function getLLMPlaceholders(reportJson: Record<string, unknown>): Array<{ path: string; prompt_id: string }> {
  const placeholders: Array<{ path: string; prompt_id: string }> = [];

  function findPlaceholders(obj: unknown, path = ''): void {
    if (typeof obj === 'string' && obj.startsWith('[LLM_PLACEHOLDER:')) {
      const match = obj.match(/\[LLM_PLACEHOLDER:\s*([^\]]+)\]/);
      if (match) {
        placeholders.push({
          path: path,
          prompt_id: match[1].trim()
        });
      }
    } else if (Array.isArray(obj)) {
      obj.forEach((item, idx) => findPlaceholders(item, `${path}[${idx}]`));
    } else if (obj && typeof obj === 'object') {
      Object.entries(obj as Record<string, unknown>).forEach(([key, value]) => {
        findPlaceholders(value, path ? `${path}.${key}` : key);
      });
    }
  }

  findPlaceholders(reportJson);
  return placeholders;
}

// Aliases for backwards compatibility
export const transformAudit = transform;
export const getAuditLLMPlaceholders = getLLMPlaceholders;

// ============================================================================
// Proposal Transform - Helper Functions
// ============================================================================

function generateProposalNumber(date: Date): string {
  const year = date.getFullYear();
  const sequence = Math.floor(Math.random() * 9000) + 1000;
  return `WRN-${year}-${sequence}`;
}

function buildProposalProjectIdentity(extracted: Record<string, unknown>, validDays: number): Record<string, unknown> {
  const intake = extracted.intake as Record<string, unknown> | undefined;
  const projectIdentity = extracted.project_identity as Record<string, unknown> | undefined;
  const projectPlan = extracted.project_plan as Record<string, unknown> | undefined;
  const client = extracted.client as Record<string, unknown> | undefined;
  const workflow = extracted.workflow as Record<string, unknown> | undefined;
  const project = extracted.project as Record<string, unknown> | undefined;

  const preparedFor = intake?.prepared_for as Record<string, unknown> | undefined;
  const sectionA = intake?.section_a_workflow_definition as Record<string, unknown> | undefined;
  const ppIdentity = projectPlan?.project_identity as Record<string, unknown> | undefined;

  const clientName = preparedFor?.account_name ||
                     projectIdentity?.client_name ||
                     ppIdentity?.client_name ||
                     client?.account_name;

  const workflowName = sectionA?.q01_workflow_name ||
                       projectIdentity?.process_name ||
                       (workflow as Record<string, unknown>)?.name ||
                       (project as Record<string, unknown>)?.name;

  const intakeForIdentity = {
    client_name: clientName,
    workflow_name: workflowName,
    process_name: workflowName,
    project_identity: projectIdentity,
    project_plan: projectPlan
  };

  const friendlyName = (projectIdentity?.friendly_name as string) ||
    (ppIdentity?.friendly_name as string) ||
    undefined;

  return generateProjectIdentity(intakeForIdentity, {
    documentType: 'proposal',
    friendlyName,
    validityDays: validDays
  }) as Record<string, unknown>;
}

function extractKeyFindings(findings: unknown, count = 3): string[] {
  if (!findings || !Array.isArray(findings) || findings.length === 0) {
    return ['Workflow automation opportunities identified', 'Process efficiency gaps documented', 'Integration improvements recommended'];
  }

  const sorted = [...findings].sort((a, b) => {
    const statusOrder: Record<string, number> = { critical: 0, warning: 1, healthy: 2 };
    return (statusOrder[a.status] || 1) - (statusOrder[b.status] || 1);
  });

  return sorted.slice(0, count).map(f => f.finding || f);
}

function buildProposalPricingSection(pricing: Record<string, unknown>, platform: string): Record<string, unknown> {
  const milestones = pricing.milestones as Record<string, Record<string, unknown>>;

  const section: Record<string, unknown> = {
    currency: 'USD',
    pricing_model: 'fixed_price',
    subtotal: {
      amount: pricing.subtotal,
      currency: 'USD',
      period: 'once',
      display: formatCurrencyUnified(pricing.subtotal as number)
    },
    total: {
      amount: pricing.final_price,
      currency: 'USD',
      period: 'once',
      display: formatCurrencyUnified(pricing.final_price as number)
    },
    payment_schedule: {
      schedule_type: 'milestone_based',
      installments: [
        {
          milestone_id: '2.1',
          label: 'Milestone 2.1: Design',
          amount: { amount: milestones.design.amount, currency: 'USD', period: 'once', display: formatCurrencyUnified(milestones.design.amount as number) },
          percentage: milestones.design.percentage,
          percent: milestones.design.percentage,
          due_event: 'Design sign-off'
        },
        {
          milestone_id: '2.2',
          label: 'Milestone 2.2: Build',
          amount: { amount: milestones.build.amount, currency: 'USD', period: 'once', display: formatCurrencyUnified(milestones.build.amount as number) },
          percentage: milestones.build.percentage,
          percent: milestones.build.percentage,
          due_event: 'Build complete'
        },
        {
          milestone_id: '2.3',
          label: 'Milestone 2.3: Test',
          amount: { amount: milestones.test.amount, currency: 'USD', period: 'once', display: formatCurrencyUnified(milestones.test.amount as number) },
          percentage: milestones.test.percentage,
          percent: milestones.test.percentage,
          due_event: 'Testing approved'
        },
        {
          milestone_id: '2.4',
          label: 'Milestone 2.4: Deploy',
          amount: { amount: milestones.deploy.amount, currency: 'USD', period: 'once', display: formatCurrencyUnified(milestones.deploy.amount as number) },
          percentage: milestones.deploy.percentage,
          percent: milestones.deploy.percentage,
          due_event: 'Go-live complete'
        }
      ]
    }
  };

  if (platform === 'upwork') {
    section.platform_fees = {
      platform: 'upwork',
      fee_percentage: 0,
      fee_note: 'Upwork service fees paid separately by client'
    };
  } else {
    section.platform_fees = {
      platform: 'direct',
      fee_percentage: 0,
      fee_note: 'Direct engagement - no platform fees'
    };
  }

  const discount = pricing.discount as Record<string, unknown> | undefined;
  if (discount && (discount.total_percentage as number) > 0) {
    section.discount_applied = {
      percentage: discount.total_percentage,
      amount: { amount: discount.amount, currency: 'USD', display: formatCurrencyUnified(discount.amount as number) },
      reason: (discount.discounts_applied as Array<{ description: string }>)?.[0]?.description || 'Volume discount'
    };
  }

  const auditCredit = pricing.audit_credit as Record<string, unknown> | undefined;
  if (auditCredit) {
    section.audit_credit = {
      amount: auditCredit.amount,
      display: auditCredit.display,
      description: auditCredit.description
    };
  }

  const earlyAdopterDiscount = pricing.early_adopter_discount as Record<string, unknown> | undefined;
  if (earlyAdopterDiscount) {
    section.early_adopter_discount = {
      percentage: earlyAdopterDiscount.percentage,
      amount: earlyAdopterDiscount.amount,
      display: earlyAdopterDiscount.display,
      note: earlyAdopterDiscount.note
    };
  }

  return section;
}

function buildProposalScopeSection(extracted: Record<string, unknown>): Record<string, unknown> {
  const projectPlan = extracted.project_plan as Record<string, unknown> | undefined;
  const ppScope = projectPlan?.scope as Record<string, unknown> | undefined;

  if (ppScope) {
    return {
      in_scope: ppScope.in_scope || [],
      out_of_scope: ppScope.out_of_scope || [],
      assumptions: ppScope.assumptions || [],
      dependencies: ppScope.dependencies || [],
      change_control: 'Changes to scope after Design milestone sign-off may require separate pricing and timeline adjustment.'
    };
  }

  const recommendedFixes = extracted.recommended_fixes as Array<{ fix?: string }> | undefined;
  const workflow = extracted.workflow as Record<string, unknown> | undefined;

  const inScope: string[] = [];
  if (recommendedFixes?.length) {
    for (const fix of recommendedFixes.slice(0, 5)) {
      if (fix.fix) {
        inScope.push(fix.fix);
      }
    }
  }

  if (inScope.length < 3) {
    inScope.push(
      `${(workflow?.name as string) || 'Workflow'} automation implementation`,
      'System integration and data synchronization',
      'User training and documentation'
    );
  }

  const outOfScope = [
    'Third-party system licensing or subscription fees',
    'Hardware procurement or infrastructure changes',
    'Data migration from legacy systems not specified in scope',
    'Ongoing maintenance beyond 30-day warranty period'
  ];

  const assumptions = [
    'Client will provide timely access to required systems and credentials',
    'Key stakeholders available for requirements and testing sessions',
    'Existing system documentation is accurate and current',
    'No significant changes to business requirements during implementation'
  ];

  return {
    in_scope: inScope.length > 0 ? inScope : ['[LLM_PLACEHOLDER: scope_in_items]'],
    out_of_scope: outOfScope,
    assumptions: assumptions,
    change_control: 'Changes to scope after Design milestone sign-off may require separate pricing and timeline adjustment.'
  };
}

function buildProposalTermsSection(platform: string, validDays: number, config: ProposalConfig): Record<string, unknown> {
  const terms: Record<string, unknown> = {
    validity_period: `This proposal is valid for ${validDays} days from date of issue.`,
    warranty_period: `${config.defaults.warranty_days}-day bug fix coverage post-deployment`,
    defect_coverage: `${config.defaults.warranty_days}-day bug fix coverage post-deployment`,
    ip_ownership: 'All custom code and configurations become client property upon final payment.'
  };

  if (platform === 'upwork') {
    terms.payment_terms = 'Payment via Upwork escrow upon milestone approval.';
    terms.cancellation_policy = 'Per Upwork Terms of Service. Completed milestones are non-refundable.';
  } else {
    terms.payment_terms = 'Invoice upon milestone completion, NET 15 payment terms.';
    terms.cancellation_policy = 'Either party may cancel with 5 business days written notice. Client pays for completed work.';
  }

  return terms;
}

function buildProposalCTASection(proposalNumber: string, validUntil: Date, platform: string, config: ProposalConfig): Record<string, unknown> {
  const expiresDisplay = validUntil.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  if (platform === 'upwork') {
    return {
      action_type: 'approve_proposal',
      headline: '[LLM_PLACEHOLDER: cta_headline]',
      subtext: '[LLM_PLACEHOLDER: cta_subtext]',
      link: 'https://www.upwork.com/messages',
      link_display: 'Reply on Upwork to approve',
      expires_display: `Proposal valid until ${expiresDisplay}`
    };
  }

  const approveLink = config.cta.approve_link_template ?
    config.cta.approve_link_template.replace('{proposal_number}', proposalNumber) :
    '';

  const secondaryLink = config.cta.book_call_link || '';

  const cta: Record<string, unknown> = {
    action_type: 'approve_proposal',
    headline: '[LLM_PLACEHOLDER: cta_headline]',
    subtext: '[LLM_PLACEHOLDER: cta_subtext]',
    link: approveLink,
    link_display: 'Approve This Proposal',
    expires_display: `Proposal valid until ${expiresDisplay}`
  };

  if (secondaryLink) {
    cta.secondary_action = {
      label: 'Schedule a Call',
      link: secondaryLink
    };
  }

  return cta;
}

// ============================================================================
// Proposal Transform - Main Function
// ============================================================================

/**
 * Build complete proposal JSON from extracted data
 * @param extracted - Output from extract_proposal
 * @param options - Generation options
 * @returns Complete proposal JSON with LLM placeholders
 */
export async function buildProposal(
  extracted: Record<string, unknown>,
  options: { platform?: string; valid_days?: number; config?: Partial<ProposalConfig>; pricing_options?: Record<string, unknown> } = {}
): Promise<Record<string, unknown>> {
  const config = { ...DEFAULT_PROPOSAL_CONFIG, ...options.config } as ProposalConfig;
  const platform = options.platform || config.defaults.platform;
  const validDays = options.valid_days || config.defaults.valid_days;

  // Calculate pricing
  let pricing: Record<string, unknown>;
  const projectPlan = extracted.project_plan as Record<string, unknown> | undefined;
  const ppEstimate = projectPlan?.estimate as Record<string, unknown> | undefined;
  const ppCost = ppEstimate?.cost as Record<string, unknown> | undefined;

  if (ppCost?.total) {
    const ppHours = ppEstimate?.hours as Record<string, unknown> | undefined;
    const total = (ppCost.total as number) || 0;

    const designAmt = Math.round(total * 0.20);
    const buildAmt = Math.round(total * 0.45);
    const testAmt = Math.round(total * 0.15);
    const deployAmt = total - designAmt - buildAmt - testAmt;

    const milestones = {
      design: { milestone_number: '2.1', milestone_name: 'Design', percentage: 20, amount: designAmt, percent: '20%', description: 'Milestone 2.1: Architecture and planning' },
      build: { milestone_number: '2.2', milestone_name: 'Build', percentage: 45, amount: buildAmt, percent: '45%', description: 'Milestone 2.2: Development and integration' },
      test: { milestone_number: '2.3', milestone_name: 'Test', percentage: 15, amount: testAmt, percent: '15%', description: 'Milestone 2.3: Testing and validation' },
      deploy: { milestone_number: '2.4', milestone_name: 'Deploy', percentage: 20, amount: deployAmt, percent: '20%', description: 'Milestone 2.4: Deployment and training' }
    };

    pricing = {
      hours: {
        total: (ppHours?.total as number) || 0,
        with_contingency: (ppHours?.with_contingency as number) || Math.ceil(((ppHours?.total as number) || 0) * 1.15)
      },
      subtotal: ppCost.subtotal || 0,
      contingency: ppCost.contingency || 0,
      contingency_percent: ppCost.contingency_percent || 0.15,
      final_price: total,
      breakdown: ppCost.breakdown || [],
      milestones
    };
  } else {
    pricing = calculatePricing(extracted.raw_audit || extracted, options.pricing_options || {}) as Record<string, unknown>;
  }

  // Calculate ROI
  const measurements = extracted.measurements as Record<string, unknown> | undefined;
  const bleed = extracted.bleed as Record<string, unknown> | undefined;
  const bleedTotal = measurements?.bleed_total as Record<string, unknown> | undefined;
  const monthlyBleed = (bleedTotal?.value as number) || (bleed?.monthly_amount as number) || 0;
  const roi = calculateROI(monthlyBleed, pricing.final_price as number);

  // Build phases
  const phases = await buildPhases(extracted.raw_audit || extracted, pricing, options);
  const totalDuration = calculateTotalDuration(phases);

  // Generate metadata
  const now = new Date();
  const validUntil = new Date(now.getTime() + validDays * 24 * 60 * 60 * 1000);
  const proposalNumber = generateProposalNumber(now);

  // Extract client info
  const intake = extracted.intake as Record<string, unknown> | undefined;
  const preparedFor = intake?.prepared_for as Record<string, unknown> | undefined;
  const projectIdentity = extracted.project_identity as Record<string, unknown> | undefined;
  const client = extracted.client as Record<string, unknown> | undefined;
  const audit = extracted.audit as Record<string, unknown> | undefined;
  const workflow = extracted.workflow as Record<string, unknown> | undefined;
  const findings = extracted.findings;

  const proposal = {
    schema_version: '1.0.0',

    document: {
      document_id: uuidv4(),
      proposal_number: proposalNumber,
      created_at: now.toISOString(),
      valid_until: validUntil.toISOString(),
      valid_days: validDays,
      title: `Phase 2: Stabilize Proposal`,
      subtitle: `${(workflow?.name as string) || 'Workflow'} Automation Implementation`,
      brand: config.brand
    },

    prepared_for: {
      account_name: preparedFor?.account_name ||
                    projectIdentity?.client_name ||
                    client?.account_name ||
                    'Client',
      industry: (client?.industry as string) || 'professional_services',
      primary_contact: client?.primary_contact || {}
    },

    prepared_by: config.producer,

    project_identity: buildProposalProjectIdentity(extracted, validDays),

    audit_reference: {
      audit_id: audit?.audit_id,
      audit_date: formatDate(audit?.audit_date as string),
      workflow_name: workflow?.name,
      bleed_total: {
        amount: monthlyBleed,
        currency: 'USD',
        period: 'monthly',
        display: formatCurrencyUnified(monthlyBleed)
      },
      bleed_period: 'month',
      key_findings: extractKeyFindings(findings, 3)
    },

    executive_summary: {
      body: '[LLM_PLACEHOLDER: executive_summary]',
      value_proposition: '[LLM_PLACEHOLDER: value_proposition]'
    },

    pricing: buildProposalPricingSection(pricing, platform),

    roi: roi,

    phases: phases,

    total_duration: totalDuration,

    scope: buildProposalScopeSection(extracted),

    terms: buildProposalTermsSection(platform, validDays, config),

    cta: buildProposalCTASection(proposalNumber, validUntil, platform, config),

    rendering: {
      mode: 'proposal',
      platform: platform,
      page: {
        size: 'letter',
        page_count: 2
      }
    }
  };

  return proposal;
}

/**
 * Get all LLM placeholder paths in the proposal
 */
export function getPlaceholderPaths(proposal: Record<string, unknown>, prefix = ''): string[] {
  const paths: string[] = [];

  function traverse(obj: unknown, path: string): void {
    if (typeof obj === 'string' && obj.startsWith('[LLM_PLACEHOLDER:')) {
      paths.push(path);
    } else if (Array.isArray(obj)) {
      obj.forEach((item, index) => traverse(item, `${path}[${index}]`));
    } else if (obj && typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        traverse(value, path ? `${path}.${key}` : key);
      }
    }
  }

  traverse(proposal, prefix);
  return paths;
}

/**
 * Set value at a path in an object
 */
export function setValueAtPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current)) {
      current[part] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * Get value at a path in an object
 */
export function getValueAtPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

// Aliases for backwards compatibility
export const getProposalPlaceholderPaths = getPlaceholderPaths;

// ============================================================================
// Project Plan Transform - Helper Functions
// ============================================================================

function collectCitations(integrationResearch: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const allCitations: Array<Record<string, unknown>> = [];
  let citationId = 1;

  for (const item of integrationResearch) {
    const research = item.research as Record<string, unknown> | undefined;
    if (research?.citations && Array.isArray(research.citations)) {
      for (const cite of research.citations) {
        allCitations.push({
          ...cite,
          id: citationId++,
          integration: item.integration
        });
      }
    }
  }

  return allCitations;
}

function generatePlanId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `plan_${timestamp}_${random}`;
}

function generateProjectTitle(intake: Record<string, unknown>): string {
  const preparedFor = intake.prepared_for as Record<string, unknown> | undefined;
  const client = intake.client as Record<string, unknown> | undefined;
  const sectionA = intake.section_a_workflow_definition as Record<string, unknown> | undefined;
  const workflow = intake.workflow as Record<string, unknown> | undefined;

  const clientName = preparedFor?.account_name || client?.name || 'Unknown Client';
  const processName = sectionA?.process_name ||
                      (workflow?.name as string) ||
                      'Workflow Automation';

  return `${clientName} - ${processName}`;
}

function generateProjectSummary(intake: Record<string, unknown>): string {
  const project = intake.project as Record<string, unknown> | undefined;
  if (project?.summary) {
    return project.summary as string;
  }

  const wf = (intake.section_a_workflow_definition as Record<string, unknown>) || {};
  const workflowName = wf.q01_workflow_name || (project?.workflow_name as string);
  const businessObjective = wf.q03_business_objective as string;
  const preparedFor = intake.prepared_for as Record<string, unknown> | undefined;
  const client = intake.client as Record<string, unknown> | undefined;
  const clientName = preparedFor?.account_name || client?.name || 'the client';

  if (workflowName || businessObjective) {
    const parts: string[] = [];
    if (workflowName) {
      parts.push(`Automate the ${workflowName} process for ${clientName}`);
    }
    if (businessObjective) {
      parts.push(businessObjective);
    }
    if (wf.q02_trigger_event) {
      parts.push(`triggered by ${(wf.q02_trigger_event as string).toLowerCase()}`);
    }
    return parts.join('. ').replace(/\.\./g, '.').trim();
  }

  const classification = intake.classification as Record<string, unknown> | undefined;
  const projectType = classification?.project_type || 'workflow_automation';
  const typeDescriptions: Record<string, string> = {
    'workflow_automation': 'workflow automation solution to streamline operations',
    'ai_agent': 'AI-powered agent to handle intelligent task processing',
    'integration': 'system integration connecting key business platforms',
    'voice_agent': 'voice AI agent for automated call handling',
    'data_pipeline': 'data pipeline for automated extraction and processing',
    'scraping': 'web data extraction and processing solution',
    'mixed': 'comprehensive automation solution'
  };

  return `Implement a ${typeDescriptions[projectType as string] || typeDescriptions['mixed']} for ${clientName}.`;
}

function cleanVersionLockedText(text: string): string {
  if (!text) return text;

  return text
    .replace(/GPT-?4[o]?(-turbo|-vision)?/gi, 'Production LLM')
    .replace(/GPT-?3\.?5(-turbo)?/gi, 'Production LLM')
    .replace(/Claude-?[23](\.[0-9])?(-opus|-sonnet|-haiku)?/gi, 'Production LLM')
    .replace(/Gemini-?[12](\.[0-9])?(-pro|-flash)?/gi, 'Production LLM')
    .replace(/Llama-?[23](\.[0-9])?/gi, 'Production LLM')
    .replace(/Mistral-?[0-9](\.[0-9])?/gi, 'Production LLM')
    .replace(/Palm-?[0-9](\.[0-9])?/gi, 'Production LLM')
    .replace(/Davinci/i, 'Production LLM')
    .replace(/Text-embedding-[0-9]/i, 'Production LLM')
    .replace(/Whisper-?[0-9]/i, 'Speech Recognition API')
    .replace(/Dall-?e-?[0-9]/i, 'Image Generation API')
    .replace(/Midjourney/i, 'Image Generation API')
    .replace(/Stable\s*Diffusion/i, 'Image Generation API')
    .replace(/OpenAI/i, 'AI Platform')
    .replace(/Anthropic/i, 'AI Platform')
    .replace(/\bChatGPT\b/i, 'Production LLM')
    .replace(/\(Production LLM based\)/gi, '(AI-powered)')
    .replace(/\(Production LLM\)/gi, '(AI-powered)')
    .replace(/Production LLM based/gi, 'AI-powered');
}

function isVersionLockedAI(tech: string): boolean {
  const versionLockedPatterns = [
    /gpt-?[0-9]/i,
    /claude-?[0-9]/i,
    /gemini-?[0-9]/i,
    /llama-?[0-9]/i,
    /mistral-?[0-9]/i,
    /palm-?[0-9]/i,
    /davinci/i,
    /text-embedding-[0-9]/i,
    /whisper-?[0-9]/i,
    /dall-?e-?[0-9]/i
  ];
  return versionLockedPatterns.some(pattern => pattern.test(tech));
}

function cleanTechReference(tech: string): string {
  if (!tech) return tech;

  const preservePatterns = ['n8n', 'web3', 'h2o', 's3', 'ec2', 'mp3', 'mp4'];
  for (const pattern of preservePatterns) {
    if (tech.toLowerCase().includes(pattern)) {
      return tech;
    }
  }

  return tech
    .replace(/\s+v?\d+(\.\d+)+\s*/gi, ' ')
    .replace(/\s+v\d+\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanAIReference(name: string): string {
  if (!name) return name;

  const aiPatterns = [
    { pattern: /gpt-?4[o]?(-turbo|-vision|-mini)?/i, replacement: 'Production LLM' },
    { pattern: /gpt-?3\.?5(-turbo)?/i, replacement: 'Production LLM' },
    { pattern: /gpt-?[0-9]/i, replacement: 'Production LLM' },
    { pattern: /claude-?[0-9](\.[0-9])?(-opus|-sonnet|-haiku)?/i, replacement: 'Production LLM' },
    { pattern: /gemini-?[0-9](\.[0-9])?(-pro|-flash|-ultra)?/i, replacement: 'Production LLM' },
    { pattern: /llama-?[0-9](\.[0-9])?/i, replacement: 'Production LLM' },
    { pattern: /mistral-?[0-9]?(-large|-medium|-small)?/i, replacement: 'Production LLM' },
    { pattern: /whisper(-[0-9])?/i, replacement: 'Speech Recognition API' },
    { pattern: /dall-?e-?[0-9]?/i, replacement: 'Image Generation API' },
    { pattern: /midjourney/i, replacement: 'Image Generation API' },
    { pattern: /stable\s*diffusion/i, replacement: 'Image Generation API' },
    { pattern: /openai/i, replacement: 'AI Platform' },
    { pattern: /anthropic/i, replacement: 'AI Platform' },
    { pattern: /\bchatgpt\b/i, replacement: 'Production LLM' }
  ];

  for (const { pattern, replacement } of aiPatterns) {
    if (pattern.test(name)) {
      return replacement;
    }
  }
  return name;
}

function generatePlanInScope(intake: Record<string, unknown>, estimate: Record<string, unknown>): string[] {
  const items: string[] = [];
  const project = intake.project as Record<string, unknown> | undefined;

  if (project?.deliverables && Array.isArray(project.deliverables)) {
    for (const deliverable of project.deliverables) {
      items.push(cleanVersionLockedText(deliverable));
    }
  }

  if (project?.integrations && Array.isArray(project.integrations)) {
    for (const integration of project.integrations) {
      const cleanName = cleanAIReference((integration as Record<string, unknown>).name as string);
      items.push(`${cleanName} integration`);
    }
  }

  items.push('Requirements documentation');
  items.push('Development and internal testing');
  items.push('User training session');
  items.push('Production provisioning and go-live activation');
  items.push('30-day defect coverage (bug fixes at no additional cost)');
  items.push('Support options: Build & Transfer ($0/mo self-host) or Build & Operate ($497/mo managed)');

  return [...new Set(items)];
}

function generatePlanOutOfScope(): string[] {
  return [
    'Ongoing AI consultancy beyond project scope',
    'Additional automations not specified in this Statement of Work',
    'Custom integrations requiring R&D or undocumented APIs',
    'Custom mobile application development',
    'Data migration from legacy systems',
    'Third-party API/SaaS subscription costs (client responsibility)',
    'Hardware procurement or on-premise infrastructure'
  ];
}

function generatePlanDeliverables(intake: Record<string, unknown>, estimate: Record<string, unknown>): Array<{ name: string; milestone: string }> {
  const deliverables: Array<{ name: string; milestone: string }> = [];
  const milestones = estimate.milestones as Array<Record<string, unknown>> | undefined;

  if (milestones) {
    for (const milestone of milestones) {
      const mDeliverables = milestone.deliverables as string[] | undefined;
      if (mDeliverables) {
        for (const d of mDeliverables) {
          deliverables.push({
            name: d,
            milestone: milestone.phase as string
          });
        }
      }
    }
  }

  return deliverables;
}

function generatePlanAssumptions(intake: Record<string, unknown>, research: Record<string, unknown>): string[] {
  const assumptions = [
    'Client will provide API credentials and access within 5 business days',
    'Client stakeholder available for weekly review calls',
    'Requirements are stable after Design phase sign-off'
  ];

  const project = intake.project as Record<string, unknown> | undefined;
  const techMentioned = project?.tech_mentioned as string[] | undefined;

  if (techMentioned && techMentioned.length > 0) {
    const cleanedTech = techMentioned
      .filter(tech => !isVersionLockedAI(tech))
      .map(tech => cleanTechReference(tech));

    if (cleanedTech.length > 0) {
      assumptions.push(`Client confirms access to: ${cleanedTech.join(', ')}`);
    }
  }

  return assumptions;
}

function generatePlanDependencies(intake: Record<string, unknown>): string[] {
  const dependencies: string[] = [];
  const project = intake.project as Record<string, unknown> | undefined;
  const integrations = project?.integrations as Array<Record<string, unknown>> | undefined;

  if (integrations) {
    for (const integration of integrations) {
      const cleanName = cleanAIReference(integration.name as string);
      dependencies.push(`${cleanName} API access and credentials`);
    }
  }

  return dependencies;
}

function generateArchitectureSummary(intake: Record<string, unknown>): string {
  const classification = intake.classification as Record<string, unknown> | undefined;
  const projectType = classification?.project_type as string;

  const summaries: Record<string, string> = {
    'workflow_automation': 'n8n-based workflow automation with webhook triggers, API integrations, and scheduled executions.',
    'ai_agent': 'LLM-powered autonomous agent with structured prompts, tool calling, and conversation management.',
    'integration': 'API-first integration architecture connecting multiple systems via REST/webhook interfaces.',
    'voice_agent': 'Voice AI system with telephony integration, speech recognition, and natural language processing.',
    'data_pipeline': 'ETL pipeline with data extraction, transformation, validation, and loading stages.',
    'scraping': 'Web scraping solution with rate limiting, proxy rotation, and structured data extraction.',
    'mixed': 'Hybrid solution combining workflow automation, AI processing, and system integration.'
  };

  return summaries[projectType] || summaries['mixed'];
}

function classifyTechCategory(tech: string): string {
  const lower = tech.toLowerCase();

  if (lower.includes('n8n') || lower.includes('make') || lower.includes('zapier') ||
      lower.includes('power automate') || lower.includes('integromat')) {
    return 'workflow';
  }
  if (lower.includes('llm') || lower.includes('ai') || lower.includes('gpt') ||
      lower.includes('claude') || lower.includes('gemini') || lower.includes('embedding') ||
      lower.includes('vision') || lower.includes('generation')) {
    return 'ai';
  }
  if (lower.includes('supabase') || lower.includes('postgres') || lower.includes('mysql') ||
      lower.includes('mongo') || lower.includes('redis') || lower.includes('database') ||
      lower.includes('airtable')) {
    return 'database';
  }
  if (lower.includes('hubspot') || lower.includes('salesforce') || lower.includes('pipedrive') ||
      lower.includes('zoho') || lower.includes('crm')) {
    return 'crm';
  }
  if (lower.includes('slack') || lower.includes('discord') || lower.includes('teams') ||
      lower.includes('gmail') || lower.includes('outlook') || lower.includes('email') ||
      lower.includes('workspace')) {
    return 'communication';
  }
  if (lower.includes('calendly') || lower.includes('calendar') || lower.includes('schedule') ||
      lower.includes('booking')) {
    return 'calendar';
  }
  if (lower.includes('digitalocean') || lower.includes('aws') || lower.includes('azure') ||
      lower.includes('gcp') || lower.includes('heroku') || lower.includes('vercel')) {
    return 'cloud';
  }
  if (lower.includes('twilio') || lower.includes('voice') || lower.includes('phone') ||
      lower.includes('sms') || lower.includes('call')) {
    return 'voice';
  }
  if (lower.includes('google ads') || lower.includes('facebook') || lower.includes('linkedin') ||
      lower.includes('ads') || lower.includes('meta')) {
    return 'ads';
  }
  if (lower.includes('analytics') || lower.includes('reporting') || lower.includes('dashboard') ||
      lower.includes('metabase') || lower.includes('looker')) {
    return 'analytics';
  }
  return 'integration';
}

function determineAIModelTypes(intake: Record<string, unknown>): string[] {
  const types = new Set<string>();
  const classification = intake.classification as Record<string, unknown> | undefined;
  const project = intake.project as Record<string, unknown> | undefined;

  const projectType = classification?.project_type;
  const summary = ((project?.summary as string) || '').toLowerCase();
  const deliverables = ((project?.deliverables as string[]) || []).join(' ').toLowerCase();
  const combined = summary + ' ' + deliverables;

  if (projectType === 'ai_agent' || combined.includes('ai') || combined.includes('scoring') ||
      combined.includes('analysis') || combined.includes('generate') || combined.includes('qualify')) {
    types.add('LLM (Text Generation)');
  }

  if (combined.includes('image') || combined.includes('vision') || combined.includes('ocr') ||
      combined.includes('screenshot') || combined.includes('document')) {
    types.add('Vision Model');
  }

  if (combined.includes('search') || combined.includes('similarity') || combined.includes('rag') ||
      combined.includes('knowledge base') || combined.includes('vector')) {
    types.add('Embeddings');
  }

  if (projectType === 'voice_agent' || combined.includes('voice') || combined.includes('call') ||
      combined.includes('transcri') || combined.includes('speech')) {
    types.add('TTS/ASR');
  }

  if (combined.includes('image generat') || combined.includes('create image') ||
      combined.includes('design') || combined.includes('visual')) {
    types.add('Image Generation');
  }

  if (combined.includes('research') || combined.includes('competitor') || combined.includes('analysis')) {
    types.add('Deep Research');
  }

  return Array.from(types);
}

function recommendTechStack(intake: Record<string, unknown>, research: Record<string, unknown>): Record<string, unknown> {
  const classification = intake.classification as Record<string, unknown> | undefined;
  const project = intake.project as Record<string, unknown> | undefined;
  const projectType = classification?.project_type;

  const aiModelTypes = determineAIModelTypes(intake);

  const techMentioned = (project?.tech_mentioned as string[]) || [];
  const cleanedTech = techMentioned
    .filter(tech => !isVersionLockedAI(tech))
    .map(tech => cleanTechReference(tech));

  const classifiedOther = cleanedTech.map(tech => ({
    name: tech,
    category: classifyTechCategory(tech)
  }));

  return {
    workflow: 'n8n (Latest Stable)',
    llm: 'Production LLM',
    database: 'Supabase (if needed)',
    voice: projectType === 'voice_agent' ? 'Production Voice AI Platform' : undefined,
    ai_model_types: aiModelTypes,
    other: cleanedTech,
    other_classified: classifiedOther
  };
}

function isGenericNote(note: string): boolean {
  const genericPatterns = [
    /or similar/i,
    /etc\.?$/i,
    /if needed/i,
    /as required/i,
    /tbd/i,
    /to be determined/i
  ];
  return genericPatterns.some(pattern => pattern.test(note));
}

function generateIntegrationNotes(integration: Record<string, unknown>, apiInfo: Record<string, unknown> | undefined, complexity: string): string {
  const systemLower = ((integration.name as string) || '').toLowerCase();
  const typeLower = ((integration.type as string) || 'api').toLowerCase();

  let paragraph = '';

  const notes = integration.notes as string | undefined;
  if (notes && !isGenericNote(notes)) {
    paragraph += notes + ' ';
  }

  if (systemLower.includes('hubspot')) {
    paragraph += `Marketing Hub Professional required. OAuth 2.0, CRM v3 API for deals. Client provides: OAuth credentials, workflow IDs.`;
  } else if (systemLower.includes('slack')) {
    paragraph += `Custom bot with chat:write, channels:read scopes. Block Kit for messages. Client provides: workspace admin access, channel IDs.`;
  } else if (systemLower.includes('calendly')) {
    paragraph += `Webhook subscription for real-time bookings. HMAC-SHA256 verification. Client provides: API access, event types.`;
  } else if (systemLower.includes('facebook')) {
    paragraph += `Lead Gen Forms API with 7-day data retention. Requires App approval. Client provides: Business account, Page Admin access.`;
  } else if (systemLower.includes('linkedin')) {
    paragraph += `Marketing Developer Platform (2-4 week approval). 100 calls/day limit. Client provides: Campaign Manager access.`;
  } else if (systemLower.includes('google ads')) {
    paragraph += `Developer token required (3-5 day approval). OAuth 2.0. Client provides: active campaigns, OAuth config.`;
  } else if (systemLower.includes('sms') || systemLower.includes('twilio')) {
    paragraph += `REST API + webhooks for delivery status. Client provides: account SID, auth token, verified numbers.`;
  } else if (systemLower.includes('gmail') || systemLower.includes('google workspace')) {
    paragraph += `OAuth 2.0 with Gmail API. Trigger-based email monitoring. Client provides: Workspace access, parsing rules.`;
  } else if (systemLower.includes('llm') || systemLower.includes('gpt') || systemLower.includes('ai') || systemLower.includes('production')) {
    paragraph += `Structured output mode with validation. Client provides: API credentials, prompt templates.`;
  } else if (typeLower === 'webhook') {
    paragraph += `Endpoint configuration with payload validation. Client provides: sample payload, auth headers.`;
  } else if (typeLower === 'email') {
    paragraph += `Email parsing with structured data extraction. Client provides: filter rules, sample formats.`;
  } else if (typeLower === 'scraping') {
    paragraph += `Rate-limited scraping with validation. Client provides: target URLs, data fields.`;
  } else {
    paragraph += `REST API with retry logic and rate limit handling. Client provides: API credentials, endpoint docs.`;
  }

  if (complexity === 'complex') {
    paragraph += ' ⚠ Complex: extended testing phase.';
  } else if (complexity === 'high_risk') {
    paragraph += ' ⚠ High risk: requires live environment testing.';
  } else if (complexity === 'moderate') {
    paragraph += ' OAuth consent flow required.';
  }

  return paragraph.trim();
}

function enrichNotesWithResearch(notes: string, research: Record<string, unknown>, integrationName: string): { notes: string; citationsUsed: number } {
  const enrichments: string[] = [];
  let citationsUsed = 0;

  const intInfo = (research.integrations as Array<Record<string, unknown>>)?.find(
    i => (i.name as string)?.toLowerCase() === integrationName.toLowerCase()
  );

  if (intInfo) {
    if (intInfo.has_native_node) {
      enrichments.push(`Native n8n node available (${intInfo.auth_type} auth).`);
    } else {
      enrichments.push(`No native n8n node - requires HTTP Request with ${intInfo.auth_type || 'API'} auth.`);
    }
  }

  const risks = research.risks as Array<Record<string, unknown>> | undefined;
  if (risks && risks.length > 0) {
    const topRisk = risks[0];
    enrichments.push(`Key risk: ${topRisk.risk} (${topRisk.likelihood}/${topRisk.impact}).`);
  }

  const laborFactors = research.labor_factors as Array<Record<string, unknown>> | undefined;
  if (laborFactors && laborFactors.length > 0) {
    const highImpact = laborFactors.filter(f => f.impact === 'high');
    if (highImpact.length > 0) {
      enrichments.push(`High-impact factors: ${highImpact.map(f => f.factor).join(', ')}.`);
    }
  }

  if (enrichments.length > 0) {
    return {
      notes: notes + '\n—\n' + enrichments.join(' '),
      citationsUsed
    };
  }

  return { notes, citationsUsed: 0 };
}

function mapPlanIntegrations(intake: Record<string, unknown>, research: Record<string, unknown>, integrationResearch: Array<Record<string, unknown>> = []): Array<Record<string, unknown>> {
  const integrations: Array<Record<string, unknown>> = [];
  const project = intake.project as Record<string, unknown> | undefined;
  const projectIntegrations = project?.integrations as Array<Record<string, unknown>> | undefined;
  const techSignals = (research as Record<string, unknown>)?.technology_signals as Record<string, unknown> | undefined;
  const apiAvailability = techSignals?.api_availability as Array<Record<string, unknown>> | undefined;

  if (projectIntegrations) {
    for (const integration of projectIntegrations) {
      const apiInfo = apiAvailability?.find(
        a => (a.system as string).toLowerCase() === (integration.name as string).toLowerCase()
      );

      const n8nResearch = integrationResearch.find(
        r => (r.integration as string)?.toLowerCase() === (integration.name as string)?.toLowerCase()
      )?.research as Record<string, unknown> | undefined;

      let complexity = 'standard';
      if (integration.type === 'scraping') complexity = 'complex';
      if (integration.type === 'voice') complexity = 'high_risk';
      if (apiInfo && !apiInfo.has_api) complexity = 'complex';
      if (apiInfo?.auth_type === 'oauth2') complexity = 'moderate';

      let complexityScore = 5;
      const complexityInfo = n8nResearch?.complexity as Record<string, unknown> | undefined;
      
      if (complexityInfo?.tier) {
        complexity = complexityInfo.tier as string;
      }
      if (complexityInfo?.score) {
        complexityScore = complexityInfo.score as number;
      }

      let notes = generateIntegrationNotes(integration, apiInfo, complexity);

      if (n8nResearch && (n8nResearch.found as boolean) !== false) {
        const enriched = enrichNotesWithResearch(notes, n8nResearch, integration.name as string);
        notes = enriched.notes;
      }

      const systemName = cleanAIReference(integration.name as string);
      const intInfos = n8nResearch?.integrations as Array<Record<string, unknown>> | undefined;
      const estimatedHours = (n8nResearch?.effort_recommendation as Record<string, unknown>)?.base_hours || 
                             (n8nResearch?.complexity as Record<string, unknown>)?.estimated_hours || 
                             null;

      integrations.push({
        system: systemName,
        integration_type: integration.type || 'api',
        complexity,
        complexity_score: complexityScore, // Explicit score for frontend transparency
        estimated_hours: estimatedHours, // Explicit hours for frontend transparency
        notes,
        research_available: !!(n8nResearch as Record<string, unknown>)?.from_cache,
        research_confidence: (n8nResearch as Record<string, unknown>)?.confidence || null,
        has_native_node: intInfos?.[0]?.has_native_node || null
      });
    }
  }

  return integrations;
}

function mapPlanRisks(estimate: Record<string, unknown>): Array<Record<string, unknown>> {
  const risks: Array<Record<string, unknown>> = [];

  const mitigationMap: Record<string, string> = {
    'on-premise': 'VPN tunneling + secure gateway with API adapter layer',
    'legacy': 'API adapter layer + versioned endpoints + extensive testing phase',
    'telephony': 'Redundant SIP trunks + call failover routing + latency monitoring',
    'voice': 'Latency monitoring + graceful degradation + multi-provider fallback',
    'real-time': 'WebSocket fallback + polling backup + connection pooling',
    'hipaa': 'BAA in place + encrypted PHI handling + audit logging',
    'pci': 'Tokenized payment data + PCI-compliant hosting + annual audit',
    'compliance': 'Audit logging + data encryption at rest + access controls',
    'integration': 'Circuit breaker pattern + health probes + retry logic',
    'api': 'Rate limit handling + exponential backoff + response caching',
    'concurrency': 'Connection pooling + queue-based processing + load balancing',
    'default': '15% contingency buffer + weekly risk review + escalation protocol'
  };

  const getMitigation = (factor: string): string => {
    const lowerFactor = factor.toLowerCase();
    for (const [key, mitigation] of Object.entries(mitigationMap)) {
      if (key !== 'default' && lowerFactor.includes(key)) {
        return mitigation;
      }
    }
    return mitigationMap.default;
  };

  const effort = estimate.effort as Record<string, unknown> | undefined;
  const riskAssessment = effort?.risk_assessment as Record<string, unknown> | undefined;
  const factors = riskAssessment?.factors as string[] | undefined;

  if (factors) {
    for (const factor of factors) {
      risks.push({
        description: factor,
        probability: 'medium',
        impact: 'medium',
        mitigation: getMitigation(factor)
      });
    }
  }

  return risks;
}

function generatePlanPaymentSchedule(estimate: Record<string, unknown>): Record<string, unknown> {
  const cost = estimate.cost as Record<string, unknown> | undefined;
  const total = (cost?.total as number) || 0;
  const UPFRONT_THRESHOLD = 10000;

  if (total <= UPFRONT_THRESHOLD) {
    return {
      type: 'milestone',
      schedule: [
        {
          milestone: 'Project Deposit (Secures Build Slot)',
          percentage: 100,
          amount: total
        }
      ],
      terms: 'NET 15',
      notes: '100% upfront to secure build slot. Production Activation occurs upon completion.'
    };
  } else {
    const upfrontAmount = Math.round(total * 0.50);
    const finalAmount = total - upfrontAmount;

    return {
      type: 'milestone',
      schedule: [
        {
          milestone: 'Project Deposit (50%)',
          percentage: 50,
          amount: upfrontAmount
        },
        {
          milestone: 'Production Activation (Go-Live)',
          percentage: 50,
          amount: finalAmount
        }
      ],
      terms: 'NET 15',
      notes: 'Final payment triggers Production Activation (Go-Live). Workflow instance provisioned upon final payment receipt.'
    };
  }
}

function generatePlanNextSteps(): string[] {
  return [
    'Review and approve this project plan',
    'Sign service agreement and submit deposit to secure build slot',
    'Schedule kickoff call within 5 business days',
    'Provide API credentials and system access',
    'Designate primary point of contact for weekly check-ins',
    'Confirm Neural Ops tier for post-activation operations - starts at $497/mo'
  ];
}

// ============================================================================
// Project Plan Transform - Main Function
// ============================================================================

/**
 * Transform intake, research, and estimate into project plan
 * @param intake - Extracted intake data
 * @param research - Research findings
 * @param estimate - Estimation results
 * @param options - Additional options including integrationResearch
 * @returns Project plan conforming to schema
 */
export function transformToProjectPlan(
  intake: Record<string, unknown>,
  research: Record<string, unknown>,
  estimate: Record<string, unknown>,
  options: { integrationResearch?: Array<Record<string, unknown>> } = {}
): Record<string, unknown> {
  const { integrationResearch = [] } = options;

  const tierRec = (research as Record<string, unknown>)?.tier_recommendation as Record<string, unknown> | undefined;
  const estimateTier = estimate.tier as Record<string, unknown> | undefined;

  const clientTier = tierRec?.tier ||
    (estimateTier?.key === 'enterprise' ? 'enterprise' :
      estimateTier?.key === 'standard' ? 'mid-market' : 'startup');

  const prospect = (research as Record<string, unknown>)?.prospect;
  const projectIdentity = generateProjectIdentity(
    { ...intake, prospect },
    { documentType: 'project_plan' }
  );

  const effort = estimate.effort as Record<string, unknown> | undefined;
  const cost = estimate.cost as Record<string, unknown> | undefined;
  const costHours = cost?.hours as Record<string, unknown> | undefined;
  const riskAssessment = effort?.risk_assessment as Record<string, unknown> | undefined;
  const preparedFor = intake.prepared_for as Record<string, unknown> | undefined;
  const client = intake.client as Record<string, unknown> | undefined;
  const classification = intake.classification as Record<string, unknown> | undefined;

  const plan: Record<string, unknown> = {
    meta: {
      plan_id: generatePlanId(),
      version: '1.0',
      generated_at: new Date().toISOString(),
      generator_version: '1.0.0'
    },

    project_identity: projectIdentity,

    project: {
      title: generateProjectTitle(intake),
      summary: generateProjectSummary(intake),
      client: {
        name: (client?.name as string) || preparedFor?.account_name || 'Client',
        tier: clientTier,
        industry: (client?.industry as string) || (prospect as Record<string, unknown>)?.industry_vertical
      },
      project_type: classification?.project_type || 'workflow_automation',
      tier: estimateTier?.key || classification?.estimated_tier || 'standard'
    },

    executive_summary: {
      body: '[LLM_PLACEHOLDER: executive_summary]'
    },

    scope: {
      objectives: (intake.project as Record<string, unknown>)?.objectives || [],
      in_scope: generatePlanInScope(intake, estimate),
      out_of_scope: generatePlanOutOfScope(),
      deliverables: generatePlanDeliverables(intake, estimate),
      assumptions: generatePlanAssumptions(intake, research),
      dependencies: generatePlanDependencies(intake)
    },

    technical: {
      architecture_summary: generateArchitectureSummary(intake),
      tech_stack: recommendTechStack(intake, research),
      integrations: mapPlanIntegrations(intake, research, integrationResearch),
      risks: mapPlanRisks(estimate)
    },

    estimate: {
      hours: {
        breakdown: effort?.adjusted_hours || effort?.base_hours || {},
        total: costHours?.total || 0,
        base: (effort?.base_hours as Record<string, unknown>)?.total || costHours?.total || 0,
        with_contingency: costHours?.with_contingency || 0
      },
      cost: {
        breakdown: cost?.breakdown || {},
        subtotal: cost?.subtotal || 0,
        contingency: cost?.contingency || 0,
        contingency_percent: cost?.contingency_percent || 0.15,
        total: cost?.total || 0
      },
      rate: estimate.rate || 135,
      risk_multiplier: {
        multiplier: riskAssessment?.multiplier || 1.0,
        category: riskAssessment?.category || 'standard',
        factors: riskAssessment?.factors || []
      },
      confidence: effort?.confidence || 'medium',
      range: cost?.range,
      // NEW: Expose deterministic basis for frontend transparency
      basis: estimate.basis || null
    },

    milestones: estimate.milestones || [],

    payment: generatePlanPaymentSchedule(estimate),

    retainer_recommendation: estimate.retainer,

    finops: estimate.finops || null,

    commercial: estimate.commercial || null,

    est_days: estimate.est_days || Math.ceil((costHours?.total as number || 0) / 6),

    next_steps: generatePlanNextSteps(),

    notes: (effort?.clarifications_needed as string[])?.length > 0 ?
      `Clarifications needed: ${(effort?.clarifications_needed as string[]).join('; ')}` : null,

    citations: collectCitations(integrationResearch),
    citations_html: generateFootnotesHtml(collectCitations(integrationResearch))
  };

  const validation = validateProjectPlan(plan);
  if (!validation.valid && validation.errors) {
    console.warn('Project plan validation warnings:');
    console.warn(formatValidationErrors(validation.errors));
  }

  return plan;
}

/**
 * Render project plan to HTML
 * @param plan - Project plan data
 * @returns Rendered HTML
 */
export function renderToHtml(plan: Record<string, unknown>): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const templatePath = join(__dirname, '..', '..', 'templates', 'project_plan_template.html');
  const template = readFileSync(templatePath, 'utf-8');

  const displayPlan = JSON.parse(JSON.stringify(plan));

  displayPlan.logo_uri = LOGO_URL;

  const estimateCost = displayPlan.estimate?.cost;
  const rawContingency = estimateCost?.contingency || 0;
  const rawContingencyPercent = estimateCost?.contingency_percent || 0.15;
  const rawSubtotal = estimateCost?.subtotal || 0;
  const rawTotal = estimateCost?.total || 0;
  const rawInternalCost = typeof displayPlan.finops?.total_internal_cost === 'number'
    ? displayPlan.finops.total_internal_cost
    : 0;

  if (estimateCost) {
    estimateCost.total = formatCurrency(estimateCost.total);
    estimateCost.subtotal = formatCurrency(estimateCost.subtotal);
    estimateCost.contingency = formatCurrency(estimateCost.contingency);
    estimateCost.contingency_percent = Math.round(estimateCost.contingency_percent * 100);

    if (estimateCost.breakdown) {
      for (const key of Object.keys(estimateCost.breakdown)) {
        estimateCost.breakdown[key] = formatCurrency(estimateCost.breakdown[key]);
      }
    }

    if (estimateCost.range) {
      estimateCost.range.low = formatCurrency(estimateCost.range.low);
      estimateCost.range.high = formatCurrency(estimateCost.range.high);
    }
  }

  if (displayPlan.milestones) {
    const totalHours = displayPlan.estimate?.hours?.total || 0;

    const milestoneRoleMap: Record<string, string> = {
      'discovery': 'Solutions Architect',
      'design': 'Solutions Architect',
      'build': 'Automation Engineer',
      'development': 'Automation Engineer',
      'test': 'QA & Documentation',
      'testing': 'QA & Documentation',
      'deploy': 'Automation Engineer',
      'deployment': 'Automation Engineer',
      'launch': 'Solutions Architect'
    };

    for (const milestone of displayPlan.milestones) {
      milestone.total_hours = totalHours;
      milestone.allocation_display = Math.round((milestone.allocation || 0) * 100) + '%';
      milestone.hours_formula = `${totalHours} × ${milestone.allocation || 0} = ${milestone.hours}`;
      const phaseKey = ((milestone.phase || milestone.name || '') as string).toLowerCase();
      milestone.primary_role = milestoneRoleMap[phaseKey] || null;
      milestone.cost = formatCurrency(milestone.cost);
    }
  }

  if (displayPlan.payment?.schedule) {
    for (const item of displayPlan.payment.schedule) {
      item.amount = formatCurrency(item.amount);
    }
  }

  if (displayPlan.meta?.generated_at) {
    displayPlan.meta.generated_at = new Date(displayPlan.meta.generated_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  if (displayPlan.finops) {
    displayPlan.finops.total_hours = displayPlan.estimate?.hours?.total || 0;
    displayPlan.finops.contingency = rawContingency;
    displayPlan.finops.contingency_percent = Math.round(rawContingencyPercent * 100);
    displayPlan.finops.subtotal = rawSubtotal;
    displayPlan.finops.total_with_contingency = rawTotal;
    displayPlan.finops.walk_away_price = Math.round(rawInternalCost * 1.2);

    displayPlan.finops.raw_production_cost = formatCurrency(displayPlan.finops.raw_production_cost);
    displayPlan.finops.compute_estimate = formatCurrency(displayPlan.finops.compute_estimate);
    displayPlan.finops.total_internal_cost = formatCurrency(displayPlan.finops.total_internal_cost);
    displayPlan.finops.target_price = formatCurrency(displayPlan.finops.target_price);
    displayPlan.finops.margin_amount = formatCurrency(displayPlan.finops.margin_amount);
    displayPlan.finops.margin_percent_display = Math.round(displayPlan.finops.margin_percent * 100);
    displayPlan.finops.internal_rate = formatCurrency(displayPlan.finops.internal_rate);

    displayPlan.finops.contingency = formatCurrency(displayPlan.finops.contingency);
    displayPlan.finops.subtotal = formatCurrency(displayPlan.finops.subtotal);
    displayPlan.finops.total_with_contingency = formatCurrency(displayPlan.finops.total_with_contingency);
    displayPlan.finops.walk_away_price = formatCurrency(displayPlan.finops.walk_away_price);

    if (displayPlan.finops.roi) {
      displayPlan.finops.roi.hours_automated = displayPlan.finops.roi.hours_automated || 20;
      displayPlan.finops.roi.client_hourly_value = displayPlan.finops.roi.client_hourly_value || 75;
      displayPlan.finops.roi.annual_value = formatCurrency(displayPlan.finops.roi.annual_value || (displayPlan.finops.roi.monthly_value * 12));
      displayPlan.finops.roi.monthly_value = formatCurrency(displayPlan.finops.roi.monthly_value);
    }

    if (displayPlan.finops.value_breakdown) {
      const vb = displayPlan.finops.value_breakdown;

      if (vb.hard_savings) {
        vb.hard_savings.annual_display = '$' + formatCurrency(vb.hard_savings.annual);
        vb.hard_savings.monthly_display = '$' + formatCurrency(vb.hard_savings.monthly);
      }

      if (vb.modeled_opportunity) {
        vb.modeled_opportunity.annual_display = '$' + formatCurrency(vb.modeled_opportunity.annual);
        vb.modeled_opportunity.monthly_display = '$' + formatCurrency(vb.modeled_opportunity.monthly);
      }

      vb.total_annual_display = '$' + formatCurrency(vb.total_annual_value);
      vb.total_monthly_display = '$' + formatCurrency(vb.total_monthly_value);
    }
  }

  if (displayPlan.commercial) {
    displayPlan.commercial.subscription_price = formatCurrency(displayPlan.commercial.subscription_price);
    displayPlan.commercial.ad_hoc_rate = formatCurrency(displayPlan.commercial.ad_hoc_rate);
    if (displayPlan.commercial.payment_terms) {
      displayPlan.commercial.payment_terms.upfront_percent_display =
        Math.round(displayPlan.commercial.payment_terms.upfront_percent * 100);
      displayPlan.commercial.payment_terms.final_percent_display =
        Math.round(displayPlan.commercial.payment_terms.final_percent * 100);
    }
  }

  return Mustache.render(template, displayPlan);
}

// Alias for backwards compatibility
export const renderProjectPlanHtml = renderToHtml;

// ============================================================================
// Unified Transform Interface
// ============================================================================

/**
 * Unified transform function that routes to appropriate document transform
 *
 * @param documentType - Type of document to generate
 * @param input - Transform input data
 * @param options - Transform options
 * @returns Transform result with rendered data
 */
export async function unifiedTransform(
  documentType: DocumentType,
  input: UnifiedTransformInput,
  options: TransformOptions = {}
): Promise<TransformResult> {
  const startedAt = new Date();
  const warnings: string[] = [];

  try {
    let data: unknown;

    switch (documentType) {
      case 'audit': {
        data = transform(
          input.intake as Record<string, unknown>,
          (input.estimate || { measurements: [] }) as unknown as MeasurementsData,
          (options.templateOverrides || {}) as Partial<AuditConfig>
        );
        break;
      }

      case 'project_plan': {
        data = transformToProjectPlan(
          input.intake as Record<string, unknown>,
          (input.research || {}) as Record<string, unknown>,
          (input.estimate || {}) as Record<string, unknown>,
          { integrationResearch: (options.integrationResearch || []) as Array<Record<string, unknown>> }
        );
        break;
      }

      case 'proposal': {
        data = await buildProposal(input.intake as Record<string, unknown>, {
          platform: options.platform,
          valid_days: options.valid_days,
          config: options.templateOverrides as Partial<ProposalConfig>
        });
        break;
      }

      default: {
        const exhaustiveCheck: never = documentType;
        throw new Error(`Unknown document type: ${exhaustiveCheck}`);
      }
    }

    const completedAt = new Date();

    return {
      success: true,
      data,
      warnings,
      timing: {
        startedAt,
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime()
      }
    };
  } catch (error) {
    const completedAt = new Date();
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      error: errorMessage,
      warnings,
      timing: {
        startedAt,
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime()
      }
    };
  }
}

/**
 * Get placeholder paths for a document type (for LLM prompts)
 */
export function getPlaceholderPathsForType(documentType: DocumentType): string[] {
  switch (documentType) {
    case 'audit':
      return [
        'scorecard.rows[].finding',
        'scorecard.rows[].recommendation',
        'exec_summary.headline',
        'exec_summary.bullets[]'
      ];

    case 'project_plan':
      return [
        'project_overview.description',
        'milestones[].description',
        'risks[].description',
        'risks[].mitigation'
      ];

    case 'proposal':
      return [
        'executive_summary',
        'scope_of_work.inclusions[]',
        'scope_of_work.exclusions[]',
        'scope_of_work.assumptions[]'
      ];

    default: {
      const exhaustiveCheck: never = documentType;
      throw new Error(`Unknown document type: ${exhaustiveCheck}`);
    }
  }
}

// Default export for backwards compatibility
export default {
  transform,
  getLLMPlaceholders,
  transformAudit,
  getAuditLLMPlaceholders,
  buildProposal,
  getPlaceholderPaths,
  getProposalPlaceholderPaths,
  setValueAtPath,
  getValueAtPath,
  transformToProjectPlan,
  renderToHtml,
  renderProjectPlanHtml,
  unifiedTransform,
  getPlaceholderPathsForType,
  DEFAULT_PROPOSAL_CONFIG
};
