// @ts-nocheck — migrated from .js (was checkJs:false); incremental tightening tracked separately.

/**
 * validate.js - JSON Schema validation layer using AJV
 * 
 * Refactored to load schemas from SQLite database via config module.
 * Validates report JSON against schemas stored in settings.db.
 * 
 * Usage:
 *   import { initValidation, validateReport, validateIntake } from './lib/validate.js';
 *   await initValidation();
 *   const result = validateReport(reportJson);
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import addFormats from 'ajv-formats';
import Ajv2020 from 'ajv/dist/2020.js';
import { 
  getValidationSchemas, 
  getBusinessValidationRules,
  getPlaceholderPatterns 
} from '../config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize AJV with draft-2020-12 support
const ajv = new Ajv2020({
  allErrors: true,
  verbose: true,
  strict: false,
  allowUnionTypes: true
});

addFormats(ajv);

// Schema cache
let _schemaCache = null;
let _ruleDefinitions = null;
let _placeholderMatchers = null;
let _isInitialized = false;

// Report schema from big_json_schema.json (loaded lazily)
let _primaryReportSchema = null;

/**
 * Initialize validation module - loads schemas from SQLite
 */
export async function initValidation() {
  if (_isInitialized) return;
  
  try {
    _schemaCache = await getValidationSchemas();
    _ruleDefinitions = await getBusinessValidationRules();
    _placeholderMatchers = await getPlaceholderPatterns();
    _isInitialized = true;
  } catch {
    console.warn('Validation init warning: Could not load schemas from SQLite, using fallbacks');
    _schemaCache = {};
    _ruleDefinitions = [];
    _placeholderMatchers = [];
    _isInitialized = true;
  }
}

/**
 * Get schema by key (from SQLite or fallback)
 */
function getSchema(schemaKey) {
  if (_schemaCache && _schemaCache[schemaKey]) {
    return _schemaCache[schemaKey].schema;
  }

  return null;
}

/**
 * Load the report schema from file (lazy loading)
 */
function getReportSchema() {
  if (!_primaryReportSchema) {
    const schemaPath = path.join(__dirname, '..', 'big_json_schema.json');
    if (fs.existsSync(schemaPath)) {
      _primaryReportSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    }
  }

  return _primaryReportSchema;
}

/**
 * Execute business validation rules from SQLite
 */
function executeBusinessRules(inputData, schemaKey) {
  const validationErrors = [];
  const applicableRules = _ruleDefinitions?.filter(rule => rule.schema === schemaKey) || [];
  
  for (const ruleDefinition of applicableRules) {
    try {
      const ruleOutcome = executeRule(ruleDefinition, inputData);
      if (!ruleOutcome.isValid) {
        validationErrors.push({
          rule: ruleDefinition.key,
          message: interpolateTemplate(ruleDefinition.errorTemplate, ruleOutcome.context),
          severity: ruleDefinition.severity,
          path: ruleOutcome.jsonPath || ''
        });
      }
    } catch {
      // Rule execution error - skip silently
    }
  }
  
  return validationErrors;
}

/**
 * Execute a single validation rule
 */
function executeRule(ruleDefinition, inputData) {
  switch (ruleDefinition.key) {
    case 'bleed_sum_verification': {
      if (inputData.bleed?.breakdown && inputData.bleed?.total) {
        const calculatedTotal = inputData.bleed.breakdown.reduce(
          (sum, item) => sum + (item.amount?.amount || 0), 0
        );
        const totalsMatch = Math.abs(calculatedTotal - inputData.bleed.total.amount) <= 0.01;
        return { 
          isValid: totalsMatch, 
          context: { breakdownSum: calculatedTotal, reportedTotal: inputData.bleed.total.amount },
          jsonPath: 'bleed.total.amount'
        };
      }

      return { isValid: true };
    }
      
    case 'critical_measurement_coverage': {
      const criticalScorecardRows = inputData.scorecard?.rows?.filter(row => row.status === 'critical') || [];
      const criticalMeasurementIds = criticalScorecardRows.flatMap(row => row.measurement_ids || []);
      const addressedMeasurementIds = inputData.fixes?.items?.flatMap(fix => fix.related_measurement_ids || []) || [];
      const unaddressedMeasurements = criticalMeasurementIds.filter(id => !addressedMeasurementIds.includes(id));
      return { 
        isValid: unaddressedMeasurements.length === 0,
        context: { measurementId: unaddressedMeasurements[0] },
        jsonPath: 'fixes.items'
      };
    }
      
    case 'quick_win_specification': {
      const hasFixes = inputData.fixes?.items?.length > 0;
      const hasQuickWinDesignated = Boolean(inputData.fixes?.quick_win_fix_id);
      return { 
        isValid: !hasFixes || hasQuickWinDesignated,
        context: {},
        jsonPath: 'fixes.quick_win_fix_id'
      };
    }
      
    case 'placeholder_resolution': {
      const unresolvedPlaceholders = findUnresolvedPlaceholders(inputData);
      return { 
        isValid: unresolvedPlaceholders.length === 0,
        context: { path: unresolvedPlaceholders[0]?.jsonPath },
        jsonPath: unresolvedPlaceholders[0]?.jsonPath || ''
      };
    }
      
    case 'measurement_evidence_present': {
      if (inputData.measurements) {
        for (let index = 0; index < inputData.measurements.length; index++) {
          const measurement = inputData.measurements[index];
          if (!measurement.evidence || measurement.evidence.length === 0) {
            return {
              isValid: false,
              context: { measurementName: measurement.name },
              jsonPath: `measurements[${index}].evidence`
            };
          }
        }
      }

      return { isValid: true };
    }
      
    case 'measurement_threshold_defined': {
      if (inputData.measurements) {
        for (let index = 0; index < inputData.measurements.length; index++) {
          const measurement = inputData.measurements[index];
          if (!measurement.threshold) {
            return {
              isValid: false,
              context: { measurementName: measurement.name },
              jsonPath: `measurements[${index}].threshold`
            };
          }
        }
      }

      return { isValid: true };
    }
      
    case 'company_name_required': {
      const hasCompanyName = inputData.prospect?.company_name || inputData.prospect?.companyName;
      return { 
        isValid: Boolean(hasCompanyName),
        context: {},
        jsonPath: '/prospect/company_name'
      };
    }
      
    case 'project_identity_required': {
      const hasProjectIdentity = inputData.project_identity || inputData.projectIdentity;
      return { 
        isValid: Boolean(hasProjectIdentity),
        context: {},
        jsonPath: '/project_identity'
      };
    }
      
    case 'scope_or_phases_required': {
      const hasScopeDefinition = inputData.scope || inputData.phases;
      return { 
        isValid: Boolean(hasScopeDefinition),
        context: {},
        jsonPath: '/scope'
      };
    }
      
    default: {
      return { isValid: true };
    }
  }
}

/**
 * Interpolate error message template with context values
 */
function interpolateTemplate(template, context) {
  let interpolatedMessage = template;
  for (const [key, value] of Object.entries(context || {})) {
    interpolatedMessage = interpolatedMessage.replaceAll(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
  }

  return interpolatedMessage;
}

/**
 * Check for LLM placeholders in the data
 */
function findUnresolvedPlaceholders(inputData) {
  const foundPlaceholders = [];
  const activePatterns = _placeholderMatchers?.filter(pattern => pattern.blocking) || [
    { regex: String.raw`\[LLM_PLACEHOLDER[^\]]*\]` }
  ];
  
  function searchNode(node, jsonPath = '') {
    if (typeof node === 'string') {
      for (const pattern of activePatterns) {
        if (new RegExp(pattern.regex).test(node)) {
          foundPlaceholders.push({ jsonPath, value: node, pattern: pattern.regex });
          break;
        }
      }
    } else if (Array.isArray(node)) {
      for (const [index, item] of node.entries()) searchNode(item, `${jsonPath}[${index}]`);
    } else if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        searchNode(value, jsonPath ? `${jsonPath}.${key}` : key);
      }
    }
  }
  
  searchNode(inputData);
  return foundPlaceholders;
}

/**
 * Validate a report JSON against the schema
 */
export function validateReport(reportJson, options = {}) {
  const { allowPlaceholders = false, strictBusinessRules = true } = options;
  
  const reportSchema = getReportSchema();
  if (!reportSchema) {
    return { valid: false, errors: [{ type: 'config', message: 'Report schema not found' }], warnings: [], placeholders: [] };
  }
  
  const schemaValidator = ajv.compile(reportSchema);
  const schemaIsValid = schemaValidator(reportJson);
  
  const validationResult = {
    valid: schemaIsValid,
    errors: [],
    warnings: [],
    placeholders: []
  };
  
  if (!schemaIsValid && schemaValidator.errors) {
    validationResult.errors = schemaValidator.errors.map(error => ({
      type: 'schema',
      path: error.instancePath,
      message: error.message,
      params: error.params
    }));
  }
  
  // Check for unresolved placeholders
  validationResult.placeholders = findUnresolvedPlaceholders(reportJson);
  if (!allowPlaceholders && validationResult.placeholders.length > 0) {
    validationResult.valid = false;
    for (const placeholder of validationResult.placeholders) {
      validationResult.errors.push({
        type: 'placeholder',
        path: placeholder.jsonPath,
        message: `Unresolved LLM placeholder: ${placeholder.value}`
      });
    }
  }
  
  // Business rules validation
  if (strictBusinessRules && _isInitialized) {
    const businessRuleErrors = executeBusinessRules(reportJson, 'report');
    for (const ruleError of businessRuleErrors) {
      if (ruleError.severity === 'warning') {
        validationResult.warnings.push(ruleError);
      } else {
        validationResult.errors.push({ type: 'business_rule', ...ruleError });
        validationResult.valid = false;
      }
    }
  }
  
  return validationResult;
}

/**
 * Validate an intake packet
 */
export function validateIntake(intakeJson) {
  const intakeSchema = getSchema('intake_packet');
  if (!intakeSchema) {
    return { valid: false, errors: [{ type: 'config', message: 'Intake schema not loaded' }], warnings: [], placeholders: [] };
  }
  
  const schemaValidator = ajv.compile(intakeSchema);
  const isValid = schemaValidator(intakeJson);
  
  return {
    valid: isValid,
    errors: isValid ? [] : schemaValidator.errors.map(error => ({
      type: 'schema',
      path: error.instancePath,
      message: error.message,
      params: error.params
    })),
    warnings: [],
    placeholders: []
  };
}

/**
 * Validate measurements extraction
 */
export function validateMeasurements(measurementsJson) {
  const measurementsSchema = getSchema('measurements_extraction');
  if (!measurementsSchema) {
    return { valid: false, errors: [{ type: 'config', message: 'Measurements schema not loaded' }], warnings: [], placeholders: [] };
  }
  
  const schemaValidator = ajv.compile(measurementsSchema);
  const isValid = schemaValidator(measurementsJson);
  
  const validationResult = {
    valid: isValid,
    errors: isValid ? [] : schemaValidator.errors.map(error => ({
      type: 'schema',
      path: error.instancePath,
      message: error.message,
      params: error.params
    })),
    warnings: [],
    placeholders: []
  };
  
  // Additional checks from business rules
  if (_isInitialized) {
    const businessRuleErrors = executeBusinessRules(measurementsJson, 'measurements_extraction');
    for (const ruleError of businessRuleErrors) {
      if (ruleError.severity === 'warning') {
        validationResult.warnings.push(ruleError);
      } else {
        validationResult.errors.push({ type: 'business_rule', ...ruleError });
        validationResult.valid = false;
      }
    }
  }
  
  return validationResult;
}

/**
 * Validate a project plan JSON structure
 *
 * @param {Object} plan - Project plan object
 * @returns {Object} Validation result with valid, errors, warnings
 */
export function validateProjectPlan(plan) {
  const errors = [];
  const warnings = [];

  // Required fields check
  if (!plan.project_identity) {
    errors.push({ type: 'required', path: 'project_identity', message: 'Project identity is required' });
  }

  if (!plan.phases || plan.phases.length === 0) {
    errors.push({ type: 'required', path: 'phases', message: 'At least one phase is required' });
  }

  if (!plan.pricing) {
    errors.push({ type: 'required', path: 'pricing', message: 'Pricing information is required' });
  }

  // Validate phases structure
  if (plan.phases && Array.isArray(plan.phases)) {
    for (const [index, phase] of plan.phases.entries()) {
      if (!phase.name) {
        errors.push({ type: 'required', path: `phases[${index}].name`, message: `Phase ${index + 1} name is required` });
      }

      if (!phase.duration_weeks && !phase.duration) {
        warnings.push({ type: 'missing', path: `phases[${index}].duration_weeks`, message: `Phase ${index + 1} has no duration specified` });
      }
    }
  }

  // Validate pricing structure
  if (plan.pricing && !plan.pricing.total && !plan.pricing.total_amount) {
    warnings.push({ type: 'missing', path: 'pricing.total', message: 'Total pricing amount not specified' });
  }

  // Check for placeholders
  const placeholders = findUnresolvedPlaceholders(plan);
  if (placeholders.length > 0) {
    for (const p of placeholders) {
      warnings.push({ type: 'placeholder', path: p.jsonPath, message: `Unresolved placeholder: ${p.value}` });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    placeholders
  };
}

/**
 * Format validation errors for display (alias for formatErrors)
 */
export function formatValidationErrors(validationResult) {
  return formatErrors(validationResult);
}

/**
 * Format validation errors for display
 */
export function formatErrors(validationResult) {
  const outputLines = [];
  
  if (validationResult.errors?.length > 0) {
    outputLines.push('ERRORS:');
    for (const [index, error] of validationResult.errors.entries()) {
      outputLines.push(`  ${index + 1}. [${error.type || error.rule}] ${error.path}: ${error.message}`);
    }
  }
  
  if (validationResult.warnings?.length > 0) {
    outputLines.push('WARNINGS:');
    for (const [index, warning] of validationResult.warnings.entries()) {
      outputLines.push(`  ${index + 1}. [${warning.type || warning.rule}] ${warning.path}: ${warning.message}`);
    }
  }
  
  if (validationResult.placeholders?.length > 0) {
    outputLines.push(`PLACEHOLDERS: ${validationResult.placeholders.length} unresolved`);
    for (const placeholder of validationResult.placeholders) {
      outputLines.push(`  - ${placeholder.jsonPath}`);
    }
  }
  
  return outputLines.join('\n');
}

/**
 * Check if validation module is initialized
 */
export function isValidationReady() {
  return _isInitialized;
}

export default {
  initValidation,
  isValidationReady,
  validateReport,
  validateIntake,
  validateMeasurements,
  validateProjectPlan,
  formatErrors,
  formatValidationErrors
};
