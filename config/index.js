/**
 * Configuration Module - Portable SQLite via sql.js (WebAssembly)
 * 
 * Single source of truth for all configuration data.
 * Uses sql.js for cross-platform compatibility (no native compilation).
 * 
 * Usage:
 *   import { getConfig, ensureLoaded } from '../config/index.js';
 *   await ensureLoaded();
 *   const config = getConfig();
 *   const rate = config.laborRates.solutions_architect.unit_rate;
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'presales.db');

// Configuration cache
let _config = null;
let _initPromise = null;

function tableExists(db, tableName) {
  const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?");
  stmt.bind([tableName]);
  const exists = stmt.step();
  stmt.free();
  return exists;
}

function defaultBrandAssets() {
  return {
    colors: {
      primary: { value: '#4F46E5', context: 'default primary brand color', fallback: '#4F46E5' },
      secondary: { value: '#10B981', context: 'default secondary brand color', fallback: '#10B981' },
      accent: { value: '#F59E0B', context: 'default accent brand color', fallback: '#F59E0B' },
    },
    identity: {
      company_name: { value: 'Wranngle Systems LLC', context: 'default company name', fallback: 'Wranngle Systems LLC' },
      tagline: { value: '', context: 'default tagline', fallback: '' },
    },
    imagery: {
      primary_logo: { value: '', context: 'default logo URL', fallback: '' },
    },
  };
}

function defaultDocumentTypes() {
  return {
    audit: {
      label: 'Phase 1: AI Process Audit',
      headerTitle: 'AI Process Audit',
      phase: 'audit',
      template: null,
      cssVariant: null,
    },
    project_plan: {
      label: 'Phase 2: Project Plan',
      headerTitle: 'Project Plan',
      phase: 'stabilize',
      template: null,
      cssVariant: null,
    },
    proposal: {
      label: 'Phase 2: Stabilize Proposal',
      headerTitle: 'Stabilize Proposal',
      phase: 'stabilize',
      template: null,
      cssVariant: null,
    },
  };
}

/**
 * Initialize sql.js and load configuration
 */
async function initializeConfig() {
  const SQL = await initSqlJs();
  let db;
  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
    for (const filename of ['schema_v3.sql', 'seed_presales.sql']) {
      const sqlPath = join(__dirname, filename);
      if (!existsSync(sqlPath)) {
        throw new Error(`Config database missing and ${filename} was not found`);
      }
      db.run(readFileSync(sqlPath, 'utf8'));
    }
  }

  const config = {};

  // Helper to run query
  const all = (sql) => {
    const stmt = db.prepare(sql);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }

    stmt.free();
    return rows;
  };

  // Load all tables
  const laborRates = all('SELECT * FROM labor_rates');
  const engagementBands = all('SELECT * FROM engagement_bands');
  const serviceAgreements = all('SELECT * FROM service_agreements');
  const adjustmentFactors = all('SELECT * FROM adjustment_factors');
  const phaseAllocations = all('SELECT * FROM phase_allocations ORDER BY sequence_order');
  const technologyProfiles = all('SELECT * FROM technology_profiles');
  const discountPolicies = all('SELECT * FROM discount_policies');
  const paymentPolicies = all('SELECT * FROM payment_policies');
  const operationalParams = all('SELECT * FROM operational_params');

  db.close();

  // Transform labor_rates to keyed object
  config.laborRates = {};
  for (const row of laborRates) {
    config.laborRates[row.role_key] = {
      role_label: row.role_label,
      unit_rate: row.unit_rate,
      default_weight: row.default_weight,
      scope_notes: row.scope_notes,
    };
  }

  // Transform engagement_bands to keyed object
  config.engagementBands = {};
  for (const row of engagementBands) {
    config.engagementBands[row.band_key] = {
      band_label: row.band_label,
      floor_usd: row.floor_usd,
      ceiling_usd: row.ceiling_usd,
      typical_usd: row.typical_usd,
      effort_floor_hrs: row.effort_floor_hrs,
      effort_ceiling_hrs: row.effort_ceiling_hrs,
      effort_default_hrs: row.effort_default_hrs,
      scope_notes: row.scope_notes,
    };
  }

  // Transform service_agreements to keyed object
  config.serviceAgreements = {};
  for (const row of serviceAgreements) {
    config.serviceAgreements[row.agreement_key] = {
      agreement_label: row.agreement_label,
      period_rate_usd: row.period_rate_usd,
      included_hrs: row.included_hrs,
      scope_notes: row.scope_notes,
    };
  }

  // Transform adjustment_factors to nested object by category
  config.adjustmentFactors = {};
  for (const row of adjustmentFactors) {
    if (!config.adjustmentFactors[row.category]) {
      config.adjustmentFactors[row.category] = {};
    }

    config.adjustmentFactors[row.category][row.factor_key] = {
      factor_label: row.factor_label,
      multiplier: row.multiplier,
      criteria: row.criteria ? JSON.parse(row.criteria) : [],
    };
  }

  // Transform phase_allocations to keyed object
  config.phaseAllocations = {};
  for (const row of phaseAllocations) {
    config.phaseAllocations[row.phase_key] = {
      phase_label: row.phase_label,
      budget_weight: row.budget_weight,
      scope_notes: row.scope_notes,
      sequence_order: row.sequence_order,
    };
  }

  // Transform technology_profiles to nested object by domain
  config.technologyProfiles = {};
  for (const row of technologyProfiles) {
    if (!config.technologyProfiles[row.domain]) {
      config.technologyProfiles[row.domain] = {};
    }

    config.technologyProfiles[row.domain][row.tech_key] = {
      risk_tier: row.risk_tier,
      notes: row.notes,
    };
  }

  // Transform discount_policies to nested object by type
  config.discountPolicies = {};
  for (const row of discountPolicies) {
    if (!config.discountPolicies[row.policy_type]) {
      config.discountPolicies[row.policy_type] = {};
    }

    config.discountPolicies[row.policy_type][row.policy_key] = {
      policy_label: row.policy_label,
      threshold_floor: row.threshold_floor,
      threshold_ceiling: row.threshold_ceiling,
      reduction_pct: row.reduction_pct,
      scope_notes: row.scope_notes,
    };
  }

  // Transform payment_policies to nested object by channel
  config.paymentPolicies = {};
  for (const row of paymentPolicies) {
    if (!config.paymentPolicies[row.channel]) {
      config.paymentPolicies[row.channel] = {};
    }

    config.paymentPolicies[row.channel][row.policy_key] = {
      mechanism: row.mechanism,
      net_days: row.net_days,
      upfront_pct: row.upfront_pct,
      final_pct: row.final_pct,
      trigger_event: row.trigger_event,
      threshold_usd: row.threshold_usd,
      scope_notes: row.scope_notes,
    };
  }

  // Transform operational_params to flat object with typed values
  config.params = {};
  for (const row of operationalParams) {
    let value = row.param_value;
    switch (row.value_type) {
      case 'integer': { value = Number.parseInt(value, 10); break;
      }

      case 'real': { value = Number.parseFloat(value); break;
      }

      case 'boolean': { value = value === 'true'; break;
      }

      case 'json': { value = JSON.parse(value); break;
      }
    }

    config.params[row.param_key] = value;
  }

  return config;
}

/**
 * Ensure config is loaded
 */
export async function ensureLoaded() {
  if (_config) return;
  _initPromise ||= initializeConfig().then(c => { _config = c; });
  await _initPromise;
}

/**
 * Get configuration (sync after ensureLoaded)
 */
export function getConfig() {
  if (!_config) {
    throw new Error('Config not loaded. Call await ensureLoaded() first.');
  }

  return _config;
}

/**
 * Check if loaded
 */
export function isLoaded() {
  return _config !== null;
}

// ============================================================================
// LEGACY COMPATIBILITY - Maps new structure to old JSON format
// ============================================================================

/**
 * Get BASE_RATES in legacy format (for pricing-calculator.js)
 */
export function getLegacyBaseRates() {
  const c = getConfig();
  return {
    hourly_rates: Object.fromEntries(
      Object.entries(c.laborRates).map(([k, v]) => [k, {
        rate: v.unit_rate,
        currency: 'USD',
        description: v.scope_notes,
      }])
    ),
    effort_tiers: {
      trivial: { min_hours: 2, max_hours: 8, default_hours: 4 },
      moderate: { min_hours: 8, max_hours: 24, default_hours: 16 },
      complex: { min_hours: 24, max_hours: 80, default_hours: 40 },
      critical: { min_hours: 40, max_hours: 160, default_hours: 80 },
    },
    fixed_packages: Object.fromEntries(
      Object.entries(c.engagementBands)
        .filter(([k]) => k.startsWith('pkg_'))
        .map(([k, v]) => [k.replace('pkg_', ''), {
          min: v.floor_usd,
          max: v.ceiling_usd,
          typical: v.typical_usd,
          description: v.scope_notes,
        }])
    ),
    milestone_allocation: Object.fromEntries(
      Object.entries(c.phaseAllocations).map(([k, v]) => [k, {
        percentage: Math.round(v.budget_weight * 100),
        description: v.scope_notes,
      }])
    ),
    minimum_project_value: c.params.minimum_project_value,
    rounding_increment: c.params.rounding_increment,
    warranty: {
      standard_days: c.params.warranty_days,
      description: 'Bug fixes included post-deployment',
    },
    payment_terms: {
      upwork: { type: 'milestone_escrow' },
      direct: { type: 'invoice', net_days: 15 },
    },
  };
}

/**
 * Get COMPLEXITY_MULTIPLIERS in legacy format
 */
export function getLegacyComplexityMultipliers() {
  const c = getConfig();
  return {
    systems_count: {
      ranges: Object.fromEntries(
        Object.entries(c.adjustmentFactors.systems_count || {}).map(([k, v]) => [
          k.replace('_plus', '+'),
          { multiplier: v.multiplier, description: v.criteria?.[0] || '' }
        ])
      ),
    },
    integration_difficulty: {
      types: Object.fromEntries(
        Object.entries(c.adjustmentFactors.integration_method || {}).map(([k, v]) => [
          k, { multiplier: v.multiplier, description: v.criteria?.[0] || '' }
        ])
      ),
    },
    data_sensitivity: {
      levels: Object.fromEntries(
        Object.entries(c.adjustmentFactors.data_sensitivity || {}).map(([k, v]) => [
          k, { multiplier: v.multiplier, description: v.criteria?.[0] || '' }
        ])
      ),
    },
    timeline_pressure: {
      speeds: Object.fromEntries(
        Object.entries(c.adjustmentFactors.timeline || {}).map(([k, v]) => [
          k, { multiplier: v.multiplier, description: v.criteria?.[0] || '' }
        ])
      ),
    },
    client_technical_readiness: {
      levels: Object.fromEntries(
        Object.entries(c.adjustmentFactors.client_readiness || {}).map(([k, v]) => [
          k, { multiplier: v.multiplier, description: v.criteria?.[0] || '' }
        ])
      ),
    },
    industry_complexity: {
      industries: Object.fromEntries(
        Object.entries(c.adjustmentFactors.industry || {}).map(([k, v]) => [
          k, { multiplier: v.multiplier }
        ])
      ),
    },
    company_size: {
      segments: Object.fromEntries(
        Object.entries(c.adjustmentFactors.company_size || {}).map(([k, v]) => [
          k, { multiplier: v.multiplier, description: v.criteria?.[0] || '' }
        ])
      ),
    },
  };
}

/**
 * Get DISCOUNT_RULES in legacy format
 */
export function getLegacyDiscountRules() {
  const c = getConfig();
  return {
    volume_discounts: {
      tiers: Object.values(c.discountPolicies.volume || {}).map(v => ({
        min_value: v.threshold_floor,
        max_value: v.threshold_ceiling,
        discount_percentage: v.reduction_pct,
        description: v.policy_label,
      })),
    },
    commitment_discounts: {
      options: Object.fromEntries(
        Object.entries(c.discountPolicies.commitment || {}).map(([k, v]) => [
          k, { discount_percentage: v.reduction_pct, description: v.policy_label }
        ])
      ),
    },
    early_payment_discounts: {
      options: Object.fromEntries(
        Object.entries(c.discountPolicies.early_payment || {}).map(([k, v]) => [
          k, { discount_percentage: v.reduction_pct, description: v.policy_label }
        ])
      ),
    },
    referral_discounts: {
      first_project_discount: c.discountPolicies.referral?.first_project?.reduction_pct || 5,
      description_text: c.discountPolicies.referral?.first_project?.policy_label || 'Referral discount',
    },
    maximum_combined_discount: c.params.max_combined_reduction_pct || 25,
    discount_stacking: c.params.discount_stacking_policy || 'additive',
    notes: {
      approval_required_above: c.params.approval_threshold_pct || 15,
    },
  };
}

/**
 * Get agency_context in legacy format
 */
export function getLegacyAgencyContext() {
  const c = getConfig();
  return {
    rate_card: {
      roles: Object.fromEntries(
        Object.entries(c.laborRates)
          .filter(([_, v]) => v.default_weight > 0)
          .map(([k, v]) => [k, {
            hourly_rate: v.unit_rate,
            typical_allocation: v.default_weight,
            description: v.scope_notes,
          }])
      ),
      blended_rate: c.params.composite_rate,
    },
    project_tiers: Object.fromEntries(
      Object.entries(c.engagementBands)
        .filter(([k]) => !k.startsWith('pkg_'))
        .map(([k, v]) => [k, {
          name: v.band_label,
          price_range: { min: v.floor_usd, max: v.ceiling_usd },
          hours_range: { min: v.effort_floor_hrs, max: v.effort_ceiling_hrs },
          description: v.scope_notes,
        }])
    ),
    retainer_options: Object.fromEntries(
      Object.entries(c.serviceAgreements).map(([k, v]) => [k, {
        name: v.agreement_label,
        monthly_rate: v.period_rate_usd,
        hours_included: v.included_hrs,
        description: v.scope_notes,
      }])
    ),
    risk_multipliers: Object.fromEntries(
      Object.entries(c.adjustmentFactors.risk || {}).map(([k, v]) => [k, {
        multiplier: v.multiplier,
        criteria: v.criteria,
      }])
    ),
    tech_stack: c.technologyProfiles,
    milestone_allocation: Object.fromEntries(
      Object.entries(c.phaseAllocations).map(([k, v]) => [k, {
        allocation: v.budget_weight,
        description: v.scope_notes,
      }])
    ),
    contingency: { default: c.params.contingency_ratio },
    pricing_validation: {
      profit_floor_percent: c.params.profit_floor_ratio * 100,
      hard_floor_coverage_percent: c.params.hard_floor_coverage_ratio * 100,
      max_payback_months: c.params.max_payback_months,
      opportunity_lift_percent: c.params.opportunity_lift_ratio * 100,
      client_hourly_value: c.params.client_hourly_value,
      average_deal_value: c.params.average_deal_value,
      daily_leads_default: c.params.daily_leads_default,
      labor_savings_multiplier: c.params.labor_savings_ratio,
    },
    subscription: {
      base_price: c.params.subscription_base_rate,
      billing_frequency: c.params.subscription_frequency,
      weekly_amount: c.params.subscription_weekly_amount,
      processes_included: c.params.subscription_processes_included,
      includes: c.params.subscription_includes,
    },
    internal_rates: { blended_hourly: c.params.internal_unit_rate },
    ad_hoc_rate: c.params.adhoc_premium_rate,
    licensing_model: {
      type: c.params.licensing_type,
      infrastructure: c.params.infrastructure_model,
      data_ownership: c.params.data_ownership,
      buyout_multiplier: c.params.buyout_multiplier,
    },
    // Integration complexity tier base hours (for estimate.js baseline calculation)
    integration_tier_hours: {
      simple: 4,
      standard: 8,
      moderate: 12,
      complex: 24,
      enterprise: 40,
      default: 8,
    },
  };
}

// ============================================================================
// V2 ENRICHED ACCESSORS - Generation Templates, Phases, Brand Assets
// ============================================================================

// Database connection for v2 queries
let _db = null;

async function getDatabase() {
  if (_db) return _db;
  const SQL = await initSqlJs();
  const buffer = readFileSync(DB_PATH);
  _db = new SQL.Database(buffer);
  return _db;
}

/**
 * Get all generation templates (enriched prompt registry)
 * @returns {Promise<Object>} Templates keyed by template_key
 */
export async function getGenerationTemplates() {
  const db = await getDatabase();
  const stmt = db.prepare(`
    SELECT t.*, 
           GROUP_CONCAT(c.constraint_value, '|||') as constraints
    FROM generation_templates t
    LEFT JOIN generation_constraints c ON t.template_key = c.template_key
    GROUP BY t.id
  `);
  
  const templates = {};
  while (stmt.step()) {
    const row = stmt.getAsObject();
    templates[row.template_key] = {
      purposeSummary: row.purpose_summary,
      targetSchemaPath: row.target_schema_path,
      outputFormat: row.output_format,
      systemInstructions: row.system_instructions,
      userMessageTemplate: row.user_message_template,
      maxLength: row.max_character_length,
      minItems: row.min_array_elements,
      maxItems: row.max_array_elements,
      itemMaxLength: row.element_max_length,
      requiresApproval: row.requires_approval === 1,
      constraints: row.constraints ? row.constraints.split('|||') : [],
    };
  }

  stmt.free();
  return templates;
}

/**
 * Get a single generation template by key
 * @param {string} templateKey - The template identifier
 * @returns {Promise<Object|null>} Template or null if not found
 */
export async function getGenerationTemplate(templateKey) {
  const templates = await getGenerationTemplates();
  return templates[templateKey] || null;
}

/**
 * Get all forbidden expressions with rationale
 * @param {string} scope - 'global' or specific template_key
 * @returns {Promise<Array>} Array of forbidden expressions
 */
export async function getForbiddenExpressions(scope = 'global') {
  const db = await getDatabase();
  const stmt = db.prepare(`
    SELECT expression, rationale, severity
    FROM forbidden_expressions
    WHERE scope = ? OR scope = 'global'
    ORDER BY severity DESC
  `);
  stmt.bind([scope]);
  
  const expressions = [];
  while (stmt.step()) {
    expressions.push(stmt.getAsObject());
  }

  stmt.free();
  return expressions;
}

/**
 * Get quality gates for output validation
 * @returns {Promise<Array>} Array of quality gates
 */
export async function getQualityGates() {
  const db = await getDatabase();
  const stmt = db.prepare(`
    SELECT gate_key, gate_label, validation_rule, applies_to, is_blocking
    FROM quality_gates
    ORDER BY id
  `);
  
  const gates = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    gates.push({
      key: row.gate_key,
      label: row.gate_label,
      rule: row.validation_rule,
      appliesTo: row.applies_to,
      blocking: row.is_blocking === 1,
    });
  }

  stmt.free();
  return gates;
}

/**
 * Get generation principles (high-level guidance)
 * @returns {Promise<Array>} Array of principles
 */
export async function getGenerationPrinciples() {
  const db = await getDatabase();
  const stmt = db.prepare(`
    SELECT principle_key, principle_label, directive, priority_rank
    FROM generation_principles
    ORDER BY priority_rank
  `);
  
  const principles = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    principles.push({
      key: row.principle_key,
      label: row.principle_label,
      text: row.directive,
      priority: row.priority_rank,
    });
  }

  stmt.free();
  return principles;
}

/**
 * Get engagement phases with milestones and deliverables
 * @returns {Promise<Array>} Phases with nested milestones and deliverables
 */
export async function getEngagementPhases() {
  const db = await getDatabase();
  if (
    !tableExists(db, 'engagement_phases') ||
    !tableExists(db, 'phase_milestones') ||
    !tableExists(db, 'milestone_deliverables')
  ) {
    return [];
  }

  // Get phases
  const phaseStmt = db.prepare(`
    SELECT phase_number, phase_key, phase_label, default_state, 
           narrative_placeholder, scope_summary
    FROM engagement_phases
    ORDER BY phase_number
  `);
  
  const phases = [];
  while (phaseStmt.step()) {
    phases.push(phaseStmt.getAsObject());
  }

  phaseStmt.free();
  
  // Get milestones for each phase
  for (const phase of phases) {
    const mileStmt = db.prepare(`
      SELECT milestone_number, milestone_key, milestone_label, 
             narrative_placeholder, default_duration_days, budget_weight, scope_summary
      FROM phase_milestones
      WHERE phase_key = ?
      ORDER BY sequence_order
    `);
    mileStmt.bind([phase.phase_key]);
    
    phase.milestones = [];
    while (mileStmt.step()) {
      const milestone = mileStmt.getAsObject();
      
      // Get deliverables for this milestone
      const delStmt = db.prepare(`
        SELECT deliverable_key, deliverable_label, purpose_summary, acceptance_criteria
        FROM milestone_deliverables
        WHERE milestone_key = ?
        ORDER BY sequence_order
      `);
      delStmt.bind([milestone.milestone_key]);
      
      milestone.deliverables = [];
      while (delStmt.step()) {
        const del = delStmt.getAsObject();
        del.acceptance_criteria = del.acceptance_criteria 
          ? JSON.parse(del.acceptance_criteria) : [];
        milestone.deliverables.push(del);
      }

      delStmt.free();
      
      phase.milestones.push(milestone);
    }

    mileStmt.free();
  }
  
  return phases;
}

/**
 * Get brand assets configuration
 * @returns {Promise<Object>} Brand assets keyed by asset_key
 */
export async function getBrandAssets() {
  const db = await getDatabase();
  if (!tableExists(db, 'brand_assets')) {
    return defaultBrandAssets();
  }

  const stmt = db.prepare(`
    SELECT asset_key, asset_category, asset_value, context, fallback_value
    FROM brand_assets
  `);
  
  const assets = {};
  while (stmt.step()) {
    const row = stmt.getAsObject();
    if (!assets[row.asset_category]) {
      assets[row.asset_category] = {};
    }

    assets[row.asset_category][row.asset_key] = {
      value: row.asset_value,
      context: row.context,
      fallback: row.fallback_value,
    };
  }

  stmt.free();
  return assets;
}

/**
 * Get document type configurations
 * @returns {Promise<Object>} Document types keyed by type_key
 */
export async function getDocumentTypes() {
  const db = await getDatabase();
  if (!tableExists(db, 'document_types')) {
    return defaultDocumentTypes();
  }

  const stmt = db.prepare(`
    SELECT type_key, type_label, header_title, phase_association, template_file, css_variant
    FROM document_types
  `);
  
  const types = {};
  while (stmt.step()) {
    const row = stmt.getAsObject();
    types[row.type_key] = {
      label: row.type_label,
      headerTitle: row.header_title,
      phase: row.phase_association,
      template: row.template_file,
      cssVariant: row.css_variant,
    };
  }

  stmt.free();
  return types;
}

/**
 * Get execution parameters (model config, retry settings)
 * @returns {Promise<Object>} Execution parameters
 */
export async function getExecutionParams() {
  const db = await getDatabase();
  const stmt = db.prepare(`
    SELECT param_key, param_value, value_type
    FROM operational_params
    WHERE category = 'execution'
  `);
  
  const params = {};
  while (stmt.step()) {
    const row = stmt.getAsObject();
    let value = row.param_value;
    switch (row.value_type) {
      case 'integer': { value = Number.parseInt(value, 10); break;
      }

      case 'real': { value = Number.parseFloat(value); break;
      }

      case 'boolean': { value = value === 'true'; break;
      }

      case 'json': { value = JSON.parse(value); break;
      }
    }

    params[row.param_key] = value;
  }

  stmt.free();
  return params;
}

// ============================================================================
// LEGACY COMPATIBILITY - Maps enriched v2 to original JSON formats
// ============================================================================

/**
 * Get proposal_prompt_registry in legacy format
 * @returns {Promise<Object>} Legacy prompt registry format
 */
export async function getLegacyPromptRegistry() {
  const templates = await getGenerationTemplates();
  const principles = await getGenerationPrinciples();
  const forbidden = await getForbiddenExpressions('global');
  const gates = await getQualityGates();
  const params = await getExecutionParams();
  
  return {
    prompts: Object.fromEntries(
      Object.entries(templates).map(([key, t]) => [key, {
        description: t.purposeSummary,
        schema_path: t.targetSchemaPath,
        output_type: t.outputFormat,
        system_prompt: t.systemInstructions,
        user_prompt_template: t.userMessageTemplate,
        output_constraints: t.constraints,
        token_limit: t.tokenBudget,
        temperature: t.temperatureSetting,
      }])
    ),
    generation_principles: principles.map(p => p.text),
    forbidden_phrases: forbidden.map(f => f.expression),
    quality_gates: Object.fromEntries(
      gates.map(g => [g.key, { description: g.label, rule: g.rule }])
    ),
    model_config: {
      model: params.default_model || 'gemini-2.0-flash-exp',
      temperature: params.default_temperature || 0.7,
      max_retries: params.max_retries || 3,
    },
  };
}

/**
 * Get milestone_builder templates in legacy format
 * @returns {Promise<Object>} Legacy phase templates
 */
export async function getLegacyPhaseTemplates() {
  const phases = await getEngagementPhases();
  
  return {
    phases: phases.map(p => ({
      number: p.phase_number,
      id: p.phase_key,
      label: p.phase_label,
      state: p.default_state,
      description_placeholder: p.narrative_placeholder,
      milestones: p.milestones.map(m => ({
        id: m.milestone_key,
        label: m.milestone_label,
        type: m.milestone_type,
        weight: m.effort_weight,
        description: m.description_template,
        acceptance_criteria: m.acceptance_criteria,
        deliverables: m.deliverables.map(d => ({
          id: d.deliverable_key,
          label: d.deliverable_label,
          format: d.output_format,
          description: d.description,
        })),
      })),
    })),
  };
}

/**
 * Get shared_components config in legacy format
 * @returns {Promise<Object>} Legacy shared components
 */
export async function getLegacySharedComponents() {
  const assets = await getBrandAssets();
  const docTypes = await getDocumentTypes();
  
  return {
    DOC_TYPE_LABELS: Object.fromEntries(
      Object.entries(docTypes).map(([k, v]) => [k, v.label])
    ),
    LOGO_URL: assets.imagery?.primary_logo?.value || '',
    BRAND_COLORS: {
      primary: assets.colors?.primary?.value || '#4F46E5',
      secondary: assets.colors?.secondary?.value || '#10B981',
      accent: assets.colors?.accent?.value || '#F59E0B',
    },
    COMPANY_NAME: assets.identity?.company_name?.value || 'Wranngle Systems LLC',
    TAGLINE: assets.identity?.tagline?.value || '',
  };
}

// ============================================================================
// V3 ACCESSORS - Extraction Templates & Validation Schemas (settings.db)
// ============================================================================

const SETTINGS_DB_PATH = join(__dirname, 'settings.db');
let _settingsDb = null;

async function getSettingsDatabase() {
  if (_settingsDb) return _settingsDb;
  const SQL = await initSqlJs();
  const buffer = readFileSync(SETTINGS_DB_PATH);
  _settingsDb = new SQL.Database(buffer);
  return _settingsDb;
}

/**
 * Get extraction templates for LLM prompting
 * @param {string} templateKey - Optional specific template key
 * @returns {Promise<Object|Array>} Template(s)
 */
export async function getExtractionTemplates(templateKey = null) {
  const db = await getSettingsDatabase();
  
  let sql = `
    SELECT template_key, display_name, purpose_statement, llm_role_context,
           input_placeholder_spec, output_schema_json, processing_guidelines,
           quality_directives, version_number
    FROM extraction_templates
    WHERE is_active = 1
  `;
  
  if (templateKey) {
    sql += ` AND template_key = ?`;
  }
  
  const stmt = db.prepare(sql);
  if (templateKey) stmt.bind([templateKey]);
  
  const templates = {};
  while (stmt.step()) {
    const row = stmt.getAsObject();
    templates[row.template_key] = {
      displayName: row.display_name,
      purpose: row.purpose_statement,
      roleContext: row.llm_role_context,
      inputPlaceholders: JSON.parse(row.input_placeholder_spec || '{}'),
      outputSchema: JSON.parse(row.output_schema_json || '{}'),
      guidelines: row.processing_guidelines,
      qualityRules: row.quality_directives,
      version: row.version_number,
    };
  }

  stmt.free();
  
  return templateKey ? templates[templateKey] : templates;
}

/**
 * Get classification taxonomies
 * @param {string} taxonomyKey - Optional filter by taxonomy type
 * @returns {Promise<Object>} Taxonomies grouped by key
 */
export async function getClassificationTaxonomies(taxonomyKey = null) {
  const db = await getSettingsDatabase();
  
  let sql = `
    SELECT taxonomy_key, value_code, display_label, description, 
           threshold_criteria, sort_order
    FROM classification_taxonomies
    ORDER BY taxonomy_key, sort_order
  `;
  
  if (taxonomyKey) {
    sql = sql.replace('ORDER BY', `WHERE taxonomy_key = ? ORDER BY`);
  }
  
  const stmt = db.prepare(sql);
  if (taxonomyKey) stmt.bind([taxonomyKey]);
  
  const taxonomies = {};
  while (stmt.step()) {
    const row = stmt.getAsObject();
    if (!taxonomies[row.taxonomy_key]) {
      taxonomies[row.taxonomy_key] = [];
    }

    taxonomies[row.taxonomy_key].push({
      code: row.value_code,
      label: row.display_label,
      description: row.description,
      criteria: row.threshold_criteria,
    });
  }

  stmt.free();
  
  return taxonomyKey ? taxonomies[taxonomyKey] : taxonomies;
}

/**
 * Get risk indicators for extraction assessment
 * @param {string} category - Optional 'red_flag' or 'positive_signal'
 * @returns {Promise<Object>} Indicators grouped by category
 */
export async function getRiskIndicators(category = null) {
  const db = await getSettingsDatabase();
  
  let sql = `
    SELECT indicator_category, indicator_code, display_text, detection_pattern,
           severity_level, mitigation_guidance, applies_to_templates
    FROM risk_indicators
    ORDER BY severity_level DESC
  `;
  
  if (category) {
    sql = sql.replace('ORDER BY', `WHERE indicator_category = ? ORDER BY`);
  }
  
  const stmt = db.prepare(sql);
  if (category) stmt.bind([category]);
  
  const indicators = { red_flag: [], positive_signal: [] };
  while (stmt.step()) {
    const row = stmt.getAsObject();
    indicators[row.indicator_category].push({
      code: row.indicator_code,
      text: row.display_text,
      pattern: row.detection_pattern,
      severity: row.severity_level,
      mitigation: row.mitigation_guidance,
      templates: JSON.parse(row.applies_to_templates || '[]'),
    });
  }

  stmt.free();
  
  return category ? indicators[category] : indicators;
}

/**
 * Get validation schemas for data validation
 * @param {string} schemaKey - Optional specific schema key
 * @returns {Promise<Object>} Schema(s)
 */
export async function getValidationSchemas(schemaKey = null) {
  const db = await getSettingsDatabase();
  
  let sql = `
    SELECT schema_key, schema_title, json_schema_version, schema_definition,
           validation_mode, error_message_prefix
    FROM validation_schemas
    WHERE is_active = 1
  `;
  
  if (schemaKey) {
    sql += ` AND schema_key = ?`;
  }
  
  const stmt = db.prepare(sql);
  if (schemaKey) stmt.bind([schemaKey]);
  
  const schemas = {};
  while (stmt.step()) {
    const row = stmt.getAsObject();
    schemas[row.schema_key] = {
      title: row.schema_title,
      version: row.json_schema_version,
      schema: JSON.parse(row.schema_definition),
      mode: row.validation_mode,
      errorPrefix: row.error_message_prefix,
    };
  }

  stmt.free();
  
  return schemaKey ? schemas[schemaKey] : schemas;
}

/**
 * Get business validation rules
 * @param {string} schemaKey - Optional filter by target schema
 * @returns {Promise<Array>} Validation rules
 */
export async function getBusinessValidationRules(schemaKey = null) {
  const db = await getSettingsDatabase();
  
  let sql = `
    SELECT rule_key, rule_name, description, applies_to_schema,
           validation_logic, error_message_template, severity, sort_order
    FROM business_validation_rules
    WHERE is_active = 1
    ORDER BY sort_order
  `;
  
  if (schemaKey) {
    sql = sql.replace('WHERE is_active', `WHERE applies_to_schema = ? AND is_active`);
  }
  
  const stmt = db.prepare(sql);
  if (schemaKey) stmt.bind([schemaKey]);
  
  const rules = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    rules.push({
      key: row.rule_key,
      name: row.rule_name,
      description: row.description,
      schema: row.applies_to_schema,
      logic: row.validation_logic,
      errorTemplate: row.error_message_template,
      severity: row.severity,
    });
  }

  stmt.free();
  
  return rules;
}

/**
 * Get placeholder patterns for unresolved content detection
 * @param {boolean} blockingOnly - Only return blocking patterns
 * @returns {Promise<Array>} Placeholder patterns
 */
export async function getPlaceholderPatterns(blockingOnly = false) {
  const db = await getSettingsDatabase();
  
  let sql = `
    SELECT pattern_regex, pattern_description, is_blocking, example_match
    FROM placeholder_patterns
  `;
  
  if (blockingOnly) {
    sql += ` WHERE is_blocking = 1`;
  }
  
  const stmt = db.prepare(sql);
  
  const patterns = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    patterns.push({
      regex: row.pattern_regex,
      description: row.pattern_description,
      blocking: row.is_blocking === 1,
      example: row.example_match,
    });
  }

  stmt.free();
  
  return patterns;
}

/**
 * Build complete LLM prompt from extraction template
 * @param {string} templateKey - Template to use
 * @param {Object} variables - Values for placeholders
 * @returns {Promise<Object>} { system, user } prompts
 */
export async function buildExtractionPrompt(templateKey, variables = {}) {
  const template = await getExtractionTemplates(templateKey);
  if (!template) {
    throw new Error(`Extraction template not found: ${templateKey}`);
  }
  
  // Replace placeholders in user message
  let userPrompt = template.roleContext + '\n\n';
  
  // Add quality directives
  if (template.qualityRules) {
    userPrompt += '## Text Quality Standards\n' + template.qualityRules + '\n\n';
  }
  
  // Add input section with variables
  userPrompt += '## Input\n';
  for (const [key, value] of Object.entries(variables)) {
    userPrompt += `${key}: ${typeof value === 'object' ? JSON.stringify(value, null, 2) : value}\n`;
  }
  
  // Add output schema
  userPrompt += '\n## Expected Output Schema\n```json\n' + 
    JSON.stringify(template.outputSchema, null, 2) + '\n```\n';
  
  // Add processing guidelines
  if (template.guidelines) {
    userPrompt += '\n## Processing Guidelines\n' + template.guidelines + '\n';
  }
  
  userPrompt += '\nReturn ONLY the JSON object, no additional text.';
  
  return {
    system: template.roleContext,
    user: userPrompt,
    outputSchema: template.outputSchema,
  };
}

export default {
  // Core config
  ensureLoaded,
  getConfig,
  isLoaded,
  
  // Legacy v1 compatibility
  getLegacyBaseRates,
  getLegacyComplexityMultipliers,
  getLegacyDiscountRules,
  getLegacyAgencyContext,
  
  // v2 enriched accessors
  getGenerationTemplates,
  getGenerationTemplate,
  getForbiddenExpressions,
  getQualityGates,
  getGenerationPrinciples,
  getEngagementPhases,
  getBrandAssets,
  getDocumentTypes,
  getExecutionParams,
  
  // Legacy v2 compatibility
  getLegacyPromptRegistry,
  getLegacyPhaseTemplates,
  getLegacySharedComponents,
  
  // v3 extraction & validation accessors
  getExtractionTemplates,
  getClassificationTaxonomies,
  getRiskIndicators,
  getValidationSchemas,
  getBusinessValidationRules,
  getPlaceholderPatterns,
  buildExtractionPrompt,
};
