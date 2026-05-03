/**
 * Calculate total project price from audit findings
 * @param {Object} auditData - Parsed audit report data
 * @param {Object} options - Additional pricing options
 * @returns {Object} Pricing breakdown
 */
export function calculatePricing(auditData: Object, options?: Object): Object;
/**
 * Assess project complexity from audit data
 */
export function assessComplexity(auditData: any, options: any): {
    systems_count: any;
    integration_difficulty: number;
    data_sensitivity: any;
    timeline_pressure: any;
    client_readiness: any;
    industry: any;
};
/**
 * Enforce profit floor (minimum margin)
 * @param {number} basePrice - Original client-facing price
 * @param {number} internalCost - Total internal production cost
 * @param {Object} config - Pricing validation config
 * @returns {Object} Price adjustment with markup if needed
 */
export function enforceProfitFloor(basePrice: number, internalCost: number, config?: Object): Object;
/**
 * Calculate Hard Labor Savings from audit bleed data (Guaranteed/Bankable)
 * Uses audit-identified monthly bleed as the hard savings
 * @param {number} monthlyBleed - Monthly revenue bleed from audit
 * @returns {Object} Hard labor savings breakdown
 */
export function calculateHardLaborSavings(monthlyBleed: number): Object;
/**
 * Calculate Modeled Opportunity (Revenue Impact)
 * Conservative 1% conversion lift estimate - NOT guaranteed
 * @param {Object} config - Pricing validation config
 * @returns {Object} Modeled opportunity breakdown
 */
export function calculateModeledOpportunity(config?: Object): Object;
/**
 * Validate Hard Floor Rule
 * @param {number} projectPrice - Total project price
 * @param {number} annualLaborSavings - Year 1 hard labor savings
 * @param {Object} config - Pricing validation config
 * @returns {Object} Hard floor validation result
 */
export function validateHardFloorRule(projectPrice: number, annualLaborSavings: number, config?: Object): Object;
/**
 * Validate Payback Period
 * @param {number} projectPrice - Total project price
 * @param {number} totalMonthlyValue - Combined monthly value (hard + modeled)
 * @param {Object} config - Pricing validation config
 * @returns {Object} Payback validation result
 */
export function validatePayback(projectPrice: number, totalMonthlyValue: number, config?: Object): Object;
/**
 * Calculate ROI metrics with enterprise validation
 * Includes separated hard savings vs modeled opportunity (CFO-credible)
 * @param {number} monthlyBleed - Monthly revenue bleed from audit
 * @param {number} investmentTotal - Total project investment
 * @param {Object} options - Validation options
 * @returns {Object} Complete ROI with value breakdown and validation
 */
export function calculateROI(monthlyBleed: number, investmentTotal: number, options?: Object): Object;
/**
 * Format payback period for display
 */
export function formatPaybackPeriod(months: any): string;
/**
 * Get fixed package recommendation based on scope
 */
export function getPackageRecommendation(auditData: any): any;
declare namespace _default {
    export { calculatePricing };
    export { calculateROI };
    export { formatPaybackPeriod };
    export { getPackageRecommendation };
    export { assessComplexity };
    export { enforceProfitFloor };
    export { calculateHardLaborSavings };
    export { calculateModeledOpportunity };
    export { validateHardFloorRule };
    export { validatePayback };
}
export default _default;
//# sourceMappingURL=pricing_calculator.d.ts.map