/**
 * Data Provenance Tracking Module
 *
 * Provides audit trail for fallback values, defaults, and data mutations.
 * Helps debug where values came from when troubleshooting pipeline outputs.
 *
 * @module lib/provenance
 */

/**
 * Provenance entry types
 */
export const ProvenanceType = {
  FALLBACK: 'fallback',     // Value came from a fallback source
  DEFAULT: 'default',       // Value is a hardcoded default
  CLAMPED: 'clamped',       // Value was clamped to a range
  INFERRED: 'inferred',     // Value was inferred/calculated
  NORMALIZED: 'normalized', // Value was normalized/transformed
  EXTRACTED: 'extracted'    // Value came from real data
};

/**
 * Confidence levels for provenance
 */
export const Confidence = {
  HIGH: 'high',       // Direct extraction from input
  MEDIUM: 'medium',   // Inferred from related data
  LOW: 'low'          // Default or fallback value
};

/**
 * Create a provenance record for a field
 * @param {string} field - Field name
 * @param {*} value - Final value used
 * @param {string} source - Where value came from
 * @param {string} type - ProvenanceType
 * @param {string} confidence - Confidence level
 * @param {object} context - Additional context
 * @returns {object} Provenance record
 */
export function createProvenance(field, value, source, type, confidence, context = {}) {
  return {
    field,
    value,
    source,
    type,
    confidence,
    timestamp: new Date().toISOString(),
    ...context
  };
}

/**
 * Track a fallback decision
 * @param {string} field - Field being resolved
 * @param {Array<{source: string, value: any, success: boolean}>} attempts - Ordered list of attempts
 * @returns {object} Provenance with attempt chain
 */
export function trackFallbackChain(field, attempts) {
  const successful = attempts.find(a => a.success);
  const failedAttempts = attempts.filter(a => !a.success).map(a => a.source);

  return createProvenance(
    field,
    successful?.value,
    successful?.source || 'unknown',
    ProvenanceType.FALLBACK,
    successful ? (failedAttempts.length === 0 ? Confidence.HIGH : Confidence.MEDIUM) : Confidence.LOW,
    {
      attempted_sources: attempts.map(a => a.source),
      failed_sources: failedAttempts,
      priority_used: attempts.findIndex(a => a.success) + 1
    }
  );
}

/**
 * Track a default value being used
 * @param {string} field - Field name
 * @param {*} defaultValue - Default value used
 * @param {string} reason - Why default was needed
 * @returns {object} Provenance record
 */
export function trackDefault(field, defaultValue, reason = 'value was null or undefined') {
  return createProvenance(
    field,
    defaultValue,
    'hardcoded_default',
    ProvenanceType.DEFAULT,
    Confidence.LOW,
    { reason }
  );
}

/**
 * Track a value being clamped to a range
 * @param {string} field - Field name
 * @param {number} original - Original value
 * @param {number} clamped - Clamped value
 * @param {number} min - Minimum allowed
 * @param {number} max - Maximum allowed
 * @returns {object} Provenance record
 */
export function trackClamped(field, original, clamped, min, max) {
  const direction = original < min ? 'below_min' : 'above_max';
  return createProvenance(
    field,
    clamped,
    'range_clamping',
    ProvenanceType.CLAMPED,
    Confidence.MEDIUM,
    {
      original_value: original,
      clamped_to: clamped,
      range: { min, max },
      direction
    }
  );
}

/**
 * Track extracted real data
 * @param {string} field - Field name
 * @param {*} value - Extracted value
 * @param {string} source - Extraction source (e.g., 'llm_extract', 'intake_form')
 * @returns {object} Provenance record
 */
export function trackExtracted(field, value, source) {
  return createProvenance(
    field,
    value,
    source,
    ProvenanceType.EXTRACTED,
    Confidence.HIGH
  );
}

/**
 * Collector class for accumulating provenance records during pipeline execution
 */
export class ProvenanceCollector {
  constructor() {
    this.records = [];
    this.fieldMap = new Map(); // Latest record per field
  }

  /**
   * Add a provenance record
   * @param {object} record - Provenance record
   */
  add(record) {
    this.records.push(record);
    this.fieldMap.set(record.field, record);
  }

  /**
   * Record a fallback chain for a field
   */
  fallback(field, attempts) {
    this.add(trackFallbackChain(field, attempts));
  }

  /**
   * Record a default being used
   */
  default(field, value, reason) {
    this.add(trackDefault(field, value, reason));
  }

  /**
   * Record a clamped value
   */
  clamped(field, original, clamped, min, max) {
    this.add(trackClamped(field, original, clamped, min, max));
  }

  /**
   * Record extracted data
   */
  extracted(field, value, source) {
    this.add(trackExtracted(field, value, source));
  }

  /**
   * Get all low-confidence fields
   * @returns {object[]} Records with low confidence
   */
  getLowConfidenceFields() {
    return this.records.filter(r => r.confidence === Confidence.LOW);
  }

  /**
   * Get summary statistics
   * @returns {object} Summary of provenance records
   */
  getSummary() {
    const byType = {};
    const byConfidence = {};

    for (const record of this.records) {
      byType[record.type] = (byType[record.type] || 0) + 1;
      byConfidence[record.confidence] = (byConfidence[record.confidence] || 0) + 1;
    }

    return {
      total_records: this.records.length,
      by_type: byType,
      by_confidence: byConfidence,
      low_confidence_fields: this.getLowConfidenceFields().map(r => r.field)
    };
  }

  /**
   * Export all records
   * @returns {object[]} All provenance records
   */
  export() {
    return [...this.records];
  }

  /**
   * Get provenance for a specific field
   * @param {string} field - Field name
   * @returns {object|undefined} Latest provenance record for field
   */
  getField(field) {
    return this.fieldMap.get(field);
  }

  /**
   * Clear all records
   */
  clear() {
    this.records = [];
    this.fieldMap.clear();
  }
}

/**
 * Global provenance collector instance for pipeline execution
 */
let globalCollector = new ProvenanceCollector();

/**
 * Get the global provenance collector
 * @returns {ProvenanceCollector}
 */
export function getCollector() {
  return globalCollector;
}

/**
 * Reset the global collector (call at start of new pipeline run)
 */
export function resetCollector() {
  globalCollector = new ProvenanceCollector();
  return globalCollector;
}

export default {
  ProvenanceType,
  Confidence,
  createProvenance,
  trackFallbackChain,
  trackDefault,
  trackClamped,
  trackExtracted,
  ProvenanceCollector,
  getCollector,
  resetCollector
};
