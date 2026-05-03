/**
 * Questionnaire Transform - Bidirectional mapping between form data and IntakeSchema
 * @module lib/questionnaire_transform
 *
 * Provides:
 * - mapFormToIntake: Convert form responses to IntakeSchema
 * - mapIntakeToForm: Convert IntakeSchema to form data (for editing)
 * - validateFormData: Validate form responses against question rules
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// -----------------------------------------------------------------------------
// Configuration Loading
// -----------------------------------------------------------------------------

/**
 * Load the question database from config
 * @returns {Object} Question database with sections and questions
 */
export function loadQuestionDatabase() {
  const configPath = join(__dirname, '..', 'config', 'intake_questions.json');
  const content = readFileSync(configPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Load the systems catalog from config
 * @returns {Object} Systems catalog with system entries
 */
export function loadSystemsCatalog() {
  const configPath = join(__dirname, '..', 'config', 'systems_catalog.json');
  const content = readFileSync(configPath, 'utf-8');
  return JSON.parse(content);
}

// -----------------------------------------------------------------------------
// Type Coercion Utilities
// -----------------------------------------------------------------------------

/**
 * Coerce a string value to the appropriate type based on field_type
 * @param {unknown} value - The value to coerce
 * @param {string} fieldType - The field type from the question
 * @returns {unknown} The coerced value
 */
function coerceValue(value, fieldType) {
  if (value === null || value === undefined || value === '') {
    return value;
  }

  switch (fieldType) {
    case 'number':
    case 'range':
      // Handle numeric strings
      if (typeof value === 'string') {
        const num = parseFloat(value.replace(/[^0-9.-]/g, ''));
        return isNaN(num) ? value : num;
      }
      return value;

    case 'currency':
      // Handle currency strings like "$1,000" or "1000"
      if (typeof value === 'string') {
        const num = parseFloat(value.replace(/[$,]/g, ''));
        return isNaN(num) ? value : num;
      }
      return value;

    case 'multiselect':
      // Ensure multiselect is always an array
      if (typeof value === 'string') {
        // Handle comma-separated or JSON array strings
        if (value.startsWith('[')) {
          try {
            return JSON.parse(value);
          } catch {
            return [value];
          }
        }
        return value.split(',').map((s) => s.trim()).filter(Boolean);
      }
      return Array.isArray(value) ? value : [value];

    case 'date':
      // Keep dates as ISO strings
      if (value instanceof Date) {
        return value.toISOString().split('T')[0];
      }
      return value;

    default:
      return value;
  }
}

/**
 * Set a nested property value using dot notation path
 * @param {Object} obj - Target object
 * @param {string} path - Dot notation path (e.g., "prepared_for.account_name")
 * @param {unknown} value - Value to set
 */
function setNestedValue(obj, path, value) {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current)) {
      current[part] = {};
    }
    current = current[part];
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * Get a nested property value using dot notation path
 * @param {Object} obj - Source object
 * @param {string} path - Dot notation path
 * @returns {unknown} The value at the path, or undefined
 */
function getNestedValue(obj, path) {
  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

/**
 * Validate a single field value against validation rules
 * @param {unknown} value - The value to validate
 * @param {Object} question - The question definition
 * @param {Record<string, unknown>} formData - Full form data for conditional checks
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateField(value, question, formData) {
  const errors = [];

  // Check if field is conditionally hidden
  if (question.conditional && !evaluateCondition(question.conditional, formData)) {
    // Hidden fields are always valid
    return { valid: true, errors: [] };
  }

  // Required check
  if (question.required) {
    const isEmpty =
      value === null ||
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && value.length === 0);

    if (isEmpty) {
      errors.push(
        question.validation?.find((v) => v.type === 'required')?.message ||
          'This field is required'
      );
    }
  }

  // Skip other validations if empty and not required
  if (value === null || value === undefined || value === '') {
    return { valid: errors.length === 0, errors };
  }

  // Apply validation rules
  for (const rule of question.validation || []) {
    switch (rule.type) {
      case 'min':
        if (typeof value === 'number' && value < rule.value) {
          errors.push(rule.message || `Minimum value is ${rule.value}`);
        }
        break;

      case 'max':
        if (typeof value === 'number' && value > rule.value) {
          errors.push(rule.message || `Maximum value is ${rule.value}`);
        }
        break;

      case 'minLength':
        if (typeof value === 'string' && value.length < rule.value) {
          errors.push(rule.message || `Minimum length is ${rule.value}`);
        }
        break;

      case 'maxLength':
        if (typeof value === 'string' && value.length > rule.value) {
          errors.push(rule.message || `Maximum length is ${rule.value}`);
        }
        break;

      case 'pattern':
        if (typeof value === 'string' && !new RegExp(rule.value).test(value)) {
          errors.push(rule.message || 'Invalid format');
        }
        break;

      case 'oneOf':
        if (Array.isArray(rule.value) && !rule.value.includes(value)) {
          errors.push(rule.message || `Must be one of: ${rule.value.join(', ')}`);
        }
        break;
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Evaluate a conditional rule against form data
 * @param {Object} condition - Conditional rule
 * @param {Record<string, unknown>} formData - Form data
 * @returns {boolean} Whether the condition is satisfied
 */
export function evaluateCondition(condition, formData) {
  const { show_when } = condition;

  // AND condition
  if ('and' in show_when) {
    return show_when.and.every((c) => evaluateCondition(c, formData));
  }

  // OR condition
  if ('or' in show_when) {
    return show_when.or.some((c) => evaluateCondition(c, formData));
  }

  // Simple condition
  const { field, operator, value } = show_when;
  const fieldValue = formData[field];

  switch (operator) {
    case '==':
      return fieldValue === value;
    case '!=':
      return fieldValue !== value;
    case '>':
      return typeof fieldValue === 'number' && fieldValue > value;
    case '<':
      return typeof fieldValue === 'number' && fieldValue < value;
    case '>=':
      return typeof fieldValue === 'number' && fieldValue >= value;
    case '<=':
      return typeof fieldValue === 'number' && fieldValue <= value;
    case 'in':
      return Array.isArray(value) && value.includes(fieldValue);
    case 'not_in':
      return Array.isArray(value) && !value.includes(fieldValue);
    case 'not_empty':
      return fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
    case 'empty':
      return fieldValue === null || fieldValue === undefined || fieldValue === '';
    default:
      return true;
  }
}

// -----------------------------------------------------------------------------
// Main Transform Functions
// -----------------------------------------------------------------------------

/**
 * Validate form data against the question database
 * @param {Record<string, unknown>} formData - Form responses keyed by question ID
 * @param {Object[]} questions - Array of question definitions
 * @returns {{ valid: boolean, errors: Record<string, string[]>, warnings: string[] }}
 */
export function validateFormData(formData, questions) {
  const errors = {};
  const warnings = [];

  for (const question of questions) {
    const value = formData[question.id];
    const result = validateField(value, question, formData);

    if (!result.valid) {
      errors[question.id] = result.errors;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    warnings,
  };
}

/**
 * Map form responses to IntakeSchema structure
 * @param {Record<string, unknown>} formData - Form responses keyed by question ID
 * @param {Object[]} questions - Array of question definitions
 * @returns {Object} IntakeSchema-compatible object
 */
export function mapFormToIntake(formData, questions) {
  // Initialize intake structure
  const intake = {
    intake_version: '1.0.0',
    captured_at: new Date().toISOString(),
    captured_by: 'questionnaire',
    prepared_for: {
      account_name: '',
    },
    section_a_workflow_definition: {
      q01_workflow_name: '',
    },
    section_b_volume_timing: {},
    section_c_systems_handoffs: {
      q10_systems_involved: [],
    },
    section_d_failure_cost: {},
    section_e_priority: {},
  };

  // Map each question to its schema path
  for (const question of questions) {
    const value = formData[question.id];

    // Skip empty values
    if (value === null || value === undefined || value === '') {
      continue;
    }

    // Skip conditionally hidden fields
    if (question.conditional && !evaluateCondition(question.conditional, formData)) {
      continue;
    }

    // Coerce value to appropriate type
    const coercedValue = coerceValue(value, question.field_type);

    // Map to schema path if defined
    if (question.schema_path) {
      setNestedValue(intake, question.schema_path, coercedValue);
    }
  }

  return intake;
}

/**
 * Map IntakeSchema back to form data (for editing existing intakes)
 * @param {Object} intake - IntakeSchema object
 * @param {Object[]} questions - Array of question definitions
 * @returns {Record<string, unknown>} Form data keyed by question ID
 */
export function mapIntakeToForm(intake, questions) {
  const formData = {};

  for (const question of questions) {
    if (question.schema_path) {
      const value = getNestedValue(intake, question.schema_path);
      if (value !== undefined) {
        formData[question.id] = value;
      }
    }
  }

  return formData;
}

/**
 * Get visible questions based on current form data
 * @param {Record<string, unknown>} formData - Current form responses
 * @param {Object[]} questions - Array of question definitions
 * @returns {Object[]} Filtered array of visible questions
 */
export function getVisibleQuestions(formData, questions) {
  return questions.filter((question) => {
    if (!question.conditional) {
      return true;
    }
    return evaluateCondition(question.conditional, formData);
  });
}

/**
 * Get questions grouped by section
 * @param {Object[]} questions - Array of question definitions
 * @param {Object[]} sectionMetadata - Array of section metadata
 * @returns {Map<string, Object[]>} Map of section ID to questions
 */
export function getQuestionsBySection(questions, sectionMetadata) {
  const grouped = new Map();

  // Initialize sections in order
  for (const section of sectionMetadata.sort((a, b) => a.order - b.order)) {
    grouped.set(section.id, []);
  }

  // Group questions
  for (const question of questions.sort((a, b) => a.order - b.order)) {
    const sectionQuestions = grouped.get(question.section) || [];
    sectionQuestions.push(question);
    grouped.set(question.section, sectionQuestions);
  }

  return grouped;
}

/**
 * Get default values for all questions
 * @param {Object[]} questions - Array of question definitions
 * @returns {Record<string, unknown>} Default form values
 */
export function getDefaultValues(questions) {
  const defaults = {};

  for (const question of questions) {
    // Check for default option in select/multiselect
    if (question.options) {
      const defaultOption = question.options.find((opt) => opt.is_default);
      if (defaultOption) {
        defaults[question.id] = question.field_type === 'multiselect'
          ? [defaultOption.value]
          : defaultOption.value;
        continue;
      }
    }

    // Default for multiselect is empty array
    if (question.field_type === 'multiselect') {
      defaults[question.id] = [];
      continue;
    }

    // Default for range is min value
    if (question.field_type === 'range' && question.min !== undefined) {
      defaults[question.id] = question.min;
    }
  }

  return defaults;
}

/**
 * Merge systems catalog into question options
 * @param {Object[]} questions - Array of question definitions
 * @param {Object} systemsCatalog - Systems catalog
 * @returns {Object[]} Questions with populated options
 */
export function populateSystemOptions(questions, systemsCatalog) {
  return questions.map((question) => {
    if (question.options_from !== 'systems_catalog') {
      return question;
    }

    // Build options from systems catalog grouped by category
    const options = [];
    const categories = new Map();

    for (const system of systemsCatalog.systems) {
      if (!categories.has(system.category)) {
        categories.set(system.category, []);
      }
      categories.get(system.category).push({
        value: system.id,
        label: system.name,
        description: system.has_native_node
          ? `Native n8n node available`
          : system.has_api
          ? 'API integration available'
          : 'Manual/custom integration',
      });
    }

    // Sort categories and flatten
    const categoryOrder = ['healthcare', 'crm', 'communication', 'payment', 'erp', 'productivity', 'marketing', 'other'];
    for (const cat of categoryOrder) {
      if (categories.has(cat)) {
        options.push(...categories.get(cat));
      }
    }

    return {
      ...question,
      options,
    };
  });
}

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------

export default {
  loadQuestionDatabase,
  loadSystemsCatalog,
  validateFormData,
  mapFormToIntake,
  mapIntakeToForm,
  evaluateCondition,
  getVisibleQuestions,
  getQuestionsBySection,
  getDefaultValues,
  populateSystemOptions,
};
