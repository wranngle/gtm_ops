// @ts-nocheck — report rendering consumes broad legacy schema/context shapes.

/**
 * HTML report generator.
 *
 * This is the explicit context -> template magic -> HTML report boundary.
 * PDF generation must consume the HTML artifact produced here, not rebuild or
 * infer report content inside the PDF layer.
 */

import fs from 'fs';
import path from 'path';
import Mustache from 'mustache';

import { buildTechnicalApproach } from './build-technical-approach.js';
import { expandLegacyPaths } from './schema-compat.js';
import { generateFooterHTML, generateHeaderHTML } from './shared-components.js';
import { buildTemplateContext } from './template-context.js';

const DEFAULT_REPORT_TEMPLATE = path.join(process.cwd(), 'templates', 'presales_report.html');

/**
 * Convert simple markdown bold markers to HTML across a nested object.
 * Mirrors the legacy presales renderer behavior so LLM narrative fields can
 * move directly into Mustache templates.
 */
export function convertMarkdownToHtml(obj) {
  if (typeof obj === 'string') {
    return obj.replaceAll(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }

  if (Array.isArray(obj)) {
    return obj.map(item => convertMarkdownToHtml(item));
  }

  if (obj && typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = convertMarkdownToHtml(value);
    }

    return result;
  }

  return obj;
}

function formatCurrencyForTemplate(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '0';
  return Math.round(value).toLocaleString('en-US');
}

export function formatProjectPlanForRender(plan = {}) {
  const formatted = JSON.parse(JSON.stringify(plan || {}));

  const rawContingency = formatted.estimate?.cost?.contingency || 0;
  const rawContingencyPercent = formatted.estimate?.cost?.contingency_percent || 0.15;
  const rawSubtotal = formatted.estimate?.cost?.subtotal || 0;
  const rawTotal = formatted.estimate?.cost?.total || 0;
  const rawInternalCost = formatted.finops?.total_internal_cost || 0;

  if (formatted.estimate?.cost) {
    if (typeof formatted.estimate.cost.subtotal === 'number') {
      formatted.estimate.cost.subtotal_display = formatted.estimate.cost.subtotal.toLocaleString();
    }

    if (typeof formatted.estimate.cost.contingency_percent === 'number') {
      formatted.estimate.cost.contingency_percent_display = Math.round(formatted.estimate.cost.contingency_percent * 100);
    }

    if (typeof formatted.estimate.cost.total === 'number') {
      formatted.estimate.cost.total = formatCurrencyForTemplate(formatted.estimate.cost.total);
    }

    if (typeof formatted.estimate.cost.subtotal === 'number') {
      formatted.estimate.cost.subtotal = formatCurrencyForTemplate(formatted.estimate.cost.subtotal);
    }

    if (typeof formatted.estimate.cost.contingency === 'number') {
      formatted.estimate.cost.contingency = formatCurrencyForTemplate(formatted.estimate.cost.contingency);
    }

    if (typeof formatted.estimate.cost.contingency_percent === 'number') {
      formatted.estimate.cost.contingency_percent = Math.round(formatted.estimate.cost.contingency_percent * 100);
    }

    if (formatted.estimate.cost.range) {
      formatted.estimate.cost.range.low = formatCurrencyForTemplate(formatted.estimate.cost.range.low);
      formatted.estimate.cost.range.high = formatCurrencyForTemplate(formatted.estimate.cost.range.high);
    }

    if (formatted.estimate.cost.breakdown) {
      for (const key of Object.keys(formatted.estimate.cost.breakdown)) {
        if (typeof formatted.estimate.cost.breakdown[key] === 'number') {
          formatted.estimate.cost.breakdown[key] = formatCurrencyForTemplate(formatted.estimate.cost.breakdown[key]);
        }
      }
    }
  }

  if (formatted.milestones) {
    const totalHours = formatted.estimate?.hours?.total || 0;
    for (const milestone of formatted.milestones) {
      milestone.allocation_display = `${Math.round((milestone.allocation || 0) * 100)}%`;
      milestone.hours_formula = `${totalHours} x ${milestone.allocation || 0} = ${milestone.hours}`;
      if (typeof milestone.cost === 'number') {
        milestone.cost = formatCurrencyForTemplate(milestone.cost);
      }
    }
  }

  if (formatted.payment?.schedule) {
    for (const item of formatted.payment.schedule) {
      if (typeof item.amount === 'number') {
        item.amount = formatCurrencyForTemplate(item.amount);
      }
    }
  }

  if (formatted.finops) {
    formatted.finops.total_hours = formatted.estimate?.hours?.total || 0;
    for (const field of [
      'raw_production_cost',
      'compute_estimate',
      'total_internal_cost',
      'target_price',
      'margin_amount',
      'internal_rate'
    ]) {
      if (typeof formatted.finops[field] === 'number') {
        formatted.finops[field] = formatCurrencyForTemplate(formatted.finops[field]);
      }
    }

    if (typeof formatted.finops.margin_percent === 'number') {
      formatted.finops.margin_percent_display = Math.round(formatted.finops.margin_percent * 100);
    }

    if (formatted.finops.roi && typeof formatted.finops.roi.monthly_value === 'number') {
      formatted.finops.roi.annual_value = formatCurrencyForTemplate((formatted.finops.roi.monthly_value || 0) * 12);
      formatted.finops.roi.monthly_value = formatCurrencyForTemplate(formatted.finops.roi.monthly_value);
    }

    formatted.finops.contingency = formatCurrencyForTemplate(rawContingency);
    formatted.finops.contingency_percent = Math.round(rawContingencyPercent * 100);
    formatted.finops.subtotal = formatCurrencyForTemplate(rawSubtotal);
    formatted.finops.total_with_contingency = formatCurrencyForTemplate(rawTotal);
    formatted.finops.walk_away_price = formatCurrencyForTemplate(Math.round(rawInternalCost * 1.2));
  }

  if (formatted.commercial) {
    if (typeof formatted.commercial.subscription_price === 'number') {
      formatted.commercial.subscription_price = formatCurrencyForTemplate(formatted.commercial.subscription_price);
    }

    if (typeof formatted.commercial.ad_hoc_rate === 'number') {
      formatted.commercial.ad_hoc_rate = formatCurrencyForTemplate(formatted.commercial.ad_hoc_rate);
    }

    if (formatted.commercial.payment_terms) {
      formatted.commercial.payment_terms.upfront_percent_display =
        Math.round((formatted.commercial.payment_terms.upfront_percent || 0) * 100);
      formatted.commercial.payment_terms.final_percent_display =
        Math.round((formatted.commercial.payment_terms.final_percent || 0) * 100);
    }
  }

  return formatted;
}

function buildClientPricing(schema) {
  const rp = schema.pricing || {};
  const milestones = rp.milestones || {};
  const finalPrice = rp.final_price || 0;
  const subtotal = rp.subtotal || finalPrice;

  return {
    currency: rp.currency || 'USD',
    pricing_model: rp.pricing_model || 'fixed_price',
    total: { amount: finalPrice, currency: 'USD', period: 'once', display: `$${finalPrice.toLocaleString()}` },
    subtotal: { amount: subtotal, currency: 'USD', period: 'once', display: `$${subtotal.toLocaleString()}` },
    payment_schedule: {
      schedule_type: 'milestone_based',
      installments: Object.entries(milestones).map(([key, milestone]) => ({
        label: milestone.milestone_name || key,
        amount: {
          amount: milestone.amount || 0,
          currency: 'USD',
          period: 'once',
          display: `$${(milestone.amount || 0).toLocaleString()}`
        },
        percent: milestone.percentage || 0
      }))
    },
    audit_credit: rp.audit_credit || null,
    early_adopter_discount: rp.early_adopter_discount || null,
    platform_fees: { platform: 'direct', fee_percentage: 0, fee_note: 'Direct engagement' }
  };
}

function buildRoiDisplay(schema) {
  const roiPercent = schema.roi?.annual_roi_percent;
  if (!roiPercent || roiPercent === 0) return 'significant';
  if (roiPercent >= 10_000) return `${Math.round(roiPercent / 100).toLocaleString()}x`;
  if (roiPercent >= 1000) return `${roiPercent.toLocaleString()}%`;
  return `${roiPercent}%`;
}

export function buildPresalesReportContext(schema, options = {}) {
  const renderSchema = convertMarkdownToHtml(schema || {});
  expandLegacyPaths(renderSchema);

  const identity = renderSchema.project_identity || renderSchema.identity || {};
  const formattedProjectPlan = formatProjectPlanForRender(renderSchema.project_plan || {});
  const auditHeader = generateHeaderHTML(identity, 'audit');
  const projectPlanHeader = generateHeaderHTML(identity, 'project_plan');
  const proposalHeader = generateHeaderHTML(identity, 'proposal');
  const unifiedFooter = generateFooterHTML(identity);

  const technicalApproach = (() => {
    const researchIntegrations = renderSchema.research?.integrations || renderSchema.integration_research || [];
    const systemIntel = renderSchema.system_intelligence || null;
    return buildTechnicalApproach(renderSchema.intake, researchIntegrations, systemIntel);
  })();

  const bleed = renderSchema.audit_report?.bleed || (() => {
    const bt = renderSchema.measurements?.bleed_total || renderSchema.bleed;
    if (!bt) return undefined;
    return {
      total: {
        value: bt.monthly || bt.value || bt.monthly_bleed || 0,
        display: bt.display || bt.monthly_bleed_display || `$${(bt.monthly || bt.value || bt.monthly_bleed || 0).toLocaleString()}`
      },
      period: 'monthly',
      period_display: 'Per Month'
    };
  })();

  const context = {
    ...renderSchema.audit_report,
    scorecard: renderSchema.audit_report?.scorecard,
    bleed,
    fixes: renderSchema.audit_report?.fixes,
    cta: renderSchema.audit_report?.cta,
    rendering: { is_conversion_mode: false },

    ...formattedProjectPlan,
    estimate: formattedProjectPlan.estimate || renderSchema.estimate,
    risk_analysis: renderSchema.estimate?.risk_analysis || formattedProjectPlan.estimate?.risk_analysis,
    milestones: formattedProjectPlan.milestones || renderSchema.project_plan?.milestones,
    technical: formattedProjectPlan.technical || renderSchema.project_plan?.technical,
    scope: formattedProjectPlan.scope || renderSchema.project_plan?.scope,
    payment: formattedProjectPlan.payment || renderSchema.project_plan?.payment,

    technical_approach: technicalApproach,
    specificity: technicalApproach.specificity,
    integrations: technicalApproach.integrations,
    features: technicalApproach.features,

    ...renderSchema.proposal,
    proposal: renderSchema.proposal,
    pricing: buildClientPricing(renderSchema),
    _has_savings: Boolean(renderSchema.pricing?.audit_credit || renderSchema.pricing?.early_adopter_discount),
    roi: renderSchema.roi,
    roi_display: buildRoiDisplay(renderSchema),

    identity: renderSchema.identity,
    project_identity: identity,
    document: {
      title: 'Unified Presales Report',
      brand: {
        logo_uri: 'https://i.ibb.co/WWFmbjKJ/wranngle-wordmark-4096w.png'
      },
      report_year: new Date().getFullYear().toString()
    },

    raw_input: {
      opening: options.rawInputOpening || renderSchema.raw_input?.opening || '',
      stats: options.rawInputStats || renderSchema.raw_input?.stats || { lines: 0, words: 0, characters: 0 },
      has_content: Boolean(options.rawInputOpening || renderSchema.raw_input?.opening)
    },

    intake: renderSchema.intake,
    product_pricing: renderSchema.product_pricing,
    lead_qualification: renderSchema.lead_qualification,
    company_profile: options.companyProfile || renderSchema.company_profile || {},
    key_metrics: renderSchema.key_metrics,
    systems_inventory: options.systemsInventory || renderSchema.systems_inventory || [],

    unified_header_html: auditHeader,
    unified_footer_html: unifiedFooter,
    audit_header_html: auditHeader,
    project_plan_header_html: projectPlanHeader,
    proposal_header_html: proposalHeader
  };

  const fmtContext = buildTemplateContext(renderSchema);
  context._fmt = fmtContext._fmt;

  return {
    schema: renderSchema,
    context
  };
}

export function loadHtmlReportTemplate(templatePath = DEFAULT_REPORT_TEMPLATE) {
  return fs.readFileSync(path.resolve(templatePath), 'utf8');
}

export function renderHtmlReport(context, template) {
  Mustache.escape = text => String(text);
  return Mustache.render(template, context);
}

export function generateHtmlReportFromContext(context, options = {}) {
  const template = options.template || loadHtmlReportTemplate(options.templatePath);
  const html = renderHtmlReport(context, template);

  return {
    html,
    context,
    template
  };
}

export function generatePresalesHtmlReport(schema, options = {}) {
  const template = options.template || loadHtmlReportTemplate(options.templatePath);
  const { schema: renderSchema, context } = buildPresalesReportContext(schema, options);
  const html = renderHtmlReport(context, template);

  return {
    html,
    context,
    schema: renderSchema,
    template
  };
}

export function writeHtmlReport(outputPath, html) {
  const absoluteOutputPath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true });
  fs.writeFileSync(absoluteOutputPath, html, 'utf8');
  return {
    path: absoluteOutputPath,
    size: Buffer.byteLength(html, 'utf8')
  };
}
