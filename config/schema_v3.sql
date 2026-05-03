-- schema_v3.sql - Extraction Prompts & Validation Schemas
-- Version: 3.0
-- Purpose: Store LLM extraction templates and JSON validation schemas
-- Semantics: Enriched field names with clear intent

-- ============================================================================
-- EXTRACTION PROMPT TEMPLATES
-- LLM prompts for data extraction with modular components
-- ============================================================================

CREATE TABLE IF NOT EXISTS extraction_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_key TEXT UNIQUE NOT NULL,           -- Canonical identifier (e.g., 'project_extraction')
    display_name TEXT NOT NULL,                   -- Human-readable name
    purpose_statement TEXT NOT NULL,              -- What this template accomplishes
    llm_role_context TEXT NOT NULL,               -- System prompt defining LLM persona
    input_placeholder_spec TEXT NOT NULL,         -- JSON: {placeholder: description} mapping
    output_schema_json TEXT NOT NULL,             -- Expected JSON output structure
    processing_guidelines TEXT,                   -- Numbered guidelines for LLM
    quality_directives TEXT,                      -- Text formatting rules
    is_active INTEGER DEFAULT 1,                  -- Soft delete flag
    version_number INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- EXTRACTION OUTPUT FIELDS
-- Defines expected fields in extraction output with validation hints
-- ============================================================================

CREATE TABLE IF NOT EXISTS extraction_output_fields (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL,
    field_path TEXT NOT NULL,                     -- JSON path (e.g., 'client.industry')
    field_type TEXT NOT NULL,                     -- string|number|boolean|array|object|enum
    enum_values TEXT,                             -- JSON array for enum types
    is_required INTEGER DEFAULT 0,
    default_value TEXT,
    validation_hint TEXT,                         -- Guidance for LLM on this field
    example_value TEXT,
    FOREIGN KEY (template_id) REFERENCES extraction_templates(id) ON DELETE CASCADE
);

-- ============================================================================
-- CLASSIFICATION TAXONOMIES
-- Reusable classification categories for extraction
-- ============================================================================

CREATE TABLE IF NOT EXISTS classification_taxonomies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    taxonomy_key TEXT NOT NULL,                   -- Category key (e.g., 'project_type', 'tier')
    value_code TEXT NOT NULL,                     -- Machine-readable value
    display_label TEXT NOT NULL,                  -- Human-readable label
    description TEXT,                             -- Detailed explanation
    threshold_criteria TEXT,                      -- When to apply this classification
    sort_order INTEGER DEFAULT 0,
    UNIQUE(taxonomy_key, value_code)
);

-- ============================================================================
-- RISK INDICATORS
-- Configurable risk flags for extraction assessment
-- ============================================================================

CREATE TABLE IF NOT EXISTS risk_indicators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    indicator_category TEXT NOT NULL,             -- 'red_flag' | 'positive_signal'
    indicator_code TEXT UNIQUE NOT NULL,
    display_text TEXT NOT NULL,
    detection_pattern TEXT,                       -- Regex or keyword pattern
    severity_level TEXT DEFAULT 'medium',         -- low|medium|high|critical
    mitigation_guidance TEXT,
    applies_to_templates TEXT                     -- JSON array of template_keys
);

-- ============================================================================
-- VALIDATION SCHEMAS
-- JSON Schema definitions for data validation
-- ============================================================================

CREATE TABLE IF NOT EXISTS validation_schemas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schema_key TEXT UNIQUE NOT NULL,              -- Canonical identifier
    schema_title TEXT NOT NULL,                   -- Human-readable title
    json_schema_version TEXT DEFAULT '2020-12',   -- JSON Schema draft version
    schema_definition TEXT NOT NULL,              -- Full JSON Schema as text
    validation_mode TEXT DEFAULT 'strict',        -- strict|lenient|draft
    error_message_prefix TEXT,                    -- Custom error prefix
    is_active INTEGER DEFAULT 1,
    version_number INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- BUSINESS VALIDATION RULES
-- Custom validation rules beyond JSON Schema
-- ============================================================================

CREATE TABLE IF NOT EXISTS business_validation_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_key TEXT UNIQUE NOT NULL,                -- Canonical identifier
    rule_name TEXT NOT NULL,                      -- Human-readable name
    description TEXT NOT NULL,                    -- What this rule validates
    applies_to_schema TEXT NOT NULL,              -- Which schema this applies to
    validation_logic TEXT NOT NULL,               -- JavaScript expression or function name
    error_message_template TEXT NOT NULL,         -- Error message with {{placeholders}}
    severity TEXT DEFAULT 'error',                -- error|warning|info
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0
);

-- ============================================================================
-- PLACEHOLDER PATTERNS
-- Patterns to detect unresolved LLM placeholders
-- ============================================================================

CREATE TABLE IF NOT EXISTS placeholder_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern_regex TEXT NOT NULL,                  -- Regex to match placeholders
    pattern_description TEXT NOT NULL,
    is_blocking INTEGER DEFAULT 1,                -- Whether this blocks finalization
    example_match TEXT
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_extraction_templates_key ON extraction_templates(template_key);
CREATE INDEX IF NOT EXISTS idx_extraction_fields_template ON extraction_output_fields(template_id);
CREATE INDEX IF NOT EXISTS idx_taxonomies_key ON classification_taxonomies(taxonomy_key);
CREATE INDEX IF NOT EXISTS idx_validation_schemas_key ON validation_schemas(schema_key);
CREATE INDEX IF NOT EXISTS idx_business_rules_schema ON business_validation_rules(applies_to_schema);
