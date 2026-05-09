// @ts-nocheck — tests against lib modules carrying @ts-nocheck post-.js->.ts migration.

/**
 * Feature Extraction Tests
 *
 * Tests the feature extraction logic in buildTechnicalApproach
 *
 * @priority P0 - Critical for evaluation scoring
 */
import { describe, it, expect } from 'vitest';
import { buildTechnicalApproach as _buildTechnicalApproach } from '../../../lib/build-technical-approach.js';

type TechApproachResult = {
  features: string[];
  integrations: Array<{ system_name: string; [k: string]: unknown }>;
  technology_stack: string[];
  specificity?: { specific_count: number; [k: string]: unknown };
  [k: string]: unknown;
};
const buildTechnicalApproach = (...args: Parameters<typeof _buildTechnicalApproach>): TechApproachResult =>
  _buildTechnicalApproach(...args) as TechApproachResult;

describe('Feature Extraction', () => {
  describe('AC1: Keyword-based feature extraction', () => {
    it('[P0] extracts scheduling features from workflow name', () => {
      const intake = {
        section_a_workflow_definition: {
          q01_workflow_name: 'Patient Appointment Scheduling',
          q02_trigger_event: 'Patient calls',
          q03_business_objective: 'Reduce no-shows',
          q04_end_condition: 'Appointment booked',
        },
        classification: { project_type: 'voice_agent' },
      };

      const result = buildTechnicalApproach(intake, []);

      expect(result.features).toContain('appointment scheduling');
    });

    it('[P0] extracts SMS features from workflow content', () => {
      const intake = {
        section_a_workflow_definition: {
          q01_workflow_name: 'Appointment Reminders',
          q02_trigger_event: 'Appointment in 24 hours',
          q03_business_objective: 'Send SMS reminders to reduce no-shows',
          q04_end_condition: 'Reminder sent',
        },
        classification: { project_type: 'workflow_automation' },
      };

      const result = buildTechnicalApproach(intake, []);

      expect(result.features).toContain('sms reminders');
    });

    it('[P0] extracts lead qualification features', () => {
      const intake = {
        section_a_workflow_definition: {
          q01_workflow_name: 'Lead Qualification',
          q02_trigger_event: 'New lead from web form',
          q03_business_objective: 'Qualify leads and route to sales',
          q04_end_condition: 'Lead qualified or disqualified',
        },
        classification: { project_type: 'voice_agent' },
      };

      const result = buildTechnicalApproach(intake, []);

      expect(result.features).toContain('lead qualification');
    });

    it('[P0] extracts payment features from systems', () => {
      const intake = {
        section_a_workflow_definition: {
          q01_workflow_name: 'Payment Collection',
          q02_trigger_event: 'Invoice due',
          q03_business_objective: 'Collect payments',
          q04_end_condition: 'Payment collected',
        },
        section_c_systems_handoffs: {
          q10_systems_involved: ['Stripe', 'QuickBooks'],
        },
        classification: { project_type: 'workflow_automation' },
      };

      const result = buildTechnicalApproach(intake, []);

      expect(result.features).toContain('payment processing');
    });

    it('[P0] extracts after-hours features', () => {
      const intake = {
        section_a_workflow_definition: {
          q01_workflow_name: 'After-Hours Support',
          q02_trigger_event: 'Call outside business hours',
          q03_business_objective: 'Handle calls 24/7',
          q04_end_condition: 'Message taken or call routed',
        },
        classification: { project_type: 'voice_agent' },
      };

      const result = buildTechnicalApproach(intake, []);

      expect(result.features).toContain('after-hours handling');
    });
  });

  describe('AC2: Integration-based feature extraction', () => {
    it('[P0] extracts CRM features from Salesforce integration', () => {
      const intake = {
        section_a_workflow_definition: {
          q01_workflow_name: 'Lead Capture',
          q02_trigger_event: 'Call received',
          q03_business_objective: 'Capture leads',
          q04_end_condition: 'Lead in CRM',
        },
        classification: { project_type: 'voice_agent' },
      };

      // Research integration format uses 'integration' and 'system' fields
      const integrations = [
        { integration: 'Salesforce', system: 'Salesforce' },
      ];

      const result = buildTechnicalApproach(intake, integrations);

      expect(result.features).toContain('crm sync');
    });

    it('[P0] extracts SMS features from Twilio integration', () => {
      const intake = {
        section_a_workflow_definition: {
          q01_workflow_name: 'Call Handling',
          q02_trigger_event: 'Incoming call',
          q03_business_objective: 'Handle calls',
          q04_end_condition: 'Call completed',
        },
        classification: { project_type: 'voice_agent' },
      };

      // Research integration format uses 'integration' and 'system' fields
      const integrations = [
        { integration: 'Twilio SMS', system: 'Twilio SMS' },
      ];

      const result = buildTechnicalApproach(intake, integrations);

      expect(result.features).toContain('sms reminders');
    });
  });

  describe('AC3: Voice agent features', () => {
    it('[P0] adds voice automation feature for voice_agent projects', () => {
      const intake = {
        section_a_workflow_definition: {
          q01_workflow_name: 'Inbound Support',
          q02_trigger_event: 'Call received',
          q03_business_objective: 'Handle support calls',
          q04_end_condition: 'Issue resolved',
        },
        classification: { project_type: 'voice_agent' },
      };

      const result = buildTechnicalApproach(intake, []);

      expect(result.features).toContain('voice automation');
    });
  });

  describe('AC4: Multiple features extracted', () => {
    it('[P0] extracts multiple features from dental practice workflow', () => {
      const intake = {
        section_a_workflow_definition: {
          q01_workflow_name: 'Patient Appointment Scheduling',
          q02_trigger_event: 'Patient calls the dental clinic',
          q03_business_objective: 'Schedule appointments and send SMS reminders',
          q04_end_condition: 'Appointment booked and confirmation sent',
        },
        section_c_systems_handoffs: {
          q10_systems_involved: ['Dentrix G7', 'Google Calendar', 'Twilio'],
        },
        classification: { project_type: 'voice_agent' },
      };

      // Research format
      const integrations = [
        { integration: 'Dentrix G7', system: 'Dentrix G7' },
        { integration: 'Google Calendar', system: 'Google Calendar' },
        { integration: 'Twilio', system: 'Twilio' },
      ];

      const result = buildTechnicalApproach(intake, integrations);

      expect(result.features.length).toBeGreaterThanOrEqual(2);
      expect(result.features).toContain('appointment scheduling');
    });

    it('[P0] extracts features from real estate outbound workflow', () => {
      const intake = {
        section_a_workflow_definition: {
          q01_workflow_name: 'Lead Follow-up Outreach',
          q02_trigger_event: 'New lead enters CRM',
          q03_business_objective: 'Qualify leads and book property viewings',
          q04_end_condition: 'Lead qualified and viewing scheduled',
        },
        section_c_systems_handoffs: {
          q10_systems_involved: ['Salesforce', 'Google Calendar', 'Twilio'],
        },
        classification: { project_type: 'voice_agent' },
      };

      // Research format
      const integrations = [
        { integration: 'Salesforce', system: 'Salesforce' },
        { integration: 'Google Calendar', system: 'Google Calendar' },
      ];

      const result = buildTechnicalApproach(intake, integrations);

      expect(result.features).toContain('lead qualification');
      expect(result.features).toContain('crm sync');
    });
  });

  describe('AC5: Features in pipeline output structure', () => {
    it('[P0] returns features array in buildTechnicalApproach result', () => {
      const intake = {
        section_a_workflow_definition: {
          q01_workflow_name: 'Test Workflow',
          q02_trigger_event: 'Test trigger',
          q03_business_objective: 'Test objective',
          q04_end_condition: 'Test end',
        },
        classification: { project_type: 'voice_agent' },
      };

      const result = buildTechnicalApproach(intake, []);

      expect(result).toHaveProperty('features');
      expect(Array.isArray(result.features)).toBe(true);
    });

    it('[P0] features is always an array even when no matches', () => {
      const intake = {
        section_a_workflow_definition: {
          q01_workflow_name: 'Generic Task',
          q02_trigger_event: 'Something happens',
          q03_business_objective: 'Do something',
          q04_end_condition: 'Done',
        },
        classification: { project_type: 'workflow_automation' },
      };

      const result = buildTechnicalApproach(intake, []);

      expect(result.features).toBeInstanceOf(Array);
    });
  });
});
