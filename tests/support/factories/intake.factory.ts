/**
 * Intake Data Factory
 * Generates realistic intake data for testing
 */
import { faker } from '@faker-js/faker';

export interface IntakeData {
  intake_version: string;
  captured_at: string;
  captured_by: string;
  prepared_for: {
    account_id: string;
    account_name: string;
  };
  section_a_workflow_definition: {
    q01_workflow_name: string;
    q02_trigger_event: string;
    q03_business_objective: string;
    q04_end_condition: string;
    q05_outcome_owner: string;
  };
  section_b_volume_timing: {
    q06_runs_per_period: string;
    q06_period_unit: string;
    q07_avg_trigger_to_end: string;
    q07_time_unit: string;
    q08_worst_case_delay: string | null;
    q08_delay_unit: string | null;
    q09_business_hours_expected: string | null;
  };
  section_c_systems_handoffs: {
    q10_systems_involved: string[];
    q11_manual_data_transfers: string;
    q12_human_decision_gates: string;
  };
  section_d_failure_cost: {
    q13_common_failures: string;
    q14_cost_if_slow_or_failed: string;
  };
  section_e_priority: {
    q15_strategic_priority: string;
    q16_automation_readiness: string;
  };
  classification?: {
    project_type: string;
    item_type?: string;
  };
}

export function createIntake(overrides: Partial<IntakeData> = {}): IntakeData {
  const clientName = faker.company.name();

  return {
    intake_version: '1.0.0',
    captured_at: faker.date.recent().toISOString(),
    captured_by: faker.person.fullName(),
    prepared_for: {
      account_id: `CLIENT-${faker.string.alphanumeric(6).toUpperCase()}`,
      account_name: clientName
    },
    section_a_workflow_definition: {
      q01_workflow_name: faker.helpers.arrayElement([
        'Patient Scheduling',
        'Lead Intake',
        'Order Fulfillment',
        'Claims Processing',
        'Appointment Booking'
      ]),
      q02_trigger_event: faker.helpers.arrayElement([
        'New lead submission via website form',
        'Phone call received',
        'Email inquiry received',
        'Appointment request submitted'
      ]),
      q03_business_objective: faker.helpers.arrayElement([
        'Reduce manual data entry and improve response time',
        'Automate lead qualification and routing',
        'Streamline scheduling and reduce no-shows'
      ]),
      q04_end_condition: faker.helpers.arrayElement([
        'Lead assigned to sales rep and follow-up scheduled',
        'Appointment confirmed in calendar system',
        'Order processed and confirmation sent'
      ]),
      q05_outcome_owner: faker.helpers.arrayElement([
        'Operations Manager',
        'Front Desk Staff',
        'Sales Team Lead'
      ])
    },
    section_b_volume_timing: {
      q06_runs_per_period: faker.helpers.arrayElement(['50', '100', '200', '500']),
      q06_period_unit: faker.helpers.arrayElement(['day', 'week', 'month']),
      q07_avg_trigger_to_end: faker.helpers.arrayElement(['15', '30', '60']),
      q07_time_unit: 'minutes',
      q08_worst_case_delay: faker.helpers.arrayElement(['2', '4', '24', null]),
      q08_delay_unit: faker.helpers.arrayElement(['hours', 'days', null]),
      q09_business_hours_expected: faker.helpers.arrayElement(['Yes - 8am to 5pm', 'No - 24/7', null])
    },
    section_c_systems_handoffs: {
      q10_systems_involved: faker.helpers.arrayElements([
        'Dentrix G7 (Practice Management)',
        'Weave (Phone/SMS)',
        'Google Calendar',
        'Salesforce CRM',
        'Rectangle Health (Payments)',
        'DentalXchange (Claims)',
        'Carestream (Imaging)'
      ], { min: 2, max: 5 }),
      q11_manual_data_transfers: faker.helpers.arrayElement([
        'Staff manually copies patient info between systems',
        'Data entered into multiple systems separately',
        'Export/import CSV files between platforms'
      ]),
      q12_human_decision_gates: faker.helpers.arrayElement([
        'Manager approval required for appointments over $500',
        'Lead qualification score determines routing',
        'Insurance verification before scheduling'
      ])
    },
    section_d_failure_cost: {
      q13_common_failures: faker.helpers.arrayElement([
        'Missed follow-ups due to manual tracking',
        'Double-booking appointments',
        'Lost leads due to slow response'
      ]),
      q14_cost_if_slow_or_failed: faker.helpers.arrayElement([
        'Lost revenue of $500-2000 per missed patient',
        'Customer churn and negative reviews',
        'Overtime costs for manual error correction'
      ])
    },
    section_e_priority: {
      q15_strategic_priority: faker.helpers.arrayElement([
        'High - Core revenue driver',
        'Medium - Operational efficiency',
        'High - Competitive differentiator'
      ]),
      q16_automation_readiness: faker.helpers.arrayElement([
        'Ready - APIs available for key systems',
        'Partial - Some systems need workarounds',
        'Challenging - Legacy systems with limited integration'
      ])
    },
    classification: {
      project_type: faker.helpers.arrayElement(['workflow_automation', 'voice_agent', 'data_pipeline']),
      item_type: faker.helpers.arrayElement(['appointments', 'leads', 'orders', 'claims'])
    },
    ...overrides
  };
}

export function createIntakeWithSystems(systems: string[], overrides: Partial<IntakeData> = {}): IntakeData {
  return createIntake({
    section_c_systems_handoffs: {
      q10_systems_involved: systems,
      q11_manual_data_transfers: 'Staff manually copies data between systems',
      q12_human_decision_gates: 'Manager approval required'
    },
    ...overrides
  });
}

export function createDentalIntake(overrides: Partial<IntakeData> = {}): IntakeData {
  return createIntake({
    prepared_for: {
      account_id: 'CLIENT-DENTAL001',
      account_name: 'Bright Smile Dental'
    },
    section_a_workflow_definition: {
      q01_workflow_name: 'Patient Scheduling',
      q02_trigger_event: 'Patient calls or submits online request',
      q03_business_objective: 'Reduce scheduling time and no-shows',
      q04_end_condition: 'Appointment confirmed and reminders set',
      q05_outcome_owner: 'Front Desk Coordinator'
    },
    section_b_volume_timing: {
      q06_runs_per_period: '200',
      q06_period_unit: 'day',
      q07_avg_trigger_to_end: '15',
      q07_time_unit: 'minutes',
      q08_worst_case_delay: '4',
      q08_delay_unit: 'hours',
      q09_business_hours_expected: 'Yes - 7am to 6pm'
    },
    section_c_systems_handoffs: {
      q10_systems_involved: [
        'Dentrix G7 (Practice Management)',
        'Weave (Phone/SMS)',
        'Google Calendar',
        'Rectangle Health (Payments)',
        'DentalXchange (Claims)'
      ],
      q11_manual_data_transfers: 'Staff copies patient info from Weave to Dentrix',
      q12_human_decision_gates: 'Insurance verification before treatment scheduling'
    },
    classification: {
      project_type: 'workflow_automation',
      item_type: 'appointments'
    },
    ...overrides
  });
}
