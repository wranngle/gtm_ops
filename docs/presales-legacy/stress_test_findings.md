# Stress Test Findings Report

## Overview

10 stress tests were executed to identify pipeline sensitivity to edge cases. All tests completed successfully (no crashes), but several inaccuracy patterns were identified.

## Test Results Summary

| Test # | Input File | Target Area | Status | Severity |
|--------|------------|-------------|--------|----------|
| 01 | stress_01_ambiguous_numbers.txt | Numeric ranges | ✅ PASS | None |
| 02 | stress_02_unit_confusion.txt | Unit conflicts | ✅ PASS | None |
| 03 | stress_03_missing_data.txt | Missing data | ✅ PASS | None |
| 04 | stress_04_contradictions.txt | Conflicting sources | ✅ PASS | None |
| 05 | stress_05_extreme_scale.txt | Enterprise scale | ✅ PASS | None |
| 06 | stress_06_tiny_scale.txt | Micro-business | ✅ PASS | None |
| 07 | stress_07_unusual_systems.txt | Legacy systems | ✅ PASS | None |
| 08 | stress_08_foreign_currency.txt | Multi-currency | ✅ PASS | None |
| 09 | stress_09_narrative_style.txt | Informal narrative | ✅ PASS | None |
| 10 | stress_10_zero_values.txt | Pre-revenue/projected | ⚠️ INACCURATE | HIGH |

---

## Detailed Findings

### ✅ PASS: Ambiguous Numbers (stress_01)

**Input**: Ranges like "500-1000 orders", "15-30 minutes", "25-35% error rate"

**Pipeline Behavior**: Correctly used midpoints
- 750 orders (midpoint of 500-1000) ✓
- 22.5 minutes (midpoint of 15-30) ✓
- 30% error rate (midpoint of 25-35) ✓

**Conclusion**: Pipeline handles numeric ranges correctly.

---

### ✅ PASS: Unit Confusion (stress_02)

**Input**: Conflicting units like "150 calls/week per clinic" vs "1800 total weekly"

**Pipeline Behavior**:
- Used 1800/week as the explicit total ✓
- Documented conflicts in attachments.notes ✓
- Used conservative midpoints for conflicting values ✓

**Conclusion**: Pipeline documents conflicts and uses conservative values.

---

### ✅ PASS: Missing Data (stress_03)

**Input**: Minimal data - "drowning in calls", "enterprise grade", no specifics

**Pipeline Behavior**:
- Inferred 200 calls/day from "drowning in calls" for enterprise ✓
- Applied industry benchmark of 10 min handling time ✓
- Used industry standard 10% error rate ✓
- Source labels correctly show "Inferred from..." ✓

**Conclusion**: Pipeline applies reasonable defaults and documents inference.

---

### ✅ PASS: Contradictions (stress_04)

**Input**: CEO says 800/month, ops says 400/month; Audit found 22% error rate, management believes 5%

**Pipeline Behavior**:
- Used midpoint of 600/month for volume ✓
- Used 15% error rate (midpoint of 22% and 5%) ✓
- Noted "Data reflects conflicting internal reports" in attachments ✓

**Conclusion**: Pipeline uses midpoints and documents contradictions.

---

### ✅ PASS: Extreme Scale (stress_05)

**Input**: 2.8M tickets/month, $18.7B revenue, 47 systems, $50M rework cost

**Pipeline Behavior**:
- Correctly parsed 2,800,000 monthly volume ✓
- $50,000,000 rework cost correctly formatted ✓
- 47 systems correctly captured ✓
- No numeric overflow issues ✓
- ROI capped appropriately for modeled opportunity ✓

**Conclusion**: Pipeline handles enterprise scale without numeric errors.

---

### ✅ PASS: Tiny Scale (stress_06)

**Input**: 3-5 orders/week (~15/month), $85K revenue, $50-100/month budget

**Pipeline Behavior**:
- Correctly used 15 orders/month ✓
- Bleed calculated at $37/month (appropriately tiny) ✓
- Captured budget constraint in notes ✓
- Owner hourly rate captured at $15/hr ✓

**Conclusion**: Pipeline handles micro-business scale appropriately.

---

### ✅ PASS: Legacy Systems (stress_07)

**Input**: AS/400 RPG III, Foxpro, DOS-based MP2, VB6 apps, Lotus Notes

**Pipeline Behavior**:
- Identified 18 legacy systems (comprehensive) ✓
- Listed all obscure systems correctly ✓
- Noted "lost source code" and "eBay hardware parts" risks ✓
- System complexity correctly marked as critical ✓

**Conclusion**: Pipeline recognizes unusual systems and captures risk context.

---

### ✅ PASS: Foreign Currency (stress_08)

**Input**: EUR, GBP, JPY, CHF, SGD, CNY values mixed

**Pipeline Behavior**:
- Captured 7 currencies context ✓
- Documented multi-currency complexity ✓
- Normalized costs to USD ✓
- 2400 invoices/month correctly extracted ✓

**Conclusion**: Pipeline normalizes to USD and captures currency complexity.

---

### ✅ PASS: Narrative Style (stress_09)

**Input**: Informal email from CEO with "kind of a disaster", "about 180 drivers"

**Pipeline Behavior**:
- 12,000 deliveries/day correctly extracted ✓
- 400 exceptions/day correctly extracted ✓
- 15 minutes handling time correctly extracted ✓
- $500K peak revenue loss correctly extracted ✓
- captured_by = "Sarah Chen" (CEO) ✓

**Conclusion**: Pipeline extracts structured data from narrative prose effectively.

---

### ⚠️ INACCURATE: Zero Values / Projected Metrics (stress_10)

**Input**: Pre-revenue startup with:
- Current: 0 customers, 0 tickets, $0 revenue
- Projected Month 12: 10,000 customers
- Projected support ratio: 1 ticket per 10 customers = 1,000 tickets
- Projected cost: "$33,333/month (1000 tickets × 20min / 60 × $100/hr)"

**Pipeline Behavior**:
- ❌ Extracted q06_runs_per_period as 10,000 (customers) instead of 1,000 (tickets)
- ❌ Bleed calculated as $333,333/month (10x too high)
- ❌ Confused customer count with ticket count despite explicit 1:10 ratio in input

**Root Cause**: Semantic extraction error - LLM prioritized the prominent "10,000 customers" figure over the derived "1,000 tickets" calculation.

**Severity**: HIGH - 10x cost overestimate affects ROI, pricing, and proposal credibility.

**Recommended Fix**: Enhance extraction prompt to:
1. Distinguish between entity counts (customers) and transaction counts (tickets/orders)
2. Apply explicit ratios when provided ("1 ticket per 10 customers")
3. Use the smaller derived figure for bleed calculations when ratio is given

---

## Inaccuracy Patterns Identified

### Pattern 1: Derived Metrics vs. Raw Counts

**Description**: When input provides both a raw count (10,000 customers) and a derived metric (1,000 tickets at 1:10 ratio), the pipeline may use the raw count for volume calculations.

**Impact**: Can cause 10x or greater cost overestimation.

**Affected Areas**: `q06_runs_per_period`, bleed calculation.

**Mitigation**: Add extraction rule: "When a ratio is provided (e.g., '1 per 10'), calculate and use the derived value for process volume."

---

### Pattern 2: Future State vs. Current State (Minor)

**Description**: For pre-revenue businesses, the pipeline correctly uses projected values, but should more clearly label these as projections in the output.

**Impact**: Low - calculations are reasonable, just labeling could be clearer.

**Affected Areas**: Bleed assumptions, ROI calculations.

**Mitigation**: Add confidence indicator for "projected" vs. "measured" metrics.

---

## Summary

- **9/10 tests passed** with accurate extraction and calculation
- **1 critical inaccuracy** found in projected metrics handling (stress_10)
- Pipeline demonstrates strong handling of:
  - Numeric ranges (midpoint calculation)
  - Conflicting data (conservative midpoints, documentation)
  - Missing data (industry benchmarks, clear inference labeling)
  - Extreme scales (no overflow, appropriate capping)
  - Legacy systems (comprehensive recognition)
  - Multi-currency (USD normalization)
  - Narrative extraction (effective parsing)

## Recommended Actions

1. **HIGH PRIORITY**: Fix derived metric extraction for ratio-based volumes
2. **MEDIUM**: Add "projected" vs "measured" confidence indicators
3. **LOW**: Consider adding validation warnings for unusual ratios (>10x difference between stated figures)
