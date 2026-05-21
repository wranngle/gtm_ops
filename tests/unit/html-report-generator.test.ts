// @ts-nocheck — html-report-generator intentionally accepts broad legacy context shapes.

import { describe, expect, it } from 'vitest';

import {
  generateHtmlReportFromContext,
  generatePresalesHtmlReport
} from '../../lib/html-report-generator.js';

describe('html-report-generator', () => {
  it('renders a Mustache context into an HTML report before PDF generation', () => {
    const { html } = generateHtmlReportFromContext(
      {
        client: 'Acme HVAC',
        headline: '<strong>After-hours dispatch</strong>',
        metrics: [{ label: 'missed calls', value: '38/mo' }]
      },
      {
        template: '<!doctype html><html><body><h1>{{{headline}}}</h1><p>{{client}}</p>{{#metrics}}<b>{{value}}</b>{{/metrics}}</body></html>'
      }
    );

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<strong>After-hours dispatch</strong>');
    expect(html).toContain('Acme HVAC');
    expect(html).toContain('38/mo');
  });

  it('builds the legacy presales report context from a pipeline schema', () => {
    const { html, context } = generatePresalesHtmlReport(
      {
        project_identity: {
          client_name: 'Acme HVAC Services',
          client_slug: 'acme-hvac',
          process_name: 'After-hours Dispatch',
          friendly_name: 'Operation Call Catch',
          document_slug: 'WRN-AI-acme-hvac-dispatch-26r1',
          process_date_display: 'May 20, 2026',
          valid_until_display: 'June 3, 2026',
          year: 2026
        },
        identity: {
          client_name: 'Acme HVAC Services'
        },
        intake: {
          section_c_systems_handoffs: {
            q10_systems_involved: ['Phone', 'CRM']
          }
        },
        measurements: {
          bleed_total: {
            monthly: 4200,
            display: '$4,200/mo'
          }
        },
        pricing: {
          final_price: 18_500,
          milestones: {
            design: { milestone_name: 'Design', amount: 4625, percentage: 25 }
          }
        },
        proposal: {
          executive_summary: {
            body: 'Capture missed after-hours demand.'
          }
        },
        project_plan: {},
        audit_report: {}
      },
      {
        template: '<html><body>{{{proposal_header_html}}}<main>{{project_identity.client_name}} {{pricing.total.display}} {{bleed.total.display}}</main></body></html>'
      }
    );

    expect(context.project_identity.client_name).toBe('Acme HVAC Services');
    expect(context.pricing.total.display).toBe('$18,500');
    expect(html).toContain('Acme HVAC Services');
    expect(html).toContain('$18,500');
    expect(html).toContain('$4,200/mo');
  });
});
