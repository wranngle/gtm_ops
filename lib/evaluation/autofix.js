/**
 * Evaluation Autofix - Apply deterministic corrections to pipeline output
 * based on detected flaws, then re-score.
 *
 * Flaw types and their fixes:
 * - MISSING_INTEGRATION: Add missing integrations to the pipeline output
 * - TIER_UNDERESTIMATE/OVERESTIMATE: Adjust tier key + recalculate hours/pricing
 * - PRICE_TOO_LOW/HIGH: Scale pricing to match expected range
 * - TIMELINE_OPTIMISTIC/PESSIMISTIC: Adjust timeline weeks
 * - FEATURE_GAP: Add missing features to proposal scope
 * - AGENT_TYPE_MISMATCH: Correct agent_type classification
 *
 * These fixes don't re-run the LLM. They patch the pipeline output
 * deterministically so the next eval pass can verify the fix worked.
 */

import { compare, detectFlaws } from './comparator.js';

const TIER_BASE_HOURS = {
  starter: 40,
  standard: 80,
  enterprise: 160,
  flagship: 320,
};

/**
 * Analyze flaws and produce remediation patches.
 * Returns patches that can be applied to pipeline output.
 */
export function diagnose(scores, _groundTruth) {
  const remediations = [];

  for (const dim of scores.dimensions || []) {
    const { dimension, details, score } = dim;
    if (score >= 0.8) continue; // Good enough, skip

    switch (dimension) {
      case 'tier_match': {
        if (details?.truth && details?.pipeline && details.pipeline !== details.truth) {
          remediations.push({
            flaw: score < 0.5 ? 'TIER_UNDERESTIMATE' : 'TIER_OVERESTIMATE',
            fix: 'patch_tier',
            target: details.truth,
            current: details.pipeline,
            description: `Tier ${details.pipeline} → ${details.truth}`,
          });
        }

        break;
      }

      case 'integration_coverage': {
        if (details?.missing?.length > 0) {
          remediations.push({
            flaw: 'MISSING_INTEGRATION',
            fix: 'add_integrations',
            missing: details.missing,
            description: `Add ${details.missing.length} missing: ${details.missing.join(', ')}`,
          });
        }

        break;
      }

      case 'pricing_reasonableness': {
        if (details?.direction && details?.pipeline && details?.truth) {
          remediations.push({
            flaw: details.direction === 'low' ? 'PRICE_TOO_LOW' : 'PRICE_TOO_HIGH',
            fix: 'adjust_price',
            current: details.pipeline,
            target: details.truth,
            direction: details.direction,
            description: `Price $${details.pipeline} → target $${details.truth}`,
          });
        }

        break;
      }

      case 'timeline_realism': {
        if (details?.direction && details?.pipeline && details?.truth) {
          remediations.push({
            flaw: details.direction === 'optimistic' ? 'TIMELINE_OPTIMISTIC' : 'TIMELINE_PESSIMISTIC',
            fix: 'adjust_timeline',
            current: details.pipeline,
            target: details.truth,
            description: `Timeline ${details.pipeline}w → ${details.truth}w`,
          });
        }

        break;
      }

      case 'agent_type_alignment': {
        if (score === 0 && details?.truth) {
          remediations.push({
            flaw: 'AGENT_TYPE_MISMATCH',
            fix: 'patch_agent_type',
            current: details.pipeline,
            target: details.truth,
            description: `Agent type ${details.pipeline} → ${details.truth}`,
          });
        }

        break;
      }

      case 'feature_coverage': {
        if (details?.missing?.length > 0) {
          remediations.push({
            flaw: 'FEATURE_GAP',
            fix: 'add_features',
            missing: details.missing,
            description: `Add ${details.missing.length} features: ${details.missing.slice(0, 3).join(', ')}${details.missing.length > 3 ? '...' : ''}`,
          });
        }

        break;
      }
    }
  }

  return remediations;
}

/**
 * Apply remediations to a pipeline output (deep clone, non-destructive).
 * Returns the patched output.
 */
export function applyFixes(pipelineOutput, remediations) {
  const output = JSON.parse(JSON.stringify(pipelineOutput));

  for (const rem of remediations) {
    switch (rem.fix) {
      case 'patch_tier': {
        // Patch tier in research and estimate
        if (output.research?.tier_assessment) {
          output.research.tier_assessment.key = rem.target;
          output.research.tier_assessment.label = rem.target.charAt(0).toUpperCase() + rem.target.slice(1);
          output.research.tier_assessment.baseHours = TIER_BASE_HOURS[rem.target] || output.research.tier_assessment.baseHours;
        }

        if (output.estimate?.effort) {
          output.estimate.effort.tier = rem.target;
        }

        break;
      }

      case 'add_integrations': {
        // Add missing integrations to the research array
        const integrations = output.research?.integrations || [];
        for (const name of rem.missing) {
          if (!integrations.some((i) => (i.name || i).toLowerCase() === name.toLowerCase())) {
            integrations.push({ name, complexity_score: 5, hours: 8, source: 'autofix' });
          }
        }

        if (output.research) output.research.integrations = integrations;
        break;
      }

      case 'adjust_price': {
        // Scale pricing toward target
        if (output.pricing) {
          const scale = rem.target / (rem.current || 1);
          if (output.pricing.total_price) output.pricing.total_price = Math.round(output.pricing.total_price * scale);
          if (output.pricing.base_price) output.pricing.base_price = Math.round(output.pricing.base_price * scale);
        }

        if (output.estimate?.pricing) {
          const scale = rem.target / (rem.current || 1);
          if (output.estimate.pricing.total) output.estimate.pricing.total = Math.round(output.estimate.pricing.total * scale);
        }

        break;
      }

      case 'adjust_timeline': {
        if (output.estimate) {
          output.estimate.timeline_weeks = rem.target;
        }

        if (output.milestones) {
          output.milestones.total_weeks = rem.target;
        }

        break;
      }

      case 'patch_agent_type': {
        output.agent_type = rem.target;
        if (output.intake?.classification) {
          output.intake.classification.agent_type = rem.target;
        }

        break;
      }

      case 'add_features': {
        // Add features to proposal scope
        output.proposal ||= {};
        if (!output.proposal.key_features) output.proposal.key_features = [];
        for (const feature of rem.missing) {
          if (!output.proposal.key_features.some((f) => f.toLowerCase() === feature.toLowerCase())) {
            output.proposal.key_features.push(feature);
          }
        }

        break;
      }
    }
  }

  return output;
}

/**
 * Run the full autofix cycle:
 * 1. Diagnose flaws from scores
 * 2. Apply fixes to pipeline output
 * 3. Re-score the patched output
 * 4. Return before/after comparison
 */
export function autofixAndRescore(pipelineOutput, groundTruth, scores, scoringConfig) {
  const remediations = diagnose(scores, groundTruth);

  if (remediations.length === 0) {
    return {
      applied: false,
      reason: 'No actionable remediations found',
      original_score: scores.aggregate_score,
      remediations: [],
    };
  }

  const patched = applyFixes(pipelineOutput, remediations);
  const newScores = compare(patched, groundTruth, scoringConfig);
  const newFlaws = detectFlaws(newScores);

  return {
    applied: true,
    original_score: scores.aggregate_score,
    fixed_score: newScores.aggregate_score,
    improvement: newScores.aggregate_score - scores.aggregate_score,
    remediations,
    remaining_flaws: newFlaws,
    patched_output: patched,
    new_scores: newScores,
  };
}

export default { diagnose, applyFixes, autofixAndRescore };
