/**
 * Case Study Harvester - Extract case studies from web pages
 * @module lib/evaluation/harvester
 *
 * Semi-automated harvesting workflow:
 * 1. Human identifies case study URL
 * 2. Harvester fetches page content
 * 3. LLM extracts PROBLEM/SOLUTION structure
 * 4. Human reviews and approves
 * 5. System stores in corpus
 */

import { generateCaseStudyId } from '../schemas/case_study.schema.ts';
import { createCaseStudy } from './corpus.js';

// =============================================================================
// Extraction Prompt
// =============================================================================

const EXTRACTION_PROMPT = `You are extracting structured data from an AI voice agent case study.

Extract the following information, being as specific and quantitative as possible.

## PROBLEM (What the client faced BEFORE the solution)

- **Industry**: The business sector (e.g., "dental", "real estate", "insurance")
- **Company Size**: Number of employees, revenue, or descriptive size (e.g., "45 employees", "mid-market")
- **Company Type**: Specific business type (e.g., "veterinary clinic", "auto dealership")
- **Pain Points**: List of specific problems, quantified where possible (e.g., "80+ calls/day handled manually", "22% no-show rate")
- **Volume Metrics**: Any numbers about volume (calls/month, hours spent, items processed)
- **Systems Involved**: Software/tools they were already using
- **Goals**: What they wanted to achieve

## SOLUTION (What was implemented)

- **Agent Type**: "inbound", "outbound", or "hybrid"
- **Voice Provider**: If mentioned (e.g., "ElevenLabs", "PlayHT", "Deepgram")
- **Integrations**: Systems connected to the AI agent
- **Pricing Model**: If disclosed (setup cost, monthly cost, per-minute rate)
- **Timeline**: How long implementation took (in weeks)
- **ROI Achieved**: Quantified results (hours saved, cost savings, conversion improvements)
- **Key Features**: Main capabilities of the solution

## Output Format

Return a JSON object with this exact structure:
{
  "problem": {
    "industry": "string",
    "company_size": "string or null",
    "company_type": "string or null",
    "pain_points": ["array of strings"],
    "volume_metrics": {
      "calls_per_month": number or null,
      "calls_per_day": number or null,
      "avg_call_duration_minutes": number or null,
      "staff_hours_per_month": number or null,
      "raw_description": "string if numbers not extractable"
    },
    "systems_involved": ["array of strings"],
    "goals": ["array of strings"]
  },
  "solution": {
    "agent_type": "inbound" | "outbound" | "hybrid",
    "voice_provider": "string or null",
    "integrations": [
      { "system_name": "string", "integration_type": "api|webhook|native|unknown", "purpose": "string" }
    ],
    "pricing_model": {
      "model_type": "one_time|monthly|per_minute|hybrid|unknown",
      "total_cost": number or null,
      "monthly_cost": number or null,
      "setup_cost": number or null,
      "raw_description": "string if structured pricing not available"
    },
    "timeline_weeks": number or null,
    "roi_achieved": {
      "hours_saved_per_month": number or null,
      "calls_automated_percent": number or null,
      "monthly_savings": number or null,
      "annual_savings": number or null,
      "raw_description": "string if structured metrics not available"
    },
    "key_features": ["array of strings"],
    "inferred_tier": "lite|standard|enterprise|flagship"
  },
  "meta": {
    "quality_score": 1-5 (1=minimal info, 5=highly detailed),
    "quality_notes": "explanation of score",
    "domain_tags": ["relevant tags from: dental, medical, veterinary, real-estate, insurance, automotive, home-services, hospitality, retail, financial-services, legal, education, scheduling, lead-qualification, customer-support, collections, surveys, appointment-reminders, after-hours"]
  }
}

IMPORTANT:
- Extract ONLY factual information from the text
- Do NOT include marketing language or superlatives
- If information is not available, use null
- Quantify everything possible (convert "hundreds" to approximate numbers)
- For inferred_tier: lite=simple single integration, standard=2-4 integrations, enterprise=5+ integrations or complex workflows, flagship=custom AI/ML components
`;

// =============================================================================
// Vendor Detection
// =============================================================================

/**
 * Known vendor URL patterns
 */
const VENDOR_PATTERNS = {
  vapi: ['vapi.ai', 'getvapi.com'],
  retell: ['retellai.com', 'retell.ai'],
  bland: ['bland.ai'],
  synthflow: ['synthflow.ai'],
  air: ['air.ai'],
  playht: ['play.ht', 'playht.com'],
  voiceflow: ['voiceflow.com'],
  elevenlabs: ['elevenlabs.io'],
};

/**
 * Detect vendor from URL
 */
export function detectVendor(url) {
  const urlLower = url.toLowerCase();

  for (const [vendor, patterns] of Object.entries(VENDOR_PATTERNS)) {
    for (const pattern of patterns) {
      if (urlLower.includes(pattern)) {
        return vendor;
      }
    }
  }

  return 'other';
}

// =============================================================================
// Content Fetching
// =============================================================================

/**
 * Fetch page content (placeholder - integrate with actual fetch)
 *
 * In production, this would use:
 * - WebFetch MCP tool
 * - Puppeteer for JS-rendered pages
 * - API calls for structured data sources
 */
async function fetchPageContent(_url) {
  // For now, this is a placeholder that requires manual content input
  // In production, integrate with WebFetch or similar

  throw new Error(
    'Automatic fetching not implemented. Please provide page content manually via harvestFromContent().'
  );
}

// =============================================================================
// LLM Extraction
// =============================================================================

/**
 * Extract case study structure from text using LLM
 *
 * @param {string} content - Page content (text/markdown)
 * @param {object} options - Extraction options
 * @returns {object} Extracted PROBLEM/SOLUTION structure
 */
async function extractWithLLM(content, options = {}) {
  const { maxRetries = 2 } = options;

  // Truncate very long content
  const truncatedContent = content.length > 15_000
    ? content.slice(0, 15_000) + '\n\n[Content truncated...]'
    : content;

  const prompt = `${EXTRACTION_PROMPT}\n\n---\n\nCASE STUDY CONTENT:\n\n${truncatedContent}`;

  // Use the project's LLM service
  try {
    const { LLMExecutor } = await import('../../src/services/llm.ts');

    const executor = new LLMExecutor({
      task: 'case-study-extraction',
      maxRetries,
    });

    const result = await executor.execute({
      prompt,
      responseFormat: 'json',
      temperature: 0.1, // Low temperature for consistent extraction
    });

    // Parse JSON from response
    const jsonMatch = result.match(/{[\s\S]*}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in LLM response');
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    // Fallback: return structure with raw content for manual extraction
    console.warn(`LLM extraction failed: ${error.message}`);
    console.warn('Returning template for manual extraction');

    return {
      problem: {
        industry: 'MANUAL_ENTRY_REQUIRED',
        company_size: null,
        company_type: null,
        pain_points: ['EXTRACT FROM: ' + content.slice(0, 200)],
        volume_metrics: { raw_description: 'MANUAL_ENTRY_REQUIRED' },
        systems_involved: [],
        goals: ['MANUAL_ENTRY_REQUIRED'],
      },
      solution: {
        agent_type: 'hybrid',
        voice_provider: null,
        integrations: [],
        pricing_model: { model_type: 'unknown' },
        timeline_weeks: null,
        roi_achieved: { raw_description: 'MANUAL_ENTRY_REQUIRED' },
        key_features: [],
        inferred_tier: 'standard',
      },
      meta: {
        quality_score: 1,
        quality_notes: `LLM extraction failed: ${error.message}. Manual entry required.`,
        domain_tags: [],
      },
      _extraction_error: error.message,
    };
  }
}

// =============================================================================
// Harvesting Functions
// =============================================================================

/**
 * Harvest case study from URL
 *
 * @param {string} url - Case study URL
 * @param {object} options - Harvesting options
 * @returns {object} Harvested case study (not yet saved)
 */
export async function harvestFromUrl(url, options = {}) {
  const { autoSave = false } = options;

  // Detect vendor
  const vendor = detectVendor(url);

  // Fetch content
  const content = await fetchPageContent(url);

  // Extract structure
  const extracted = await extractWithLLM(content, options);

  // Build case study object
  const caseStudy = {
    source: {
      vendor,
      url,
      title: options.title || null,
    },
    problem: extracted.problem,
    solution: extracted.solution,
    meta: {
      ...extracted.meta,
      holdout: false,
      harvested_by: options.harvestedBy || 'harvester',
    },
  };

  if (autoSave) {
    return await createCaseStudy(caseStudy);
  }

  return {
    ...caseStudy,
    _preview: true,
    _extraction_error: extracted._extraction_error,
  };
}

/**
 * Harvest case study from pre-fetched content
 *
 * @param {string} content - Page content (text/markdown)
 * @param {object} sourceInfo - Source metadata
 * @param {object} options - Harvesting options
 * @returns {object} Harvested case study
 */
export async function harvestFromContent(content, sourceInfo, options = {}) {
  const { autoSave = false, id = null } = options;

  // Validate source info
  if (!sourceInfo.url) {
    throw new Error('Source URL is required');
  }

  const vendor = sourceInfo.vendor || detectVendor(sourceInfo.url);

  // Extract structure
  const extracted = await extractWithLLM(content, options);

  // Build case study object
  const caseStudy = {
    id: id || generateCaseStudyId(vendor, extracted.problem?.industry || 'unknown', Date.now() % 1000),
    source: {
      vendor,
      url: sourceInfo.url,
      title: sourceInfo.title || null,
      published_date: sourceInfo.published_date || null,
    },
    problem: extracted.problem,
    solution: extracted.solution,
    meta: {
      ...extracted.meta,
      holdout: options.holdout ?? false,
      harvested_by: options.harvestedBy || 'harvester',
    },
  };

  if (autoSave) {
    return await createCaseStudy(caseStudy);
  }

  return {
    ...caseStudy,
    _preview: true,
    _extraction_error: extracted._extraction_error,
  };
}

/**
 * Manually create a case study from structured data
 *
 * @param {object} data - Complete case study data
 * @returns {object} Created case study
 */
export async function createManualCaseStudy(data) {
  return await createCaseStudy(data);
}

// =============================================================================
// Batch Harvesting
// =============================================================================

/**
 * Harvest multiple case studies from URLs
 *
 * @param {Array} sources - Array of { url, title?, vendor? }
 * @param {object} options - Harvesting options
 * @returns {Array} Results for each URL
 */
export async function batchHarvest(sources, options = {}) {
  const results = [];

  for (const source of sources) {
    try {
      const result = await harvestFromUrl(source.url, {
        ...options,
        title: source.title,
      });
      results.push({
        url: source.url,
        success: true,
        case_study: result,
      });
    } catch (error) {
      results.push({
        url: source.url,
        success: false,
        error: error.message,
      });
    }
  }

  return results;
}

// =============================================================================
// Validation & Enrichment
// =============================================================================

/**
 * Validate extracted case study quality
 */
export function validateExtraction(caseStudy) {
  const issues = [];

  // Check problem completeness
  if (!caseStudy.problem?.industry || caseStudy.problem.industry === 'MANUAL_ENTRY_REQUIRED') {
    issues.push('Missing or invalid industry');
  }

  if (!caseStudy.problem?.pain_points?.length) {
    issues.push('No pain points extracted');
  }

  if (!caseStudy.problem?.goals?.length) {
    issues.push('No goals extracted');
  }

  // Check solution completeness
  if (!caseStudy.solution?.agent_type) {
    issues.push('Missing agent type');
  }

  if (!caseStudy.solution?.key_features?.length) {
    issues.push('No key features extracted');
  }

  // Check quality score validity
  const quality = caseStudy.meta?.quality_score;
  if (quality == null || quality < 1 || quality > 5) {
    issues.push('Invalid quality score');
  }

  return {
    valid: issues.length === 0,
    issues,
    quality_score: caseStudy.meta?.quality_score || 1,
  };
}

/**
 * Suggest improvements for low-quality extractions
 */
export function suggestImprovements(caseStudy) {
  const suggestions = [];
  const validation = validateExtraction(caseStudy);

  if (!validation.valid) {
    suggestions.push(...validation.issues.map((i) => `Fix: ${i}`));
  }

  // Quality-specific suggestions
  if (validation.quality_score < 3) {
    if (!caseStudy.problem?.volume_metrics?.calls_per_month) {
      suggestions.push('Add volume metrics (calls/month, hours spent)');
    }

    if (!caseStudy.solution?.pricing_model?.total_cost) {
      suggestions.push('Add pricing information if available');
    }

    if (!caseStudy.solution?.roi_achieved?.monthly_savings) {
      suggestions.push('Add ROI metrics if available');
    }
  }

  return suggestions;
}

// =============================================================================
// Exports
// =============================================================================

export default {
  harvestFromUrl,
  harvestFromContent,
  createManualCaseStudy,
  batchHarvest,
  validateExtraction,
  suggestImprovements,
  detectVendor,
};
