/**
 * Schema Registry - Centralized Zod schema exports
 * @module lib/schemas
 *
 * This module provides the single source of truth for all data contracts
 * in the unified presales pipeline. Every module boundary should validate
 * data using these schemas.
 *
 * ADR-001: Zod Schema Contracts
 * - 9 primary schemas defined for module boundaries
 * - All types derived via z.infer<> for single source of truth
 * - Runtime validation prevents data corruption
 */

// =============================================================================
// Common Types (shared across all schemas)
// =============================================================================

// =============================================================================
// Schema Registry Object (ADR-001)
// =============================================================================

import { type z } from 'zod';
import { IntakeSchema } from './intake.schema.js';
import { MeasurementsDataSchema, BleedTotalSchema } from './measurements.schema.js';
import { ResearchResultSchema, TierAssessmentSchema } from './research.schema.js';
import { EstimateOutputSchema, MilestoneSchema, FinOpsSchema } from './estimate.schema.js';
import { TransformContextSchema } from './transform.schema.js';
import { ConfigSchema } from './config.schema.js';
import { SalesStrategySchema } from './sales_strategy.schema.js';
import { QuestionDatabaseSchema, LeadQualificationResultSchema, SystemsCatalogSchema } from './questionnaire.schema.js';
import { CaseStudySchema } from './case_study.schema.js';
import { EvaluationRunSchema, FlawPatternSchema, ScoringConfigSchema } from './evaluation.schema.js';
import { BusinessProfileSchema } from './business_profile.schema.js';
import { PersonProfileSchema } from './person_profile.schema.js';

// =============================================================================
// Validation Utilities
// =============================================================================


export {
  // NumericWithDisplay pattern
  NumericWithDisplaySchema,
  CurrencySchema,
  PercentageSchema,
  type NumericWithDisplay,
  type Currency,
  type Percentage,

  // Units
  PeriodUnitSchema,
  TimeUnitSchema,
  type PeriodUnit,
  type TimeUnit,

  // Status
  StatusSchema,
  MetricTypeSchema,
  type Status,
  type MetricType,

  // Tiers
  ComplexityTierSchema,
  PricingTierSchema,
  type ComplexityTier,
  type PricingTier,

  // Evidence
  EvidenceSchema,
  CitationSchema,
  type Evidence,
  type Citation,

  // Helpers
  validateDisplaySync,
} from './common.schema.js';

// =============================================================================
// 1. Intake Schema (After extraction)
// =============================================================================

export {
  IntakeSchema,
  PartialIntakeSchema,
  IntakeExtractionResultSchema,
  PreparedForSchema,
  SectionASchema,
  SectionBSchema,
  SectionCSchema,
  SectionDSchema,
  SectionESchema,
  AttachmentsSchema,
  type Intake,
  type PartialIntake,
  type IntakeExtractionResult,
  type PreparedFor,
  type SectionA,
  type SectionB,
  type SectionC,
  type SectionD,
  type SectionE,
  type Attachments,
} from './intake.schema.js';

// =============================================================================
// 2. Measurements Schema (Bleed calculations)
// =============================================================================

export {
  MeasurementsDataSchema,
  MeasurementSchema,
  BleedAssumptionSchema,
  BleedCalculationSchema,
  BleedTotalSchema,
  BleedInputsSchema,
  BleedValidationResultSchema,
  ThresholdSchema,
  type MeasurementsData,
  type Measurement,
  type BleedAssumption,
  type BleedCalculation,
  type BleedTotal,
  type BleedInputs,
  type BleedValidationResult,
  type Threshold,
} from './measurements.schema.js';

// =============================================================================
// 3. Research Schema (After research lookup)
// =============================================================================

export {
  ResearchResultSchema,
  IntegrationResearchItemSchema,
  IntegrationSummarySchema,
  IntegrationDetailSchema,
  ComplexitySchema,
  LaborFactorSchema,
  RiskItemSchema,
  EffortRecommendationSchema,
  FreshnessSchema,
  TierAssessmentSchema,
  ResearchGapReportSchema,
  type ResearchResult,
  type IntegrationResearchItem,
  type IntegrationSummary,
  type IntegrationDetail,
  type Complexity,
  type LaborFactor,
  type RiskItem,
  type EffortRecommendation,
  type Freshness,
  type TierAssessment,
  type ResearchGapReport,
} from './research.schema.js';

// =============================================================================
// 4. Estimate Schema (After LLM estimation)
// =============================================================================

export {
  EstimateOutputSchema,
  EffortSchema,
  CostSchema,
  MilestoneSchema,
  TierSchema,
  FinOpsSchema,
  ValueBreakdownSchema,
  HardSavingsSchema,
  ModeledOpportunitySchema,
  FinOpsValidationSchema,
  ROISchema,
  RiskElaborationSchema,
  SourceTrackingSchema,
  HoursBreakdownSchema,
  CostBreakdownSchema,
  type EstimateOutput,
  type Effort,
  type Cost,
  type Milestone,
  type Tier,
  type FinOps,
  type ValueBreakdown,
  type HardSavings,
  type ModeledOpportunity,
  type FinOpsValidation,
  type ROI,
  type RiskElaboration,
  type SourceTracking,
  type HoursBreakdown,
} from './estimate.schema.js';

// =============================================================================
// 5. Transform Schema (Before rendering)
// =============================================================================

export {
  TransformContextSchema,
  ProjectIdentitySchema,
  TechnicalApproachSchema,
  ScorecardRowSchema,
  RenderingSchema,
  PaymentScheduleItemSchema,
  NeuralOpsTierSchema,
  TechStackItemSchema,
  IntegrationRowSchema,
  type TransformContext,
  type ProjectIdentity,
  type TechnicalApproach,
  type ScorecardRow,
  type Rendering,
  type PaymentScheduleItem,
  type NeuralOpsTier,
  type TechStackItem,
  type IntegrationRow,
} from './transform.schema.js';

// =============================================================================
// 6. Config Schema (Runtime configuration)
// =============================================================================

export {
  ConfigSchema,
  EnvVarsSchema,
  CLIOptionsSchema,
  LLMProviderConfigSchema,
  RateCardSchema,
  BrandingSchema,
  PipelineConfigSchema,
  validateEnv,
  validateConfig,
  type Config,
  type EnvVars,
  type CLIOptions,
  type LLMProviderConfig,
  type RateCard,
  type Branding,
  type PipelineConfig,
} from './config.schema.js';

// =============================================================================
// 7. Sales Strategy Schema (Internal sales playbook)
// =============================================================================

export {
  SalesStrategySchema,
  MarketContextSchema,
  PricingStrategySchema,
  CompensationSchema,
  ScriptsSchema,
  ObjectionSchema,
  ComplianceNoteSchema,
  validateSalesStrategy,
  type SalesStrategy,
  type MarketContext,
  type PricingStrategy,
  type Compensation,
  type Scripts,
  type Objection,
  type ComplianceNote,
} from './sales_strategy.schema.js';

// =============================================================================
// 8. Questionnaire Schema (Intake assessment & lead qualification)
// =============================================================================

export {
  // Field types
  FieldTypeSchema,
  QuestionSectionSchema,
  ValidationRuleTypeSchema,
  ValidationRuleSchema,
  ConditionalOperatorSchema,
  SimpleConditionSchema,
  ConditionalRuleSchema,
  SelectOptionSchema,
  type FieldType,
  type QuestionSection,
  type ValidationRuleType,
  type ValidationRule,
  type ConditionalOperator,
  type SimpleCondition,
  type ConditionalRule,
  type SelectOption,

  // Question definition
  QuestionSchema,
  SectionMetadataSchema,
  QuestionDatabaseSchema,
  type Question,
  type SectionMetadata,
  type QuestionDatabase,

  // Lead qualification
  LeadStatusSchema,
  QualificationThresholdsSchema,
  QualificationWeightsSchema,
  QualificationConfigSchema,
  QualificationComponentSchema,
  LeadQualificationResultSchema,
  type LeadStatus,
  type QualificationThresholds,
  type QualificationWeights,
  type QualificationConfig,
  type QualificationComponent,
  type LeadQualificationResult,

  // Form submission
  FormSubmissionSchema,
  type FormSubmission,

  // Systems catalog
  SystemCategorySchema,
  SystemEntrySchema,
  SystemsCatalogSchema,
  type SystemCategory,
  type SystemEntry,
  type SystemsCatalog,

  // System Intelligence (Unified Lookup)
  ResearchFreshnessSchema,
  LaborFactorSchema,
  CitationSchema,
  SystemIntelligenceSchema,
  type ResearchFreshness,
  type LaborFactor,
  type Citation,
  type SystemIntelligence,

  // Company profile (internal sheet)
  CompanyProfileSchema,
  KeyMetricsSchema,
  type CompanyProfile,
  type KeyMetrics,

  // Validation helpers
  validateQuestionDatabase,
  validateSystemsCatalog,
  evaluateCondition,
} from './questionnaire.schema.js';

// =============================================================================
// 9. Case Study Schema (Pipeline evaluation ground truth)
// =============================================================================

export {
  // Source tracking
  VendorSchema,
  CaseStudySourceSchema,
  type Vendor,
  type CaseStudySource,

  // Problem section (masked input)
  VolumeMetricsSchema,
  CaseStudyProblemSchema,
  type VolumeMetrics,
  type CaseStudyProblem,

  // Solution section (ground truth)
  AgentTypeSchema,
  SolutionIntegrationSchema,
  PricingModelSchema,
  ROIMetricsSchema,
  CaseStudySolutionSchema,
  type AgentType,
  type SolutionIntegration,
  type PricingModel,
  type ROIMetrics,
  type CaseStudySolution,

  // Meta section
  QualityScoreSchema,
  DomainTagSchema,
  CaseStudyMetaSchema,
  type DomainTag,
  type CaseStudyMeta,

  // Complete case study
  CaseStudySchema,
  CreateCaseStudySchema,
  UpdateCaseStudyMetaSchema,
  type CaseStudy,
  type CreateCaseStudy,
  type UpdateCaseStudyMeta,

  // Helpers
  validateCaseStudy,
  generateCaseStudyId,
} from './case_study.schema.js';

// =============================================================================
// 10. Evaluation Schema (Pipeline evaluation runs and scoring)
// =============================================================================

export {
  // Scoring
  DimensionScoreSchema,
  EvaluationScoresSchema,
  type DimensionScore,
  type EvaluationScores,

  // Evaluation runs
  EvaluationStatusSchema,
  FlawCodeSchema,
  EvaluationRunSchema,
  CreateEvaluationRunSchema,
  type EvaluationStatus,
  type FlawCode,
  type EvaluationRun,
  type CreateEvaluationRun,

  // Flaw patterns
  FlawSeveritySchema,
  FlawPatternSchema,
  type FlawSeverity,
  type FlawPattern,

  // Batch evaluation
  BatchEvaluationSummarySchema,
  type BatchEvaluationSummary,

  // Configuration
  ScoringWeightsSchema,
  ScoringThresholdsSchema,
  ScoringConfigSchema,
  type ScoringWeights,
  type ScoringThresholds,
  type ScoringConfig,

  // Helpers
  validateEvaluationRun,
  validateFlawPattern,
  DEFAULT_SCORING_CONFIG,
} from './evaluation.schema.js';

// =============================================================================
// 11. Business Profile Schema (API enrichment)
// =============================================================================

export {
  BusinessProfileSchema,
  CompanySizeSegmentSchema,
  EnrichmentSourceSchema,
  parseRevenueEstimate,
  getCompanySizeSegment,
  REVENUE_RANGES,
  type BusinessProfile,
  type CompanySizeSegment,
  type EnrichmentSource,
} from './business_profile.schema.js';

// =============================================================================
// 12. Person Profile Schema (Contact enrichment)
// =============================================================================

export {
  PersonProfileSchema,
  PersonEnrichmentSourceSchema,
  SenioritySchema,
  type PersonProfile,
  type PersonEnrichmentSource,
  type Seniority,
} from './person_profile.schema.js';

/**
 * Central registry of all schemas for programmatic access.
 * Use this for dynamic validation or schema iteration.
 */
export const schemas = {
  // Primary contracts (9 schemas per ADR-001)
  intake: IntakeSchema,
  measurements: MeasurementsDataSchema,
  bleed: BleedTotalSchema,
  research: ResearchResultSchema,
  tier: TierAssessmentSchema,
  estimate: EstimateOutputSchema,
  milestone: MilestoneSchema,
  finops: FinOpsSchema,
  transform: TransformContextSchema,
  config: ConfigSchema,
  // Internal sales playbook
  salesStrategy: SalesStrategySchema,
  // Questionnaire & lead qualification
  questionDatabase: QuestionDatabaseSchema,
  leadQualification: LeadQualificationResultSchema,
  systemsCatalog: SystemsCatalogSchema,
  // Case study evaluation
  caseStudy: CaseStudySchema,
  evaluationRun: EvaluationRunSchema,
  flawPattern: FlawPatternSchema,
  scoringConfig: ScoringConfigSchema,
  businessProfile: BusinessProfileSchema,
  personProfile: PersonProfileSchema,
} as const;

/**
 * Type for the schema registry
 */
export type SchemaRegistry = typeof schemas;

/**
 * Schema names for type-safe access
 */
export type SchemaName = keyof SchemaRegistry;

/**
 * Environment-based validation mode
 */
export type ValidationMode = 'strict' | 'permissive';

/**
 * Validation result with detailed error info
 */
export type ValidationResult<T> = {
  success: boolean;
  data?: T;
  errors?: Array<{
    path: string;
    message: string;
    code: string;
  }>;
  warnings?: string[];
}

/**
 * Validates data against a schema with environment-aware enforcement.
 *
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @param options - Validation options
 * @returns Validation result with typed data or errors
 */
export function validateAtBoundary<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
  options: {
    stage?: string;
    mode?: ValidationMode;
  } = {}
): ValidationResult<z.infer<T>> {
  const mode = options.mode ??
    (process.env.NODE_ENV === 'production' ? 'strict' : 'permissive');

  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));

  if (mode === 'strict') {
    return { success: false, errors };
  }

  // Permissive mode: log warnings but return data with defaults
  console.warn(
    `[VALIDATION WARNING] ${options.stage ?? 'unknown'}: ${errors.length} issues`,
    errors
  );

  // Try to return partial data
  return {
    success: false,
    errors,
    warnings: errors.map((e) => `${e.path}: ${e.message}`),
    data, // Unsafe but permissive
  };
}
