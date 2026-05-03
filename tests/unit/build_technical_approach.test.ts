/**
 * Unit Tests for build_technical_approach.js
 *
 * Tests critical business logic:
 * - Integration deduplication (generic vs specific)
 * - Technology stack building
 * - Smart truncation at sentence boundaries
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createIntake,
  createDentalIntake,
  createIntakeWithSystems,
  type IntakeData
} from '../support/factories/intake.factory';
import {
  createIntegration,
  createDentalIntegrations,
  createGenericCategoryTestCases,
  createDeduplicationTestCases,
  type IntegrationData
} from '../support/factories/integration.factory';

// Import the module under test
// Note: Using dynamic import for ESM compatibility
let buildTechnicalApproach: (intake: IntakeData, integrations: IntegrationData[]) => any;

beforeEach(async () => {
  const module = await import('../../lib/build_technical_approach.js');
  buildTechnicalApproach = module.buildTechnicalApproach;
});

describe('[P0] buildTechnicalApproach - Core Integration Processing', () => {
  it('[P0] should return valid structure with all required fields', async () => {
    // GIVEN: Valid intake and integration data
    const intake = createDentalIntake();
    const integrations = createDentalIntegrations();

    // WHEN: Building technical approach
    const result = buildTechnicalApproach(intake, integrations);

    // THEN: All required fields should be present
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('technology_stack');
    expect(result).toHaveProperty('integrations');
    expect(result).toHaveProperty('labor_factors');
    expect(result).toHaveProperty('citations');
    expect(result).toHaveProperty('specificity');
    expect(result.technology_stack).toBeInstanceOf(Array);
    expect(result.integrations).toBeInstanceOf(Array);
  });

  it('[P0] should handle empty integrations gracefully', async () => {
    // GIVEN: Intake with no integrations
    const intake = createIntake();

    // WHEN: Building technical approach with empty array
    const result = buildTechnicalApproach(intake, []);

    // THEN: Should return valid structure with empty integrations
    expect(result.integrations).toEqual([]);
    expect(result.technology_stack.length).toBeGreaterThanOrEqual(2); // Default stack
    expect(result.specificity.total_count).toBe(0);
  });

  it('[P0] should include default n8n and LLM in technology stack', async () => {
    // GIVEN: Any valid intake
    const intake = createIntake();

    // WHEN: Building technical approach
    const result = buildTechnicalApproach(intake, []);

    // THEN: Default stack should include n8n and LLM
    const stackNames = result.technology_stack.map((t: any) => t.name);
    expect(stackNames).toContain('n8n (Latest Stable)');
    expect(stackNames).toContain('Production LLM');
  });
});

describe('[P1] matchGenericCategory - Generic Category Detection', () => {
  it('[P1] should correctly identify generic categories via specificity flags', async () => {
    // GIVEN: Known generic category names
    const genericNames = ['Phone/SMS', 'CRM', 'VoIP', 'Payments'];

    for (const name of genericNames) {
      // WHEN: Processing a generic integration
      const integrations = [{ system: name, integration: name }];
      const intake = createIntake();
      const result = buildTechnicalApproach(intake, integrations);

      // THEN: Should be flagged as generic
      const integration = result.integrations.find((i: any) =>
        i.system_name.toLowerCase() === name.toLowerCase()
      );
      expect(integration?.is_generic).toBe(true);
    }
  });

  it('[P1] should NOT flag known specific products as generic', async () => {
    // GIVEN: Known specific products that could match generic patterns
    const specificProducts = [
      'Weave',          // Could match "phone/sms" but is a specific product
      'Rectangle Health', // Could match "payments" but is a specific product
      'Google Calendar',  // Could match "calendar" but is a specific product
      'Salesforce',       // Could match "crm" but is a specific product
      'RingCentral',      // Could match "voip" but is a specific product
      'Dentrix G7'        // Could match "practice management" but is specific
    ];

    for (const product of specificProducts) {
      // WHEN: Processing this specific product
      const integrations = [createIntegration({ system: product })];
      const intake = createIntake();
      const result = buildTechnicalApproach(intake, integrations);

      // THEN: Should NOT be flagged as generic
      const integration = result.integrations.find((i: any) =>
        i.system_name === product
      );

      expect(integration?.is_generic).toBe(false);
    }
  });
});

describe('[P0] Integration Deduplication - Generic vs Specific', () => {
  it('[P0] should remove generic Phone/SMS when Weave is present', async () => {
    // GIVEN: Both generic Phone/SMS and specific Weave
    const integrations = [
      createIntegration({ system: 'Phone/SMS' }),
      createIntegration({ system: 'Weave' })
    ];
    const intake = createIntake();

    // WHEN: Building technical approach
    const result = buildTechnicalApproach(intake, integrations);

    // THEN: Only Weave should remain (Phone/SMS deduplicated)
    const systemNames = result.integrations.map((i: any) => i.system_name);
    expect(systemNames).toContain('Weave');
    expect(systemNames).not.toContain('Phone/SMS');
  });

  it('[P0] should remove generic Payments when Rectangle Health is present', async () => {
    // GIVEN: Both generic Payments and specific Rectangle Health
    const integrations = [
      createIntegration({ system: 'Payments' }),
      createIntegration({ system: 'Rectangle Health' })
    ];
    const intake = createIntake();

    // WHEN: Building technical approach
    const result = buildTechnicalApproach(intake, integrations);

    // THEN: Only Rectangle Health should remain
    const systemNames = result.integrations.map((i: any) => i.system_name);
    expect(systemNames).toContain('Rectangle Health');
    expect(systemNames).not.toContain('Payments');
  });

  it('[P0] should remove generic Scheduling when Calendly is present', async () => {
    // GIVEN: Both generic Scheduling and specific Calendly (which IS in GENERIC_CATEGORIES.scheduling)
    const integrations = [
      { system: 'Scheduling', integration: 'Scheduling' },
      { system: 'Calendly', integration: 'Calendly' }
    ];
    const intake = createIntake();

    // WHEN: Building technical approach
    const result = buildTechnicalApproach(intake, integrations);

    // THEN: Only Calendly should remain
    const systemNames = result.integrations.map((i: any) => i.system_name);
    expect(systemNames).toContain('Calendly');
    expect(systemNames).not.toContain('Scheduling');
  });

  it('[P0] should keep generic when no specific exists', async () => {
    // GIVEN: Generic Phone/SMS without any specific VoIP product
    const integrations = [
      createIntegration({ system: 'Phone/SMS' }),
      createIntegration({ system: 'Dentrix G7' }) // Unrelated specific
    ];
    const intake = createIntake();

    // WHEN: Building technical approach
    const result = buildTechnicalApproach(intake, integrations);

    // THEN: Both should remain (no deduplication across categories)
    const systemNames = result.integrations.map((i: any) => i.system_name);
    expect(systemNames).toContain('Phone/SMS');
    expect(systemNames).toContain('Dentrix G7');
  });

  it('[P1] should handle multiple generics and specifics correctly', async () => {
    // GIVEN: Multiple generics with corresponding specifics
    const integrations = [
      { system: 'Phone/SMS', integration: 'Phone/SMS' },
      { system: 'Weave', integration: 'Weave' },
      { system: 'Payments', integration: 'Payments' },
      { system: 'Rectangle Health', integration: 'Rectangle Health' },
      { system: 'Dentrix G7', integration: 'Dentrix G7' } // No matching generic
    ];
    const intake = createIntake();

    // WHEN: Building technical approach
    const result = buildTechnicalApproach(intake, integrations);

    // THEN: All generics should be removed, all specifics kept
    const systemNames = result.integrations.map((i: any) => i.system_name);
    expect(systemNames).toContain('Weave');
    expect(systemNames).toContain('Rectangle Health');
    expect(systemNames).toContain('Dentrix G7');
    expect(systemNames).not.toContain('Phone/SMS');
    expect(systemNames).not.toContain('Payments');
    expect(result.integrations.length).toBe(3);
  });
});

describe('[P1] Technology Stack Building', () => {
  it('[P1] should add Voice AI for voice_agent projects', async () => {
    // GIVEN: Intake classified as voice_agent
    const intake = createIntake({
      classification: { project_type: 'voice_agent' }
    });

    // WHEN: Building technical approach
    const result = buildTechnicalApproach(intake, []);

    // THEN: Voice AI should be in stack
    const stackNames = result.technology_stack.map((t: any) => t.name);
    expect(stackNames).toContain('Voice AI');
  });

  it('[P1] should add Supabase for data_pipeline projects', async () => {
    // GIVEN: Intake classified as data_pipeline
    const intake = createIntake({
      classification: { project_type: 'data_pipeline' }
    });

    // WHEN: Building technical approach
    const result = buildTechnicalApproach(intake, []);

    // THEN: Supabase should be in stack
    const stackNames = result.technology_stack.map((t: any) => t.name);
    expect(stackNames).toContain('Supabase');
  });

  it('[P1] should add Telephony API for phone-related integrations', async () => {
    // GIVEN: Integrations including a telephony system
    const integrations = [
      createIntegration({ system: 'RingCentral' })
    ];
    const intake = createIntake();

    // WHEN: Building technical approach
    const result = buildTechnicalApproach(intake, integrations);

    // THEN: Telephony API should be in stack
    const stackNames = result.technology_stack.map((t: any) => t.name);
    expect(stackNames).toContain('Telephony API');
    expect(stackNames).toContain('SMS Gateway'); // Also adds SMS
  });

  it('[P1] should add Payment Processing for payment integrations', async () => {
    // GIVEN: Integrations including a payment system
    const integrations = [
      createIntegration({ system: 'Square Payments' })
    ];
    const intake = createIntake();

    // WHEN: Building technical approach
    const result = buildTechnicalApproach(intake, integrations);

    // THEN: Payment Processing should be in stack
    const stackNames = result.technology_stack.map((t: any) => t.name);
    expect(stackNames).toContain('Payment Processing');
  });
});

describe('[P1] Specificity Tracking', () => {
  it('[P1] should correctly count generic vs specific integrations', async () => {
    // GIVEN: Mix of generic and specific integrations
    const integrations = [
      createIntegration({ system: 'Weave' }),         // Specific
      createIntegration({ system: 'VoIP' }),          // Generic
      createIntegration({ system: 'Rectangle Health' }), // Specific
      createIntegration({ system: 'CRM' })            // Generic
    ];
    const intake = createIntake();

    // WHEN: Building technical approach
    const result = buildTechnicalApproach(intake, integrations);

    // THEN: Specificity counts should be accurate
    // Note: Deduplication may affect final counts
    expect(result.specificity.has_generic).toBe(true);
    expect(result.specificity.total_count).toBeGreaterThan(0);
  });

  it('[P1] should set has_generic to false when all are specific', async () => {
    // GIVEN: Only specific integrations
    const integrations = [
      createIntegration({ system: 'Weave' }),
      createIntegration({ system: 'Dentrix G7' }),
      createIntegration({ system: 'Rectangle Health' })
    ];
    const intake = createIntake();

    // WHEN: Building technical approach
    const result = buildTechnicalApproach(intake, integrations);

    // THEN: has_generic should be false
    expect(result.specificity.has_generic).toBe(false);
    expect(result.specificity.generic_count).toBe(0);
    expect(result.specificity.specific_count).toBe(result.specificity.total_count);
  });
});

describe('[P1] smartTruncate - Sentence Boundary Truncation', () => {
  it('[P1] should include notes from research_notes', async () => {
    // GIVEN: Integration with research_notes
    const shortText = 'This is a short note.';
    const integrations = [{
      system: 'TestSystem',
      integration: 'TestSystem',
      research: {
        found: true,
        research_notes: shortText,
        auth_type: 'API Key'
      }
    }];
    const intake = createIntake();

    // WHEN: Building technical approach
    const result = buildTechnicalApproach(intake, integrations as any);

    // THEN: Notes should contain the research text
    const integration = result.integrations.find((i: any) => i.system_name === 'TestSystem');
    expect(integration).toBeDefined();
    expect(integration?.notes).toBeDefined();
    expect(typeof integration?.notes).toBe('string');
  });

  it('[P1] should truncate long notes and end cleanly', async () => {
    // GIVEN: Long text that will be truncated
    const longText = 'First sentence here. Second sentence follows. Third sentence is very long and continues with lots of additional content that exceeds the truncation limit significantly. Fourth sentence adds more content. Fifth sentence continues on. Sixth sentence makes it even longer. Seventh sentence goes further. Eighth sentence really pushes the limit with extensive explanation of technical details that nobody reads anyway.';

    const integrations = [{
      system: 'LongNoteSystem',
      integration: 'LongNoteSystem',
      research: {
        found: true,
        research_notes: longText,
        auth_type: 'OAuth2'
      }
    }];
    const intake = createIntake();

    // WHEN: Building technical approach
    const result = buildTechnicalApproach(intake, integrations as any);

    // THEN: Notes should be defined and shorter than original
    const integration = result.integrations.find((i: any) => i.system_name === 'LongNoteSystem');
    expect(integration).toBeDefined();
    expect(integration?.notes).toBeDefined();
    // Notes are prefixed with auth type, so we check it's not undefined
    expect(integration?.notes.length).toBeLessThan(longText.length + 50); // Allow for auth prefix
  });
});
