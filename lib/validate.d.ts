/**
 * Validate a report JSON against the schema
 * @param {Object} reportJson - The report to validate
 * @param {Object} options - Validation options
 * @returns {Object} { valid: boolean, errors: Array, warnings: Array, placeholders: Array }
 */
export function validateReport(reportJson: Record<string, unknown>, options?: Record<string, unknown>): Record<string, unknown>;
/**
 * Validate an intake packet
 */
export function validateIntake(intakeJson: any): {
  valid: any;
  errors: any;
  warnings: never[];
  placeholders: never[];
};
/**
 * Validate measurements extraction
 */
export function validateMeasurements(measurementsJson: any): {
  valid: any;
  errors: any;
  warnings: never[];
  placeholders: never[];
};
/**
 * Format validation errors for display
 */
export function formatErrors(validationResult: any): string;
/**
 * Format Ajv validation errors for display
 * @param {object[]} errors - Ajv validation errors
 * @returns {string} Formatted error message
 */
export function formatValidationErrors(errors: Array<Record<string, unknown>>): string;
/**
 * Validate research data
 * @param {object} data - Research data
 * @returns {{valid: boolean, errors: object[]|null}}
 */
export function validateResearch(data: Record<string, unknown>): {
  valid: boolean;
  errors: Array<Record<string, unknown>> | undefined;
};
/**
 * Validate project plan data
 * @param {object} data - Project plan data
 * @returns {{valid: boolean, errors: object[]|null}}
 */
export function validateProjectPlan(data: Record<string, unknown>): {
  valid: boolean;
  errors: Array<Record<string, unknown>> | undefined;
};
declare namespace _default {
  export { validateReport };
  export { validateIntake };
  export { validateMeasurements };
  export { validateResearch };
  export { validateProjectPlan };
  export { formatErrors };
  export { formatValidationErrors };
}
export default _default;
// # sourceMappingURL=validate.d.ts.map