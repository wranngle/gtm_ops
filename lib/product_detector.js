/**
 * Product Detector - Detects AI Voice Agent vs. Project-Based Intakes
 *
 * Analyzes intake data for voice agent keywords and returns classification.
 * Used by the pipeline to route to product-specific pricing and narratives.
 */

// Voice agent keyword patterns (aligned with sales_strategy.json context)
const VOICE_AGENT_KEYWORDS = {
  // Primary indicators (high confidence) - score: 10 points each
  primary: [
    'voice agent', 'ai voice', 'voice ai', 'virtual receptionist',
    '24/7 receptionist', 'after-hours', 'after hours', 'afterhours',
    'missed call', 'missed calls', 'phone automation',
    'call handling', 'inbound call', 'call answering',
    'ai receptionist', 'phone agent', 'call agent',
    'never miss a call', 'answer every call'
  ],
  // Secondary indicators (medium confidence) - score: 3 points each
  secondary: [
    'phone', 'call', 'calls', 'voicemail', 'ivr', 'pbx',
    'twilio', 'ringcentral', 'vonage', 'plivo', 'weave',
    'receptionist', 'emergency calls', 'lead capture',
    'inbound', 'outbound', 'caller', 'dispatch',
    'appointment booking', 'scheduling calls'
  ],
  // Industry context boosters - score: 2 points each
  industry: [
    'hvac', 'plumbing', 'plumber', 'electrical', 'electrician',
    'trades', 'contractor', 'home services', 'emergency service',
    'dental', 'dentist', 'medical', 'clinic', 'practice',
    'property management', 'real estate', 'towing', 'locksmith'
  ]
};

// Detection threshold calibration
const DETECTION_THRESHOLD = 15; // Calibrated for high precision
const MAX_CONFIDENCE_SCORE = 30; // For normalization

/**
 * Build searchable text from all intake sections
 * @param {object} intake - Intake data object
 * @returns {string} Lowercase concatenated text
 */
function buildSearchableText(intake) {
  if (!intake) return '';
  return JSON.stringify(intake).toLowerCase();
}

/**
 * Count keyword matches in text
 * @param {string} text - Text to search
 * @param {string[]} keywords - Keywords to find
 * @returns {number} Count of matched keywords
 */
function countMatches(text, keywords) {
  return keywords.filter(kw => text.includes(kw.toLowerCase())).length;
}

/**
 * Extract matched keywords with their groups
 * @param {string} text - Text to search
 * @param {object} keywordGroups - Groups of keywords
 * @returns {Array} Matched keywords with group info
 */
function extractMatchedKeywords(text, keywordGroups) {
  const matched = [];
  for (const [group, keywords] of Object.entries(keywordGroups)) {
    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) {
        matched.push({ keyword: kw, group });
      }
    }
  }

  return matched;
}

/**
 * Detect if intake is for AI Voice Agent product
 * @param {object} intake - Extracted intake data
 * @returns {object} Classification result
 */
export function detectProductType(intake) {
  // Build searchable text from all intake sections
  const searchText = buildSearchableText(intake);

  // Score based on keyword matches
  const scores = {
    primary: countMatches(searchText, VOICE_AGENT_KEYWORDS.primary) * 10,
    secondary: countMatches(searchText, VOICE_AGENT_KEYWORDS.secondary) * 3,
    industry: countMatches(searchText, VOICE_AGENT_KEYWORDS.industry) * 2
  };

  const totalScore = scores.primary + scores.secondary + scores.industry;
  const isVoiceAgent = totalScore >= DETECTION_THRESHOLD;

  // Extract matched keywords for logging/debugging
  const matchedKeywords = extractMatchedKeywords(searchText, VOICE_AGENT_KEYWORDS);

  return {
    // Core classification
    project_type: isVoiceAgent ? 'voice_agent' : 'workflow_automation',
    is_product: isVoiceAgent,
    product_key: isVoiceAgent ? 'ai_voice_agent' : null,

    // Detection metadata
    confidence: Math.min(totalScore / MAX_CONFIDENCE_SCORE, 1), // Normalized 0-1
    raw_score: totalScore,
    threshold: DETECTION_THRESHOLD,
    scores,

    // Matched keywords (for logging)
    matched_keywords: matchedKeywords,
    matched_count: matchedKeywords.length,

    // Pricing model hint
    pricing_model: isVoiceAgent ? 'hybrid_product' : 'fixed_project',

    // Display values for templates
    project_type_display: isVoiceAgent ? 'AI Voice Agent' : 'Workflow Automation',
    confidence_display: `${Math.round(Math.min(totalScore / MAX_CONFIDENCE_SCORE, 1) * 100)}%`
  };
}

/**
 * Get the keyword configuration (for testing/debugging)
 * @returns {object} Keyword groups
 */
export function getKeywordConfig() {
  return { ...VOICE_AGENT_KEYWORDS };
}

export default { detectProductType, getKeywordConfig, VOICE_AGENT_KEYWORDS };
