/**
 * migrate_v3.js - Migrate extraction prompts and validation schemas to SQLite
 * 
 * Sources:
 *   - prompts/extract_project.md → extraction_templates
 *   - prompts/research_prospect.md → extraction_templates
 *   - lib/validate.js inline schemas → validation_schemas
 *   - Business rules → business_validation_rules
 */

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'settings.db');
const SCHEMA_PATH = path.join(__dirname, 'schema_v3.sql');

// ============================================================================
// EXTRACTION TEMPLATES (Enriched from .md files)
// ============================================================================

const extractionTemplates = [
  {
    template_key: 'project_extraction',
    display_name: 'Project Requirements Extractor',
    purpose_statement: 'Analyze job posts, RFPs, or client communications to extract structured project requirements for sales engineering assessment.',
    llm_role_context: 'You are an expert sales engineer analyzing a job post, RFP, or client communication to extract structured project requirements.',
    input_placeholder_spec: JSON.stringify({
      raw_input: 'The unstructured text from client opportunity (job post, RFP, email, call notes)'
    }),
    output_schema_json: JSON.stringify({
      source: {
        type: 'upwork_job|direct_rfp|email|discovery_call|other',
        raw_text: 'original input preserved'
      },
      client: {
        name: 'company or individual name',
        industry: 'vertical classification',
        company_size: '1-10|11-50|51-200|201-500|500+|unknown'
      },
      project: {
        workflow_name: 'concise 2-4 word identifier',
        summary: 'one to two sentence overview',
        objectives: ['enumerated goals'],
        deliverables: ['expected outputs'],
        integrations: [{ name: 'system', type: 'api|webhook|database|file|scraping|voice|email|other', notes: 'details' }],
        tech_mentioned: ['explicit technologies'],
        constraints: ['limitations or requirements'],
        timeline_mentioned: 'any schedule references',
        budget_mentioned: 'any financial range'
      },
      signals: {
        complexity_indicators: ['complexity phrases'],
        risk_flags: ['potential concerns'],
        opportunity_signals: ['upsell potential'],
        unclear_requirements: ['clarification needed']
      },
      classification: {
        project_type: 'workflow_automation|ai_agent|integration|voice_agent|data_pipeline|scraping|mixed',
        estimated_tier: 'discovery|proof_of_concept|standard|enterprise',
        confidence: 'decimal 0.0-1.0'
      }
    }, null, 2),
    processing_guidelines: `1. Source Type Detection:
   - upwork_job: Contains Upwork-specific language (budget type, client history)
   - direct_rfp: Formal RFP document structure
   - email: Email correspondence format
   - discovery_call: Call notes or transcript
   - other: Indeterminate source

2. Project Type Classification:
   - workflow_automation: n8n/Make/Zapier style automation
   - ai_agent: LLM-powered autonomous agents
   - integration: System interconnection
   - voice_agent: Telephony AI systems
   - data_pipeline: ETL and data processing
   - scraping: Web extraction requirements
   - mixed: Multiple types combined

3. Tier Estimation:
   - discovery: Under $2,500, quick consultation
   - proof_of_concept: $2,500-$7,500, single workflow demo
   - standard: $7,500-$25,000, full implementation
   - enterprise: $25,000+, multi-system complexity

4. Risk Flag Detection:
   - Vague or undefined scope
   - Unrealistic timelines
   - Legacy systems (SOAP, XML, on-premise)
   - Anti-bot/scraping challenges
   - Real-time/voice requirements
   - Compliance (HIPAA, SOC2)

5. Confidence Scoring:
   - 0.9+: Crystal clear requirements, standard project
   - 0.7-0.9: Estimable with minor gaps
   - 0.5-0.7: Significant ambiguity, needs clarification
   - Below 0.5: Too vague for reliable estimation`,
    quality_directives: `Text Quality Standards:

Capitalization:
- Sentence case for summaries and descriptions
- Title Case for system names, company names, product names
- ALL-CAPS only for acronyms (API, CRM, LLM, SLA)
- Never all-lowercase for proper nouns

Punctuation:
- Complete sentences end with periods
- Oxford commas in lists (item 1, item 2, and item 3)
- No trailing commas

Numbers & Currency:
- Dollar amounts with thousands commas: $1,500 not $1500
- Preserve decimal precision from source
- Percentages as digits with symbol (15%)

Complete Sentences:
- Subject and verb required
- No trailing ellipsis or cut-off text
- No sentence fragments in summaries`
  },
  {
    template_key: 'prospect_research_synthesis',
    display_name: 'Prospect Research Synthesizer',
    purpose_statement: 'Synthesize research findings about a prospect company to inform project estimation, tier classification, and proposal strategy.',
    llm_role_context: 'You are an expert sales engineer synthesizing research findings about a prospect company to inform project estimation and proposal strategy.',
    input_placeholder_spec: JSON.stringify({
      company_name: 'Target company name',
      company_url: 'Company website URL',
      industry: 'Known industry vertical (optional)',
      research_findings: 'Raw research gathered from web searches',
      integrations: 'JSON array of integrations from project requirements'
    }),
    output_schema_json: JSON.stringify({
      prospect: {
        company_name: 'string',
        legal_name: 'if different from company_name',
        website: 'url',
        industry_vertical: 'primary industry',
        sub_industry: 'specific niche',
        founded_year: 'number',
        headquarters: 'city, country',
        employee_count_range: '1-10|11-50|51-200|201-500|501-1000|1000+|unknown',
        funding_status: 'bootstrapped|seed|series_a|series_b|series_c+|public|acquired|unknown',
        total_funding: 'dollar amount if known',
        latest_funding_round: { type: 'round type', amount: 'dollar', date: 'YYYY-MM' }
      },
      technology_signals: {
        known_stack: ['confirmed technologies'],
        likely_stack: ['inferred technologies'],
        api_availability: [{ system: 'name', has_api: true, api_type: 'rest|graphql|soap|webhook|unknown', documentation_url: 'url', auth_type: 'api_key|oauth2|basic|custom|unknown', notes: 'details' }],
        integration_complexity: 'standard|moderate|complex|unknown'
      },
      business_context: {
        business_model: 'b2b|b2c|b2b2c|marketplace|saas|services|other|unknown',
        recent_news: [{ headline: 'string', source: 'string', date: 'YYYY-MM-DD', url: 'url', relevance: 'why it matters' }],
        competitors: ['competitor names'],
        market_position: 'assessment text'
      },
      risk_assessment: {
        red_flags: [{ flag: 'description', severity: 'low|medium|high', source: 'origin' }],
        positive_signals: ['positive indicators'],
        overall_risk: 'low|medium|high|unknown'
      },
      tier_recommendation: {
        tier: 'enterprise|mid-market|startup|unknown',
        pricing_strategy: 'premium|standard|competitive',
        research_depth_used: 'deep|standard|quick',
        confidence: 'decimal 0.0-1.0',
        rationale: 'explanation for recommendation'
      }
    }, null, 2),
    processing_guidelines: `Tier Classification Guidelines:

Enterprise (premium pricing):
- 200+ employees OR
- $10M+ funding OR
- Public company OR
- Multiple complex integrations

Mid-Market (standard pricing):
- 20-200 employees OR
- $1M-$10M funding OR
- Established business with clear needs

Startup (competitive pricing):
- Under 20 employees AND
- Under $1M funding AND
- Early stage business

API Research Protocol:
1. Does a public API exist?
2. What authentication is required?
3. Is documentation available?
4. Are there rate limits or enterprise requirements?
5. What is the integration complexity?

Risk Indicator Detection:

Red Flags:
- No clear business model
- Recent layoffs or financial trouble
- Unrealistic expectations
- History of scope creep with vendors
- Legacy systems without API
- Missing compliance mentions where likely needed

Positive Signals:
- Strong funding/financials
- Clear technical understanding
- Existing automation investments
- Good vendor reviews
- Modern tech stack`,
    quality_directives: `Text Formatting Standards:
- Sentence case for descriptions and notes
- Title Case for company names, product names, system names
- ALL-CAPS only for acronyms (API, CRM, LLM, OAuth, REST)
- Never all-lowercase for proper nouns
- Examples: "Salesforce CRM", "The company uses...", "Standard REST API integration"`
  }
];

// ============================================================================
// CLASSIFICATION TAXONOMIES (Enriched)
// ============================================================================

const classificationTaxonomies = [
  // Project Types
  { taxonomy_key: 'project_type', value_code: 'workflow_automation', display_label: 'Workflow Automation', description: 'n8n, Make, or Zapier-style process automation connecting multiple systems', threshold_criteria: 'Primary focus is automating a business process with triggers and actions', sort_order: 1 },
  { taxonomy_key: 'project_type', value_code: 'ai_agent', display_label: 'AI Agent', description: 'LLM-powered autonomous agents that can reason, plan, and execute tasks', threshold_criteria: 'Requires language model integration for decision-making', sort_order: 2 },
  { taxonomy_key: 'project_type', value_code: 'integration', display_label: 'System Integration', description: 'Connecting existing systems for data synchronization or API bridging', threshold_criteria: 'Focus is on connecting systems rather than automating processes', sort_order: 3 },
  { taxonomy_key: 'project_type', value_code: 'voice_agent', display_label: 'Voice Agent', description: 'Telephony AI systems for phone calls, IVR, or voice assistants', threshold_criteria: 'Involves phone/voice interaction capabilities', sort_order: 4 },
  { taxonomy_key: 'project_type', value_code: 'data_pipeline', display_label: 'Data Pipeline', description: 'ETL, data transformation, and processing workflows', threshold_criteria: 'Primary purpose is data movement and transformation', sort_order: 5 },
  { taxonomy_key: 'project_type', value_code: 'scraping', display_label: 'Web Scraping', description: 'Automated extraction of data from websites', threshold_criteria: 'Requires parsing HTML or navigating web interfaces programmatically', sort_order: 6 },
  { taxonomy_key: 'project_type', value_code: 'mixed', display_label: 'Mixed/Hybrid', description: 'Combination of multiple project types', threshold_criteria: 'No single type dominates; multiple categories apply equally', sort_order: 7 },

  // Pricing Tiers
  { taxonomy_key: 'pricing_tier', value_code: 'discovery', display_label: 'Discovery', description: 'Quick audit or consultation engagement', threshold_criteria: 'Under $2,500, typically 1-2 day effort', sort_order: 1 },
  { taxonomy_key: 'pricing_tier', value_code: 'proof_of_concept', display_label: 'Proof of Concept', description: 'Single workflow demonstration', threshold_criteria: '$2,500-$7,500, proves feasibility', sort_order: 2 },
  { taxonomy_key: 'pricing_tier', value_code: 'standard', display_label: 'Standard Implementation', description: 'Full production implementation', threshold_criteria: '$7,500-$25,000, complete solution', sort_order: 3 },
  { taxonomy_key: 'pricing_tier', value_code: 'enterprise', display_label: 'Enterprise', description: 'Multi-system complex implementation', threshold_criteria: '$25,000+, multi-phase with support', sort_order: 4 },

  // Client Tiers
  { taxonomy_key: 'client_tier', value_code: 'enterprise', display_label: 'Enterprise', description: 'Large organization with premium pricing tolerance', threshold_criteria: '200+ employees OR $10M+ funding OR public company', sort_order: 1 },
  { taxonomy_key: 'client_tier', value_code: 'mid-market', display_label: 'Mid-Market', description: 'Established business with standard pricing', threshold_criteria: '20-200 employees OR $1M-$10M funding', sort_order: 2 },
  { taxonomy_key: 'client_tier', value_code: 'startup', display_label: 'Startup', description: 'Early-stage company with competitive pricing', threshold_criteria: 'Under 20 employees AND under $1M funding', sort_order: 3 },

  // Source Types
  { taxonomy_key: 'source_type', value_code: 'upwork_job', display_label: 'Upwork Job Post', description: 'Job listing from Upwork platform', threshold_criteria: 'Contains Upwork-specific language or structure', sort_order: 1 },
  { taxonomy_key: 'source_type', value_code: 'direct_rfp', display_label: 'Direct RFP', description: 'Formal Request for Proposal document', threshold_criteria: 'Structured RFP format with sections', sort_order: 2 },
  { taxonomy_key: 'source_type', value_code: 'email', display_label: 'Email Correspondence', description: 'Client email inquiry', threshold_criteria: 'Email format with headers', sort_order: 3 },
  { taxonomy_key: 'source_type', value_code: 'discovery_call', display_label: 'Discovery Call Notes', description: 'Notes or transcript from sales call', threshold_criteria: 'Call notes or meeting transcript format', sort_order: 4 },
  { taxonomy_key: 'source_type', value_code: 'other', display_label: 'Other', description: 'Unclassified source type', threshold_criteria: 'Cannot determine source type', sort_order: 5 }
];

// ============================================================================
// RISK INDICATORS (Enriched)
// ============================================================================

const riskIndicators = [
  // Red Flags
  { indicator_category: 'red_flag', indicator_code: 'vague_scope', display_text: 'Vague or undefined scope', detection_pattern: 'not sure|unclear|TBD|to be determined|figure out', severity_level: 'high', mitigation_guidance: 'Request detailed requirements document before estimation', applies_to_templates: '["project_extraction"]' },
  { indicator_category: 'red_flag', indicator_code: 'unrealistic_timeline', display_text: 'Unrealistic timeline expectations', detection_pattern: 'ASAP|urgent|yesterday|this week|24 hours', severity_level: 'high', mitigation_guidance: 'Clarify realistic timeline or decline engagement', applies_to_templates: '["project_extraction"]' },
  { indicator_category: 'red_flag', indicator_code: 'legacy_systems', display_text: 'Legacy system integration required', detection_pattern: 'SOAP|XML|on-premise|mainframe|AS400|COBOL', severity_level: 'medium', mitigation_guidance: 'Add integration discovery phase and buffer for unknowns', applies_to_templates: '["project_extraction", "prospect_research_synthesis"]' },
  { indicator_category: 'red_flag', indicator_code: 'anti_bot_challenge', display_text: 'Anti-bot or scraping challenges', detection_pattern: 'captcha|cloudflare|bot protection|rate limit|block', severity_level: 'high', mitigation_guidance: 'Assess feasibility before committing; may need specialized approach', applies_to_templates: '["project_extraction"]' },
  { indicator_category: 'red_flag', indicator_code: 'realtime_voice', display_text: 'Real-time or voice requirements', detection_pattern: 'real-time|realtime|live|phone|voice|call|IVR', severity_level: 'medium', mitigation_guidance: 'Verify latency requirements and infrastructure capabilities', applies_to_templates: '["project_extraction"]' },
  { indicator_category: 'red_flag', indicator_code: 'compliance_required', display_text: 'Compliance requirements', detection_pattern: 'HIPAA|SOC2|GDPR|PCI|compliance|regulated', severity_level: 'medium', mitigation_guidance: 'Include compliance review phase and documentation', applies_to_templates: '["project_extraction", "prospect_research_synthesis"]' },
  { indicator_category: 'red_flag', indicator_code: 'no_business_model', display_text: 'No clear business model', detection_pattern: null, severity_level: 'medium', mitigation_guidance: 'Verify payment capability before engagement', applies_to_templates: '["prospect_research_synthesis"]' },
  { indicator_category: 'red_flag', indicator_code: 'financial_trouble', display_text: 'Recent layoffs or financial trouble', detection_pattern: 'layoff|restructur|downsiz|bankrupt|funding gap', severity_level: 'high', mitigation_guidance: 'Require payment upfront or milestone-based billing', applies_to_templates: '["prospect_research_synthesis"]' },
  { indicator_category: 'red_flag', indicator_code: 'scope_creep_history', display_text: 'History of scope creep with vendors', detection_pattern: null, severity_level: 'high', mitigation_guidance: 'Include strict change order process in contract', applies_to_templates: '["prospect_research_synthesis"]' },

  // Positive Signals
  { indicator_category: 'positive_signal', indicator_code: 'strong_funding', display_text: 'Strong funding or financials', detection_pattern: 'series|raised|funded|profitable|revenue', severity_level: 'low', mitigation_guidance: null, applies_to_templates: '["prospect_research_synthesis"]' },
  { indicator_category: 'positive_signal', indicator_code: 'technical_understanding', display_text: 'Clear technical understanding', detection_pattern: 'API|webhook|integration|technical|architecture', severity_level: 'low', mitigation_guidance: null, applies_to_templates: '["project_extraction", "prospect_research_synthesis"]' },
  { indicator_category: 'positive_signal', indicator_code: 'automation_investment', display_text: 'Existing automation investments', detection_pattern: 'n8n|zapier|make|automation|workflow', severity_level: 'low', mitigation_guidance: null, applies_to_templates: '["prospect_research_synthesis"]' },
  { indicator_category: 'positive_signal', indicator_code: 'modern_stack', display_text: 'Modern technology stack', detection_pattern: 'REST|GraphQL|cloud|AWS|GCP|Azure', severity_level: 'low', mitigation_guidance: null, applies_to_templates: '["prospect_research_synthesis"]' },
  { indicator_category: 'positive_signal', indicator_code: 'good_vendor_reviews', display_text: 'Good reviews from other vendors', detection_pattern: null, severity_level: 'low', mitigation_guidance: null, applies_to_templates: '["prospect_research_synthesis"]' }
];


// ============================================================================
// VALIDATION SCHEMAS (Migrated from validate.js with enriched structure)
// ============================================================================

const validationSchemas = [
  {
    schema_key: 'intake_packet',
    schema_title: 'Client Intake Packet',
    json_schema_version: '2020-12',
    validation_mode: 'strict',
    error_message_prefix: 'Intake validation failed',
    schema_definition: JSON.stringify({
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "title": "Client Intake Packet",
      "description": "Structured questionnaire capturing workflow requirements from client discovery",
      "type": "object",
      "required": ["intake_version", "captured_at", "prepared_for", "section_a_workflow_definition"],
      "properties": {
        "intake_version": { "type": "string", "description": "Schema version identifier" },
        "captured_at": { "type": "string", "format": "date-time", "description": "ISO timestamp of intake capture" },
        "captured_by": { "type": "string", "description": "Person who conducted intake" },
        "prepared_for": {
          "type": "object",
          "description": "Client identification",
          "required": ["account_name"],
          "properties": {
            "account_id": { "type": "string", "description": "Internal account identifier" },
            "account_name": { "type": "string", "description": "Client company name" }
          }
        },
        "section_a_workflow_definition": {
          "type": "object",
          "description": "Core workflow identification",
          "required": ["q01_workflow_name", "q02_trigger_event"],
          "properties": {
            "q01_workflow_name": { "type": "string", "minLength": 1, "description": "Concise workflow identifier" },
            "q02_trigger_event": { "type": "string", "minLength": 1, "description": "What initiates this workflow" },
            "q03_business_objective": { "type": "string", "description": "Business goal this workflow achieves" },
            "q04_end_condition": { "type": "string", "description": "Success criteria for workflow completion" },
            "q05_outcome_owner": { "type": "string", "description": "Responsible party for outcomes" }
          }
        },
        "section_b_volume_timing": {
          "type": "object",
          "description": "Throughput and timing requirements",
          "properties": {
            "q06_runs_per_period": { "type": "string", "description": "Execution frequency count" },
            "q06_period_unit": { "type": "string", "description": "Frequency period (day/week/month)" },
            "q07_avg_trigger_to_end": { "type": "string", "description": "Typical execution duration" },
            "q07_time_unit": { "type": "string", "description": "Duration unit" },
            "q08_worst_case_delay": { "type": "string", "description": "Maximum acceptable latency" },
            "q08_delay_unit": { "type": "string", "description": "Delay unit" },
            "q09_business_hours_expected": { "type": "string", "description": "Operating hours constraint" }
          }
        },
        "section_c_systems_handoffs": {
          "type": "object",
          "description": "Integration touchpoints",
          "properties": {
            "q10_systems_involved": { "type": "array", "items": { "type": "string" }, "description": "Systems in the workflow" },
            "q11_manual_data_transfers": { "type": "string", "description": "Current manual copy-paste operations" },
            "q12_human_decision_gates": { "type": "string", "description": "Points requiring human judgment" }
          }
        },
        "section_d_failure_cost": {
          "type": "object",
          "description": "Failure impact assessment",
          "properties": {
            "q13_common_failures": { "type": "string", "description": "Typical failure modes" },
            "q14_cost_if_slow_or_failed": { "type": "string", "description": "Business impact of failures" }
          }
        },
        "section_e_priority": {
          "type": "object",
          "description": "Priority focus",
          "properties": {
            "q15_one_thing_to_fix": { "type": "string", "description": "Single most important improvement" }
          }
        },
        "attachments": {
          "type": "object",
          "description": "Supporting documentation",
          "properties": {
            "evidence_uris": { "type": "array", "items": { "type": "string" }, "description": "Links to evidence files" },
            "notes": { "type": "string", "description": "Additional context" }
          }
        }
      }
    }, null, 2)
  },
  {
    schema_key: 'measurements_extraction',
    schema_title: 'Workflow Measurements Extraction',
    json_schema_version: '2020-12',
    validation_mode: 'strict',
    error_message_prefix: 'Measurements validation failed',
    schema_definition: JSON.stringify({
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "title": "Workflow Measurements Extraction",
      "description": "Structured metrics extracted from workflow analysis",
      "type": "object",
      "required": ["measurements"],
      "properties": {
        "measurements": {
          "type": "array",
          "minItems": 1,
          "description": "Collection of workflow metrics",
          "items": {
            "type": "object",
            "required": ["id", "name", "value", "value_display"],
            "properties": {
              "id": { "type": "string", "description": "Unique metric identifier" },
              "name": { "type": "string", "description": "Human-readable metric name" },
              "metric_type": { 
                "type": "string", 
                "enum": ["latency", "error_rate", "quality", "complexity", "volume", "cost"],
                "description": "Category of metric"
              },
              "value": { "type": "number", "description": "Numeric metric value" },
              "unit": { "type": "string", "description": "Unit of measurement" },
              "value_display": { "type": "string", "description": "Formatted display string" },
              "source": { "type": "string", "description": "Data source for this metric" },
              "status": { 
                "type": ["string", "null"], 
                "enum": ["critical", "warning", "healthy", null],
                "description": "Health status assessment"
              },
              "status_reason": { "type": ["string", "null"], "description": "Explanation for status" },
              "threshold": {
                "type": ["object", "null"],
                "description": "Performance thresholds",
                "properties": {
                  "target": { "type": ["number", "null"], "description": "Target value" },
                  "target_display": { "type": ["string", "null"], "description": "Formatted target" },
                  "healthy_max": { "type": ["number", "null"], "description": "Healthy upper bound" },
                  "warning_max": { "type": ["number", "null"], "description": "Warning upper bound" },
                  "direction": { 
                    "type": ["string", "null"], 
                    "enum": ["lower_is_better", "higher_is_better", null],
                    "description": "Optimization direction"
                  }
                }
              },
              "evidence": {
                "type": "array",
                "description": "Supporting evidence",
                "items": {
                  "type": "object",
                  "properties": {
                    "type": { "type": "string", "description": "Evidence type" },
                    "summary": { "type": "string", "description": "Evidence summary" }
                  }
                }
              }
            }
          }
        },
        "bleed_assumptions": { "type": "array", "description": "Cost calculation assumptions" },
        "bleed_calculations": { "type": "array", "description": "Cost calculation steps" },
        "bleed_total": {
          "type": "object",
          "description": "Total workflow inefficiency cost",
          "required": ["value"],
          "properties": {
            "value": { "type": "number", "description": "Total cost value" },
            "currency": { "type": "string", "description": "Currency code" },
            "period": { "type": "string", "description": "Time period" },
            "display": { "type": "string", "description": "Formatted display" }
          }
        }
      }
    }, null, 2)
  },
  {
    schema_key: 'research_data',
    schema_title: 'Prospect Research Data',
    json_schema_version: '2020-12',
    validation_mode: 'lenient',
    error_message_prefix: 'Research validation failed',
    schema_definition: JSON.stringify({
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "title": "Prospect Research Data",
      "description": "Company research for tier classification and risk assessment",
      "type": "object",
      "properties": {
        "prospect": {
          "type": "object",
          "description": "Company profile",
          "properties": {
            "company_name": { "type": "string", "description": "Company name" },
            "companyName": { "type": "string", "description": "Alternative key for company name" }
          }
        },
        "technology_signals": { "type": "object", "description": "Tech stack indicators" },
        "business_context": { "type": "object", "description": "Business model and market position" },
        "risk_assessment": { "type": "object", "description": "Risk evaluation" },
        "tier_recommendation": { "type": "object", "description": "Pricing tier recommendation" }
      }
    }, null, 2)
  },
  {
    schema_key: 'project_plan',
    schema_title: 'Project Plan Data',
    json_schema_version: '2020-12',
    validation_mode: 'strict',
    error_message_prefix: 'Project plan validation failed',
    schema_definition: JSON.stringify({
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "title": "Project Plan Data",
      "description": "Structured project plan with phases and deliverables",
      "type": "object",
      "properties": {
        "project_identity": {
          "type": "object",
          "description": "Project identification",
          "properties": {
            "name": { "type": "string" },
            "description": { "type": "string" }
          }
        },
        "projectIdentity": { "type": "object", "description": "Alternative key for project identity" },
        "scope": { "type": "object", "description": "Project scope definition" },
        "phases": { 
          "type": "array", 
          "description": "Project phases",
          "items": { "type": "object" }
        }
      }
    }, null, 2)
  }
];

// ============================================================================
// BUSINESS VALIDATION RULES (Migrated from validateBusinessRules)
// ============================================================================

const businessValidationRules = [
  {
    rule_key: 'bleed_sum_verification',
    rule_name: 'Bleed Breakdown Sum Verification',
    description: 'Verifies that bleed breakdown items sum to the reported total',
    applies_to_schema: 'report',
    validation_logic: 'breakdownSum === reportedTotal (within 0.01 tolerance)',
    error_message_template: 'Bleed breakdown sum ({{breakdownSum}}) does not match total ({{reportedTotal}})',
    severity: 'error',
    sort_order: 1
  },
  {
    rule_key: 'critical_measurement_coverage',
    rule_name: 'Critical Measurement Fix Coverage',
    description: 'Ensures every critical measurement has at least one corresponding fix',
    applies_to_schema: 'report',
    validation_logic: 'criticalMeasurementIds.every(id => fixMeasurementIds.includes(id))',
    error_message_template: 'Critical measurement {{measurementId}} has no corresponding fix',
    severity: 'warning',
    sort_order: 2
  },
  {
    rule_key: 'quick_win_specification',
    rule_name: 'Quick Win Fix Specification',
    description: 'Ensures a quick win fix is identified when fixes are present',
    applies_to_schema: 'report',
    validation_logic: 'fixes.items.length === 0 || fixes.quick_win_fix_id !== null',
    error_message_template: 'Fixes present but no quick_win_fix_id specified',
    severity: 'warning',
    sort_order: 3
  },
  {
    rule_key: 'placeholder_resolution',
    rule_name: 'LLM Placeholder Resolution',
    description: 'Ensures all LLM placeholders are resolved in final output',
    applies_to_schema: 'report',
    validation_logic: '!content.includes("[LLM_PLACEHOLDER")',
    error_message_template: 'Unresolved LLM placeholder found at {{path}}',
    severity: 'error',
    sort_order: 4
  },
  {
    rule_key: 'measurement_evidence_present',
    rule_name: 'Measurement Evidence Presence',
    description: 'Warns when measurements lack supporting evidence',
    applies_to_schema: 'measurements_extraction',
    validation_logic: 'measurement.evidence && measurement.evidence.length > 0',
    error_message_template: 'Measurement "{{measurementName}}" has no evidence records',
    severity: 'warning',
    sort_order: 5
  },
  {
    rule_key: 'measurement_threshold_defined',
    rule_name: 'Measurement Threshold Definition',
    description: 'Warns when measurements lack threshold configuration',
    applies_to_schema: 'measurements_extraction',
    validation_logic: 'measurement.threshold !== null',
    error_message_template: 'Measurement "{{measurementName}}" has no threshold defined',
    severity: 'warning',
    sort_order: 6
  },
  {
    rule_key: 'company_name_required',
    rule_name: 'Company Name Required',
    description: 'Ensures company name is present in prospect data',
    applies_to_schema: 'research_data',
    validation_logic: 'prospect.company_name || prospect.companyName',
    error_message_template: 'Company name is required in prospect data',
    severity: 'error',
    sort_order: 7
  },
  {
    rule_key: 'project_identity_required',
    rule_name: 'Project Identity Required',
    description: 'Ensures project identity is present in project plan',
    applies_to_schema: 'project_plan',
    validation_logic: 'data.project_identity || data.projectIdentity',
    error_message_template: 'Project identity is required',
    severity: 'error',
    sort_order: 8
  },
  {
    rule_key: 'scope_or_phases_required',
    rule_name: 'Scope or Phases Required',
    description: 'Ensures project plan has scope or phases defined',
    applies_to_schema: 'project_plan',
    validation_logic: 'data.scope || data.phases',
    error_message_template: 'Scope or phases are required',
    severity: 'error',
    sort_order: 9
  }
];

// ============================================================================
// PLACEHOLDER PATTERNS
// ============================================================================

const placeholderPatterns = [
  { pattern_regex: '\\[LLM_PLACEHOLDER[^\\]]*\\]', pattern_description: 'Standard LLM placeholder format', is_blocking: 1, example_match: '[LLM_PLACEHOLDER:summary]' },
  { pattern_regex: '\\{\\{[A-Z_]+\\}\\}', pattern_description: 'Mustache-style placeholder (uppercase)', is_blocking: 0, example_match: '{{COMPANY_NAME}}' },
  { pattern_regex: '\\[TODO[^\\]]*\\]', pattern_description: 'TODO markers', is_blocking: 1, example_match: '[TODO: add content]' },
  { pattern_regex: '\\[PLACEHOLDER[^\\]]*\\]', pattern_description: 'Generic placeholder markers', is_blocking: 1, example_match: '[PLACEHOLDER]' }
];

// ============================================================================
// MIGRATION EXECUTION
// ============================================================================

async function runMigration() {
  console.log('Starting v3 migration: Extraction prompts & validation schemas...\n');

  const SQL = await initSqlJs();
  
  // Load existing database or create new
  let db;
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    console.log('Loaded existing database');
  } else {
    db = new SQL.Database();
    console.log('Created new database');
  }

  // Apply schema
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.run(schema);
  console.log('Applied schema_v3.sql\n');

  // Insert extraction templates
  console.log('Inserting extraction templates...');
  const insertTemplate = db.prepare(`
    INSERT OR REPLACE INTO extraction_templates 
    (template_key, display_name, purpose_statement, llm_role_context, 
     input_placeholder_spec, output_schema_json, processing_guidelines, quality_directives)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  for (const t of extractionTemplates) {
    insertTemplate.run([
      t.template_key, t.display_name, t.purpose_statement, t.llm_role_context,
      t.input_placeholder_spec, t.output_schema_json, t.processing_guidelines, t.quality_directives
    ]);
    console.log(`  ✓ ${t.template_key}`);
  }
  insertTemplate.free();

  // Insert classification taxonomies
  console.log('\nInserting classification taxonomies...');
  const insertTaxonomy = db.prepare(`
    INSERT OR REPLACE INTO classification_taxonomies 
    (taxonomy_key, value_code, display_label, description, threshold_criteria, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  const taxonomyGroups = {};
  for (const t of classificationTaxonomies) {
    insertTaxonomy.run([t.taxonomy_key, t.value_code, t.display_label, t.description, t.threshold_criteria, t.sort_order]);
    taxonomyGroups[t.taxonomy_key] = (taxonomyGroups[t.taxonomy_key] || 0) + 1;
  }
  insertTaxonomy.free();
  
  for (const [key, count] of Object.entries(taxonomyGroups)) {
    console.log(`  ✓ ${key}: ${count} values`);
  }

  // Insert risk indicators
  console.log('\nInserting risk indicators...');
  const insertRisk = db.prepare(`
    INSERT OR REPLACE INTO risk_indicators 
    (indicator_category, indicator_code, display_text, detection_pattern, 
     severity_level, mitigation_guidance, applies_to_templates)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  let redFlags = 0, positiveSignals = 0;
  for (const r of riskIndicators) {
    insertRisk.run([
      r.indicator_category, r.indicator_code, r.display_text, r.detection_pattern,
      r.severity_level, r.mitigation_guidance, r.applies_to_templates
    ]);
    if (r.indicator_category === 'red_flag') redFlags++;
    else positiveSignals++;
  }
  insertRisk.free();
  console.log(`  ✓ ${redFlags} red flags`);
  console.log(`  ✓ ${positiveSignals} positive signals`);

  // Insert validation schemas
  console.log('\nInserting validation schemas...');
  const insertSchema = db.prepare(`
    INSERT OR REPLACE INTO validation_schemas 
    (schema_key, schema_title, json_schema_version, schema_definition, 
     validation_mode, error_message_prefix)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  for (const s of validationSchemas) {
    insertSchema.run([
      s.schema_key, s.schema_title, s.json_schema_version, 
      s.schema_definition, s.validation_mode, s.error_message_prefix
    ]);
    console.log(`  ✓ ${s.schema_key}`);
  }
  insertSchema.free();

  // Insert business validation rules
  console.log('\nInserting business validation rules...');
  const insertRule = db.prepare(`
    INSERT OR REPLACE INTO business_validation_rules 
    (rule_key, rule_name, description, applies_to_schema, 
     validation_logic, error_message_template, severity, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  for (const r of businessValidationRules) {
    insertRule.run([
      r.rule_key, r.rule_name, r.description, r.applies_to_schema,
      r.validation_logic, r.error_message_template, r.severity, r.sort_order
    ]);
    console.log(`  ✓ ${r.rule_key}`);
  }
  insertRule.free();

  // Insert placeholder patterns
  console.log('\nInserting placeholder patterns...');
  const insertPlaceholder = db.prepare(`
    INSERT OR REPLACE INTO placeholder_patterns 
    (pattern_regex, pattern_description, is_blocking, example_match)
    VALUES (?, ?, ?, ?)
  `);
  
  for (const p of placeholderPatterns) {
    insertPlaceholder.run([p.pattern_regex, p.pattern_description, p.is_blocking, p.example_match]);
  }
  insertPlaceholder.free();
  console.log(`  ✓ ${placeholderPatterns.length} patterns`);

  // Save database
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
  
  console.log('\n' + '='.repeat(60));
  console.log('Migration v3 complete!');
  console.log('='.repeat(60));
  console.log(`Database saved to: ${DB_PATH}`);
  console.log(`\nSummary:`);
  console.log(`  - ${extractionTemplates.length} extraction templates`);
  console.log(`  - ${classificationTaxonomies.length} taxonomy values`);
  console.log(`  - ${riskIndicators.length} risk indicators`);
  console.log(`  - ${validationSchemas.length} validation schemas`);
  console.log(`  - ${businessValidationRules.length} business rules`);
  console.log(`  - ${placeholderPatterns.length} placeholder patterns`);

  db.close();
}

runMigration().catch(console.error);
