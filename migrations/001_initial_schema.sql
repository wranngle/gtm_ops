-- Migration: 001_initial_schema
-- Description: Initial PostgreSQL schema for multi-tenant presales platform
-- Created: 2026-01-19

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable Row Level Security helper
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE user_role AS ENUM ('owner', 'admin', 'member', 'viewer');
CREATE TYPE subscription_plan AS ENUM ('free', 'pro', 'enterprise');
CREATE TYPE execution_status AS ENUM ('running', 'completed', 'failed');
CREATE TYPE webhook_status AS ENUM ('pending', 'success', 'failed');

-- =============================================================================
-- USERS TABLE
-- =============================================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clerk_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_clerk_id ON users(clerk_id);

-- =============================================================================
-- WORKSPACES TABLE
-- =============================================================================

CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    plan subscription_plan DEFAULT 'free',
    settings JSONB DEFAULT '{}',
    -- Branding (Enterprise)
    logo_url TEXT,
    primary_color VARCHAR(7),
    secondary_color VARCHAR(7),
    custom_domain VARCHAR(255),
    custom_domain_verified BOOLEAN DEFAULT FALSE,
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_workspaces_slug ON workspaces(slug);
CREATE INDEX idx_workspaces_owner ON workspaces(owner_id);
CREATE INDEX idx_workspaces_custom_domain ON workspaces(custom_domain) WHERE custom_domain IS NOT NULL;

-- =============================================================================
-- WORKSPACE MEMBERS TABLE
-- =============================================================================

CREATE TABLE workspace_members (
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'member',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);

-- =============================================================================
-- PROJECTS TABLE
-- =============================================================================

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    client_slug VARCHAR(255) NOT NULL,
    project_slug VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(workspace_id, client_slug, project_slug)
);

CREATE INDEX idx_projects_workspace ON projects(workspace_id);

-- =============================================================================
-- EXECUTIONS TABLE
-- =============================================================================

CREATE TABLE executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    timestamp BIGINT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    input_hash VARCHAR(64),
    input_path TEXT,
    output_dir TEXT,
    status execution_status DEFAULT 'running',
    slug VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    -- Summary fields
    total_price DECIMAL(10, 2),
    total_hours DECIMAL(10, 2),
    risk_score INTEGER,
    monthly_bleed DECIMAL(10, 2),
    audit_score INTEGER,
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_executions_workspace ON executions(workspace_id);
CREATE INDEX idx_executions_workspace_ts ON executions(workspace_id, timestamp DESC);
CREATE INDEX idx_executions_project ON executions(project_id);
CREATE INDEX idx_executions_user ON executions(user_id);

-- =============================================================================
-- ARTIFACTS TABLE
-- =============================================================================

CREATE TABLE artifacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,  -- 'html', 'pdf', 'json'
    path TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    previous_version_id UUID REFERENCES artifacts(id),
    content_hash VARCHAR(64),
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_artifacts_execution ON artifacts(execution_id);
CREATE INDEX idx_artifacts_workspace ON artifacts(workspace_id);
CREATE INDEX idx_artifacts_version ON artifacts(execution_id, type, version);

-- =============================================================================
-- USAGE EVENTS TABLE
-- =============================================================================

CREATE TABLE usage_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_usage_events_workspace ON usage_events(workspace_id);
CREATE INDEX idx_usage_events_workspace_ts ON usage_events(workspace_id, timestamp DESC);
CREATE INDEX idx_usage_events_type ON usage_events(event_type);
CREATE INDEX idx_usage_events_user ON usage_events(user_id);

-- =============================================================================
-- WEBHOOKS TABLE
-- =============================================================================

CREATE TABLE webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    secret VARCHAR(64) NOT NULL,
    events JSONB NOT NULL DEFAULT '[]',
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_webhooks_workspace ON webhooks(workspace_id);

-- =============================================================================
-- WEBHOOK DELIVERIES TABLE
-- =============================================================================

CREATE TABLE webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    delivery_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    status webhook_status DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    response_code INTEGER,
    response_body TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status);

-- =============================================================================
-- AUDIT LOGS TABLE
-- =============================================================================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    log_id VARCHAR(255) UNIQUE NOT NULL,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    hash VARCHAR(64) NOT NULL,
    previous_hash VARCHAR(64),
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit logs are immutable - prevent updates and deletes
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are immutable and cannot be modified';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_immutable
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_modification();

CREATE INDEX idx_audit_logs_workspace_ts ON audit_logs(workspace_id, timestamp DESC);
CREATE INDEX idx_audit_logs_user_ts ON audit_logs(user_id, timestamp DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action, timestamp DESC);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- =============================================================================
-- USER CONSENTS TABLE (GDPR)
-- =============================================================================

CREATE TABLE user_consents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_type VARCHAR(100) NOT NULL,  -- 'terms', 'privacy', 'marketing'
    version VARCHAR(50) NOT NULL,
    consented BOOLEAN NOT NULL,
    ip_address INET,
    user_agent TEXT,
    consented_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_user_consents_user ON user_consents(user_id);
CREATE INDEX idx_user_consents_type ON user_consents(consent_type);

-- =============================================================================
-- SUBSCRIPTIONS TABLE (Stripe)
-- =============================================================================

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID UNIQUE NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    plan subscription_plan NOT NULL DEFAULT 'free',
    status VARCHAR(50) NOT NULL DEFAULT 'active',  -- 'active', 'past_due', 'cancelled'
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);

-- =============================================================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================================================

-- Enable RLS on all tables with workspace_id
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Create policies (workspace isolation)
-- Note: Policies require current_setting('app.current_workspace_id') to be set in session

CREATE POLICY projects_workspace_isolation ON projects
    FOR ALL USING (workspace_id::text = current_setting('app.current_workspace_id', true));

CREATE POLICY executions_workspace_isolation ON executions
    FOR ALL USING (workspace_id::text = current_setting('app.current_workspace_id', true));

CREATE POLICY artifacts_workspace_isolation ON artifacts
    FOR ALL USING (workspace_id::text = current_setting('app.current_workspace_id', true));

CREATE POLICY usage_events_workspace_isolation ON usage_events
    FOR ALL USING (workspace_id::text = current_setting('app.current_workspace_id', true));

CREATE POLICY webhooks_workspace_isolation ON webhooks
    FOR ALL USING (workspace_id::text = current_setting('app.current_workspace_id', true));

CREATE POLICY webhook_deliveries_workspace_isolation ON webhook_deliveries
    FOR ALL USING (webhook_id IN (
        SELECT id FROM webhooks WHERE workspace_id::text = current_setting('app.current_workspace_id', true)
    ));

CREATE POLICY audit_logs_workspace_isolation ON audit_logs
    FOR ALL USING (
        workspace_id IS NULL OR
        workspace_id::text = current_setting('app.current_workspace_id', true)
    );

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to set workspace context for RLS
CREATE OR REPLACE FUNCTION set_workspace_context(workspace_uuid UUID)
RETURNS void AS $$
BEGIN
    PERFORM set_config('app.current_workspace_id', workspace_uuid::text, false);
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER workspaces_updated_at BEFORE UPDATE ON workspaces
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER webhooks_updated_at BEFORE UPDATE ON webhooks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
