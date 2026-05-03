#!/usr/bin/env bash
# Cloudflare D1 migration for the gtm_ops full-stack Pages deploy.
#
# Usage:
#   bash scripts/migrate-d1.sh           # remote D1 (production)
#   bash scripts/migrate-d1.sh --local   # local sqlite under .wrangler/
#
# Prerequisites:
#   1) wrangler is installed and the operator is logged in (`wrangler login`)
#   2) `wrangler d1 create presales-d1` has been run AND wrangler.toml's
#      [[d1_databases]] entry has the returned database_id pasted in.
#
# Loads config/seed_presales.sql, which currently covers:
#   labor_rates, pricing_rules, integration_costs, business_profile_defaults
#
# Phase 2.5 punch list (NOT loaded by this script — extract first):
#   lib/history.js:21      → projects, executions, artifacts
#   lib/admin.js:133       → metric_buckets, metric_daily, activity_feed,
#                            health_snapshots
#   lib/webhooks.js:84     → webhooks, webhook_deliveries
#   lib/branding.js:213    → workspace_branding, custom_domains,
#                            domain_verification_logs
#   lib/audit.js:87        → audit_logs
#   lib/usage.js:90        → usage_events
#   lib/gdpr.js:93         → user_consents, export_jobs, deletion_requests,
#                            legal_documents, data_processing, access_requests
#   lib/rbac.js:559        → workspace_users, invitations
#   lib/evaluation/corpus.js → evaluation_runs, case_studies
#
# Until those are extracted into migrations/NNN_<table>.sql files, the
# corresponding Pages Functions transparently fall back to the bundled
# fixture JSON — preview deploys are functional, just not "live."

set -euo pipefail

DB_NAME="presales-d1"
SEED_FILE="config/seed_presales.sql"
LOCAL_FLAG=""

if [[ "${1:-}" == "--local" ]]; then
  LOCAL_FLAG="--local"
  echo "[migrate-d1] Mode: LOCAL (sqlite under .wrangler/)"
else
  echo "[migrate-d1] Mode: REMOTE (production D1 — $DB_NAME)"
fi

if [[ ! -f "$SEED_FILE" ]]; then
  echo "[migrate-d1] FATAL: $SEED_FILE not found" >&2
  exit 1
fi

if ! command -v wrangler >/dev/null 2>&1; then
  if command -v npx >/dev/null 2>&1; then
    WRANGLER="npx -y wrangler"
  else
    echo "[migrate-d1] FATAL: neither wrangler nor npx on PATH" >&2
    exit 1
  fi
else
  WRANGLER="wrangler"
fi

echo "[migrate-d1] Loading $SEED_FILE into $DB_NAME ${LOCAL_FLAG:+(local)}..."
$WRANGLER d1 execute "$DB_NAME" $LOCAL_FLAG --file="$SEED_FILE"

echo "[migrate-d1] Verifying labor_rates seeded..."
$WRANGLER d1 execute "$DB_NAME" $LOCAL_FLAG --command="SELECT COUNT(*) AS rows FROM labor_rates"

echo "[migrate-d1] Done."
echo
echo "Next: extract Phase 2.5 schemas (see comment block above) and re-run."
