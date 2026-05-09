// @ts-nocheck — migrated from .js (was checkJs:false); incremental tightening tracked separately.

/**
 * Final HTML LLM Pass
 * Reviews and corrects the complete HTML proposal for coherence and quality
 *
 * This is the final stage before PDF generation, ensuring the document
 * is polished and consistent throughout.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import Mustache from 'mustache';
import {
  MODEL_FALLBACK_ORDER,
  getNextFallbackModel,
  isRateLimitError,
  parseRetryAfter,
  GroqAdapter
} from '../src/services/llm.js';
import { ensureLoaded, getLegacyPromptRegistry } from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prompt registry loaded from SQLite (async init)
let PROMPT_REGISTRY = null;
let _initialized = false;

/**
 * Initialize prompt registry from SQLite
 */
export async function initHtmlPolish() {
  if (_initialized) return;
  await ensureLoaded();
  PROMPT_REGISTRY = await getLegacyPromptRegistry();
  _initialized = true;
}

/**
 * Run final HTML review pass
 * @param {string} htmlPath - Path to the rendered HTML file
 * @param {Object} context - Context with client info, pricing, etc.
 * @param {Object} options - Execution options
 * @returns {Promise<string>} Path to the corrected HTML file
 */
async function runFinalHtmlPass(htmlPath, context = {}, options = {}) {
  // Ensure prompt registry is loaded
  await initHtmlPolish();
  
  const useGroq = options.useGroq || false;
  const skipFinalPass = options.skipFinalPass || false;

  // Skip if explicitly disabled
  if (skipFinalPass) {
    console.log('  Final HTML pass skipped (--skip-final-pass)');
    return {
      htmlPath,
      changes: [{ type: 'skipped', reason: 'Final pass explicitly skipped' }],
      method: 'skipped'
    };
  }

  // Read the rendered HTML
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  // Skip LLM polish for large documents (>100KB) - use manual polish instead
  const MAX_LLM_POLISH_SIZE = 100 * 1024; // 100KB threshold
  if (htmlContent.length > MAX_LLM_POLISH_SIZE) {
    console.log(`  Document too large for LLM polish (${(htmlContent.length / 1024).toFixed(1)}KB > 100KB threshold)`);
    console.log('  Using manual polish for faster processing...');
    const { html: manuallyPolished, changes } = manualPolishHTML(htmlContent);
    fs.writeFileSync(htmlPath, manuallyPolished, 'utf8');
    return {
      htmlPath,
      changes,
      method: 'manual_size_threshold'
    };
  }

  // Get the final review prompt
  // Note: PROMPT_REGISTRY.prompts is an Object keyed by prompt_id, not an Array
  const prompts = PROMPT_REGISTRY?.prompts || {};
  const promptDef = prompts.final_html_review_v1 || Object.values(prompts).find(p => p?.prompt_id === 'final_html_review_v1');
  if (!promptDef) {
    console.warn('  Final HTML review prompt not found, using manual polish');
    const { html: manuallyPolished, changes } = manualPolishHTML(htmlContent);
    fs.writeFileSync(htmlPath, manuallyPolished, 'utf8');
    return {
      htmlPath,
      changes,
      method: 'manual'
    };
  }

  // Build context for the prompt
  const promptContext = {
    client_name: context.client_name || 'Client',
    total_price: context.total_price || '$0',
    platform: context.platform || 'direct',
    html_content: htmlContent
  };

  // Render the user prompt
  const userPrompt = Mustache.render(promptDef.user_prompt_template, promptContext);

  const inputTokensEst = Math.ceil(htmlContent.length / 4); // ~4 chars per token
  console.log('  Running final quality review...');
  console.log(`    Input: ${htmlContent.length} chars (~${inputTokensEst} tokens)`);
  const llmStartTime = Date.now();

  try {
    // Call LLM
    let correctedHtml;
    if (useGroq) {
      const adapter = new GroqAdapter({ apiKey: process.env.GROQ_API_KEY });
      correctedHtml = await adapter.generate(promptDef.system_prompt, userPrompt);
    } else {
      correctedHtml = await generateWithGemini(promptDef.system_prompt, userPrompt);
    }

    const llmDuration = Date.now() - llmStartTime;
    const outputChars = correctedHtml?.length || 0;
    console.log(`    LLM response: ${llmDuration}ms (${(llmDuration/1000).toFixed(1)}s)`);
    console.log(`    Output: ${outputChars} chars (input was ${htmlContent.length})`);

    // Debug: Check if content is exactly the same using hash
    const inputHash = crypto.createHash('md5').update(htmlContent).digest('hex').slice(0, 8);
    const outputHash = crypto.createHash('md5').update(correctedHtml).digest('hex').slice(0, 8);
    console.log(`    Hash comparison: input=${inputHash} output=${outputHash}`);

    if (correctedHtml === htmlContent) {
      console.warn('    ⚠️ LLM returned IDENTICAL content - no changes made');
      // Return with a note that no changes were needed
      return {
        htmlPath,
        changes: [{ type: 'no_changes_needed', reason: 'LLM determined document was already polished' }],
        method: 'llm_no_changes'
      };
    }

    if (correctedHtml.trim() === htmlContent.trim()) {
      console.warn('    ⚠️ LLM returned identical content (whitespace only diff)');
    } else {
      // Show first difference location
      let diffIndex = 0;
      for (let i = 0; i < Math.min(htmlContent.length, correctedHtml.length); i++) {
        if (htmlContent[i] !== correctedHtml[i]) {
          diffIndex = i;
          break;
        }
      }

      console.log(`    First difference at char ${diffIndex}:`);
      console.log(`      Original: "${htmlContent.slice(Math.max(0, diffIndex - 20), diffIndex + 40)}"`);
      console.log(`      Polished: "${correctedHtml.slice(Math.max(0, diffIndex - 20), diffIndex + 40)}"`);
    }

    // Validate the response is valid HTML
    if (!isValidHtml(correctedHtml)) {
      console.warn('  Final pass returned invalid HTML, keeping original');
      console.warn('  Response preview:', correctedHtml.slice(0, 200));
      // Return proper object instead of just path
      return {
        htmlPath,
        changes: [{ type: 'invalid_response', reason: 'LLM returned invalid HTML, keeping original' }],
        method: 'llm_rejected'
      };
    }

    // Check for forbidden phrases
    const hasForbidden = checkForbiddenPhrases(correctedHtml, promptDef.output_constraints?.forbidden_phrases);
    if (hasForbidden.length > 0) {
      console.warn(`  Warning: Final HTML contains forbidden phrases: ${hasForbidden.join(', ')}`);
    }

    // Count changes made (rough estimate based on length difference)
    const changePercent = Math.abs(correctedHtml.length - htmlContent.length) / htmlContent.length * 100;
    if (changePercent > 10) {
      console.warn(`  Warning: Final pass made significant changes (${changePercent.toFixed(1)}% difference)`);
      // If changes are too large, keep original (LLM might have hallucinated)
      if (changePercent > 25) {
        console.warn('  Changes too extensive, keeping original HTML');
        // Return proper object instead of just path
        return {
          htmlPath,
          changes: [{ type: 'excessive_changes', reason: `LLM made ${changePercent.toFixed(1)}% changes, rejecting to preserve original` }],
          method: 'llm_rejected'
        };
      }
    }

    // Write the corrected HTML back
    fs.writeFileSync(htmlPath, correctedHtml, 'utf8');

    // Summarize what changed
    const changes = summarizeHTMLChanges(htmlContent, correctedHtml);
    console.log(`  Final pass complete (${changePercent.toFixed(1)}% adjusted)`);

    return {
      htmlPath,
      changes,
      method: 'llm'
    };

  } catch (error) {
    console.error(`  Final HTML pass failed: ${error.message}`);
    console.log('  Falling back to manual polish...');

    // Use manual polish fallback
    const { html: manuallyPolished, changes } = manualPolishHTML(htmlContent);

    // Write the manually polished HTML back
    fs.writeFileSync(htmlPath, manuallyPolished, 'utf8');

    return {
      htmlPath,
      changes,
      method: 'manual'
    };
  }
}

/**
 * Generate with Gemini using streaming REST API for real-time observability
 */
async function generateWithGemini(systemPrompt, userPrompt, retries = 2) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not set');
  }

  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
  const body = {
    contents: [{ parts: [{ text: fullPrompt }] }],
    generationConfig: {
      maxOutputTokens: 65_000,
      temperature: 0.1
    }
  };

  let currentModel = MODEL_FALLBACK_ORDER[0];
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const apiVersion = 'v1beta';
      const baseUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models`;
      // Use streaming endpoint for real-time observability
      const url = `${baseUrl}/${currentModel}:streamGenerateContent?alt=sse&key=${apiKey}`;

      console.log(`    [LLM] Model: ${currentModel}, attempt ${attempt + 1}/${retries + 1} (streaming)`);
      const fetchStart = Date.now();

      // Activity-based timeout: abort if no data received for 45s (not hard overall timeout)
      // This prevents killing slow-but-working streaming requests
      const controller = new AbortController();
      const INACTIVITY_TIMEOUT_MS = 45_000; // 45 seconds of no activity = abort
      let activityTimeoutId = setTimeout(() => {
        console.log(`    [LLM] No activity for ${INACTIVITY_TIMEOUT_MS/1000}s, aborting...`);
        controller.abort();
      }, INACTIVITY_TIMEOUT_MS);

      // Helper to reset the activity timeout on each chunk received
      const resetActivityTimeout = () => {
        clearTimeout(activityTimeoutId);
        activityTimeoutId = setTimeout(() => {
          console.log(`    [LLM] No activity for ${INACTIVITY_TIMEOUT_MS/1000}s, aborting...`);
          controller.abort();
        }, INACTIVITY_TIMEOUT_MS);
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        clearTimeout(activityTimeoutId);
        const errorText = await response.text();
        console.log(`    [LLM] Error: ${response.status}`);
        throw new Error(`Gemini API error ${response.status}: ${errorText}`);
      }

      // Stream the response with progress updates
      let fullContent = '';
      let chunkCount = 0;
      let lastProgressLog = Date.now();
      const progressInterval = 5000; // Log progress every 5 seconds

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Reset activity timeout - we received data, connection is alive
        resetActivityTimeout();

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            if (jsonStr.trim() === '[DONE]') continue;

            try {
              const data = JSON.parse(jsonStr);
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
              if (text) {
                fullContent += text;
                chunkCount++;

                // Log progress periodically
                const now = Date.now();
                if (now - lastProgressLog >= progressInterval) {
                  const elapsed = ((now - fetchStart) / 1000).toFixed(1);
                  const tokensEst = Math.ceil(fullContent.length / 4);
                  console.log(`    [LLM] Streaming: ${elapsed}s, ~${tokensEst} tokens, ${chunkCount} chunks`);
                  lastProgressLog = now;
                }
              }
            } catch {
              // Skip malformed JSON chunks
            }
          }
        }
      }

      clearTimeout(activityTimeoutId);
      const fetchDuration = Date.now() - fetchStart;
      const outputTokensEst = Math.ceil(fullContent.length / 4);
      console.log(`    [LLM] Complete: ${(fetchDuration/1000).toFixed(1)}s, ~${outputTokensEst} tokens, ${chunkCount} chunks`);

      return extractHtml(fullContent);

    } catch (error) {
      lastError = error;

      if (error.name === 'AbortError') {
        console.log(`    [LLM] Timeout - no activity for 45s (connection stalled)`);
      }

      if (isRateLimitError(error)) {
        const nextModel = getNextFallbackModel(currentModel);
        if (nextModel) {
          console.log(`  Rate limit, falling back to ${nextModel}`);
          currentModel = nextModel;
          await sleep(2000);
          continue;
        }

        const retryAfter = parseRetryAfter(error);
        console.log(`  Rate limit, waiting ${Math.ceil(retryAfter / 1000)}s...`);
        await sleep(retryAfter);
        continue;
      }

      if (attempt < retries) {
        await sleep(5000 * (attempt + 1));
        continue;
      }

      break;
    }
  }

  throw lastError;
}

/**
 * Extract HTML from LLM response (handles markdown code blocks)
 */
function extractHtml(content) {
  // If wrapped in markdown code block, extract it
  const htmlMatch = content.match(/```html?\s*([\s\S]*?)```/);
  if (htmlMatch) {
    return htmlMatch[1].trim();
  }

  // If it starts with <!DOCTYPE or <html, use as-is
  if (content.trim().startsWith('<!DOCTYPE') || content.trim().startsWith('<html')) {
    return content.trim();
  }

  // Otherwise return as-is
  return content.trim();
}

/**
 * Basic HTML validation
 */
function isValidHtml(html) {
  // Must start with doctype or html tag
  const trimmed = html.trim().toLowerCase();
  if (!trimmed.startsWith('<!doctype') && !trimmed.startsWith('<html')) {
    return false;
  }

  // Must have closing html tag
  if (!trimmed.includes('</html>')) {
    return false;
  }

  // Must have body
  if (!trimmed.includes('<body') || !trimmed.includes('</body>')) {
    return false;
  }

  return true;
}

/**
 * Check for forbidden phrases
 */
function checkForbiddenPhrases(html, forbidden = []) {
  const found = [];
  const lowerHtml = html.toLowerCase();

  for (const phrase of forbidden) {
    if (lowerHtml.includes(phrase.toLowerCase())) {
      found.push(phrase);
    }
  }

  return found;
}

/**
 * Manual HTML polish fallback - applies deterministic fixes when LLM is unavailable
 * This ensures proposals are always polished even when API limits are hit
 * @param {string} html - The rendered HTML document
 * @returns {{html: string, changes: Array}} - Polished HTML and list of changes
 */
function manualPolishHTML(html) {
  const changes = [];
  let polished = html;

  // 1. Remove [INSUFFICIENT_EVIDENCE] markers and replace with sensible defaults
  const insufficientMatches = polished.match(/\[INSUFFICIENT_EVIDENCE[^\]]*]/g) || [];
  if (insufficientMatches.length > 0) {
    polished = polished.replaceAll(/\[INSUFFICIENT_EVIDENCE[^\]]*]/g, 'Data not available');
    changes.push({
      type: 'fix_insufficient_evidence',
      count: insufficientMatches.length,
      reason: `Replaced ${insufficientMatches.length} insufficient evidence markers with "Data not available"`
    });
  }

  // 2. Remove markdown code block markers
  const markdownMatches = polished.match(/```(?:json|html|text)?/g) || [];
  if (markdownMatches.length > 0) {
    polished = polished.replaceAll(/```(?:json|html|text)?/g, '');
    changes.push({
      type: 'remove_markdown',
      count: markdownMatches.length,
      reason: `Removed ${markdownMatches.length} markdown code block markers`
    });
  }

  // 3. Remove remaining [LLM_PLACEHOLDER: ...] markers with proposal-specific defaults
  const placeholderMatches = polished.match(/\[LLM_PLACEHOLDER:[^\]]+]/g) || [];
  if (placeholderMatches.length > 0) {
    polished = polished.replaceAll(/\[LLM_PLACEHOLDER:\s*([^\]]+)]/g, (match, field) => {
      // Proposal-specific defaults
      if (field.includes('executive_summary')) return 'This proposal outlines the implementation plan based on Phase 1 audit findings.';
      if (field.includes('value_proposition')) return 'Recover operational efficiency through targeted automation.';
      if (field.includes('milestone_description')) return 'Deliverables and implementation activities for this milestone.';
      if (field.includes('phase_description')) return 'Phase activities and expected outcomes.';
      if (field.includes('scope_in')) return 'Implementation of automation workflows as specified.';
      if (field.includes('scope_out')) return 'Items outside the defined project boundaries.';
      if (field.includes('assumption')) return 'Standard project assumptions apply.';
      if (field.includes('cta_headline')) return 'Ready to move forward?';
      if (field.includes('cta_subtext')) return 'Approve this proposal to begin implementation.';
      return 'See details above.';
    });
    changes.push({
      type: 'fix_placeholders',
      count: placeholderMatches.length,
      reason: `Replaced ${placeholderMatches.length} unfilled placeholders with default text`
    });
  }

  // 4. Clean up template variables like [specific data point]
  const templateVarMatches = polished.match(/\[(?:specific|start|end|missing|level|client|workflow)[^\]]*]/gi) || [];
  if (templateVarMatches.length > 0) {
    polished = polished
      .replaceAll(/\[specific data point]/gi, 'key metrics')
      .replaceAll(/\[start date]/gi, 'the project start date')
      .replaceAll(/\[end date]/gi, 'the project end date')
      .replaceAll(/\[missing period\/segment]/gi, 'certain time periods')
      .replaceAll(/\[specific data category]/gi, 'certain categories')
      .replaceAll(/\[level of detail]/gi, 'detailed')
      .replaceAll(/\[specific area of impact]/gi, 'specific areas')
      .replaceAll(/\[client name]/gi, 'the client')
      .replaceAll(/\[workflow name]/gi, 'the workflow');
    changes.push({
      type: 'fix_template_vars',
      count: templateVarMatches.length,
      reason: `Replaced ${templateVarMatches.length} template variables with readable text`
    });
  }

  // 5. Fix broken sentences (no ending punctuation)
  // Note: Skip header/title elements - they are intentionally without trailing periods
  // Use a pattern that captures the full opening tag to check for class names
  const brokenSentencePattern = /<(p|div|span|td)([^>]*)>([^<>]+[a-zA-Z])<\/\1>/g;
  let match;
  let brokenCount = 0;
  const originalPolished = polished;
  
  // Classes that should NOT get periods added (titles, headers, labels, values)
  const skipClasses = [
    'wrn-header-client', 'wrn-header-process', 'wrn-header-doc-title', 'wrn-header-friendly',
    'wrn-header-slug', 'wrn-header-meta', 'wrn-footer-slug', 'wrn-footer-copy',
    'section-header', 'doc-title', 'stat__label', 'stat__value', 'stat__note',
    'badge', 'pill', 'label', 'title', 'header', 'name', 'slug'
  ];
  
  while ((match = brokenSentencePattern.exec(originalPolished)) !== null) {
    const tagName = match[1];
    const attrs = match[2] || '';
    const text = match[3];
    
    // Extract class attribute if present
    const classMatch = attrs.match(/class="([^"]*)"/i);
    const classes = classMatch ? classMatch[1].toLowerCase() : '';
    
    // Skip if element has a title/header/label class
    const hasSkipClass = skipClasses.some(sc => classes.includes(sc));
    if (hasSkipClass) {
      continue;
    }
    
    // Skip if this looks like a project title (starts with "Operation" or similar title patterns)
    if (/^operation\s+\w+\s+\w+$/i.test(text)) {
      continue;
    }
    
    // Skip short text or text with existing punctuation
    if (text.length <= 20 || /[.!?:,]$/.test(text)) {
      continue;
    }
    
    // Skip if text looks like a title (Title Case with few words)
    const words = text.trim().split(/\s+/);
    if (words.length <= 6 && words.every(w => /^[A-Z\d]/.test(w) || /^(a|an|the|and|or|of|to|for|in|on|at|by|with)$/i.test(w))) {
      continue;
    }
    
    // Add period to actual sentences
    const fullMatch = match[0];
    const replacement = `<${tagName}${attrs}>${text}.</${tagName}>`;
    polished = polished.replace(fullMatch, replacement);
    brokenCount++;
  }

  if (brokenCount > 0) {
    changes.push({
      type: 'fix_punctuation',
      count: brokenCount,
      reason: `Added missing punctuation to ${brokenCount} sentences`
    });
  }

  // 6. Ensure no double spaces
  const doubleSpaces = (polished.match(/  +/g) || []).length;
  if (doubleSpaces > 10) {
    polished = polished.replaceAll(/  +/g, ' ');
    changes.push({
      type: 'fix_whitespace',
      count: doubleSpaces,
      reason: 'Normalized whitespace'
    });
  }

  if (changes.length === 0) {
    changes.push({
      type: 'no_changes',
      reason: 'HTML already clean, no manual fixes needed'
    });
  }

  console.log(`  Manual polish complete: ${changes.length} fixes applied`);
  for (const c of changes) console.log(`    - ${c.reason}`);

  return { html: polished, changes };
}

/**
 * Summarize changes between original and polished HTML
 * Returns a list of detected changes
 */
function summarizeHTMLChanges(original, polished) {
  const changes = [];

  // Check for [INSUFFICIENT_EVIDENCE] removal
  const insufficientBefore = (original.match(/\[INSUFFICIENT_EVIDENCE]/g) || []).length;
  const insufficientAfter = (polished.match(/\[INSUFFICIENT_EVIDENCE]/g) || []).length;
  if (insufficientBefore > insufficientAfter) {
    changes.push({
      type: 'fix_insufficient_evidence',
      count: insufficientBefore - insufficientAfter,
      reason: `Fixed ${insufficientBefore - insufficientAfter} insufficient evidence markers`
    });
  }

  // Check for markdown artifact removal
  const markdownBefore = (original.match(/```/g) || []).length;
  const markdownAfter = (polished.match(/```/g) || []).length;
  if (markdownBefore > markdownAfter) {
    changes.push({
      type: 'remove_markdown',
      count: markdownBefore - markdownAfter,
      reason: `Removed ${markdownBefore - markdownAfter} markdown code block markers`
    });
  }

  // Check for placeholder removal
  const placeholderBefore = (original.match(/\[LLM_PLACEHOLDER:/g) || []).length;
  const placeholderAfter = (polished.match(/\[LLM_PLACEHOLDER:/g) || []).length;
  if (placeholderBefore > placeholderAfter) {
    changes.push({
      type: 'fix_placeholders',
      count: placeholderBefore - placeholderAfter,
      reason: `Fixed ${placeholderBefore - placeholderAfter} unfilled placeholders`
    });
  }

  // Simple text length comparison
  const originalTextLength = original.replaceAll(/<[^>]*>/g, '').length;
  const polishedTextLength = polished.replaceAll(/<[^>]*>/g, '').length;
  const lengthDiff = Math.abs(polishedTextLength - originalTextLength);
  const lengthChangePercent = (lengthDiff / originalTextLength * 100).toFixed(1);

  if (lengthDiff > 50) {
    changes.push({
      type: 'text_rewrite',
      reason: `Text content changed by ${lengthChangePercent}% (${lengthDiff} characters)`
    });
  }

  // If no specific changes detected, note that polish ran
  if (changes.length === 0) {
    changes.push({
      type: 'minor_polish',
      reason: 'Minor text improvements applied'
    });
  }

  return changes;
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export {
  runFinalHtmlPass,
  manualPolishHTML,
  summarizeHTMLChanges,
  isValidHtml,
  checkForbiddenPhrases
};

export default {
  runFinalHtmlPass,
  manualPolishHTML,
  summarizeHTMLChanges,
  isValidHtml,
  checkForbiddenPhrases
};
