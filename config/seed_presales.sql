-- seed_presales.sql
-- Auto-generated via scripts/dump_presales_seed.js (config tables only)
-- Source: config/presales.db (binary, gitignored)
-- Regenerate the .db file with: bun scripts/build-presales-db.js

PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

-- ============ labor_rates ============
DROP TABLE IF EXISTS labor_rates;
CREATE TABLE labor_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_key TEXT UNIQUE NOT NULL,          -- e.g., 'solutions_architect'
    role_label TEXT NOT NULL,               -- Human-readable name
    unit_rate INTEGER NOT NULL,             -- USD per hour (was: hourly_rate)
    default_weight REAL DEFAULT 0.0,        -- Allocation ratio 0-1 (was: typical_allocation)
    scope_notes TEXT,                       -- What this role covers
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO labor_rates (id, role_key, role_label, unit_rate, default_weight, scope_notes, created_at) VALUES (1, 'solutions_architect', 'Solutions Architect', 175, 0.2, 'Strategic planning, system design, schema architecture', '2026-01-02 05:23:32');
INSERT INTO labor_rates (id, role_key, role_label, unit_rate, default_weight, scope_notes, created_at) VALUES (2, 'automation_engineer', 'Automation Engineer', 125, 0.5, 'n8n workflows, API integrations, scripting', '2026-01-02 05:23:32');
INSERT INTO labor_rates (id, role_key, role_label, unit_rate, default_weight, scope_notes, created_at) VALUES (3, 'ai_developer', 'Ai Developer', 150, 0.2, 'LLM integration, prompt engineering, AI agent development', '2026-01-02 05:23:32');
INSERT INTO labor_rates (id, role_key, role_label, unit_rate, default_weight, scope_notes, created_at) VALUES (4, 'qa_documentation', 'Qa Documentation', 85, 0.1, 'Testing, validation, documentation, training materials', '2026-01-02 05:23:32');
INSERT INTO labor_rates (id, role_key, role_label, unit_rate, default_weight, scope_notes, created_at) VALUES (5, 'ai_engineering', 'Ai Engineering', 175, 0.0, 'AI/ML model development, training, fine-tuning', '2026-01-02 05:23:32');
INSERT INTO labor_rates (id, role_key, role_label, unit_rate, default_weight, scope_notes, created_at) VALUES (6, 'integration_development', 'Integration Development', 150, 0.0, 'API integrations, system connections, data pipelines', '2026-01-02 05:23:32');
INSERT INTO labor_rates (id, role_key, role_label, unit_rate, default_weight, scope_notes, created_at) VALUES (7, 'system_design', 'System Design', 165, 0.0, 'Architecture design, technical specification', '2026-01-02 05:23:32');
INSERT INTO labor_rates (id, role_key, role_label, unit_rate, default_weight, scope_notes, created_at) VALUES (8, 'testing_qa', 'Testing Qa', 125, 0.0, 'Testing, validation, quality assurance', '2026-01-02 05:23:32');
INSERT INTO labor_rates (id, role_key, role_label, unit_rate, default_weight, scope_notes, created_at) VALUES (9, 'project_management', 'Project Management', 100, 0.0, 'Coordination, client communication, planning', '2026-01-02 05:23:32');
INSERT INTO labor_rates (id, role_key, role_label, unit_rate, default_weight, scope_notes, created_at) VALUES (10, 'training_documentation', 'Training Documentation', 95, 0.0, 'User training, documentation writing', '2026-01-02 05:23:32');

-- ============ engagement_bands ============
DROP TABLE IF EXISTS engagement_bands;
CREATE TABLE engagement_bands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    band_key TEXT UNIQUE NOT NULL,          -- e.g., 'discovery', 'standard'
    band_label TEXT NOT NULL,               -- Display name
    floor_usd INTEGER NOT NULL,             -- Minimum price (was: price_range.min)
    ceiling_usd INTEGER NOT NULL,           -- Maximum price (was: price_range.max)
    typical_usd INTEGER,                    -- Most common price point
    effort_floor_hrs INTEGER,               -- Min hours (was: hours_range.min)
    effort_ceiling_hrs INTEGER,             -- Max hours (was: hours_range.max)
    effort_default_hrs INTEGER,             -- Default hours estimate
    scope_notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO engagement_bands (id, band_key, band_label, floor_usd, ceiling_usd, typical_usd, effort_floor_hrs, effort_ceiling_hrs, effort_default_hrs, scope_notes, created_at) VALUES (1, 'discovery', 'Discovery/Audit', 500, 2500, 1500, 4, 16, 10, 'Process audit, traffic light report, opportunity identification', '2026-01-02 05:23:32');
INSERT INTO engagement_bands (id, band_key, band_label, floor_usd, ceiling_usd, typical_usd, effort_floor_hrs, effort_ceiling_hrs, effort_default_hrs, scope_notes, created_at) VALUES (2, 'proof_of_concept', 'Proof of Concept', 2500, 7500, 5000, 20, 50, 35, 'Single workflow or integration demonstration', '2026-01-02 05:23:32');
INSERT INTO engagement_bands (id, band_key, band_label, floor_usd, ceiling_usd, typical_usd, effort_floor_hrs, effort_ceiling_hrs, effort_default_hrs, scope_notes, created_at) VALUES (3, 'standard', 'Standard Implementation', 7500, 25000, 16250, 50, 160, 105, 'Full workflow automation with integrations', '2026-01-02 05:23:32');
INSERT INTO engagement_bands (id, band_key, band_label, floor_usd, ceiling_usd, typical_usd, effort_floor_hrs, effort_ceiling_hrs, effort_default_hrs, scope_notes, created_at) VALUES (4, 'enterprise', 'Enterprise Solution', 25000, 100000, 62500, 160, 600, 380, 'Multi-system integration, AI agents, voice automation', '2026-01-02 05:23:32');
INSERT INTO engagement_bands (id, band_key, band_label, floor_usd, ceiling_usd, typical_usd, effort_floor_hrs, effort_ceiling_hrs, effort_default_hrs, scope_notes, created_at) VALUES (5, 'pkg_simple_automation', 'Simple Automation', 2500, 5000, 3500, NULL, NULL, NULL, 'Single workflow automation, basic AI integration', '2026-01-02 05:23:32');
INSERT INTO engagement_bands (id, band_key, band_label, floor_usd, ceiling_usd, typical_usd, effort_floor_hrs, effort_ceiling_hrs, effort_default_hrs, scope_notes, created_at) VALUES (6, 'pkg_standard_implementation', 'Standard Implementation', 7500, 15000, 10000, NULL, NULL, NULL, 'Multi-workflow automation, 2-3 system integration', '2026-01-02 05:23:32');
INSERT INTO engagement_bands (id, band_key, band_label, floor_usd, ceiling_usd, typical_usd, effort_floor_hrs, effort_ceiling_hrs, effort_default_hrs, scope_notes, created_at) VALUES (7, 'pkg_complex_system', 'Complex System', 15000, 35000, 22500, NULL, NULL, NULL, 'Enterprise integration, custom AI development', '2026-01-02 05:23:32');
INSERT INTO engagement_bands (id, band_key, band_label, floor_usd, ceiling_usd, typical_usd, effort_floor_hrs, effort_ceiling_hrs, effort_default_hrs, scope_notes, created_at) VALUES (8, 'pkg_enterprise_solution', 'Enterprise Solution', 35000, 75000, 50000, NULL, NULL, NULL, 'Full platform build, multiple AI components', '2026-01-02 05:23:32');

-- ============ service_agreements ============
DROP TABLE IF EXISTS service_agreements;
CREATE TABLE service_agreements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agreement_key TEXT UNIQUE NOT NULL,     -- e.g., 'maintenance', 'growth'
    agreement_label TEXT NOT NULL,
    period_rate_usd INTEGER NOT NULL,       -- Monthly rate (was: monthly_rate)
    included_hrs INTEGER NOT NULL,          -- Hours included (was: hours_included)
    scope_notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO service_agreements (id, agreement_key, agreement_label, period_rate_usd, included_hrs, scope_notes, created_at) VALUES (1, 'maintenance', 'Maintenance & Monitoring', 497, 4, 'Daily monitoring, error alerts, minor fixes', '2026-01-02 05:23:32');
INSERT INTO service_agreements (id, agreement_key, agreement_label, period_rate_usd, included_hrs, scope_notes, created_at) VALUES (2, 'growth', 'Growth Partnership', 1497, 12, 'Ongoing optimization, new automations, priority support', '2026-01-02 05:23:32');
INSERT INTO service_agreements (id, agreement_key, agreement_label, period_rate_usd, included_hrs, scope_notes, created_at) VALUES (3, 'scale', 'Scale Partnership', 2997, 25, 'Dedicated capacity, strategic planning, rapid iteration', '2026-01-02 05:23:32');

-- ============ adjustment_factors ============
DROP TABLE IF EXISTS adjustment_factors;
CREATE TABLE adjustment_factors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,                 -- e.g., 'risk', 'systems', 'timeline'
    factor_key TEXT NOT NULL,               -- e.g., 'standard', 'complex'
    factor_label TEXT,
    multiplier REAL NOT NULL DEFAULT 1.0,   -- Adjustment multiplier
    criteria TEXT,                          -- JSON array of qualifying conditions
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category, factor_key)
);
CREATE INDEX idx_adjustment_category ON adjustment_factors(category);
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (1, 'risk', 'standard', 'Standard', 1.0, '["Client has API keys ready","Standard REST API integrations","Clear requirements documented","Existing authentication in place"]', '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (2, 'risk', 'moderate', 'Moderate', 1.25, '["Multiple API integrations required","Some custom development needed","Requirements need clarification","OAuth or complex auth flows"]', '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (3, 'risk', 'complex', 'Complex', 1.5, '["Legacy system integration (SOAP, XML)","On-premise gateway requirements","Significant custom development","Compliance requirements (HIPAA, SOC2)"]', '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (4, 'risk', 'high_risk', 'High Risk', 2.0, '["Voice/real-time agent deployment","WebSocket/streaming integrations","Web scraping with anti-bot measures","Undefined scope or R&D nature"]', '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (5, 'systems_count', '1-2', '1-2 systems', 1.0, '["Simple integration scope"]', '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (6, 'systems_count', '3-4', '3-4 systems', 1.15, '["Moderate integration complexity"]', '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (7, 'systems_count', '5-6', '5-6 systems', 1.3, '["Complex multi-system integration"]', '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (8, 'systems_count', '7_plus', '7+ systems', 1.5, '["Enterprise-level integration"]', '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (9, 'integration_method', 'api_available', 'Api Available', 1.0, '["Well-documented REST/GraphQL API available"]', '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (10, 'integration_method', 'webhook_only', 'Webhook Only', 1.2, '["Webhook-based integration, limited API"]', '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (11, 'integration_method', 'csv_import', 'Csv Import', 1.15, '["Manual data import/export required"]', '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (12, 'integration_method', 'scraping_required', 'Scraping Required', 1.5, '["No API, web scraping or RPA needed"]', '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (13, 'integration_method', 'custom_connector', 'Custom Connector', 1.75, '["Custom connector development required"]', '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (14, 'data_sensitivity', 'standard', 'Standard', 1.0, '["Standard business data"]', '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (15, 'data_sensitivity', 'pii_present', 'Pii Present', 1.15, '["Personal identifiable information handling"]', '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (16, 'data_sensitivity', 'hipaa_phi', 'Hipaa Phi', 1.35, '["Healthcare PHI data (HIPAA compliance)"]', '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (17, 'data_sensitivity', 'financial_regulated', 'Financial Regulated', 1.4, '["Financial data (SOX, PCI compliance)"]', '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (18, 'data_sensitivity', 'government_classified', 'Government Classified', 1.6, '["Government or classified data handling"]', '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (19, 'timeline', 'standard', 'Standard', 1.0, '["Normal timeline (20+ business days)"]', '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (20, 'timeline', 'expedited', 'Expedited', 1.2, '["Faster delivery (10-20 business days)"]', '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (21, 'timeline', 'rush', 'Rush', 1.5, '["Rush delivery (5-10 business days)"]', '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (22, 'timeline', 'emergency', 'Emergency', 2.0, '["Emergency delivery (<5 business days)"]', '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (23, 'client_readiness', 'highly_prepared', 'Highly Prepared', 0.95, '["Documentation ready, APIs accessible, responsive IT"]', '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (24, 'client_readiness', 'standard', 'Standard', 1.0, '["Normal preparation level"]', '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (25, 'client_readiness', 'limited_documentation', 'Limited Documentation', 1.1, '["Missing documentation, discovery needed"]', '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (26, 'client_readiness', 'legacy_systems', 'Legacy Systems', 1.25, '["Outdated systems, limited technical resources"]', '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (27, 'industry', 'technology', 'Technology', 1.0, NULL, '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (28, 'industry', 'professional_services', 'Professional Services', 1.0, NULL, '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (29, 'industry', 'retail_ecommerce', 'Retail Ecommerce', 1.05, NULL, '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (30, 'industry', 'manufacturing', 'Manufacturing', 1.1, NULL, '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (31, 'industry', 'healthcare', 'Healthcare', 1.25, NULL, '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (32, 'industry', 'financial_services', 'Financial Services', 1.2, NULL, '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (33, 'industry', 'legal', 'Legal', 1.15, NULL, '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (34, 'industry', 'government', 'Government', 1.3, NULL, '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (35, 'industry', 'education', 'Education', 1.05, NULL, '2026-01-02 05:23:32');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (36, 'company_size', 'smb', 'Small Business (≤50)', 1.0, '["1-50 employees"]', '2026-01-29 17:47:14');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (37, 'company_size', 'mid_market', 'Mid-Market (51-500)', 1.15, '["51-500 employees"]', '2026-01-29 17:47:14');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (38, 'company_size', 'enterprise', 'Enterprise (501-5000)', 1.3, '["501-5000 employees"]', '2026-01-29 17:47:14');
INSERT INTO adjustment_factors (id, category, factor_key, factor_label, multiplier, criteria, created_at) VALUES (39, 'company_size', 'large_enterprise', 'Large Enterprise (5000+)', 1.5, '["5000+ employees"]', '2026-01-29 17:47:14');

-- ============ phase_allocations ============
DROP TABLE IF EXISTS phase_allocations;
CREATE TABLE phase_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phase_key TEXT UNIQUE NOT NULL,         -- e.g., 'design', 'build'
    phase_label TEXT NOT NULL,
    budget_weight REAL NOT NULL,            -- 0-1 allocation (was: allocation/percentage)
    scope_notes TEXT,
    sequence_order INTEGER DEFAULT 0,       -- Display order
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO phase_allocations (id, phase_key, phase_label, budget_weight, scope_notes, sequence_order, created_at) VALUES (1, 'design', 'Design', 0.2, 'Requirements, architecture, planning', 1, '2026-01-02 05:23:32');
INSERT INTO phase_allocations (id, phase_key, phase_label, budget_weight, scope_notes, sequence_order, created_at) VALUES (2, 'build', 'Build', 0.45, 'Development, integration, internal testing', 2, '2026-01-02 05:23:32');
INSERT INTO phase_allocations (id, phase_key, phase_label, budget_weight, scope_notes, sequence_order, created_at) VALUES (3, 'test', 'Test', 0.15, 'Alpha testing, beta testing, validation', 3, '2026-01-02 05:23:32');
INSERT INTO phase_allocations (id, phase_key, phase_label, budget_weight, scope_notes, sequence_order, created_at) VALUES (4, 'deploy', 'Deploy', 0.2, 'Production deployment, training, go-live support', 4, '2026-01-02 05:23:32');

-- ============ technology_profiles ============
DROP TABLE IF EXISTS technology_profiles;
CREATE TABLE technology_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL,                   -- e.g., 'workflow', 'voice', 'llm'
    tech_key TEXT NOT NULL,                 -- e.g., 'n8n', 'vapi', 'gemini'
    risk_tier TEXT NOT NULL,                -- Links to adjustment_factors
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(domain, tech_key)
);
CREATE INDEX idx_tech_domain ON technology_profiles(domain);
INSERT INTO technology_profiles (id, domain, tech_key, risk_tier, notes, created_at) VALUES (1, 'workflow', 'n8n', 'standard', 'Preferred platform', '2026-01-02 05:23:32');
INSERT INTO technology_profiles (id, domain, tech_key, risk_tier, notes, created_at) VALUES (2, 'workflow', 'make', 'standard', 'Alternative for simple flows', '2026-01-02 05:23:32');
INSERT INTO technology_profiles (id, domain, tech_key, risk_tier, notes, created_at) VALUES (3, 'workflow', 'zapier', 'standard', 'Client preference only', '2026-01-02 05:23:32');
INSERT INTO technology_profiles (id, domain, tech_key, risk_tier, notes, created_at) VALUES (4, 'voice', 'vapi', 'moderate', 'Preferred voice AI', '2026-01-02 05:23:32');
INSERT INTO technology_profiles (id, domain, tech_key, risk_tier, notes, created_at) VALUES (5, 'voice', 'bland_ai', 'high_risk', 'Complex but powerful', '2026-01-02 05:23:32');
INSERT INTO technology_profiles (id, domain, tech_key, risk_tier, notes, created_at) VALUES (6, 'voice', 'elevenlabs', 'moderate', 'TTS only', '2026-01-02 05:23:32');
INSERT INTO technology_profiles (id, domain, tech_key, risk_tier, notes, created_at) VALUES (7, 'voice', 'twilio', 'moderate', 'Telephony infrastructure', '2026-01-02 05:23:32');
INSERT INTO technology_profiles (id, domain, tech_key, risk_tier, notes, created_at) VALUES (8, 'llm', 'gemini', 'standard', 'Preferred for cost/quality', '2026-01-02 05:23:32');
INSERT INTO technology_profiles (id, domain, tech_key, risk_tier, notes, created_at) VALUES (9, 'llm', 'openai', 'standard', 'Complex reasoning tasks', '2026-01-02 05:23:32');
INSERT INTO technology_profiles (id, domain, tech_key, risk_tier, notes, created_at) VALUES (10, 'llm', 'anthropic', 'standard', 'Long context processing', '2026-01-02 05:23:32');
INSERT INTO technology_profiles (id, domain, tech_key, risk_tier, notes, created_at) VALUES (11, 'llm', 'groq', 'standard', 'Fast inference fallback', '2026-01-02 05:23:32');
INSERT INTO technology_profiles (id, domain, tech_key, risk_tier, notes, created_at) VALUES (12, 'database', 'supabase', 'standard', 'Preferred - Postgres + Auth', '2026-01-02 05:23:32');
INSERT INTO technology_profiles (id, domain, tech_key, risk_tier, notes, created_at) VALUES (13, 'database', 'airtable', 'standard', 'Non-technical editing', '2026-01-02 05:23:32');
INSERT INTO technology_profiles (id, domain, tech_key, risk_tier, notes, created_at) VALUES (14, 'database', 'qdrant', 'moderate', 'Vector DB for RAG', '2026-01-02 05:23:32');

-- ============ discount_policies ============
DROP TABLE IF EXISTS discount_policies;
CREATE TABLE discount_policies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    policy_type TEXT NOT NULL,              -- 'volume', 'commitment', 'referral', 'early_payment'
    policy_key TEXT NOT NULL,               -- Specific tier/option key
    policy_label TEXT,
    threshold_floor INTEGER,                -- Min value for eligibility (was: min_value)
    threshold_ceiling INTEGER,              -- Max value for eligibility (was: max_value)
    reduction_pct REAL NOT NULL DEFAULT 0,  -- Discount % (was: discount_percentage)
    scope_notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(policy_type, policy_key)
);
CREATE INDEX idx_discount_type ON discount_policies(policy_type);
INSERT INTO discount_policies (id, policy_type, policy_key, policy_label, threshold_floor, threshold_ceiling, reduction_pct, scope_notes, created_at) VALUES (1, 'volume', 'tier_0', 'No volume discount', 0, 9999, 0.0, NULL, '2026-01-02 05:23:32');
INSERT INTO discount_policies (id, policy_type, policy_key, policy_label, threshold_floor, threshold_ceiling, reduction_pct, scope_notes, created_at) VALUES (2, 'volume', 'tier_10000', '5% discount for $10K+ projects', 10000, 24999, 5.0, NULL, '2026-01-02 05:23:32');
INSERT INTO discount_policies (id, policy_type, policy_key, policy_label, threshold_floor, threshold_ceiling, reduction_pct, scope_notes, created_at) VALUES (3, 'volume', 'tier_25000', '8% discount for $25K+ projects', 25000, 49999, 8.0, NULL, '2026-01-02 05:23:32');
INSERT INTO discount_policies (id, policy_type, policy_key, policy_label, threshold_floor, threshold_ceiling, reduction_pct, scope_notes, created_at) VALUES (4, 'volume', 'tier_50000', '12% discount for $50K+ projects', 50000, NULL, 12.0, NULL, '2026-01-02 05:23:32');
INSERT INTO discount_policies (id, policy_type, policy_key, policy_label, threshold_floor, threshold_ceiling, reduction_pct, scope_notes, created_at) VALUES (5, 'commitment', 'single_project', 'Standard single project pricing', NULL, NULL, 0.0, NULL, '2026-01-02 05:23:32');
INSERT INTO discount_policies (id, policy_type, policy_key, policy_label, threshold_floor, threshold_ceiling, reduction_pct, scope_notes, created_at) VALUES (6, 'commitment', 'retainer_3_month', '3-month retainer commitment', NULL, NULL, 10.0, NULL, '2026-01-02 05:23:32');
INSERT INTO discount_policies (id, policy_type, policy_key, policy_label, threshold_floor, threshold_ceiling, reduction_pct, scope_notes, created_at) VALUES (7, 'commitment', 'retainer_6_month', '6-month retainer commitment', NULL, NULL, 15.0, NULL, '2026-01-02 05:23:32');
INSERT INTO discount_policies (id, policy_type, policy_key, policy_label, threshold_floor, threshold_ceiling, reduction_pct, scope_notes, created_at) VALUES (8, 'commitment', 'retainer_12_month', 'Annual retainer commitment', NULL, NULL, 20.0, NULL, '2026-01-02 05:23:32');
INSERT INTO discount_policies (id, policy_type, policy_key, policy_label, threshold_floor, threshold_ceiling, reduction_pct, scope_notes, created_at) VALUES (9, 'early_payment', 'net_15', 'Standard NET 15 terms', NULL, NULL, 0.0, NULL, '2026-01-02 05:23:32');
INSERT INTO discount_policies (id, policy_type, policy_key, policy_label, threshold_floor, threshold_ceiling, reduction_pct, scope_notes, created_at) VALUES (10, 'early_payment', 'net_0', '3% discount for payment upon invoice', NULL, NULL, 3.0, NULL, '2026-01-02 05:23:32');
INSERT INTO discount_policies (id, policy_type, policy_key, policy_label, threshold_floor, threshold_ceiling, reduction_pct, scope_notes, created_at) VALUES (11, 'early_payment', 'prepaid_50', '5% discount for 50% upfront payment', NULL, NULL, 5.0, NULL, '2026-01-02 05:23:32');
INSERT INTO discount_policies (id, policy_type, policy_key, policy_label, threshold_floor, threshold_ceiling, reduction_pct, scope_notes, created_at) VALUES (12, 'early_payment', 'prepaid_full', '8% discount for full upfront payment', NULL, NULL, 8.0, NULL, '2026-01-02 05:23:32');
INSERT INTO discount_policies (id, policy_type, policy_key, policy_label, threshold_floor, threshold_ceiling, reduction_pct, scope_notes, created_at) VALUES (13, 'referral', 'first_project', '5% discount for first project from referral', NULL, NULL, 5.0, NULL, '2026-01-02 05:23:32');

-- ============ payment_policies ============
DROP TABLE IF EXISTS payment_policies;
CREATE TABLE payment_policies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel TEXT NOT NULL,                  -- 'upwork', 'direct'
    policy_key TEXT NOT NULL,               -- 'standard', 'split', etc.
    mechanism TEXT,                         -- 'milestone_escrow', 'invoice'
    net_days INTEGER,                       -- Payment terms
    upfront_pct REAL,                       -- Deposit percentage
    final_pct REAL,                         -- Final payment percentage
    trigger_event TEXT,                     -- What triggers final payment
    threshold_usd INTEGER,                  -- Value threshold for this policy
    scope_notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(channel, policy_key)
);
INSERT INTO payment_policies (id, channel, policy_key, mechanism, net_days, upfront_pct, final_pct, trigger_event, threshold_usd, scope_notes, created_at) VALUES (1, 'upwork', 'standard', 'milestone', NULL, NULL, NULL, NULL, NULL, 'Escrow-based, paid per milestone approval', '2026-01-02 05:23:32');
INSERT INTO payment_policies (id, channel, policy_key, mechanism, net_days, upfront_pct, final_pct, trigger_event, threshold_usd, scope_notes, created_at) VALUES (2, 'direct', 'standard', 'invoice', 15, 50.0, 50.0, NULL, NULL, '50% upfront, 50% on completion (or per milestone)', '2026-01-02 05:23:32');
INSERT INTO payment_policies (id, channel, policy_key, mechanism, net_days, upfront_pct, final_pct, trigger_event, threshold_usd, scope_notes, created_at) VALUES (3, 'direct', 'below_threshold', 'invoice', NULL, 100.0, 0.0, NULL, 10000, '100% upfront to secure build slot', '2026-01-02 05:23:32');
INSERT INTO payment_policies (id, channel, policy_key, mechanism, net_days, upfront_pct, final_pct, trigger_event, threshold_usd, scope_notes, created_at) VALUES (4, 'direct', 'above_threshold', 'invoice', NULL, 50.0, 50.0, 'Production Activation (Go-Live)', 10000, '50% deposit / 50% before go-live', '2026-01-02 05:23:32');

-- ============ operational_params ============
DROP TABLE IF EXISTS operational_params;
CREATE TABLE operational_params (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    param_key TEXT UNIQUE NOT NULL,
    param_value TEXT NOT NULL,              -- Stored as TEXT, parse as needed
    value_type TEXT DEFAULT 'string',       -- 'integer', 'real', 'boolean', 'json'
    category TEXT,                          -- Grouping category
    scope_notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (1, 'composite_rate', '135', 'integer', 'rates', 'Weighted average based on typical allocations', '2026-01-02 05:23:32');
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (2, 'internal_unit_rate', '50', 'integer', 'rates', 'Internal production cost rate for margin calculation', '2026-01-02 05:23:32');
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (3, 'adhoc_premium_rate', '250', 'integer', 'rates', 'Premium rate for non-subscriber work - the ''FU price'' to encourage subscription model', '2026-01-02 05:23:32');
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (4, 'contingency_ratio', '0.15', 'real', 'estimation', '15% contingency added to all estimates', '2026-01-02 05:23:32');
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (5, 'profit_floor_ratio', '0.5', 'real', 'validation', 'Minimum (Price - Cost) / Price ratio. Auto-markup applied if below.', '2026-01-02 05:23:32');
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (6, 'hard_floor_coverage_ratio', '0.5', 'real', 'validation', 'Year 1 labor savings must cover this % of project price', '2026-01-02 05:23:32');
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (7, 'max_payback_months', '3', 'integer', 'validation', NULL, '2026-01-02 05:23:32');
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (8, 'opportunity_lift_ratio', '0.01', 'real', 'validation', 'Conservative modeled revenue impact (never mixed with hard savings)', '2026-01-02 05:23:32');
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (9, 'client_hourly_value', '75', 'integer', 'validation', NULL, '2026-01-02 05:23:32');
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (10, 'average_deal_value', '500', 'integer', 'validation', NULL, '2026-01-02 05:23:32');
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (11, 'daily_leads_default', '15', 'integer', 'validation', NULL, '2026-01-02 05:23:32');
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (12, 'labor_savings_ratio', '0.3', 'real', 'validation', '% of project hours that become monthly recurring savings', '2026-01-02 05:23:32');
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (13, 'subscription_base_rate', '497', 'integer', 'subscription', 'Managed Service base tier - encourages recurring over project', '2026-01-02 05:23:32');
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (14, 'subscription_frequency', 'weekly', 'string', 'subscription', NULL, '2026-01-02 05:23:32');
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (15, 'subscription_weekly_amount', '115', 'integer', 'subscription', NULL, '2026-01-02 05:23:32');
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (16, 'subscription_processes_included', '3', 'integer', 'subscription', NULL, '2026-01-02 05:23:32');
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (17, 'subscription_includes', '["Up to 3 automated business processes","API updates and maintenance","Security monitoring","Wranngle-hosted infrastructure","4-hour SLA for outages"]', 'json', 'subscription', NULL, '2026-01-02 05:23:32');
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (18, 'licensing_type', 'managed_service', 'string', 'licensing', 'Client owns data, Wranngle hosts infrastructure. Workflows exportable upon termination.', '2026-01-02 05:23:32');
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (19, 'infrastructure_model', 'wranngle_hosted', 'string', 'licensing', NULL, '2026-01-02 05:23:32');
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (20, 'data_ownership', 'client', 'string', 'licensing', NULL, '2026-01-02 05:23:32');
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (21, 'buyout_multiplier', '5x-10x setup fee', 'string', 'licensing', NULL, '2026-01-02 05:23:32');
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (22, 'minimum_project_value', '2500', 'integer', 'pricing', NULL, '2026-01-02 05:23:32');
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (23, 'rounding_increment', '500', 'integer', 'pricing', NULL, '2026-01-02 05:23:32');
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (24, 'warranty_days', '30', 'integer', 'warranty', 'Bug fixes included post-deployment', '2026-01-02 05:23:32');
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (25, 'max_combined_reduction_pct', '25', 'integer', 'discounts', NULL, '2026-01-02 05:23:32');
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (26, 'discount_stacking_policy', 'highest_only', 'string', 'discounts', NULL, '2026-01-02 05:23:32');
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (27, 'approval_threshold_pct', '15', 'integer', 'discounts', 'Discounts above 15% require manager approval', '2026-01-02 05:23:32');
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (28, 'generation_concurrency_limit', '5', 'integer', 'execution', 'Maximum parallel LLM calls', '2026-01-02 05:46:20');
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (29, 'generation_retry_attempts', '2', 'integer', 'execution', 'Retry count on transient failures', '2026-01-02 05:46:20');
INSERT INTO operational_params (id, param_key, param_value, value_type, category, scope_notes, created_at) VALUES (30, 'generation_timeout_ms', '30000', 'integer', 'execution', 'Per-call timeout in milliseconds', '2026-01-02 05:46:20');

COMMIT;
PRAGMA foreign_keys = ON;
