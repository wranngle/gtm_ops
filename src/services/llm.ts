/**
 * llm.ts - Consolidated LLM Service
 *
 * Combines functionality from:
 * - lib/model_config.ts (model configuration, rate limits)
 * - lib/groq_adapter.ts (Groq API adapter)
 * - lib/llm_executor.ts (per-field LLM execution)
 * - lib/llm_batch_executor.ts (batch narrative generation)
 *
 * @module services/llm
 */

import { type } from 'arktype';
import Mustache from 'mustache';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// SCHEMAS
// ============================================================================

export const ModelConfigSchema = type({
  rpm: ['number', 'number'],
  tpm: ['number', 'number'],
  rpd: ['number', 'number'],
  category: 'string',
  tier: 'string',
});

export const GroqModelConfigSchema = type({
  rpm: 'number',
  rpd: 'number',
  context: 'number',
  tier: 'string',
});

export type ModelConfig = typeof ModelConfigSchema.infer;
export type GroqModelConfig = typeof GroqModelConfigSchema.infer;

// ============================================================================
// MODEL CONFIGURATION
// ============================================================================

export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'gemini-3-flash-preview': {
    rpm: [15, 2000],
    tpm: [1000000, 4000000],
    rpd: [1500, 10000],
    category: 'text-out',
    tier: 'flash'
  }
};

export const MODEL_FALLBACK_ORDER = ['gemini-3-flash-preview'];

export const GROQ_MODELS: Record<string, GroqModelConfig> = {
  'llama-3.3-70b-versatile': {
    rpm: 30,
    rpd: 14400,
    context: 128000,
    tier: 'premium'
  },
  'llama-3.1-8b-instant': {
    rpm: 30,
    rpd: 14400,
    context: 128000,
    tier: 'fast'
  },
  'llama-3.2-1b-preview': {
    rpm: 30,
    rpd: 14400,
    context: 8192,
    tier: 'lite'
  }
};

export const GROQ_FALLBACK_ORDER = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];

// ============================================================================
// RATE LIMIT UTILITIES
// ============================================================================

export function getModelDelay(modelId: string, usePaidTier = false): number {
  const config = MODEL_CONFIGS[modelId];
  if (!config) {
    console.warn(`Unknown model: ${modelId}, using default 3s delay`);
    return 3000;
  }
  const rpm = usePaidTier ? config.rpm[1] : config.rpm[0];
  const baseDelay = Math.ceil(60000 / rpm);
  return Math.ceil(baseDelay * 1.1);
}

export function getGroqDelay(modelId: string): number {
  const config = GROQ_MODELS[modelId];
  if (!config) return 2000;
  const baseDelay = Math.ceil(60000 / config.rpm);
  return Math.ceil(baseDelay * 1.1);
}

export function getNextFallbackModel(currentModel: string): string | null {
  const currentIndex = MODEL_FALLBACK_ORDER.indexOf(currentModel);
  if (currentIndex === -1) return MODEL_FALLBACK_ORDER[0];
  if (currentIndex >= MODEL_FALLBACK_ORDER.length - 1) return null;
  return MODEL_FALLBACK_ORDER[currentIndex + 1];
}

export function isRateLimitError(error: Error): boolean {
  const message = error.message || '';
  return (
    message.includes('429') ||
    message.includes('quota') ||
    message.includes('RESOURCE_EXHAUSTED') ||
    message.includes('rate limit') ||
    message.includes('Quota exceeded')
  );
}

export function parseRetryAfter(error: Error): number {
  const message = error.message || '';
  const secondsMatch = message.match(/retry\s+in\s+([\d.]+)s/i) ||
                      message.match(/"retryDelay":\s*"([\d.]+)s"/);
  if (secondsMatch) {
    return Math.ceil(parseFloat(secondsMatch[1]) * 1000);
  }
  return 60000;
}

export function getModelInfo(modelId: string) {
  const config = MODEL_CONFIGS[modelId];
  if (!config) return { model: modelId, tier: 'unknown', rpm: 'unknown' };
  return {
    model: modelId,
    tier: config.tier,
    rpm_free: config.rpm[0],
    delay_ms: getModelDelay(modelId, false)
  };
}

// ============================================================================
// MASTER PROMPTS
// ============================================================================

const MASTER_SYSTEM_PROMPT = `You are a professional business process auditor writing content for an AI Process Audit. Your task is to generate ALL narrative content for the report in a single, well-structured JSON response.

CRITICAL RULES:
1. Use ONLY the data provided - never invent numbers, names, or facts
2. Be concise and professional - no fluff, no hedging language
3. Use active voice and specific language
4. Quote exact values from the provided measurements
5. Every field must have a value - use context clues to write appropriate content
6. Output ONLY valid JSON - no markdown, no explanation

FORBIDDEN PHRASES (never use these):
- "I think", "might be", "could be", "approximately", "around", "roughly"
- "I believe", "probably", "perhaps", "maybe"

TONE:
- Professional and authoritative
- Direct and actionable
- Urgent but not alarmist
- Focused on business impact`;

const PROPOSAL_SYSTEM_PROMPT = `You are a professional sales proposal writer creating content for a Phase 2: Stabilize proposal. Your task is to generate compelling, specific narrative content.

CRITICAL RULES:
1. Use ONLY the data provided - never invent numbers, names, or facts
2. Be specific and action-oriented - reference actual workflow names and pain points
3. Never use generic phrases like "This proposal outlines..." or "A hybrid solution..."
4. Output ONLY valid JSON - no markdown, no explanation

FORBIDDEN PHRASES (never use these):
- "This proposal outlines..."
- "A hybrid solution combining..."
- "We propose to..."
- Generic buzzwords without specific context

TONE:
- Confident and compelling
- Specific to the client's actual situation
- Focused on outcomes and ROI`;

const REFINEMENT_SYSTEM_PROMPT = `You are a quality assurance editor reviewing AI-generated content for a business report. Your job is to verify and improve the content while ensuring it remains grounded in the source data.

VERIFICATION CHECKLIST:
1. All numbers match the source data exactly
2. No fabricated information
3. Professional tone throughout
4. No hedging language (might, could, approximately)
5. All sentences are complete and grammatically correct
6. Money values are wrapped in <strong> tags where appropriate
7. Content is concise - no unnecessary words
8. Risk statements start with "Risk:"
9. Fix solutions are actionable one-liners

IMPROVEMENTS TO MAKE:
- Fix any awkward phrasing
- Ensure consistent voice and tone
- Tighten verbose sentences
- Add missing punctuation
- Remove any placeholder text like [INSUFFICIENT_EVIDENCE]

OUTPUT: Return the IMPROVED JSON with the same structure. Only modify text content, not structure.`;

// ============================================================================
// GROQ ADAPTER
// ============================================================================

export interface GroqAdapterOptions {
  apiKey?: string;
  model?: string;
  verbose?: boolean;
}

export interface GroqGenerateOptions {
  temperature?: number;
  maxTokens?: number;
  maxRetries?: number;
  jsonMode?: boolean;
}

export class GroqAdapter {
  private apiKey: string;
  public model: string;
  private verbose: boolean;
  private baseUrl = 'https://api.groq.com/openai/v1/chat/completions';
  public stats = { tokensUsed: 0, requestCount: 0, modelUsed: '' };

  constructor(options: GroqAdapterOptions = {}) {
    this.apiKey = options.apiKey || process.env.GROQ_API_KEY || '';
    this.model = options.model || GROQ_FALLBACK_ORDER[0];
    this.verbose = options.verbose !== false;
    this.stats.modelUsed = this.model;
  }

  private log(message: string): void {
    if (this.verbose) {
      const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
      console.log(`[${timestamp}] ${message}`);
    }
  }

  private getNextFallbackModel(): string | null {
    const currentIdx = GROQ_FALLBACK_ORDER.indexOf(this.model);
    if (currentIdx === -1 || currentIdx >= GROQ_FALLBACK_ORDER.length - 1) return null;
    return GROQ_FALLBACK_ORDER[currentIdx + 1];
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async generate(
    systemPrompt: string,
    userPrompt: string,
    options: GroqGenerateOptions = {}
  ): Promise<string | object> {
    if (!this.apiKey) {
      throw new Error('Groq API key not configured. Set GROQ_API_KEY environment variable.');
    }

    const body: {
      model: string;
      messages: Array<{ role: string; content: string }>;
      temperature: number;
      max_tokens: number;
    } = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: options.temperature || 0.3,
      max_tokens: options.maxTokens || 2000
    };

    const maxRetries = options.maxRetries || 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(this.baseUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });

        if (response.status === 429) {
          const nextModel = this.getNextFallbackModel();
          if (nextModel) {
            this.log(`Rate limited on ${this.model}, switching to ${nextModel}`);
            this.model = nextModel;
            body.model = nextModel;
            this.stats.modelUsed = nextModel;
            continue;
          }
          throw new Error(`Groq rate limited on all models`);
        }

        if (response.status === 413) {
          const nextModel = this.getNextFallbackModel();
          if (nextModel) {
            this.log(`Request too large for ${this.model}, switching to ${nextModel}`);
            this.model = nextModel;
            body.model = nextModel;
            this.stats.modelUsed = nextModel;
            continue;
          }
          throw new Error('Request too large for all Groq models');
        }

        const data = await response.json();
        if (!response.ok) {
          throw new Error(`Groq API error ${response.status}: ${data.error?.message || response.statusText}`);
        }

        const text = data.choices?.[0]?.message?.content || '';
        if (data.usage) this.stats.tokensUsed += data.usage.total_tokens;
        this.stats.requestCount++;

        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) jsonText = jsonText.slice(7);
        if (jsonText.startsWith('```')) jsonText = jsonText.slice(3);
        if (jsonText.endsWith('```')) jsonText = jsonText.slice(0, -3);
        jsonText = jsonText.trim();

        try {
          return JSON.parse(jsonText);
        } catch {
          return text.trim();
        }
      } catch (err) {
        lastError = err as Error;
        const isRetryable = lastError.message.includes('fetch failed') ||
                           lastError.message.includes('network') ||
                           lastError.message.includes('timeout');
        if (isRetryable && attempt < maxRetries) {
          await this.sleep(2000 * (attempt + 1));
          continue;
        }
        break;
      }
    }
    throw new Error(`Groq API call failed: ${lastError?.message}`);
  }

  getStats() {
    return { ...this.stats };
  }
}

// ============================================================================
// LLM EXECUTOR OPTIONS
// ============================================================================

export interface LLMExecutorOptions {
  apiKey?: string;
  groqApiKey?: string;
  model?: string;
  maxRetries?: number;
  dryRun?: boolean;
  verbose?: boolean;
  usePaidTier?: boolean;
  useGroq?: boolean;
  skipRefinement?: boolean;
  useGrounding?: boolean; // NEW: Enable Google Search Grounding
  task?: string;
}

export interface LLMStats {
  promptsExecuted: number;
  tokensUsed: number;
  errors: Array<{ prompt_id: string; model: string; error: string }>;
  approvalRequired: Array<{ path: string; prompt_id: string; approval_gate: string }>;
  modelUsed: string;
  fallbacks: Array<{ from: string; to: string; timestamp: string }>;
  groqUsed: boolean;
  apiCalls?: number;
  generationTime?: number;
  refinementTime?: number;
  polishLog?: Array<{ timestamp: string; path: string; before: string; after: string; reason: string }>;
}

// ============================================================================
// LLM EXECUTOR CLASS
// ============================================================================

export class LLMExecutor {
  private apiKey: string;
  private groqApiKey: string;
  private model: string;
  private maxRetries: number;
  private dryRun: boolean;
  private verbose: boolean;
  private baseUrl: string;
  private usePaidTier: boolean;
  private useGroq: boolean;
  private useGrounding: boolean; // NEW
  private currentModel: string;
  private fallbackHistory: Array<{ from: string; to: string; timestamp: string }> = [];
  private modelSwitches = 0;
  private groqAdapter: GroqAdapter | null;
  private promptRegistry: { prompts: any[]; registry_version?: string };
  public stats: LLMStats;

  constructor(options: LLMExecutorOptions = {}) {
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY || '';
    this.groqApiKey = options.groqApiKey || process.env.GROQ_API_KEY || '';
    this.model = options.model || MODEL_FALLBACK_ORDER[0];
    this.maxRetries = options.maxRetries || 2;
    this.dryRun = options.dryRun || false;
    this.verbose = options.verbose !== false;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
    this.usePaidTier = options.usePaidTier || false;
    this.useGroq = options.useGroq || false;
    this.useGrounding = options.useGrounding || false; // NEW
    this.currentModel = this.model;

    this.groqAdapter = this.groqApiKey ? new GroqAdapter({
      apiKey: this.groqApiKey,
      verbose: this.verbose
    }) : null;

    this.promptRegistry = this.loadPromptRegistry();

    this.stats = {
      promptsExecuted: 0,
      tokensUsed: 0,
      errors: [],
      approvalRequired: [],
      modelUsed: this.currentModel,
      fallbacks: [],
      groqUsed: false
    };

    if (this.verbose) {
      if (this.useGroq && this.groqAdapter) {
        console.log(`LLM Executor initialized: Groq-only mode (${this.groqAdapter.model})`);
      } else {
        const modelInfo = getModelInfo(this.currentModel);
        console.log(`LLM Executor initialized: ${modelInfo.model} (${modelInfo.tier} tier)${this.useGrounding ? ' [GROUNDING ENABLED]' : ''}`);
      }
    }
  }

  private loadPromptRegistry(): { prompts: any[]; registry_version?: string } {
    const registryPath = path.join(__dirname, '..', '..', 'prompts', 'prompt_registry.json');
    try {
      const content = fs.readFileSync(registryPath, 'utf8');
      return JSON.parse(content);
    } catch {
      console.warn('Could not load prompt registry');
      return { prompts: [] };
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private fallbackToNextModel(): boolean {
    const nextModel = getNextFallbackModel(this.currentModel);
    if (!nextModel) {
      if (this.verbose) console.log('⚠️  No more fallback models available');
      return false;
    }
    const previousModel = this.currentModel;
    this.currentModel = nextModel;
    this.modelSwitches++;
    const fallbackInfo = { from: previousModel, to: nextModel, timestamp: new Date().toISOString() };
    this.fallbackHistory.push(fallbackInfo);
    this.stats.fallbacks.push(fallbackInfo);
    if (this.verbose) {
      console.log(`🔄 Falling back: ${previousModel} → ${nextModel}`);
    }
    return true;
  }

  getPrompt(promptId: string) {
    return this.promptRegistry.prompts?.find((p: any) => p.prompt_id === promptId);
  }

  stripMarkdown(text: string): string {
    return text
      .replace(/^```(?:json|html|text|markdown)?\s*\n?/gim, '')
      .replace(/\n?```$/gim, '')
      .trim();
  }

  async callLLM(prompt: any, context: Record<string, any>): Promise<{ content: string; tokens: number }> {
    Mustache.escape = (text: string) => text;
    const userPrompt = Mustache.render(prompt.user_prompt_template || '', context);

    if (this.dryRun) {
      return { content: `[DRY_RUN: Would call LLM with prompt ${prompt.prompt_id}]`, tokens: 0 };
    }

    if (this.useGroq && this.groqAdapter) {
      const result = await this.groqAdapter.generate(prompt.system_prompt || '', userPrompt, {
        temperature: 0.3,
        maxTokens: prompt.max_tokens || 2000,
        maxRetries: this.maxRetries
      });
      this.stats.promptsExecuted++;
      this.stats.groqUsed = true;
      this.stats.modelUsed = `groq:${this.groqAdapter.model}`;
      const content = typeof result === 'string' ? result : JSON.stringify(result);
      return { content, tokens: this.groqAdapter.stats.tokensUsed };
    }

    if (!this.apiKey) {
      throw new Error('Gemini API key not set');
    }

    const fullPrompt = prompt.system_prompt ? `${prompt.system_prompt}\n\n${userPrompt}` : userPrompt;
    const body: any = {
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: { maxOutputTokens: prompt.max_tokens || 200, temperature: 0.3 }
    };

    // Apply grounding if enabled (Gemini only)
    if (this.useGrounding) {
      body.tools = [{ googleSearch: {} }];
    }

    let lastError: Error | null = null;
    let fallbackAttempted = false;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const url = `${this.baseUrl}/${this.currentModel}:generateContent?key=${this.apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Gemini API error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const tokens = data.usageMetadata?.totalTokenCount || 0;
        this.stats.promptsExecuted++;
        this.stats.tokensUsed += tokens;
        this.stats.modelUsed = this.currentModel;
        return { content, tokens };
      } catch (err) {
        lastError = err as Error;
        if (isRateLimitError(lastError)) {
          if (!fallbackAttempted && this.fallbackToNextModel()) {
            fallbackAttempted = true;
            attempt = -1;
            continue;
          }
          await this.sleep(parseRetryAfter(lastError));
          continue;
        }
        const isRetryable = lastError.message.includes('fetch failed') || lastError.message.includes('network');
        if (isRetryable && attempt < this.maxRetries) {
          await this.sleep(5000 * (attempt + 1));
          continue;
        }
        break;
      }
    }

    if (this.groqAdapter && lastError && isRateLimitError(lastError)) {
      if (this.verbose) console.log('🔄 Falling back to Groq');
      const result = await this.groqAdapter.generate(prompt.system_prompt || '', userPrompt, {
        temperature: 0.3,
        maxTokens: prompt.max_tokens || 2000
      });
      this.stats.promptsExecuted++;
      this.stats.groqUsed = true;
      this.stats.modelUsed = `groq:${this.groqAdapter.model}`;
      const content = typeof result === 'string' ? result : JSON.stringify(result);
      return { content, tokens: this.groqAdapter.stats.tokensUsed };
    }

    throw lastError || new Error('LLM call failed');
  }

  getStats() {
    return { ...this.stats, registry_version: this.promptRegistry.registry_version };
  }
}

// ============================================================================
// BATCH PROMPT BUILDERS
// ============================================================================

function buildMasterPrompt(reportJson: any): string {
  const workflow = reportJson.audit?.workflows?.[0];
  const bleed = reportJson.bleed;
  const scorecard = reportJson.scorecard;
  const fixes = reportJson.fixes;
  const clientName = reportJson.prepared_for?.account_name || 'Client';

  const tw = reportJson.audit?.scope?.time_window;
  let timeWindow = 'the analysis period';
  if (tw) {
    const startDate = new Date(tw.start).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const endDate = new Date(tw.end).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    timeWindow = `${startDate} to ${endDate}`;
  }

  return `Generate ALL narrative content for this audit report. Use the data below.

<audit_context>
Client: ${clientName}
Workflow: ${workflow?.name || 'Unknown'}
Trigger: ${workflow?.trigger || 'Unknown'}
Objective: ${workflow?.objective || 'Unknown'}
Time Window: ${timeWindow}
Systems: ${reportJson.audit?.scope?.systems_involved?.map((s: any) => s.system_name).join(', ') || 'Unknown'}
</audit_context>

<measurements>
${workflow?.measurements?.map((m: any) => `- ${m.name}: ${m.value_display} (target: ${m.target || 'not set'}, status: ${m.status})`).join('\n') || 'No measurements'}
</measurements>

<bleed_data>
Total Bleed: ${bleed?.total?.display || '$0'}
Period: ${bleed?.period || 'month'}
Volume: ${workflow?.volume || 'Derived from calculations'}
Item Type: ${bleed?.item_type || 'items'}
Assumptions: ${JSON.stringify(bleed?.assumptions || [])}
Calculations: ${JSON.stringify(bleed?.calculations || [])}
</bleed_data>

<scorecard_rows>
${scorecard?.rows?.map((r: any, i: number) => `Row ${i + 1}: ${r.category} - Status: ${r.status} - Metrics: ${r.metrics?.map((m: any) => m.value_display).join(', ')}`).join('\n') || 'No rows'}
</scorecard_rows>

<fixes>
${fixes?.items?.map((f: any, i: number) => `Fix ${i + 1}: Related to ${f.related_measurement_ids?.[0] || 'general'}, Quick win: ${f.quick_win}, Effort: ${f.implementation?.effort_level}, Impact tier: ${f.impact?.tier}, Recovery: ${f.impact?.estimated_recovery?.display || 'TBD'}`).join('\n') || 'No fixes'}
</fixes>

Generate this exact JSON structure with all narrative fields filled:

{
  "document_title": "Phase 1: AI Process Audit — [Workflow Name]",
  "scope_statement": "[2-3 sentence scope statement]",
  "in_scope": ["[item 1]", "[item 2]", "[item 3]", "[item 4]"],
  "out_of_scope": ["[item 1]", "[item 2]", "[item 3]"],
  "limitations": ["[limitation 1]", "[limitation 2]"],
  "executive_summary": "[2 sentences with bleed amount in <strong> tags]",
  "scorecard_findings": [
    ${scorecard?.rows?.map((r: any, i: number) => `{
      "row_index": ${i},
      "category": "${r.category}",
      "summary": "[Business impact with <span class='math-pill'> around numbers]",
      "risk": "Risk: [Specific consequence]"
    }`).join(',\n    ')}
  ],
  "math_defender": "[Use Item Type from bleed_data - e.g. '200 appointments/day' not 'items/day'. VOLUME × RATE × COST with <span class='math-pill'> tags]",
  "fixes": [
    ${fixes?.items?.map((_f: any, i: number) => `{
      "fix_index": ${i},
      "problem": "[Pain point]",
      "solution": "[Action: verb + tech + outcome]",
      "impact_basis": "[How this reduces pain]",
      "acceptance_criteria": ["[Criterion 1]", "[Criterion 2]"]
    }`).join(',\n    ')}
  ],
  "cta_headline": "[3-8 word urgent headline]",
  "cta_subtext": "[10-20 word supporting sentence]"
}

Output ONLY the JSON object:`;
}

function buildProposalPrompt(proposalJson: any): string {
  const clientName = proposalJson.prepared_for?.account_name || 'Client';
  const workflowName = proposalJson.audit_reference?.workflow_name || 'Workflow';
  const bleedTotal = proposalJson.audit_reference?.bleed_total?.display || '$0';
  const keyFindings = proposalJson.audit_reference?.key_findings || [];
  const totalPrice = proposalJson.pricing?.total?.display || '$0';
  const roi = proposalJson.roi;
  const phases = proposalJson.phases || [];

  return `Generate narrative content for this Phase 2: Stabilize proposal.

<proposal_context>
Client: ${clientName}
Workflow: ${workflowName}
Monthly Bleed: ${bleedTotal}
Key Findings: ${keyFindings.join('; ')}
Total Investment: ${totalPrice}
Payback Period: ${roi?.payback_period?.display || 'TBD'}
First Year ROI: ${roi?.first_year_roi?.percentage || 'TBD'}
</proposal_context>

<phases>
${phases.map((p: any, i: number) => `Phase ${i + 1}: ${p.name} - ${p.duration?.display || 'TBD'}`).join('\n')}
</phases>

Generate this exact JSON structure:

{
  "executive_summary": "[2-3 sentences referencing ${workflowName} and ${bleedTotal}. DO NOT start with 'This proposal...']",
  "value_proposition": "[1 sentence about payback and savings]",
  "cta_headline": "[3-6 word action headline]",
  "cta_subtext": "[10-15 word next steps]"
}

Output ONLY the JSON object:`;
}

function buildRefinementPrompt(generatedContent: any, sourceData: any): string {
  return `Review and improve this generated content against the source data.

<generated_content>
${JSON.stringify(generatedContent, null, 2)}
</generated_content>

<source_data>
${JSON.stringify(sourceData, null, 2)}
</source_data>

Verify all numbers match. Fix quality issues. Return improved JSON:`;
}

function detectDocumentType(json: any): 'audit' | 'proposal' | 'project_plan' | 'unknown' {
  if (json.scorecard?.rows && json.audit?.workflows) return 'audit';
  if (json.pricing?.payment_schedule && json.audit_reference) return 'proposal';
  if (json.milestones && json.estimate) return 'project_plan';
  return 'unknown';
}

// ============================================================================
// BATCH LLM EXECUTOR OPTIONS
// ============================================================================

export interface BatchLLMExecutorOptions {
  apiKey?: string;
  groqApiKey?: string;
  model?: string;
  maxRetries?: number;
  dryRun?: boolean;
  verbose?: boolean;
  skipRefinement?: boolean;
  useGroq?: boolean;
}

export interface BatchLLMStats {
  apiCalls: number;
  tokensUsed: number;
  generationTime: number;
  refinementTime: number;
  modelUsed: string;
  groqUsed: boolean;
}

// ============================================================================
// BATCH LLM EXECUTOR CLASS
// ============================================================================

export class BatchLLMExecutor {
  private apiKey: string;
  private groqApiKey: string;
  private model: string;
  private maxRetries: number;
  private dryRun: boolean;
  private verbose: boolean;
  private baseUrl: string;
  private skipRefinement: boolean;
  private useGroq: boolean;
  private currentModel: string;
  private fallbackHistory: Array<{ from: string; to: string }> = [];
  private groqAdapter: GroqAdapter | null;
  public stats: BatchLLMStats;

  constructor(options: BatchLLMExecutorOptions = {}) {
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY || '';
    this.groqApiKey = options.groqApiKey || process.env.GROQ_API_KEY || '';
    this.model = options.model || MODEL_FALLBACK_ORDER[0];
    this.maxRetries = options.maxRetries || 3;
    this.dryRun = options.dryRun || false;
    this.verbose = options.verbose !== false;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
    this.skipRefinement = options.skipRefinement || false;
    this.useGroq = options.useGroq || false;
    this.currentModel = this.model;

    this.groqAdapter = this.groqApiKey ? new GroqAdapter({
      apiKey: this.groqApiKey,
      verbose: this.verbose
    }) : null;

    this.stats = {
      apiCalls: 0,
      tokensUsed: 0,
      generationTime: 0,
      refinementTime: 0,
      modelUsed: this.currentModel,
      groqUsed: false
    };

    if (this.verbose) {
      if (this.useGroq && this.groqAdapter) {
        console.log(`Batch LLM Executor initialized: Groq-only mode (${this.groqAdapter.model})`);
      } else {
        const modelInfo = getModelInfo(this.currentModel);
        console.log(`Batch LLM Executor initialized: ${modelInfo.model} (${modelInfo.tier} tier)`);
        if (this.groqAdapter) {
          console.log(`  Groq fallback: Available (${this.groqAdapter.model})`);
        }
      }
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private fallbackToNextModel(): boolean {
    const nextModel = getNextFallbackModel(this.currentModel);
    if (!nextModel) {
      if (this.verbose) console.log('⚠️  No more fallback models available');
      return false;
    }
    const previousModel = this.currentModel;
    this.currentModel = nextModel;
    this.fallbackHistory.push({ from: previousModel, to: nextModel });
    if (this.verbose) {
      const modelInfo = getModelInfo(nextModel);
      console.log(`🔄 Falling back: ${previousModel} → ${nextModel} (${modelInfo.tier} tier)`);
    }
    return true;
  }

  async callLLM(systemPrompt: string, userPrompt: string, maxTokens = 4000): Promise<{ content: string; tokens: number }> {
    if (this.dryRun) {
      return { content: '{}', tokens: 0 };
    }

    if (this.useGroq && this.groqAdapter) {
      if (this.verbose) console.log(`  Using Groq directly (${this.groqAdapter.model})`);
      const result = await this.groqAdapter.generate(systemPrompt, userPrompt, {
        maxTokens,
        jsonMode: true
      });
      this.stats.apiCalls++;
      this.stats.groqUsed = true;
      this.stats.modelUsed = `groq:${this.groqAdapter.model}`;
      const tokens = this.groqAdapter.stats.tokensUsed;
      this.stats.tokensUsed += tokens;
      return { content: typeof result === 'string' ? result : JSON.stringify(result), tokens };
    }

    if (!this.apiKey) {
      throw new Error('Gemini API key not set');
    }

    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
    const body = {
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 }
    };

    let lastError: Error | null = null;
    let fallbackAttempted = false;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const url = `${this.baseUrl}/${this.currentModel}:generateContent?key=${this.apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Gemini API error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const tokens = data.usageMetadata?.totalTokenCount || 0;
        this.stats.apiCalls++;
        this.stats.tokensUsed += tokens;
        this.stats.modelUsed = this.currentModel;
        return { content, tokens };
      } catch (err) {
        lastError = err as Error;
        if (isRateLimitError(lastError)) {
          if (!fallbackAttempted && this.fallbackToNextModel()) {
            fallbackAttempted = true;
            attempt = -1;
            continue;
          }
          const retryAfter = parseRetryAfter(lastError);
          if (this.verbose) console.log(`    Rate limit hit, waiting ${Math.ceil(retryAfter / 1000)}s...`);
          await this.sleep(retryAfter);
          continue;
        }
        const isRetryable = lastError.message.includes('fetch failed') || lastError.message.includes('network');
        if (isRetryable && attempt < this.maxRetries) {
          await this.sleep(5000 * (attempt + 1));
          continue;
        }
        break;
      }
    }

    if (this.groqAdapter && lastError && isRateLimitError(lastError)) {
      if (this.verbose) console.log(`🔄 All Gemini models exhausted, falling back to Groq`);
      try {
        const result = await this.groqAdapter.generate(systemPrompt, userPrompt, {
          temperature: 0.3,
          maxTokens,
          maxRetries: this.maxRetries
        });
        this.stats.apiCalls++;
        this.stats.groqUsed = true;
        this.stats.modelUsed = `groq:${this.groqAdapter.model}`;
        const content = typeof result === 'string' ? result : JSON.stringify(result);
        return { content, tokens: this.groqAdapter.stats.tokensUsed };
      } catch (groqErr) {
        if (this.verbose) console.log(`⚠️  Groq fallback also failed: ${(groqErr as Error).message}`);
      }
    }

    throw lastError || new Error('LLM call failed');
  }

  private parseJSON(text: string): any {
    const cleaned = text
      .replace(/^```(?:json)?\s*\n?/gim, '')
      .replace(/\n?```$/gim, '')
      .trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Could not parse JSON from LLM output');
  }

  async fillAllNarratives(reportJson: any): Promise<any> {
    const startTime = Date.now();
    const docType = detectDocumentType(reportJson);
    let systemPrompt: string; let userPrompt: string;

    if (docType === 'proposal') {
      console.log('Stage 1: Generating proposal narratives in single LLM call...');
      systemPrompt = PROPOSAL_SYSTEM_PROMPT;
      userPrompt = buildProposalPrompt(reportJson);
    } else {
      console.log('Stage 1: Generating all narratives in single LLM call (18000 max tokens)...');
      systemPrompt = MASTER_SYSTEM_PROMPT;
      userPrompt = buildMasterPrompt(reportJson);
    }

    const genResult = await this.callLLM(systemPrompt, userPrompt, 18000);
    let generatedContent: any;

    try {
      generatedContent = this.parseJSON(genResult.content);
    } catch (err) {
      console.error('Failed to parse generated content:', (err as Error).message);
      console.error('Raw output:', genResult.content.slice(0, 500));
      throw new Error('LLM returned invalid JSON');
    }

    this.stats.generationTime = Date.now() - startTime;
    console.log(`  Generated ${Object.keys(generatedContent).length} narrative fields in ${this.stats.generationTime}ms`);

    if (!this.skipRefinement && docType === 'audit') {
      console.log('Stage 2: Self-verification refinement pass...');
      const refineStart = Date.now();
      const sourceData = {
        measurements: reportJson.audit?.workflows?.[0]?.measurements,
        bleed: reportJson.bleed,
        client: reportJson.prepared_for?.account_name
      };
      const refinePrompt = buildRefinementPrompt(generatedContent, sourceData);
      const refineResult = await this.callLLM(REFINEMENT_SYSTEM_PROMPT, refinePrompt, 18000);
      try {
        generatedContent = this.parseJSON(refineResult.content);
        this.stats.refinementTime = Date.now() - refineStart;
        console.log(`  Refinement complete in ${this.stats.refinementTime}ms`);
      } catch {
        console.warn('Refinement parse failed, using original content');
      }
    } else if (docType === 'proposal') {
      console.log('Stage 2: Skipping refinement for proposal (simpler structure)');
    }

    console.log('Stage 3: Mapping content to report structure...');
    const filledReport = this.applyGeneratedContent(reportJson, generatedContent);
    console.log(`Batch LLM complete: ${this.stats.apiCalls} API calls, ${this.stats.tokensUsed} tokens`);
    return filledReport;
  }

  private applyGeneratedContent(reportJson: any, generated: any): any {
    const report = JSON.parse(JSON.stringify(reportJson));

    if (generated.document_title && report.document) {
      report.document.title = generated.document_title;
    }
    if (generated.scope_statement && report.audit?.scope) {
      report.audit.scope.scope_statement = generated.scope_statement;
    }
    if (generated.in_scope && report.audit?.scope) {
      report.audit.scope.in_scope = generated.in_scope;
    }
    if (generated.out_of_scope && report.audit?.scope) {
      report.audit.scope.out_of_scope = generated.out_of_scope;
    }
    if (generated.limitations && report.audit?.methodology) {
      report.audit.methodology.limitations = generated.limitations;
    }
    if (generated.executive_summary && report.scorecard?.executive_summary) {
      report.scorecard.executive_summary.body = generated.executive_summary;
    }
    if (generated.executive_summary && report.executive_summary && !report.scorecard) {
      report.executive_summary.body = generated.executive_summary;
    }
    if (generated.value_proposition && report.executive_summary) {
      report.executive_summary.value_proposition = generated.value_proposition;
    }
    if (generated.scorecard_findings && report.scorecard?.rows) {
      generated.scorecard_findings.forEach((finding: any) => {
        const row = report.scorecard.rows[finding.row_index];
        if (row) {
          row.finding = row.finding || {};
          row.finding.summary = finding.summary;
          row.finding.risk = finding.risk;
        }
      });
    }
    if (generated.math_defender && report.bleed) {
      report.bleed.math_defender_text = generated.math_defender;
    }
    if (generated.fixes && report.fixes?.items) {
      generated.fixes.forEach((fix: any) => {
        const item = report.fixes.items[fix.fix_index];
        if (item) {
          item.problem = fix.problem;
          item.solution = fix.solution;
          if (item.impact) item.impact.basis = fix.impact_basis;
          if (fix.acceptance_criteria) item.acceptance_criteria = fix.acceptance_criteria;
        }
      });
    }
    if (generated.cta_headline && report.cta) {
      report.cta.headline = generated.cta_headline;
    }
    if (generated.cta_subtext && report.cta) {
      report.cta.subtext = generated.cta_subtext;
    }

    return report;
  }

  getStats(): BatchLLMStats {
    return { ...this.stats };
  }
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export async function fillReportNarratives(
  reportJson: any,
  options: BatchLLMExecutorOptions = {}
): Promise<any> {
  const executor = new BatchLLMExecutor(options);
  return executor.fillAllNarratives(reportJson);
}

export async function executeLLMJson(
  systemPromptOrTemplate: string,
  userPromptOrOptions?: string | LLMExecutorOptions,
  options: LLMExecutorOptions = {}
): Promise<any> {
  // Detect old vs new API:
  // Old: executeLLMJson(template, { task: 'x' })
  // New: executeLLMJson(systemPrompt, userPrompt, options)
  let systemPrompt: string;
  let userPrompt: string;
  let finalOptions: LLMExecutorOptions;

  if (typeof userPromptOrOptions === 'string') {
    // New API: (systemPrompt, userPrompt, options)
    systemPrompt = systemPromptOrTemplate;
    userPrompt = userPromptOrOptions;
    finalOptions = options;
  } else {
    // Old API: (template, options) - template becomes both system and user prompt
    systemPrompt = 'You are a helpful assistant that returns valid JSON.';
    userPrompt = systemPromptOrTemplate;
    finalOptions = (userPromptOrOptions as LLMExecutorOptions) || {};
  }

  const executor = new LLMExecutor(finalOptions);
  const prompt = { system_prompt: systemPrompt, user_prompt_template: userPrompt, max_tokens: 4000 };
  const result = await executor.callLLM(prompt, {});
  try {
    // Strip any markdown code blocks (handle various formats)
    const cleaned = result.content
      .replace(/```(?:json|javascript|js)?\s*\n/gi, '')  // Opening code fence
      .replace(/\n```\s*$/gi, '')                         // Closing code fence at end
      .replace(/```\s*$/gi, '')                           // Closing code fence without newline
      .replace(/^```(?:json|javascript|js)?\s*/gi, '')    // Opening at very start
      .trim();

    // Extract JSON object or array
    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);

    if (objectMatch) {
      return JSON.parse(objectMatch[0]);
    }
    if (arrayMatch) {
      return JSON.parse(arrayMatch[0]);
    }

    // Try direct parse as last resort
    return JSON.parse(cleaned);
  } catch (parseError) {
    // Log the parsing error for debugging
    console.warn('⚠️ JSON parsing failed:', (parseError as Error).message);
    console.warn('   Raw content starts with:', result.content.slice(0, 100));

    // Return empty object instead of raw string to prevent downstream errors
    return {};
  }
}
