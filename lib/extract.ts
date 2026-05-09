// @ts-nocheck — migrated from .js (was checkJs:false); incremental tightening tracked separately.

/**
 * extract.js - LLM-Powered Data Extraction from Unstructured Text
 *
 * Parses info dumps, interview notes, and raw text into structured
 * intake packets and measurements for the audit pipeline.
 *
 * OPTIMIZED: Single LLM call extracts BOTH intake AND measurements together.
 * Uses Google Gemini API with 18000 max tokens for reliable extraction.
 *
 * Usage:
 *   import { Extractor } from './lib/extract.js';
 *   const extractor = new Extractor({ apiKey: 'your-gemini-key' });
 *   const { intake, measurements } = await extractor.extract(rawText);
 */

import {
  MODEL_FALLBACK_ORDER,
  getModelInfo
} from '../src/services/llm.js';
import { createKeyedCollection } from './collections.js';
import { validateBleedInputsGate } from './schema-validation.js';

/**
 * Strip a markdown code fence from an LLM response and JSON.parse the
 * result, wrapping any SyntaxError with actionable context (token
 * count + a head/tail snippet of the body). LLM responses
 * occasionally come back with truncation at the token limit, fence
 * variants, or runaway strings — a bare "Unexpected token" without
 * the source is impossible to triage.
 *
 * Pure function so the parse-with-context contract is unit-testable
 * independently of the LLM provider plumbing in callLLM.
 *
 * @param {string} text - Raw LLM response (may be fenced)
 * @param {number} tokensUsed - Token count from the same call (for diagnostics)
 * @returns {*} Parsed JSON
 * @throws {Error} with .cause = original SyntaxError when parse fails
 */
export function parseLLMJson(text, tokensUsed) {
  let jsonText = (text ?? '').trim();
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.slice(7);
  }

  if (jsonText.startsWith('```')) {
    jsonText = jsonText.slice(3);
  }

  if (jsonText.endsWith('```')) {
    jsonText = jsonText.slice(0, -3);
  }

  const trimmed = jsonText.trim();
  try {
    return JSON.parse(trimmed);
  } catch (parseError) {
    const snippet = trimmed.length > 200
      ? `${trimmed.slice(0, 100)}...${trimmed.slice(-100)}`
      : trimmed;
    const error = new Error(
      `LLM returned malformed JSON (${parseError.message}). `
      + `Tokens used: ${tokensUsed}. `
      + `Response (${trimmed.length} chars): ${snippet}`,
    );
    error.cause = parseError;
    throw error;
  }
}

/**
 * BATCHED extraction prompt - extracts BOTH intake AND measurements in ONE call
 * This eliminates the 2-call overhead and reduces total extraction time by ~50%
 *
 * IMPORTANT: This prompt is designed to handle BOTH explicit data AND inferential analysis.
 * For job postings/RFPs where explicit metrics aren't stated, use industry benchmarks.
 */
const BATCHED_EXTRACTION_SYSTEM_PROMPT = `You are a business process analyst specializing in automation ROI assessment. Your job is to analyze text and produce structured JSON for automation project proposals.

EXTRACTION PHILOSOPHY:
1. EXTRACT explicit values when clearly stated (volumes, timelines, team sizes)
2. INFER reasonable values when implied (manual effort = volume × time per item)
3. ESTIMATE using industry benchmarks when not stated (hourly rates, error rates, SLA targets)
4. NEVER leave bleed_total at $0 if there is ANY manual process described - manual work always has cost

INFERENCE GUIDELINES FOR MANUAL PROCESSES:
- If volume is stated (e.g., "50-100 leads/day"), use the midpoint (75)
- If manual review is mentioned without time, estimate 5-15 minutes per item
- If hourly cost not stated, use $75/hr for professional staff
- If error rate not stated, use 5-15% for manual processes
- If SLA not stated, infer from context (urgent=4h, standard=24h, batch=48h)

BLEED CALCULATION (REQUIRED):
Monthly Bleed = manual_hours_per_month × hourly_rate
- manual_hours = (volume_per_period × periods_per_month × minutes_per_item) / 60
- Use specific item names (e.g., "200 leads/day", "50 appointments/week") based on the workflow.
- If sales team reviews 75 leads/day × 10 min each × 22 days = 275 hours/month
- At $75/hr = $20,625/month bleed from manual effort alone

OUTPUT FORMAT:
You must output valid JSON only. No markdown, no explanation, no commentary.
NEGATIVE CONSTRAINT: Never use the phrase "(carried to Phase 2 proposal)" in any field.`;

const BATCHED_EXTRACTION_PROMPT = `Extract BOTH the intake packet AND measurements from this unstructured text in a SINGLE response.

<input_text>
{{text}}
</input_text>

<timestamp>{{timestamp}}</timestamp>

Return this EXACT JSON structure with BOTH "intake" and "measurements_data" keys:

{
  "intake": {
    "intake_version": "1.0.0",
    "captured_at": "{{timestamp}}",
    "captured_by": "<extract interviewer name or use 'unknown'>",
    "prepared_for": {
      "account_id": "<generate as CLIENT-XXX or null>",
      "account_name": "<extract company/client name>"
    },
    "section_a_workflow_definition": {
      "q01_workflow_name": "<extract the main process/workflow being discussed>",
      "q02_trigger_event": "<what starts this workflow>",
      "q03_business_objective": "<goal of the workflow>",
      "q04_end_condition": "<when is it complete>",
      "q05_outcome_owner": "<who is responsible>"
    },
    "section_b_volume_timing": {
      "q06_runs_per_period": "<number as string>",
      "q06_period_unit": "<day|week|month|quarter|year>",
      "q07_avg_trigger_to_end": "<number as string>",
      "q07_time_unit": "<minutes|hours|days>",
      "q08_worst_case_delay": "<number as string or null>",
      "q08_delay_unit": "<minutes|hours|days or null>",
      "q09_business_hours_expected": "<Yes/No with details or null>"
    },
    "section_c_systems_handoffs": {
      "q10_systems_involved": ["<array of system names with tools in parens>"],
      "q11_manual_data_transfers": "<describe manual work>",
      "q12_human_decision_gates": "<describe human decisions required>"
    },
    "section_d_failure_cost": {
      "q13_common_failures": "<what goes wrong>",
      "q14_cost_if_slow_or_failed": "<business impact with $ amounts if mentioned>"
    },
    "section_e_priority": {
      "q15_one_thing_to_fix": "<client's stated priority or infer from context>"
    },
    "attachments": {
      "evidence_uris": [],
      "notes": "<any additional context or quotes>"
    }
  },
  "measurements_data": {
    "measurements": [
      {
        "id": "<m_descriptive_id>",
        "name": "<Human Readable Name>",
        "metric_type": "<latency|error_rate|volume|complexity|cost|quality>",
        "value": <number>,
        "unit": "<hours|minutes|days|percent|count|dollars>",
        "value_display": "<formatted like '26h' or '15%'>",
        "source": "<where this came from in the text>",
        "evidence": [{"type": "client_statement", "summary": "<exact or paraphrased quote>"}],
        "threshold": {
          "target": <number or null>,
          "target_display": "<formatted target>",
          "healthy_max": <number for lower_is_better metrics>,
          "warning_max": <number>,
          "direction": "<lower_is_better|higher_is_better>"
        },
        "status": "<healthy|warning|critical based on value vs threshold>",
        "status_reason": "<brief explanation>"
      }
    ],
    "bleed_assumptions": [
      {
        "id": "<a_descriptive_id>",
        "label": "<what this assumption represents>",
        "value": <number>,
        "value_display": "<formatted>",
        "currency": "USD",
        "period": "monthly",
        "source": "<where extracted from>"
      }
    ],
    "bleed_calculations": [
      {
        "id": "<c_descriptive_id>",
        "label": "<calculation name>",
        "formula": "<readable formula like 'volume × rate × cost'>",
        "inputs": ["<assumption_ids used>"],
        "result": <number>,
        "result_display": "<formatted like '$4,050'>"
      }
    ],
    "bleed_total": {
      "value": <total monthly bleed number>,
      "currency": "USD",
      "period": "month",
      "display": "<formatted like '$4,050/mo'>"
    }
  }
}

MEASUREMENT GUIDELINES:
- Create measurements for: response time, error/miss rates, delays, complexity (system count), manual effort
- Set thresholds based on industry standards if not explicitly stated:
  - Response time: healthy <1h, warning <4h, critical >4h
  - Error rates: healthy <5%, warning <10%, critical >10%
  - Manual handoffs: healthy ≤2, warning ≤4, critical >4
- Calculate status by comparing value to thresholds

BLEED CALCULATION GUIDELINES:
- Identify: volume, failure rate, cost per failure
- If cost per failure not stated, note it as an assumption
- Monthly bleed = volume × failure_rate × cost_per_failure
- If data is insufficient for bleed calc, use conservative estimates and note them

Output ONLY the JSON object with both "intake" and "measurements_data" keys.`;

/**
 * Extractor class - OPTIMIZED for single-call batched extraction
 * Uses gemini-3-flash-preview with 18000 max tokens for reliable extraction
 */
export class Extractor {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY;
    this.model = options.model || MODEL_FALLBACK_ORDER[0]; // gemini-3-flash-preview
    this.maxTokens = options.maxTokens || 18_000; // High limit to prevent truncation
    this.verbose = options.verbose !== false;

    // Use v1beta for all Gemini models (required for systemInstruction + responseMimeType)
    const apiVersion = 'v1beta';
    this.baseUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models`;

    this.stats = {
      tokensUsed: 0,
      extractionTime: 0,
      modelUsed: this.model,
      apiCalls: 0
    };

    if (this.verbose) {
      const modelInfo = getModelInfo(this.model);
      console.log(`Extractor initialized: ${modelInfo.model} (${this.maxTokens} max tokens)`);
    }
  }

  /**
   * Log with timestamp
   */
  log(message) {
    if (this.verbose) {
      const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
      console.log(`[${timestamp}] ${message}`);
    }
  }

  /**
   * Call Gemini API - optimized for structured JSON extraction
   * Uses systemInstruction + responseMimeType for reliable output
   */
  async callLLM(systemPrompt, userPrompt) {
    if (!this.apiKey) {
      throw new Error('Gemini API key not configured. Set GEMINI_API_KEY environment variable.');
    }

    const startTime = Date.now();

    // Gemini API v1beta configuration for optimal JSON extraction
    // - systemInstruction: Separate system prompt for better instruction following
    // - responseMimeType: Forces valid JSON output (no markdown wrapping)
    // - temperature 0.2: Lower for more deterministic extraction
    const body = {
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [{
        role: 'user',
        parts: [{ text: userPrompt }]
      }],
      generationConfig: {
        maxOutputTokens: this.maxTokens,
        temperature: 0.2,
        responseMimeType: 'application/json'
      }
    };

    const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data.error?.message || response.statusText;
      throw new Error(`Gemini API error ${response.status}: ${errorMsg}`);
    }

    // Extract text from response
    let text = '';
    if (data.candidates && data.candidates[0]?.content?.parts) {
      for (const part of data.candidates[0].content.parts) {
        if (part.text) {
          text += part.text;
        }
      }
    }

    // Track stats
    this.stats.apiCalls++;
    if (data.usageMetadata) {
      this.stats.tokensUsed += (data.usageMetadata.promptTokenCount || 0) +
        (data.usageMetadata.candidatesTokenCount || 0);
    }

    const elapsed = Date.now() - startTime;
    this.log(`  LLM call completed in ${elapsed}ms (${this.stats.tokensUsed} tokens)`);

    // Parse JSON from response (strip markdown if present + wrap with
    // actionable context — extracted to parseLLMJson so the contract
    // is unit-testable.
    return parseLLMJson(text, this.stats.tokensUsed);
  }

  /**
   * Sanitize extracted intake - replace nulls with sensible defaults
   * This handles cases where LLM returns null for optional fields that schema requires as strings
   * @returns {object} { sanitized: object, provenance: object } - Sanitized intake with provenance tracking
   */
  sanitizeIntake(intake) {
    const defaults = {
      // Section A - workflow definition
      'section_a_workflow_definition.q02_trigger_event': 'Request received',
      'section_a_workflow_definition.q03_business_objective': 'Complete the workflow efficiently',
      'section_a_workflow_definition.q04_end_condition': 'Process completed',
      'section_a_workflow_definition.q05_outcome_owner': 'Unknown',
      // Section B - volume/timing
      'section_b_volume_timing.q06_runs_per_period': 'Unknown',
      'section_b_volume_timing.q06_period_unit': 'month',
      'section_b_volume_timing.q07_avg_trigger_to_end': 'Unknown',
      'section_b_volume_timing.q07_time_unit': 'hours',
      'section_b_volume_timing.q08_worst_case_delay': 'Unknown',
      'section_b_volume_timing.q08_delay_unit': 'days',
      'section_b_volume_timing.q09_business_hours_expected': 'Yes',
      // Section C - systems
      'section_c_systems_handoffs.q11_manual_data_transfers': 'Manual data entry between systems',
      'section_c_systems_handoffs.q12_human_decision_gates': 'Human review and approval required',
      // Section D - failures
      'section_d_failure_cost.q13_common_failures': 'Process delays and errors',
      'section_d_failure_cost.q14_cost_if_slow_or_failed': 'Financial and operational impact',
      // Section E - priority
      'section_e_priority.q15_one_thing_to_fix': 'Automate manual processes',
      // Attachments
      'attachments.notes': ''
    };

    // Deep clone to avoid mutating original
    const sanitized = JSON.parse(JSON.stringify(intake));

    // Track which fields were replaced with defaults (provenance)
    const replacedFields = {};
    const extractedFields = {};

    // Ensure captured_at is valid ISO timestamp
    if (!sanitized.captured_at || sanitized.captured_at === null) {
      sanitized.captured_at = new Date().toISOString();
      replacedFields.captured_at = { default: sanitized.captured_at, reason: 'missing timestamp' };
    }

    // Apply defaults for null string fields
    for (const [path, defaultValue] of Object.entries(defaults)) {
      const parts = path.split('.');
      let obj = sanitized;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!obj[parts[i]]) {
          obj[parts[i]] = {};
        }

        obj = obj[parts[i]];
      }

      const finalKey = parts.at(-1);
      if (obj[finalKey] === null || obj[finalKey] === undefined) {
        obj[finalKey] = defaultValue;
        replacedFields[path] = { default: defaultValue, reason: 'null or undefined' };
      } else {
        extractedFields[path] = { value: obj[finalKey], source: 'llm_extraction' };
      }
    }

    // Store provenance metadata on the sanitized object
    sanitized._provenance = {
      replaced_fields: replacedFields,
      extracted_fields: extractedFields,
      replacement_count: Object.keys(replacedFields).length,
      extraction_count: Object.keys(extractedFields).length,
      confidence: Object.keys(replacedFields).length === 0 ? 'high' :
        Object.keys(replacedFields).length < 5 ? 'medium' : 'low'
    };

    // Ensure systems array exists
    sanitized.section_c_systems_handoffs ||= {};
    if (!Array.isArray(sanitized.section_c_systems_handoffs.q10_systems_involved)) {
      sanitized.section_c_systems_handoffs.q10_systems_involved = ['Unknown system'];
    }

    // Ensure attachments.evidence_uris is array
    sanitized.attachments ||= {};
    if (!Array.isArray(sanitized.attachments.evidence_uris)) {
      sanitized.attachments.evidence_uris = [];
    }

    return sanitized;
  }

  /**
   * BATCHED extraction: raw text → intake + measurements in ONE LLM call
   * This is ~50% faster than sequential extraction
   */
  async extract(rawText) {
    const startTime = Date.now();

    this.log('Starting BATCHED extraction from info dump...');
    this.log(`  Input length: ${rawText.length} chars`);

    const timestamp = new Date().toISOString();
    const prompt = BATCHED_EXTRACTION_PROMPT
      .replaceAll('{{text}}', rawText)
      .replaceAll('{{timestamp}}', timestamp);

    // Single LLM call extracts BOTH intake AND measurements
    const result = await this.callLLM(BATCHED_EXTRACTION_SYSTEM_PROMPT, prompt);

    // Validate we got both parts
    if (!result.intake) {
      throw new Error('Extraction failed: missing intake data');
    }

    if (!result.measurements_data) {
      throw new Error('Extraction failed: missing measurements data');
    }

    const {intake} = result;
    const measurements = result.measurements_data;

    // Validate required fields
    if (!intake.prepared_for?.account_name) {
      throw new Error('Could not extract client/account name from input');
    }

    if (!intake.section_a_workflow_definition?.q01_workflow_name) {
      throw new Error('Could not extract workflow name from input');
    }

    if (!measurements.measurements || measurements.measurements.length === 0) {
      throw new Error('Could not extract any measurements from input');
    }

    // Generate default account_id if missing
    if (!intake.prepared_for.account_id) {
      const slug = intake.prepared_for.account_name
        .replaceAll(/[^a-zA-Z\d]/g, '')
        .slice(0, 8)
        .toUpperCase();
      intake.prepared_for.account_id = `CLIENT-${slug}-${Date.now().toString(36).toUpperCase()}`;
    }

    // Sanitize intake to replace nulls with defaults
    const sanitizedIntake = this.sanitizeIntake(intake);

    // CRITICAL: Recalculate bleed deterministically (don't trust LLM arithmetic)
    // Pass intake so we can use q07_avg_trigger_to_end as authoritative time-per-item
    const recalculatedMeasurements = this.recalculateBleedDeterministically(measurements, sanitizedIntake);

    this.stats.extractionTime = Date.now() - startTime;

    this.log(`  Client: ${sanitizedIntake.prepared_for.account_name}`);
    this.log(`  Workflow: ${sanitizedIntake.section_a_workflow_definition.q01_workflow_name}`);
    this.log(`  Measurements: ${recalculatedMeasurements.measurements.length}`);
    this.log(`  Bleed total: ${recalculatedMeasurements.bleed_total?.display || 'Not calculated'}`);
    this.log(`Extraction complete in ${this.stats.extractionTime}ms (1 API call, ${this.stats.tokensUsed} tokens)`);

    // Schema v2: Convert measurements array to keyed collection for O(1) lookup
    const keyedMeasurements = this.toKeyedMeasurements(recalculatedMeasurements);
    this.log(`  Keyed metrics: ${keyedMeasurements.metrics.count} items`);

    return { intake: sanitizedIntake, measurements: keyedMeasurements };
  }

  /**
   * Convert measurements structure to Schema v2 keyed format
   * Maintains backward compatibility with .measurements array via toMustacheCollection
   *
   * @param {Object} measurements - Original measurements with .measurements array
   * @returns {Object} Keyed structure with metrics.byId for O(1) lookup
   */
  toKeyedMeasurements(measurements) {
    // CRITICAL: Ensure all measurements have IDs (CC-030 fix)
    // Generate IDs for items without them to prevent array/byId mismatch
    const normalizedMeasurements = (measurements.measurements || []).map((item, index) => {
      if (!item) return null;
      if (item.id) return item;

      // Generate ID from name if available, otherwise use index
      const generatedId = item.name
        ? item.name.toLowerCase().replaceAll(/[^a-z\d]+/g, '_').replaceAll(/^_|_$/g, '')
        : `metric_${index}`;

      return { ...item, id: generatedId };
    }).filter(Boolean); // Remove null items

    // Create keyed collection from normalized measurements array
    const metricsCollection = createKeyedCollection(normalizedMeasurements, 'id');

    // Return new structure with keyed metrics + original bleed data
    return {
      // Schema v2: Keyed metrics collection
      metrics: metricsCollection,

      // Backward compat: Array for templates/consumers expecting .measurements
      // CRITICAL: Use normalized array to match byId count (CC-030 fix)
      measurements: normalizedMeasurements,

      // Bleed data unchanged
      bleed_assumptions: measurements.bleed_assumptions,
      bleed_calculations: measurements.bleed_calculations,
      bleed_total: measurements.bleed_total
    };
  }

  /**
   * CRITICAL: Recalculate bleed using deterministic JavaScript arithmetic
   * Never trust LLM to do math correctly - extract raw values, calculate here
   *
   * PRIORITY ORDER for time-per-item:
   * 1. Intake q07_avg_trigger_to_end (authoritative, explicitly stated)
   * 2. Measurement with "per item" or "per call" in name
   * 3. Default 10 minutes (conservative industry benchmark)
   *
   * NEVER use total monthly hours as time-per-item!
   */
  recalculateBleedDeterministically(measurements, intake = null) {
    // Deep clone to avoid mutation
    const result = JSON.parse(JSON.stringify(measurements));

    // Get assumptions (hourly rate, days per month)
    const hourlyRateAssumption = result.bleed_assumptions?.find(a =>
      a.id?.toLowerCase().includes('hourly') ||
      a.label?.toLowerCase().includes('hourly')
    );
    const daysAssumption = result.bleed_assumptions?.find(a =>
      a.id?.toLowerCase().includes('days') ||
      a.label?.toLowerCase().includes('days')
    );

    // PRIORITY 1: Use intake's q07_avg_trigger_to_end as authoritative time-per-item
    let timePerItemMinutes = null;
    let timeSource = 'default';

    if (intake?.section_b_volume_timing?.q07_avg_trigger_to_end) {
      const intakeTime = Number.parseFloat(intake.section_b_volume_timing.q07_avg_trigger_to_end);
      const intakeUnit = intake.section_b_volume_timing.q07_time_unit || 'minutes';

      if (!isNaN(intakeTime) && intakeTime > 0) {
        if (intakeUnit === 'hours') {
          timePerItemMinutes = intakeTime * 60;
        } else if (intakeUnit === 'seconds') {
          timePerItemMinutes = intakeTime / 60;
        } else {
          timePerItemMinutes = intakeTime; // assume minutes
        }

        timeSource = 'intake_q07';
        this.log(`  [DETERMINISTIC] Using intake q07 time-per-item: ${intakeTime} ${intakeUnit} = ${timePerItemMinutes} min`);
      }
    }

    // PRIORITY 2: Look for explicit per-item measurements (NOT total monthly hours)
    if (timePerItemMinutes === null) {
      const perItemMeasurement = result.measurements.find(m => {
        const name = m.name?.toLowerCase() || '';
        const id = m.id?.toLowerCase() || '';
        // Look for explicit per-item indicators
        return (name.includes('per item') || name.includes('per call') ||
          name.includes('per lead') || name.includes('per request') ||
          id.includes('per_item') || id.includes('per_call'));
      });

      if (perItemMeasurement && perItemMeasurement.value > 0) {
        const unit = perItemMeasurement.unit || 'minutes';
        if (unit === 'hours') {
          timePerItemMinutes = perItemMeasurement.value * 60;
        } else if (unit === 'seconds') {
          timePerItemMinutes = perItemMeasurement.value / 60;
        } else {
          timePerItemMinutes = perItemMeasurement.value;
        }

        timeSource = 'per_item_measurement';
        this.log(`  [DETERMINISTIC] Using per-item measurement: ${perItemMeasurement.value} ${unit} = ${timePerItemMinutes} min`);
      }
    }

    // PRIORITY 3: Reasonable default (industry benchmark for manual tasks)
    if (timePerItemMinutes === null) {
      timePerItemMinutes = 10; // 10 minutes is reasonable for most manual review tasks
      timeSource = 'default_10min';
      this.log(`  [DETERMINISTIC] Using default time-per-item: 10 min (no explicit value found)`);
    }

    // SANITY CHECK: Time per item should never exceed 60 minutes for most processes
    // If it does, the LLM likely confused total time with per-item time
    if (timePerItemMinutes > 60) {
      this.log(`  [WARNING] Time-per-item ${timePerItemMinutes} min seems too high (>60), capping at 15 min`);
      timePerItemMinutes = 15; // Conservative cap
      timeSource = 'capped_sanity';
    }

    // Get volume from intake (authoritative) or measurements
    let volumePerDay = 20; // Default
    if (intake?.section_b_volume_timing?.q06_runs_per_period) {
      const intakeVolume = Number.parseFloat(intake.section_b_volume_timing.q06_runs_per_period);
      const periodUnit = intake.section_b_volume_timing.q06_period_unit || 'day';

      if (!isNaN(intakeVolume) && intakeVolume > 0) {
        // Normalize to per-day
        switch (periodUnit) {
          case 'day': {
            volumePerDay = intakeVolume;
        
            break;
          }

          case 'week': {
            volumePerDay = intakeVolume / 5; // 5 working days
        
            break;
          }

          case 'month': {
            volumePerDay = intakeVolume / 22; // 22 working days
        
            break;
          }

          default: {
            volumePerDay = intakeVolume;
          }
        }

        this.log(`  [DETERMINISTIC] Using intake volume: ${intakeVolume}/${periodUnit} = ${volumePerDay.toFixed(1)}/day`);
      }
    }

    const hourlyRate = hourlyRateAssumption?.value || 75;  // $/hr
    const daysPerMonth = daysAssumption?.value || 22;  // working days

    // SCHEMA VALIDATION GATE - Would have caught $10.7M bug
    // NOTE: throwOnError is now environment-based (strict in production)
    try {
      validateBleedInputsGate({
        volume_per_day: volumePerDay,
        days_per_month: daysPerMonth,
        minutes_per_item: timePerItemMinutes,
        hourly_rate: hourlyRate
      }, { logWarnings: true });  // throwOnError defaults to env-based
    } catch (validationError) {
      this.log(`  [VALIDATION ERROR] ${validationError.message}`);
      throw validationError;  // Re-throw in production, caught by pipeline
    }

    // DETERMINISTIC CALCULATION:
    // Monthly hours = (volume_per_day × days_per_month × minutes_per_item) / 60
    // Monthly bleed = monthly_hours × hourly_rate
    const monthlyMinutes = volumePerDay * daysPerMonth * timePerItemMinutes;
    const monthlyHours = monthlyMinutes / 60;
    const monthlyBleed = Math.round(monthlyHours * hourlyRate);

    // Log the calculation for transparency
    this.log(`  [DETERMINISTIC] Bleed calculation (source: ${timeSource}):`);
    this.log(`    Volume: ${volumePerDay.toFixed(1)}/day × ${daysPerMonth} days × ${timePerItemMinutes} min = ${monthlyMinutes.toFixed(0)} min/mo`);
    this.log(`    Hours: ${monthlyMinutes.toFixed(0)} ÷ 60 = ${monthlyHours.toFixed(1)} hrs/mo`);
    this.log(`    Bleed: ${monthlyHours.toFixed(1)} × $${hourlyRate}/hr = $${monthlyBleed.toLocaleString()}/mo`);

    // Check if LLM got it wrong
    const llmBleed = result.bleed_total?.value || 0;
    if (Math.abs(llmBleed - monthlyBleed) > monthlyBleed * 0.1) { // More than 10% different
      this.log(`  [WARNING] LLM calculated $${llmBleed.toLocaleString()}, deterministic = $${monthlyBleed.toLocaleString()}`);
    }

    // Override LLM calculations with deterministic values
    result.bleed_calculations = [{
      id: 'c_manual_effort_cost',
      label: 'Monthly Manual Effort Cost',
      formula: `(${volumePerDay.toFixed(0)}/day × ${daysPerMonth} days × ${timePerItemMinutes} min) ÷ 60 × $${hourlyRate}/hr`,
      formula_display: `${volumePerDay.toFixed(0)} × ${daysPerMonth} × ${timePerItemMinutes} ÷ 60 × $${hourlyRate}`,
      inputs: ['volume', 'days_per_month', 'time_per_item', 'hourly_rate'],
      result: monthlyBleed,
      result_display: `$${monthlyBleed.toLocaleString()}`,
      calculation_method: 'deterministic_js',
      time_source: timeSource
    }];

    result.bleed_total = {
      value: monthlyBleed,
      currency: 'USD',
      period: 'month',
      display: `$${monthlyBleed.toLocaleString()}/mo`,
      calculation_method: 'deterministic_js'
    };

    return result;
  }

  /**
   * Get extraction stats
   */
  getStats() {
    return { ...this.stats };
  }
}

export default { Extractor };
