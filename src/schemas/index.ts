/**
 * Schemas Index
 * 
 * Re-exports all Zod schemas for the presales pipeline.
 * 
 * @module src/schemas
 */

// =============================================================================
// MONETARY & DURATION
// =============================================================================

// =============================================================================
// CONVENIENCE RE-EXPORTS
// =============================================================================



export {
  // Schemas
  PeriodSchema,
  MonetaryValueSchema,
  DurationValueSchema,
  DurationUnitSchema,
  DecimalRatioSchema,
  IntegerPercentSchema,
  PercentageValueSchema,
  
  // Types
  type Period,
  type MonetaryValue,
  type DurationValue,
  type DurationUnit,
  type DecimalRatio,
  type IntegerPercent,
  type PercentageValue,
  
  // Factory functions
  createMonetary,
  createDuration,
  safeParseMonetary,
  
  // Conversion utilities
  toMonthlyAmount,
  toAnnualAmount,
  convertDuration
} from './monetary.js';

// =============================================================================
// ESTIMATE & BLEED
// =============================================================================

export {
  // Schemas
  BleedInputsSchema,
  BleedBreakdownItemSchema,
  BleedCalculationSchema,
  TierKeySchema,
  TierAssessmentSchema,
  SavingsBreakdownSchema,
  ValueBreakdownSchema,
  ROICalculationSchema,
  FinOpsValidationSchema,
  FinOpsSchema,
  EstimateSchema,
  
  // Types
  type BleedInputs,
  type BleedBreakdownItem,
  type BleedCalculation,
  type TierKey,
  type TierAssessment,
  type SavingsBreakdown,
  type ValueBreakdown,
  type ROICalculation,
  type FinOpsValidation,
  type FinOps,
  type Estimate,
  
  // Validation helpers
  validateBleedInputs,
  validateEstimate
} from './estimate.js';

// =============================================================================
// IDENTITY
// =============================================================================

export {
  // Schemas
  ProjectIdentitySchema,
  DocumentTypeSchema,
  PreparedForSchema,
  
  // Types
  type ProjectIdentity,
  type DocumentType,
  type PreparedFor,
  
  // Helpers
  slugifyClient,
  slugifyProject,
  generateDocumentSlug,
  validateProjectIdentity,
  safeParseIdentity
} from './identity.js';

// =============================================================================
// INTAKE
// =============================================================================

export {
  // Section schemas
  SectionAOverviewSchema,
  SectionBWorkflowSchema,
  SectionCSystemsSchema,
  SectionDMetricsSchema,
  SectionEGoalsSchema,
  WorkflowStepSchema,
  SystemInvolvedSchema,
  MetricSchema,
  SuccessCriterionSchema,
  IntakeSchema,
  
  // Types
  type Intake,
  
  // Helpers
  validateIntake,
  extractMetrics
} from './intake.js';


export {z} from 'zod';