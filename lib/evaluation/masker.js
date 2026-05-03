/**
 * Case Study Masker - Transforms PROBLEM into pipeline intake format
 * @module lib/evaluation/masker
 *
 * CRITICAL: This module transforms case study PROBLEM sections into
 * standard intake format WITHOUT leaking any SOLUTION data.
 *
 * The masking ensures blind evaluation - the pipeline sees only
 * the problem statement, never the actual solution.
 */

import { IntakeSchema } from '../schemas/intake.schema.ts';
import { CaseStudyProblemSchema } from '../schemas/case_study.schema.ts';

// =============================================================================
// Masking Configuration
// =============================================================================

/**
 * Default mappings from case study PROBLEM fields to intake fields
 */
const DEFAULT_MAPPINGS = {
  // PROBLEM.industry → account_name suffix or classification
  industry: {
    target: 'prepared_for.account_name',
    transform(value, problem) {
      // Use company_type if available, otherwise derive from industry
      const companyType = problem.company_type || `${value} Company`;
      return `[Evaluation] ${companyType}`;
    },
  },

  // PROBLEM.pain_points → section_d_failure_cost.q13_common_failures
  pain_points: {
    target: 'section_d_failure_cost.q13_common_failures',
    transform(value) {
      if (Array.isArray(value)) {
        return value.join('; ');
      }

      return String(value);
    },
  },

  // PROBLEM.goals → section_a_workflow_definition.q03_business_objective
  goals: {
    target: 'section_a_workflow_definition.q03_business_objective',
    transform(value) {
      if (Array.isArray(value)) {
        return value.join('. ');
      }

      return String(value);
    },
  },

  // PROBLEM.systems_involved → section_c_systems_handoffs.q10_systems_involved
  systems_involved: {
    target: 'section_c_systems_handoffs.q10_systems_involved',
    transform: (value) => (Array.isArray(value) ? value : []),
  },

  // PROBLEM.volume_metrics → section_b_volume_timing.*
  volume_metrics: {
    target: 'section_b_volume_timing',
    transform(value) {
      if (!value) return {};

      const result = {};

      // Map calls/items to runs_per_period
      if (value.calls_per_month) {
        result.q06_runs_per_period = String(value.calls_per_month);
        result.q06_period_unit = 'month';
      } else if (value.calls_per_day) {
        result.q06_runs_per_period = String(value.calls_per_day);
        result.q06_period_unit = 'day';
      } else if (value.items_processed_per_month) {
        result.q06_runs_per_period = String(value.items_processed_per_month);
        result.q06_period_unit = 'month';
      }

      // Map call duration
      if (value.avg_call_duration_minutes) {
        result.q07_avg_trigger_to_end = String(value.avg_call_duration_minutes);
        result.q07_time_unit = 'minutes';
      }

      return result;
    },
  },

  // PROBLEM.constraints → section_d_failure_cost.q14_cost_if_slow_or_failed
  constraints: {
    target: 'section_d_failure_cost.q14_cost_if_slow_or_failed',
    transform(value) {
      if (Array.isArray(value) && value.length > 0) {
        return `Constraints: ${value.join('; ')}`;
      }

      return null;
    },
  },
};

// =============================================================================
// Solution Leak Detection
// =============================================================================

/**
 * Keywords that might indicate solution leakage
 * NOTE: These should be specific enough to not flag normal business language
 */
const SOLUTION_LEAK_KEYWORDS = [
  // Agent types (specific to voice AI solutions)
  'inbound agent',
  'outbound agent',
  'voice agent',
  'ai agent',
  'conversational ai',
  'voice bot',
  'chatbot',

  // Pricing indicators (specific - not just $ which is too common)
  'per minute rate',
  'monthly subscription',
  'setup fee',
  'implementation cost',
  'total cost was',
  'project cost',

  // ROI indicators (specific to solution outcomes)
  'savings achieved',
  'hours saved per',
  'roi of',
  'payback period',
  'return on investment',

  // Timeline indicators (specific to solution implementation)
  'implemented in',
  'went live',
  'deployment took',
  'launched after',

  // Provider names (voice AI platforms)
  'vapi',
  'retell',
  'bland',
  'synthflow',
  'elevenlabs',
  'playht',
];

/**
 * Check if text contains solution leak indicators
 */
function detectSolutionLeaks(text) {
  if (!text || typeof text !== 'string') return [];

  const lowerText = text.toLowerCase();
  const leaks = [];

  for (const keyword of SOLUTION_LEAK_KEYWORDS) {
    if (lowerText.includes(keyword.toLowerCase())) {
      leaks.push(keyword);
    }
  }

  return leaks;
}

/**
 * Recursively check an object for solution leaks
 */
function findLeaksInObject(obj, path = '') {
  const allLeaks = [];

  if (typeof obj === 'string') {
    const leaks = detectSolutionLeaks(obj);
    if (leaks.length > 0) {
      allLeaks.push({ path, leaks, value: obj.slice(0, 100) });
    }
  } else if (Array.isArray(obj)) {
    for (const [i, item] of obj.entries()) {
      allLeaks.push(...findLeaksInObject(item, `${path}[${i}]`));
    }
  } else if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      allLeaks.push(...findLeaksInObject(value, path ? `${path}.${key}` : key));
    }
  }

  return allLeaks;
}

// =============================================================================
// Core Masking Functions
// =============================================================================

/**
 * Transform case study PROBLEM into pipeline intake format
 *
 * Supports two formats:
 * 1. Legacy format: { industry, pain_points, goals, systems_involved, volume_metrics }
 * 2. Factory format: IntakeData with prepared_for, section_a_*, etc. (passes through)
 *
 * @param {object} caseStudy - Full case study object (only PROBLEM is used)
 * @param {object} options - Masking options
 * @returns {object} Masked intake ready for pipeline
 */
export function toIntake(caseStudy, options = {}) {
  const {
    validateOutput = true,
    checkLeaks = true,
    mappings = DEFAULT_MAPPINGS,
  } = options;

  // Extract problem only - NEVER access solution
  const {problem} = caseStudy;

  if (!problem) {
    throw new Error('Case study must have a problem section');
  }

  // Detect format: Factory IntakeData has prepared_for and section_* fields
  const isFactoryFormat = problem.prepared_for && problem.section_a_workflow_definition;

  let intake;

  if (isFactoryFormat) {
    // Factory format: Problem IS already an IntakeData - pass through with evaluation markers
    intake = {
      ...problem,
      intake_version: problem.intake_version || '1.0.0',
      captured_at: problem.captured_at || new Date().toISOString(),
      captured_by: 'evaluation-masker',
      prepared_for: {
        ...problem.prepared_for,
        account_id: problem.prepared_for.account_id.startsWith('EVAL-')
          ? problem.prepared_for.account_id
          : `EVAL-${problem.prepared_for.account_id}`,
      },
    };
  } else {
    // Legacy format: Transform from industry/pain_points/goals/etc.
    const problemValidation = CaseStudyProblemSchema.safeParse(problem);
    if (!problemValidation.success) {
      throw new Error(`Invalid problem structure: ${problemValidation.error.message}`);
    }

    // Build intake from legacy problem fields
    intake = {
      intake_version: '1.0.0',
      captured_at: new Date().toISOString(),
      captured_by: 'evaluation-masker',

      prepared_for: {
        account_id: `EVAL-${caseStudy.id || 'UNKNOWN'}`,
        account_name: mappings.industry.transform(problem.industry, problem),
      },

      section_a_workflow_definition: {
        q01_workflow_name: deriveWorkflowName(problem),
        q02_trigger_event: deriveTriggerfromGoals(problem.goals),
        q03_business_objective: mappings.goals.transform(problem.goals),
        q04_end_condition: deriveEndCondition(problem.goals),
        q05_outcome_owner: 'Operations',
      },

      section_b_volume_timing: {
        q06_runs_per_period: '100', // Default
        q06_period_unit: 'day',
        q07_avg_trigger_to_end: '15',
        q07_time_unit: 'minutes',
        ...mappings.volume_metrics.transform(problem.volume_metrics),
      },

      section_c_systems_handoffs: {
        q10_systems_involved: mappings.systems_involved.transform(problem.systems_involved),
        q11_manual_data_transfers: deriveManualTransfers(problem),
        q12_human_decision_gates: 'Standard approval workflow',
      },

      section_d_failure_cost: {
        q13_common_failures: mappings.pain_points.transform(problem.pain_points),
        q14_cost_if_slow_or_failed: deriveCostImpact(problem),
      },

      section_e_priority: {
        q15_one_thing_to_fix: problem.pain_points?.[0] || 'Reduce manual workload',
      },
    };
  }

  // Check for solution leaks if enabled
  if (checkLeaks && caseStudy.solution) {
    const leaks = findLeaksInObject(intake);
    if (leaks.length > 0) {
      console.warn('[MASKER WARNING] Potential solution leaks detected:');
      for (const leak of leaks) {
        console.warn(`  - ${leak.path}: ${leak.leaks.join(', ')}`);
      }

      if (options.strictLeakCheck) {
        throw new Error(`Solution leakage detected: ${leaks.map((l) => l.path).join(', ')}`);
      }
    }
  }

  // Validate output if enabled
  if (validateOutput) {
    const validation = IntakeSchema.safeParse(intake);
    if (!validation.success) {
      console.warn('[MASKER WARNING] Generated intake has validation issues:');
      for (const issue of validation.error.issues) {
        console.warn(`  - ${issue.path.join('.')}: ${issue.message}`);
      }
    }
  }

  return intake;
}

/**
 * Derive workflow name from problem context
 */
function deriveWorkflowName(problem) {
  const { industry, goals, pain_points } = problem;

  // Look for common workflow types in goals/pain points
  const allText = [...(goals || []), ...(pain_points || [])].join(' ').toLowerCase();

  if (allText.includes('schedul') || allText.includes('appointment') || allText.includes('booking')) {
    return 'Appointment Scheduling';
  }

  if (allText.includes('lead') || allText.includes('inquiry') || allText.includes('prospect')) {
    return 'Lead Intake & Qualification';
  }

  if (allText.includes('support') || allText.includes('customer service') || allText.includes('help')) {
    return 'Customer Support';
  }

  if (allText.includes('reminder') || allText.includes('follow-up') || allText.includes('outreach')) {
    return 'Outbound Reminders';
  }

  if (allText.includes('order') || allText.includes('purchase') || allText.includes('fulfillment')) {
    return 'Order Processing';
  }

  if (allText.includes('after hours') || allText.includes('24/7') || allText.includes('emergency')) {
    return 'After-Hours Coverage';
  }

  // Default based on industry
  return `${industry || 'Business'} Process Automation`;
}

/**
 * Derive trigger event from goals
 */
function deriveTriggerfromGoals(goals) {
  if (!goals || goals.length === 0) {
    return 'Inbound customer contact';
  }

  const goalsText = goals.join(' ').toLowerCase();

  if (goalsText.includes('call') || goalsText.includes('phone')) {
    return 'Phone call received';
  }

  if (goalsText.includes('form') || goalsText.includes('web')) {
    return 'Form submission received';
  }

  if (goalsText.includes('email')) {
    return 'Email inquiry received';
  }

  return 'Customer interaction initiated';
}

/**
 * Derive end condition from goals
 */
function deriveEndCondition(goals) {
  if (!goals || goals.length === 0) {
    return 'Request resolved or escalated';
  }

  const goalsText = goals.join(' ').toLowerCase();

  if (goalsText.includes('schedul') || goalsText.includes('appointment')) {
    return 'Appointment confirmed in system';
  }

  if (goalsText.includes('lead') || goalsText.includes('qualify')) {
    return 'Lead qualified and routed to sales';
  }

  if (goalsText.includes('support') || goalsText.includes('resolve')) {
    return 'Issue resolved or ticket created';
  }

  return 'Process completed successfully';
}

/**
 * Derive manual transfer description from problem
 */
function deriveManualTransfers(problem) {
  const systems = problem.systems_involved || [];

  if (systems.length <= 1) {
    return 'Manual data entry and record keeping';
  }

  return `Staff manually copies data between ${systems.slice(0, 3).join(', ')}`;
}

/**
 * Derive cost impact from problem pain points
 */
function deriveCostImpact(problem) {
  const painPoints = problem.pain_points || [];

  // Look for quantified impacts
  for (const pain of painPoints) {
    if (pain.includes('$') || pain.includes('hour') || pain.includes('minute')) {
      return pain;
    }
  }

  // Generic impact
  return 'Manual work overhead, delayed response times, and missed opportunities';
}

// =============================================================================
// Batch Masking
// =============================================================================

/**
 * Transform multiple case studies to intakes
 */
export function batchToIntake(caseStudies, options = {}) {
  const results = [];

  for (const caseStudy of caseStudies) {
    try {
      const intake = toIntake(caseStudy, options);
      results.push({
        id: caseStudy.id,
        success: true,
        intake,
      });
    } catch (error) {
      results.push({
        id: caseStudy.id,
        success: false,
        error: error.message,
      });
    }
  }

  return results;
}

// =============================================================================
// Validation & Debugging
// =============================================================================

/**
 * Validate that masked intake contains no solution references
 *
 * Supports both legacy solution format (with pricing_model, roi_achieved)
 * and factory solution format (with price_min/max, roi_months)
 */
export function validateNoSolutionLeakage(intake, solution) {
  const leaks = [];

  const intakeText = JSON.stringify(intake).toLowerCase();

  // NOTE: We deliberately DO NOT check for agent_type leakage.
  // Agent types (inbound/outbound/hybrid) are natural terms that appear in workflow
  // descriptions (e.g., "Outbound Sales Calls"). The solution's agent_type is typically
  // INFERRED from the workflow, so finding the word is expected, not a leak.

  // Check for provider name leakage
  if (solution.voice_provider && intakeText.includes(solution.voice_provider.toLowerCase())) {
    leaks.push(`Voice provider "${solution.voice_provider}" found in intake`);
  }

  // Check for specific integration names from solution
  // Handle both array of strings (factory) and array of objects (legacy)
  for (const integration of solution.integrations || []) {
    const systemName = typeof integration === 'string' ? integration : integration.system_name;
    if (systemName && intakeText.includes(systemName.toLowerCase()) && // This is OK - systems can be in both problem and solution
      // Only flag if it's integration-specific details from legacy format
      typeof integration === 'object' && integration.integration_type && intakeText.includes(integration.integration_type)) {
      leaks.push(`Integration type "${integration.integration_type}" for ${systemName} found`);
    }
  }

  // Check for pricing leakage - legacy format
  if (solution.pricing_model) {
    const { total_cost, monthly_cost, setup_cost, per_minute_rate } = solution.pricing_model;
    const prices = [total_cost, monthly_cost, setup_cost, per_minute_rate].filter(Boolean);

    for (const price of prices) {
      if (intakeText.includes(String(price))) {
        leaks.push(`Price value ${price} found in intake`);
      }
    }
  }

  // Check for pricing leakage - factory format
  if (solution.price_min || solution.price_max) {
    const prices = [solution.price_min, solution.price_max].filter(Boolean);
    for (const price of prices) {
      if (intakeText.includes(String(price))) {
        leaks.push(`Price value ${price} found in intake`);
      }
    }
  }

  // Check for ROI leakage - legacy format
  if (solution.roi_achieved) {
    const roiValues = Object.values(solution.roi_achieved).filter(
      (v) => typeof v === 'number'
    );
    for (const value of roiValues) {
      if (intakeText.includes(String(value))) {
        leaks.push(`ROI metric ${value} found in intake`);
      }
    }
  }

  // Check for ROI leakage - factory format
  // Only flag specific ROI-related patterns, not just any number occurrence
  if (solution.roi_months) {
    const roiPatterns = [
      `payback in ${solution.roi_months} month`,
      `roi of ${solution.roi_months}`,
      `${solution.roi_months} month payback`,
      `${solution.roi_months}-month payback`,
    ];
    for (const pattern of roiPatterns) {
      if (intakeText.includes(pattern)) {
        leaks.push(`ROI pattern "${pattern}" found in intake`);
        break;
      }
    }
  }

  return {
    clean: leaks.length === 0,
    leaks,
  };
}

/**
 * Generate a debug report for masked intake
 *
 * Supports both legacy and factory case study formats
 */
export function generateMaskingReport(caseStudy, maskedIntake) {
  const {problem} = caseStudy;
  const {solution} = caseStudy;

  const leakCheck = validateNoSolutionLeakage(maskedIntake, solution);

  // Detect format: Factory IntakeData has prepared_for and section_* fields
  const isFactoryFormat = problem.prepared_for && problem.section_a_workflow_definition;

  let problemSummary;
  if (isFactoryFormat) {
    // Factory format
    problemSummary = {
      industry: problem.prepared_for?.account_name || 'unknown',
      pain_point_count: 1, // Factory uses q13_common_failures as string
      goal_count: 1, // Factory uses q03_business_objective as string
      systems_count: problem.section_c_systems_handoffs?.q10_systems_involved?.length || 0,
    };
  } else {
    // Legacy format
    problemSummary = {
      industry: problem.industry,
      pain_point_count: problem.pain_points?.length || 0,
      goal_count: problem.goals?.length || 0,
      systems_count: problem.systems_involved?.length || 0,
    };
  }

  return {
    case_study_id: caseStudy.id,
    timestamp: new Date().toISOString(),

    problem_summary: problemSummary,

    masked_intake_summary: {
      account_name: maskedIntake.prepared_for?.account_name,
      workflow_name: maskedIntake.section_a_workflow_definition?.q01_workflow_name,
      systems_included: maskedIntake.section_c_systems_handoffs?.q10_systems_involved?.length || 0,
    },

    leakage_check: leakCheck,

    solution_hidden: {
      agent_type: solution.agent_type,
      integration_count: solution.integrations?.length || 0,
      has_pricing: Boolean(solution.pricing_model || solution.price_min || solution.price_max),
      has_roi: Boolean(solution.roi_achieved || solution.roi_months),
    },
  };
}

// =============================================================================
// Exports
// =============================================================================

export default {
  toIntake,
  batchToIntake,
  validateNoSolutionLeakage,
  generateMaskingReport,
  detectSolutionLeaks,
};
