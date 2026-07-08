-- Migration: 001_initial_schema (DOWN)
-- Description: Rollback initial PostgreSQL schema
-- WARNING: This will destroy all data!

-- Drop triggers first
DROP TRIGGER IF EXISTS users_updated_at ON users;
DROP TRIGGER IF EXISTS workspaces_updated_at ON workspaces;
DROP TRIGGER IF EXISTS webhooks_updated_at ON webhooks;
DROP TRIGGER IF EXISTS subscriptions_updated_at ON subscriptions;
DROP TRIGGER IF EXISTS audit_logs_immutable ON audit_logs;

-- Drop functions
DROP FUNCTION IF EXISTS update_updated_at();
DROP FUNCTION IF EXISTS set_workspace_context(UUID);
DROP FUNCTION IF EXISTS prevent_audit_modification();

-- Drop policies
DROP POLICY IF EXISTS projects_workspace_isolation ON projects;
DROP POLICY IF EXISTS executions_workspace_isolation ON executions;
DROP POLICY IF EXISTS artifacts_workspace_isolation ON artifacts;
DROP POLICY IF EXISTS usage_events_workspace_isolation ON usage_events;
DROP POLICY IF EXISTS webhooks_workspace_isolation ON webhooks;
DROP POLICY IF EXISTS webhook_deliveries_workspace_isolation ON webhook_deliveries;
DROP POLICY IF EXISTS audit_logs_workspace_isolation ON audit_logs;

-- Disable RLS
ALTER TABLE IF EXISTS projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS executions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS artifacts DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS usage_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS webhooks DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS webhook_deliveries DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_logs DISABLE ROW LEVEL SECURITY;

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS user_consents;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS webhook_deliveries;
DROP TABLE IF EXISTS webhooks;
DROP TABLE IF EXISTS usage_events;
DROP TABLE IF EXISTS artifacts;
DROP TABLE IF EXISTS executions;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS workspace_members;
DROP TABLE IF EXISTS workspaces;
DROP TABLE IF EXISTS users;

-- Drop enums
DROP TYPE IF EXISTS webhook_status;
DROP TYPE IF EXISTS execution_status;
DROP TYPE IF EXISTS subscription_plan;
DROP TYPE IF EXISTS user_role;

-- Note: Extensions are not dropped as they may be used by other databases
-- DROP EXTENSION IF EXISTS "pgcrypto";
-- DROP EXTENSION IF EXISTS "uuid-ossp";
