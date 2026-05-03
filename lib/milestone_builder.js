/**
 * Milestone Builder for AI Proposals
 * Constructs the canonical Phase 1/2/3 structure with nested milestones
 */

import { v4 as uuidv4 } from 'uuid';
import { ensureLoaded, getLegacyPhaseTemplates } from '../config/index.js';
import { formatCurrency } from './project_identity.js';

// Phase templates loaded from SQLite
let _phaseTemplates = null;
let _isInitialized = false;

/**
 * Initialize milestone templates from SQLite
 */
export async function initMilestoneBuilder() {
  if (_isInitialized) return;
  await ensureLoaded();
  _phaseTemplates = await getLegacyPhaseTemplates();
  _isInitialized = true;
}

/**
 * Get phase template by key (falls back to hardcoded if not initialized)
 */
function getPhaseTemplate(phaseNumber) {
  if (_phaseTemplates?.phases) {
    return _phaseTemplates.phases.find(phase => phase.number === phaseNumber);
  }

  return null;
}

/**
 * Get milestone template by key
 */
function getMilestoneTemplate(milestoneKey) {
  if (_phaseTemplates?.phases) {
    for (const phase of _phaseTemplates.phases) {
      const milestone = phase.milestones?.find(ms => ms.id === milestoneKey);
      if (milestone) return milestone;
    }
  }

  return null;
}

/**
 * Build the complete phase structure for a proposal
 * @param {Object} auditData - Parsed audit report data
 * @param {Object} pricing - Pricing breakdown from pricing_calculator
 * @param {Object} options - Additional options
 * @returns {Promise<Array>} Array of three phases
 */
export async function buildPhases(auditData, pricing, options = {}) {
  // Ensure templates are loaded
  await initMilestoneBuilder();
  
  return [
    buildPhase1Audit(auditData),
    buildPhase2Stabilize(auditData, pricing, options),
    buildPhase3Scale(auditData, options)
  ];
}

/**
 * Build Phase 1: Audit (completed)
 */
export function buildPhase1Audit(auditData) {
  const template = getPhaseTemplate(1);
  const auditDate = auditData.document?.created_at ||
    auditData.audit_date ||
    new Date().toISOString();

  return {
    phase_id: uuidv4(),
    phase_number: 1,
    phase_name: template?.label || 'Audit',
    state: template?.state || 'complete',
    description: template?.description_placeholder || '[LLM_PLACEHOLDER: phase_1_description]',
    milestones: [
      {
        milestone_id: uuidv4(),
        milestone_number: '1.1',
        milestone_name: 'AI Process Audit',
        description: 'Comprehensive analysis of current workflow, systems, and operational efficiency.',
        deliverables: [
          {
            name: 'AI Process Audit Report',
            description: 'Single-page diagnostic with category health scores and revenue bleed analysis'
          },
          {
            name: 'Key Findings',
            description: 'Prioritized list of issues with effort/impact assessment'
          },
          {
            name: 'Recommended Fixes',
            description: 'Actionable improvements with expected ROI'
          }
        ],
        duration: {
          value: auditData.audit_duration_days || 3,
          unit: 'business_days',
          display: `${auditData.audit_duration_days || 3} business days`
        },
        price_allocation: {
          amount: 0,
          currency: 'USD',
          period: 'once',
          display: 'Completed'
        }
      }
    ]
  };
}

/**
 * Build Phase 2: Stabilize (current proposal)
 */
export function buildPhase2Stabilize(auditData, pricing, options = {}) {
  const milestoneAllocations = pricing.milestones;
  const workflowName = auditData.workflow?.name ||
    auditData.workflow_name ||
    'workflow automation';

  // Estimate durations based on pricing
  const durations = estimateDurations(pricing.final_price, options);

  const template = getPhaseTemplate(2);
  return {
    phase_id: uuidv4(),
    phase_number: 2,
    phase_name: template?.label || 'Stabilize',
    state: template?.state || 'current',
    description: template?.description_placeholder || '[LLM_PLACEHOLDER: phase_2_description]',
    milestones: [
      buildMilestone21Design(auditData, milestoneAllocations.design, durations.design),
      buildMilestone22Build(auditData, milestoneAllocations.build, durations.build),
      buildMilestone23Test(auditData, milestoneAllocations.test, durations.test),
      buildMilestone24Deploy(auditData, milestoneAllocations.deploy, durations.deploy)
    ]
  };
}

/**
 * Milestone 2.1: Design
 */
function buildMilestone21Design(auditData, allocation, duration) {
  return {
    milestone_id: uuidv4(),
    milestone_number: '2.1',
    milestone_name: 'Design',
    description: '[LLM_PLACEHOLDER: milestone_2_1_description]',
    deliverables: [
      {
        name: 'Requirements Document',
        description: 'Finalized functional and technical requirements',
        acceptance_criteria: [
          'All stakeholder requirements captured',
          'Success metrics defined',
          'Client sign-off obtained'
        ]
      },
      {
        name: 'Solution Architecture',
        description: 'Technical design for system integrations and data flows',
        acceptance_criteria: [
          'Integration points mapped for all systems',
          'Data schema defined',
          'Security requirements addressed'
        ]
      },
      {
        name: 'Implementation Plan',
        description: 'Detailed project timeline and resource allocation',
        acceptance_criteria: [
          'Task breakdown with dependencies',
          'Risk mitigation strategies',
          'Communication cadence established'
        ]
      }
    ],
    duration,
    price_allocation: {
      amount: allocation.amount,
      percentage: allocation.percentage,
      currency: 'USD',
      period: 'once',
      display: formatCurrency(allocation.amount)
    }
  };
}

/**
 * Milestone 2.2: Build
 */
function buildMilestone22Build(auditData, allocation, duration) {
  const recommendedFixes = auditData.recommended_fixes || [];
  const deliverables = [];

  // Core system development
  deliverables.push({
    name: 'Core Automation System',
    description: 'Primary workflow automation implementation',
    acceptance_criteria: [
      'All critical path automations functional',
      'Error handling implemented',
      'Logging and monitoring in place'
    ]
  });

  // Integration development
  const involvedSystems = auditData.systems ||
    auditData.workflow?.systems_involved || [];
  if (involvedSystems.length > 1) {
    deliverables.push({
      name: 'System Integrations',
      description: `Connections between ${involvedSystems.slice(0, 3).join(', ')}${involvedSystems.length > 3 ? ' and others' : ''}`,
      acceptance_criteria: [
        'API connections established and tested',
        'Data synchronization verified',
        'Failover handling configured'
      ]
    });
  }

  // AI components if applicable
  const includesAIComponents = recommendedFixes.some(fix =>
    (fix.fix || fix.description || '').toLowerCase().includes('ai') ||
    (fix.fix || fix.description || '').toLowerCase().includes('automat')
  );
  if (includesAIComponents) {
    deliverables.push({
      name: 'AI Processing Components',
      description: 'Machine learning or AI-powered automation elements',
      acceptance_criteria: [
        'Model accuracy meets requirements',
        'Processing latency within SLA',
        'Edge cases handled gracefully'
      ]
    });
  }

  // Internal testing
  deliverables.push({
    name: 'Internal Testing Complete',
    description: 'Developer testing and code review',
    acceptance_criteria: [
      'Unit tests passing',
      'Integration tests complete',
      'Code review approved'
    ]
  });

  return {
    milestone_id: uuidv4(),
    milestone_number: '2.2',
    milestone_name: 'Build',
    description: '[LLM_PLACEHOLDER: milestone_2_2_description]',
    deliverables,
    duration,
    price_allocation: {
      amount: allocation.amount,
      percentage: allocation.percentage,
      currency: 'USD',
      period: 'once',
      display: formatCurrency(allocation.amount)
    }
  };
}

/**
 * Milestone 2.3: Test
 */
function buildMilestone23Test(auditData, allocation, duration) {
  return {
    milestone_id: uuidv4(),
    milestone_number: '2.3',
    milestone_name: 'Test',
    description: '[LLM_PLACEHOLDER: milestone_2_3_description]',
    deliverables: [
      {
        name: 'Alpha Testing',
        description: 'Internal QA with synthetic data',
        acceptance_criteria: [
          'All test scenarios passed',
          'Performance benchmarks met',
          'Bug fixes completed'
        ]
      },
      {
        name: 'Beta Testing',
        description: 'Client stakeholder testing with real workflows',
        acceptance_criteria: [
          'User acceptance criteria met',
          'Feedback incorporated',
          'Sign-off from key stakeholders'
        ]
      },
      {
        name: 'Performance Validation',
        description: 'Load testing and optimization',
        acceptance_criteria: [
          'Response times within SLA',
          'System stable under expected load',
          'No memory leaks or resource issues'
        ]
      }
    ],
    duration,
    price_allocation: {
      amount: allocation.amount,
      percentage: allocation.percentage,
      currency: 'USD',
      period: 'once',
      display: formatCurrency(allocation.amount)
    }
  };
}

/**
 * Milestone 2.4: Deploy
 */
function buildMilestone24Deploy(auditData, allocation, duration) {
  return {
    milestone_id: uuidv4(),
    milestone_number: '2.4',
    milestone_name: 'Deploy',
    description: '[LLM_PLACEHOLDER: milestone_2_4_description]',
    deliverables: [
      {
        name: 'Production Deployment',
        description: 'Live system deployment with monitoring',
        acceptance_criteria: [
          'System live in production',
          'Monitoring dashboards active',
          'Alerting configured'
        ]
      },
      {
        name: 'User Training',
        description: 'Training sessions for end users and administrators',
        acceptance_criteria: [
          'All designated users trained',
          'Training materials delivered',
          'Q&A sessions completed'
        ]
      },
      {
        name: 'Documentation Package',
        description: 'Technical and user documentation',
        acceptance_criteria: [
          'User guide delivered',
          'Admin documentation complete',
          'Troubleshooting guide provided'
        ]
      },
      {
        name: 'Go-Live Support',
        description: 'Dedicated support during initial production period',
        acceptance_criteria: [
          'Support coverage confirmed',
          'Escalation paths defined',
          'Warranty period begins'
        ]
      }
    ],
    duration,
    price_allocation: {
      amount: allocation.amount,
      percentage: allocation.percentage,
      currency: 'USD',
      period: 'once',
      display: formatCurrency(allocation.amount)
    }
  };
}

/**
 * Build Phase 3: Scale (future, optional)
 * This phase is intentionally marked as optional for upselling purposes
 */
export function buildPhase3Scale(auditData, options = {}) {
  const template = getPhaseTemplate(3);
  return {
    phase_id: uuidv4(),
    phase_number: 3,
    phase_name: template?.label || 'Scale',
    phase_label: 'Phase 3: Scale (Optional)',
    state: template?.state || 'upcoming',
    is_optional: true,
    optional_note: 'Available after Phase 2 completion',
    description: '[LLM_PLACEHOLDER: phase_3_description]',
    milestones: [
      {
        milestone_id: uuidv4(),
        milestone_number: '3.1',
        milestone_name: 'Optimize',
        description: 'Performance optimization and efficiency improvements based on production metrics.',
        deliverables: [
          { name: 'Performance Analysis', description: 'Review of production metrics and bottlenecks' },
          { name: 'Optimization Implementation', description: 'Targeted improvements to speed and efficiency' }
        ]
      },
      {
        milestone_id: uuidv4(),
        milestone_number: '3.2',
        milestone_name: 'Expand',
        description: 'Extension to additional workflows, teams, or business units.',
        deliverables: [
          { name: 'Expansion Roadmap', description: 'Plan for scaling to additional use cases' },
          { name: 'Additional Integrations', description: 'New system connections as needed' }
        ]
      }
    ]
  };
}

/**
 * Estimate milestone durations based on price
 */
export function estimateDurations(totalPrice, options = {}) {
  // Base duration estimation: roughly 1 week per $5K
  const totalWeeks = Math.max(2, Math.ceil(totalPrice / 5000));

  // Apply timeline pressure if specified
  const pressureMultiplier = {
    standard: 1,
    expedited: 0.7,
    rush: 0.5,
    emergency: 0.3
  }[options.timeline_pressure || 'standard'] || 1;

  const adjustedWeeks = Math.max(2, Math.ceil(totalWeeks * pressureMultiplier));

  // Distribute across milestones (roughly matching price allocation)
  const designWeeks = Math.max(1, Math.ceil(adjustedWeeks * 0.2));
  const buildWeeks = Math.max(1, Math.ceil(adjustedWeeks * 0.45));
  const testWeeks = Math.max(1, Math.ceil(adjustedWeeks * 0.15));
  const deployWeeks = Math.max(1, Math.ceil(adjustedWeeks * 0.2));

  return {
    total: formatDuration(adjustedWeeks, 'weeks'),
    design: formatDuration(designWeeks, 'weeks'),
    build: formatDuration(buildWeeks, 'weeks'),
    test: formatDuration(testWeeks, 'weeks'),
    deploy: formatDuration(deployWeeks, 'weeks')
  };
}

/**
 * Format duration object
 */
export function formatDuration(value, unit) {
  const displayUnit = value === 1 ? unit.replace(/s$/, '') : unit;
  return {
    value,
    unit,
    display: `${value} ${displayUnit}`
  };
}

/**
 * Calculate total duration from all milestones
 */
export function calculateTotalDuration(phases) {
  let totalWeeks = 0;

  for (const phase of phases) {
    if (phase.state !== 'upcoming') {
      for (const milestone of (phase.milestones || [])) {
        if (milestone.duration?.unit === 'weeks') {
          totalWeeks += milestone.duration.value;
        } else if (milestone.duration?.unit === 'business_days') {
          totalWeeks += milestone.duration.value / 5;
        }
      }
    }
  }

  return formatDuration(Math.ceil(totalWeeks), 'weeks');
}

// =============================================================================
// PRODUCT-SPECIFIC MILESTONE NARRATIVES (AI Voice Agent)
// Same 4-milestone structure with product-focused language
// =============================================================================

/**
 * Product milestone templates for AI Voice Agent
 */
const PRODUCT_MILESTONES = {
  configuration: {
    number: '2.1',
    name: 'Configuration',
    project_equivalent: 'Design',
    description: 'Voice agent configuration and call flow design tailored to your business.',
    deliverables: [
      {
        name: 'Call Flow Script',
        description: 'Custom conversation scripts for common caller scenarios',
        acceptance_criteria: [
          'Business hours, services, and pricing captured',
          'Emergency call routing defined',
          'FAQ responses configured'
        ]
      },
      {
        name: 'Phone System Setup',
        description: 'Number provisioning and call forwarding configuration',
        acceptance_criteria: [
          'Phone number assigned or ported',
          'Forwarding rules configured',
          'Failover routing established'
        ]
      },
      {
        name: 'Integration Mapping',
        description: 'Connection points to your existing systems',
        acceptance_criteria: [
          'Calendar integration configured',
          'CRM sync established (if applicable)',
          'Notification preferences set'
        ]
      }
    ]
  },
  integration: {
    number: '2.2',
    name: 'Integration',
    project_equivalent: 'Build',
    description: 'Connect your voice agent to your business systems and workflows.',
    deliverables: [
      {
        name: 'Calendar Integration',
        description: 'Real-time availability sync for appointment booking',
        acceptance_criteria: [
          'Availability windows synced',
          'Double-booking prevention active',
          'Appointment confirmation automated'
        ]
      },
      {
        name: 'CRM/Dispatch Integration',
        description: 'Lead capture and job dispatch automation',
        acceptance_criteria: [
          'New leads auto-created',
          'Job details captured accurately',
          'Dispatch notifications configured'
        ]
      },
      {
        name: 'Notification Setup',
        description: 'SMS/email alerts for calls and appointments',
        acceptance_criteria: [
          'Owner notification preferences set',
          'Team alerts configured',
          'Escalation paths defined'
        ]
      }
    ]
  },
  training: {
    number: '2.3',
    name: 'Training',
    project_equivalent: 'Test',
    description: 'Test calls and refinement to ensure natural, accurate conversations.',
    deliverables: [
      {
        name: 'Test Call Simulations',
        description: 'Simulated calls covering all scenarios',
        acceptance_criteria: [
          'Common inquiries handled correctly',
          'Edge cases addressed',
          'Escalation triggers working'
        ]
      },
      {
        name: 'Voice & Tone Calibration',
        description: 'Fine-tuning the voice agent personality',
        acceptance_criteria: [
          'Tone matches brand voice',
          'Pacing appropriate for callers',
          'Industry terminology correct'
        ]
      },
      {
        name: 'Stakeholder Review',
        description: 'Live demo with your team for feedback',
        acceptance_criteria: [
          'Team has heard test calls',
          'Feedback incorporated',
          'Sign-off obtained'
        ]
      }
    ]
  },
  launch: {
    number: '2.4',
    name: 'Launch',
    project_equivalent: 'Deploy',
    description: 'Go live with your AI receptionist and ongoing optimization.',
    deliverables: [
      {
        name: 'Go-Live Activation',
        description: 'Switch to production and monitor first calls',
        acceptance_criteria: [
          'Phone line active',
          'First real calls handled',
          'Monitoring dashboard accessible'
        ]
      },
      {
        name: 'Owner Training',
        description: 'Quick tutorial on dashboard and settings',
        acceptance_criteria: [
          'Dashboard walkthrough completed',
          'Settings adjustment demonstrated',
          'Support contact provided'
        ]
      },
      {
        name: 'First Week Review',
        description: 'Analysis of early calls and quick adjustments',
        acceptance_criteria: [
          'Call transcripts reviewed',
          'Quick wins identified',
          'Refinements applied'
        ]
      },
      {
        name: 'Ongoing Protection',
        description: 'Your AI receptionist is now 24/7 active',
        acceptance_criteria: [
          'Monthly subscription begins',
          'Support SLA in effect',
          'Optimization recommendations ongoing'
        ]
      }
    ]
  }
};

/**
 * Build Phase 2 milestones for AI Voice Agent product
 * Uses product-specific narratives instead of project narratives
 * @param {Object} intake - Intake data with classification
 * @param {Object} productPricing - Product pricing from calculateProductPricing
 * @param {Object} options - Additional options
 * @returns {Object} Phase 2 structure with product milestones
 */
export function buildProductPhase2(intake, productPricing, options = {}) {
  const setupFee = productPricing.setup_fee?.amount || 500;

  // Estimate durations for product (typically faster than custom projects)
  const productDurations = estimateProductDurations(setupFee);

  // Allocate setup fee across milestones (same percentages as project)
  const allocations = {
    configuration: { amount: Math.round(setupFee * 0.2), percentage: 20 },
    integration: { amount: Math.round(setupFee * 0.45), percentage: 45 },
    training: { amount: Math.round(setupFee * 0.15), percentage: 15 },
    launch: { amount: setupFee - Math.round(setupFee * 0.2) - Math.round(setupFee * 0.45) - Math.round(setupFee * 0.15), percentage: 20 }
  };

  return {
    phase_id: uuidv4(),
    phase_number: 2,
    phase_name: 'Activate',
    phase_label: 'Phase 2: Activate Your AI Receptionist',
    state: 'current',
    description: 'Configure, integrate, test, and launch your 24/7 AI Voice Agent.',
    is_product: true,
    product_key: 'ai_voice_agent',
    milestones: [
      buildProductMilestone('configuration', allocations.configuration, productDurations.configuration),
      buildProductMilestone('integration', allocations.integration, productDurations.integration),
      buildProductMilestone('training', allocations.training, productDurations.training),
      buildProductMilestone('launch', allocations.launch, productDurations.launch)
    ]
  };
}

/**
 * Build a single product milestone from template
 */
function buildProductMilestone(key, allocation, duration) {
  const template = PRODUCT_MILESTONES[key];
  if (!template) {
    throw new Error(`Unknown product milestone: ${key}`);
  }

  return {
    milestone_id: uuidv4(),
    milestone_number: template.number,
    milestone_name: template.name,
    project_equivalent: template.project_equivalent,
    description: template.description,
    deliverables: template.deliverables,
    duration,
    price_allocation: {
      amount: allocation.amount,
      percentage: allocation.percentage,
      currency: 'USD',
      period: 'once',
      display: formatCurrency(allocation.amount),
      note: 'One-time setup fee'
    }
  };
}

/**
 * Estimate durations for product milestones (typically faster)
 */
function estimateProductDurations(setupFee) {
  // Products are faster: roughly 1 day per $125 of setup
  // But with minimums for each phase
  const totalDays = Math.max(5, Math.ceil(setupFee / 125));

  return {
    configuration: formatDuration(Math.max(1, Math.ceil(totalDays * 0.2)), 'days'),
    integration: formatDuration(Math.max(2, Math.ceil(totalDays * 0.4)), 'days'),
    training: formatDuration(Math.max(1, Math.ceil(totalDays * 0.2)), 'days'),
    launch: formatDuration(Math.max(1, Math.ceil(totalDays * 0.2)), 'days')
  };
}

/**
 * Build phases for product (AI Voice Agent)
 * Uses product-specific Phase 2 milestones
 * @param {Object} intake - Intake data
 * @param {Object} productPricing - Product pricing breakdown
 * @param {Object} options - Additional options
 * @returns {Promise<Array>} Array of phases with product narratives
 */
export async function buildProductPhases(intake, productPricing, options = {}) {
  await initMilestoneBuilder();

  return [
    buildPhase1Audit({ ...intake, audit_duration_days: 1 }), // Faster audit for products
    buildProductPhase2(intake, productPricing, options),
    buildProductPhase3(intake, productPricing, options)
  ];
}

/**
 * Build Phase 3 for product (future upsell)
 */
function buildProductPhase3(intake, productPricing, options = {}) {
  return {
    phase_id: uuidv4(),
    phase_number: 3,
    phase_name: 'Expand',
    phase_label: 'Phase 3: Expand (Optional)',
    state: 'upcoming',
    is_optional: true,
    is_product: true,
    optional_note: 'Upgrade anytime after launch',
    description: 'Grow your virtual office with additional channels and capabilities.',
    milestones: [
      {
        milestone_id: uuidv4(),
        milestone_number: '3.1',
        milestone_name: 'Website Chat',
        description: 'Add AI-powered chat widget to your website.',
        deliverables: [
          { name: 'Chat Widget Installation', description: 'Simple code snippet for your website' },
          { name: 'Unified Inbox', description: 'All conversations in one dashboard' }
        ],
        price_allocation: {
          amount: 250,
          currency: 'USD',
          period: 'mo',
          display: '+$250/mo',
          note: 'Upgrade to Growth Bundle'
        }
      },
      {
        milestone_id: uuidv4(),
        milestone_number: '3.2',
        milestone_name: 'Additional Lines',
        description: 'Scale to multiple phone numbers or locations.',
        deliverables: [
          { name: 'Additional Number Setup', description: 'New numbers with same AI configuration' },
          { name: 'Location Routing', description: 'Smart routing based on caller area' }
        ]
      }
    ]
  };
}

/**
 * Get product milestone templates (for testing/debugging)
 */
export function getProductMilestoneTemplates() {
  return { ...PRODUCT_MILESTONES };
}

export default {
  buildPhases,
  buildProductPhases,
  buildPhase1Audit,
  buildPhase2Stabilize,
  buildProductPhase2,
  buildPhase3Scale,
  calculateTotalDuration,
  estimateDurations,
  formatDuration,
  getProductMilestoneTemplates
};
