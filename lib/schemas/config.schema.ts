/**
 * Config Schema - Runtime configuration validation
 * @module lib/schemas/config.schema
 */

import { z } from 'zod';

// =============================================================================
// LLM Provider Configuration
// =============================================================================

export const LLMProviderConfigSchema = z.object({
  provider: z.enum(['gemini', 'groq']).default('gemini'),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().positive().default(4096),
  timeout: z.number().positive().default(60_000),
});

export type LLMProviderConfig = z.infer<typeof LLMProviderConfigSchema>;

// =============================================================================
// Rate Card Entry
// =============================================================================

export const RateCardEntrySchema = z.object({
  role: z.string(),
  hourly_rate: z.number().positive(),
  description: z.string().optional(),
});

export type RateCardEntry = z.infer<typeof RateCardEntrySchema>;

// =============================================================================
// Rate Card
// =============================================================================

export const RateCardSchema = z.object({
  solutions_architect: z.number().positive().default(150),
  automation_engineer: z.number().positive().default(125),
  ai_developer: z.number().positive().default(140),
  qa_documentation: z.number().positive().default(100),
});

export type RateCard = z.infer<typeof RateCardSchema>;

// =============================================================================
// Branding Configuration
// =============================================================================

export const BrandingSchema = z.object({
  company_name: z.string().default('Wranngle Systems LLC'),
  logo_url: z.string().optional(),
  primary_color: z.string().default('#ff5f00'),
  secondary_color: z.string().default('#cf3c69'),
  font_heading: z.string().default('Outfit'),
  font_body: z.string().default('Inter'),
});

export type Branding = z.infer<typeof BrandingSchema>;

// =============================================================================
// Pipeline Configuration
// =============================================================================

export const PipelineConfigSchema = z.object({
  // Retry settings
  max_retries: z.number().min(1).max(10).default(3),
  retry_delay_ms: z.number().positive().default(1000),

  // Validation settings
  validation_mode: z.enum(['strict', 'permissive']).default('permissive'),
  throw_on_warning: z.boolean().default(false),

  // Output settings
  output_dir: z.string().default('./output'),
  include_json_schema: z.boolean().default(true),

  // Polish settings
  enable_polish: z.boolean().default(true),
  polish_max_tokens: z.number().positive().default(2048),
});

export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;

// =============================================================================
// Environment Variables Schema
// =============================================================================

export const EnvVarsSchema = z.object({
  // Required
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),

  // Optional
  GROQ_API_KEY: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  PORT: z.string().transform(Number).pipe(z.number().positive()).default('3000'),

  // Research library
  N8N_RESEARCH_LIBRARY_PATH: z.string().optional(),
});

export type EnvVars = z.infer<typeof EnvVarsSchema>;

// =============================================================================
// Complete Application Config
// =============================================================================

export const ConfigSchema = z.object({
  // Environment
  env: z.enum(['development', 'production', 'test']).default('development'),
  log_level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // LLM
  llm: LLMProviderConfigSchema.optional(),

  // Pricing
  rate_card: RateCardSchema.optional(),
  contingency_percent: z.number().min(0).max(0.5).default(0.15),

  // Branding
  branding: BrandingSchema.optional(),

  // Pipeline
  pipeline: PipelineConfigSchema.optional(),

  // Paths
  paths: z.object({
    input_dir: z.string().default('./input'),
    output_dir: z.string().default('./output'),
    template_dir: z.string().default('./templates'),
    research_library: z.string().optional(),
  }).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

// =============================================================================
// CLI Options Schema
// =============================================================================

export const CLIOptionsSchema = z.object({
  input: z.string(),
  output: z.string().optional(),
  verbose: z.boolean().default(false),
  dryRun: z.boolean().default(false),
  retry: z.boolean().default(false),
  stage: z.string().optional(),
  resume: z.boolean().default(false),
});

export type CLIOptions = z.infer<typeof CLIOptionsSchema>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validates environment variables at startup
 */
export function validateEnv(): EnvVars {
  const result = EnvVarsSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`
    );
    throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
  }

  return result.data;
}

/**
 * Validates config file at startup
 */
export function validateConfig(config: unknown): Config {
  const result = ConfigSchema.safeParse(config);

  if (!result.success) {
    const errors = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`
    );
    throw new Error(`Config validation failed:\n${errors.join('\n')}`);
  }

  return result.data;
}
