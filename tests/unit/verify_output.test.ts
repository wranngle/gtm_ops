/**
 * Unit Tests for verify_output.js
 *
 * Tests schema validation logic:
 * - Undefined value detection
 * - Display field contract enforcement
 * - Data path validation
 */
import { describe, it, expect } from 'vitest';

// Re-implement core verification functions for testing
// (avoiding direct import of CLI-oriented script)

/**
 * Get nested value from object using dot notation path
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

/**
 * Check for undefined values in schema
 */
function checkUndefinedValues(schema: any, path = ''): string[] {
  const issues: string[] = [];

  function walk(obj: any, currentPath: string) {
    if (obj === undefined) {
      issues.push(currentPath);
      return;
    }
    if (obj === null || typeof obj !== 'object') return;

    for (const [key, value] of Object.entries(obj)) {
      const newPath = currentPath ? `${currentPath}.${key}` : key;
      if (value === undefined) {
        issues.push(newPath);
      } else if (typeof value === 'object' && value !== null) {
        walk(value, newPath);
      }
    }
  }

  walk(schema, path);
  return issues;
}

/**
 * Check display fields contract
 */
function checkDisplayFields(schema: any): Array<{ message: string }> {
  const requiredDisplayFields = [
    { numeric: 'estimate.finops.value_breakdown.total_annual_value', display: 'estimate.finops.value_breakdown.total_annual_display' },
    { numeric: 'estimate.finops.value_breakdown.total_monthly_value', display: 'estimate.finops.value_breakdown.total_monthly_display' },
  ];

  const issues: Array<{ message: string }> = [];

  for (const field of requiredDisplayFields) {
    const numericValue = getNestedValue(schema, field.numeric);
    const displayValue = getNestedValue(schema, field.display);

    if (numericValue !== undefined && displayValue === undefined) {
      issues.push({
        message: `Missing display field for ${field.numeric} (value: ${numericValue})`
      });
    }

    if (numericValue !== undefined && displayValue !== undefined) {
      const expectedDisplay = `$${numericValue.toLocaleString()}`;
      if (displayValue !== expectedDisplay) {
        issues.push({
          message: `Display mismatch: ${field.display} is "${displayValue}" but expected "${expectedDisplay}"`
        });
      }
    }
  }

  return issues;
}

describe('[P1] getNestedValue - Dot Notation Path Access', () => {
  it('[P1] should access top-level properties', () => {
    // GIVEN: Simple object
    const obj = { name: 'Test', value: 123 };

    // WHEN: Accessing top-level property
    const result = getNestedValue(obj, 'name');

    // THEN: Should return the value
    expect(result).toBe('Test');
  });

  it('[P1] should access nested properties', () => {
    // GIVEN: Nested object
    const obj = {
      estimate: {
        finops: {
          value_breakdown: {
            total_annual_value: 50000
          }
        }
      }
    };

    // WHEN: Accessing deeply nested property
    const result = getNestedValue(obj, 'estimate.finops.value_breakdown.total_annual_value');

    // THEN: Should return the value
    expect(result).toBe(50000);
  });

  it('[P1] should return undefined for missing paths', () => {
    // GIVEN: Object without the path
    const obj = { name: 'Test' };

    // WHEN: Accessing non-existent path
    const result = getNestedValue(obj, 'does.not.exist');

    // THEN: Should return undefined
    expect(result).toBeUndefined();
  });

  it('[P1] should handle null objects gracefully', () => {
    // GIVEN: Object with null in path
    const obj = { parent: null };

    // WHEN: Accessing through null
    const result = getNestedValue(obj, 'parent.child');

    // THEN: Should return undefined without throwing
    expect(result).toBeUndefined();
  });
});

describe('[P1] checkUndefinedValues - Schema Validation', () => {
  it('[P1] should find no issues in clean schema', () => {
    // GIVEN: Schema with no undefined values
    const schema = {
      name: 'Test',
      nested: {
        value: 123,
        array: [1, 2, 3]
      }
    };

    // WHEN: Checking for undefined values
    const issues = checkUndefinedValues(schema);

    // THEN: Should find no issues
    expect(issues).toHaveLength(0);
  });

  it('[P1] should detect top-level undefined', () => {
    // GIVEN: Schema with undefined value
    const schema = {
      name: 'Test',
      missing: undefined
    };

    // WHEN: Checking for undefined values
    const issues = checkUndefinedValues(schema);

    // THEN: Should find the undefined path
    expect(issues).toContain('missing');
  });

  it('[P1] should detect nested undefined', () => {
    // GIVEN: Schema with nested undefined
    const schema = {
      estimate: {
        finops: {
          value: undefined
        }
      }
    };

    // WHEN: Checking for undefined values
    const issues = checkUndefinedValues(schema);

    // THEN: Should find the full path
    expect(issues).toContain('estimate.finops.value');
  });

  it('[P1] should handle arrays correctly', () => {
    // GIVEN: Schema with array containing undefined
    const schema = {
      items: [
        { name: 'Item 1' },
        { name: undefined }
      ]
    };

    // WHEN: Checking for undefined values
    const issues = checkUndefinedValues(schema);

    // THEN: Should find the array index path
    expect(issues.some(i => i.includes('items'))).toBe(true);
  });
});

describe('[P0] checkDisplayFields - Display Field Contract', () => {
  it('[P0] should pass when display fields match numeric values', () => {
    // GIVEN: Schema with correct display fields
    const schema = {
      estimate: {
        finops: {
          value_breakdown: {
            total_annual_value: 50000,
            total_annual_display: '$50,000',
            total_monthly_value: 4167,
            total_monthly_display: '$4,167'
          }
        }
      }
    };

    // WHEN: Checking display fields
    const issues = checkDisplayFields(schema);

    // THEN: Should find no issues
    expect(issues).toHaveLength(0);
  });

  it('[P0] should detect missing display field', () => {
    // GIVEN: Schema with numeric but no display field
    const schema = {
      estimate: {
        finops: {
          value_breakdown: {
            total_annual_value: 50000
            // total_annual_display is missing
          }
        }
      }
    };

    // WHEN: Checking display fields
    const issues = checkDisplayFields(schema);

    // THEN: Should find the missing display field
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].message).toContain('Missing display field');
  });

  it('[P0] should detect display field mismatch', () => {
    // GIVEN: Schema with mismatched display value
    const schema = {
      estimate: {
        finops: {
          value_breakdown: {
            total_annual_value: 50000,
            total_annual_display: '$60,000', // Wrong value!
            total_monthly_value: 4167,
            total_monthly_display: '$4,167'
          }
        }
      }
    };

    // WHEN: Checking display fields
    const issues = checkDisplayFields(schema);

    // THEN: Should find the mismatch
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].message).toContain('Display mismatch');
  });

  it('[P1] should skip fields when numeric value is undefined', () => {
    // GIVEN: Schema without numeric values
    const schema = {
      estimate: {
        finops: {
          value_breakdown: {}
        }
      }
    };

    // WHEN: Checking display fields
    const issues = checkDisplayFields(schema);

    // THEN: Should not report issues for missing numeric values
    expect(issues).toHaveLength(0);
  });
});

describe('[P1] Data Path Validation', () => {
  /**
   * Check for common data path issues
   */
  function checkDataPaths(schema: any): string[] {
    const issues: string[] = [];

    // Client name should be populated
    const clientName = getNestedValue(schema, 'project_identity.client_name');
    if (!clientName || clientName === 'Unknown Client') {
      issues.push('Client name is missing or default');
    }

    // Process name should be populated
    const processName = getNestedValue(schema, 'project_identity.process_name');
    if (!processName || processName === 'Business Process') {
      issues.push('Process name is missing or default');
    }

    // ROI payback should be calculated
    const paybackMonths = getNestedValue(schema, 'proposal.roi.payback_period_months') ||
                          getNestedValue(schema, 'proposal.roi.payback_months');
    if (paybackMonths === undefined || paybackMonths === 'N/A') {
      issues.push('ROI payback period is missing or N/A');
    }

    return issues;
  }

  it('[P1] should pass for valid schema', () => {
    // GIVEN: Complete schema with all required fields
    const schema = {
      project_identity: {
        client_name: 'Bright Smile Dental',
        process_name: 'Patient Scheduling'
      },
      proposal: {
        roi: {
          payback_period_months: 3
        }
      }
    };

    // WHEN: Checking data paths
    const issues = checkDataPaths(schema);

    // THEN: Should find no issues
    expect(issues).toHaveLength(0);
  });

  it('[P1] should detect missing client name', () => {
    // GIVEN: Schema with missing client name
    const schema = {
      project_identity: {
        process_name: 'Patient Scheduling'
      },
      proposal: {
        roi: {
          payback_period_months: 3
        }
      }
    };

    // WHEN: Checking data paths
    const issues = checkDataPaths(schema);

    // THEN: Should find client name issue
    expect(issues).toContain('Client name is missing or default');
  });

  it('[P1] should detect Unknown Client placeholder', () => {
    // GIVEN: Schema with placeholder client name
    const schema = {
      project_identity: {
        client_name: 'Unknown Client',
        process_name: 'Patient Scheduling'
      },
      proposal: {
        roi: {
          payback_period_months: 3
        }
      }
    };

    // WHEN: Checking data paths
    const issues = checkDataPaths(schema);

    // THEN: Should find placeholder issue
    expect(issues).toContain('Client name is missing or default');
  });

  it('[P1] should detect N/A payback period', () => {
    // GIVEN: Schema with N/A payback
    const schema = {
      project_identity: {
        client_name: 'Test Client',
        process_name: 'Test Process'
      },
      proposal: {
        roi: {
          payback_period_months: 'N/A'
        }
      }
    };

    // WHEN: Checking data paths
    const issues = checkDataPaths(schema);

    // THEN: Should find payback issue
    expect(issues).toContain('ROI payback period is missing or N/A');
  });
});
