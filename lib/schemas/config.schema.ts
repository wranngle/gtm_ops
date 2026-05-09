/**
 * Config Schema - Runtime configuration validation
 * @module lib/schemas/config.schema
 */

import { type } from 'arktype';

// =============================================================================
// LLM Provider Configuration
// =============================================================================

export const LLMProviderConfigSchema = type({
  provider: type("'gemini' | 'groq'").default('gemini'),
  'model?': 'string',
  temperature: type('0 <= number <= 2').default(0.7),
  maxTokens: type('number > 0').default(4096),
  timeout: type('number > 0').default(60_000),
});

export type LLMProviderConfig = typeof LLMProviderConfigSchema.infer;

// =============================================================================
// Rate Card Entry
// =============================================================================

export const RateCardEntrySchema = type({
  role: 'string',
  hourly_rate: 'number > 0',
  'description?': 'string',
});

export type RateCardEntry = typeof RateCardEntrySchema.infer;

// =============================================================================
// Rate Card
// =============================================================================

export const RateCardSchema = type({
  solutions_architect: type('number > 0').default(150),
  automation_engineer: type('number > 0').default(125),
  ai_developer: type('number > 0').default(140),
  qa_documentation: type('number > 0').default(100),
});

export type RateCard = typeof RateCardSchema.infer;

// =============================================================================
// Branding Configuration
// =============================================================================

export const BrandingSchema = type({
  company_name: type('string').default('Wranngle Systems LLC'),
  'logo_url?': 'string',
  primary_color: type('string').default('#ff5f00'),
  secondary_color: type('string').default('#cf3c69'),
  font_heading: type('string').default('Outfit'),
  font_body: type('string').default('Inter'),
});

export type Branding = typeof BrandingSchema.infer;

// =============================================================================
// Pipeline Configuration
// =============================================================================

export const PipelineConfigSchema = type({
  max_retries: type('1 <= number <= 10').default(3),
  retry_delay_ms: type('number > 0').default(1000),
  validation_mode: type("'strict' | 'permissive'").default('permissive'),
  throw_on_warning: type('boolean').default(false),
  output_dir: type('string').default('./output'),
  include_json_schema: type('boolean').default(true),
  enable_polish: type('boolean').default(true),
  polish_max_tokens: type('number > 0').default(2048),
});

export type PipelineConfig = typeof PipelineConfigSchema.infer;

// =============================================================================
// Environment Variables Schema
// =============================================================================

export const EnvVarsSchema = type({
  GEMINI_API_KEY: 'string >= 1',
  'GROQ_API_KEY?': 'string',
  NODE_ENV: type("'development' | 'production' | 'test'").default('development'),
  LOG_LEVEL: type("'debug' | 'info' | 'warn' | 'error'").default('info'),
  // PORT: zod's `.transform(Number).pipe(z.number().positive())` is replaced with
  // an arktype morph from string → positive number; default '3000' is mapped to 3000.
  PORT: type('string')
    .pipe((s, ctx) => {
      const n = Number(s);
      return Number.isFinite(n) && n > 0 ? n : ctx.error('a positive numeric string');
    })
    .default('3000'),
  'N8N_RESEARCH_LIBRARY_PATH?': 'string',
});

export type EnvVars = typeof EnvVarsSchema.infer;

// =============================================================================
// Complete Application Config
// =============================================================================

export const ConfigSchema = type({
  env: type("'development' | 'production' | 'test'").default('development'),
  log_level: type("'debug' | 'info' | 'warn' | 'error'").default('info'),
  'llm?': LLMProviderConfigSchema,
  'rate_card?': RateCardSchema,
  contingency_percent: type('0 <= number <= 0.5').default(0.15),
  'branding?': BrandingSchema,
  'pipeline?': PipelineConfigSchema,
  'paths?': type({
    input_dir: type('string').default('./input'),
    output_dir: type('string').default('./output'),
    template_dir: type('string').default('./templates'),
    'research_library?': 'string',
  }),
});

export type Config = typeof ConfigSchema.infer;

// =============================================================================
// CLI Options Schema
// =============================================================================

export const CLIOptionsSchema = type({
  input: 'string',
  'output?': 'string',
  verbose: type('boolean').default(false),
  dryRun: type('boolean').default(false),
  retry: type('boolean').default(false),
  'stage?': 'string',
  resume: type('boolean').default(false),
});

export type CLIOptions = typeof CLIOptionsSchema.infer;

// =============================================================================
// Validation Helpers
// =============================================================================

export function validateEnv(): EnvVars {
  const result = EnvVarsSchema(process.env);
  if (result instanceof type.errors) {
    throw new Error(`Environment validation failed:\n${result.summary}`);
  }
  return result;
}

export function validateConfig(config: unknown): Config {
  const result = ConfigSchema(config);
  if (result instanceof type.errors) {
    throw new Error(`Config validation failed:\n${result.summary}`);
  }
  return result;
}
