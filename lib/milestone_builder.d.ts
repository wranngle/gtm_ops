/**
 * Build the complete phase structure for a proposal
 * @param {Object} auditData - Parsed audit report data
 * @param {Object} pricing - Pricing breakdown from pricing_calculator
 * @param {Object} options - Additional options
 * @returns {Array} Array of three phases
 */
export function buildPhases(auditData: Object, pricing: Object, options?: Object): any[];
/**
 * Build Phase 1: Audit (completed)
 */
export function buildPhase1Audit(auditData: any): {
    phase_id: string;
    phase_number: number;
    phase_name: string;
    state: string;
    description: string;
    milestones: {
        milestone_id: string;
        milestone_number: string;
        milestone_name: string;
        description: string;
        deliverables: {
            name: string;
            description: string;
        }[];
        duration: {
            value: any;
            unit: string;
            display: string;
        };
        price_allocation: {
            amount: number;
            currency: string;
            period: string;
            display: string;
        };
    }[];
};
/**
 * Build Phase 2: Stabilize (current proposal)
 */
export function buildPhase2Stabilize(auditData: any, pricing: any, options?: {}): {
    phase_id: string;
    phase_number: number;
    phase_name: string;
    state: string;
    description: string;
    milestones: {
        milestone_id: string;
        milestone_number: string;
        milestone_name: string;
        description: string;
        deliverables: {
            name: string;
            description: string;
            acceptance_criteria: string[];
        }[];
        duration: any;
        price_allocation: {
            amount: any;
            percentage: any;
            currency: string;
            period: string;
            display: string;
        };
    }[];
};
/**
 * Build Phase 3: Scale (future, optional)
 * This phase is intentionally marked as optional for upselling purposes
 */
export function buildPhase3Scale(auditData: any, options?: {}): {
    phase_id: string;
    phase_number: number;
    phase_name: string;
    phase_label: string;
    state: string;
    is_optional: boolean;
    optional_note: string;
    description: string;
    milestones: {
        milestone_id: string;
        milestone_number: string;
        milestone_name: string;
        description: string;
        deliverables: {
            name: string;
            description: string;
        }[];
    }[];
};
/**
 * Estimate milestone durations based on price
 */
export function estimateDurations(totalPrice: any, options?: {}): {
    total: {
        value: any;
        unit: any;
        display: string;
    };
    design: {
        value: any;
        unit: any;
        display: string;
    };
    build: {
        value: any;
        unit: any;
        display: string;
    };
    test: {
        value: any;
        unit: any;
        display: string;
    };
    deploy: {
        value: any;
        unit: any;
        display: string;
    };
};
/**
 * Format duration object
 */
export function formatDuration(value: any, unit: any): {
    value: any;
    unit: any;
    display: string;
};
/**
 * Calculate total duration from all milestones
 */
export function calculateTotalDuration(phases: any): {
    value: any;
    unit: any;
    display: string;
};
declare namespace _default {
    export { buildPhases };
    export { buildPhase1Audit };
    export { buildPhase2Stabilize };
    export { buildPhase3Scale };
    export { calculateTotalDuration };
    export { estimateDurations };
    export { formatDuration };
}
export default _default;
//# sourceMappingURL=milestone_builder.d.ts.map