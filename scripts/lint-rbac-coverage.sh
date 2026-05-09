#!/usr/bin/env bash
# lint-rbac-coverage.sh — enforce requireRole on Express mutation routes
# AND on sensitive read routes that expose admin/audit data.
#
# WHY (mutations): server.ts historically grew several POST/PATCH/PUT/DELETE
# handlers with no role check. The dev-mode auth shim (lib/rbac.ts) defaults
# missing roles to "viewer" in production, so any unprotected mutation route
# silently accepts any caller. PRs #98–#99 swept the surface; this lint stops
# the regression.
#
# WHY (sensitive reads): /api/audit-logs/* exposes the full audit history
# (workspace_id, user_id, ip_address, metadata). /api/admin/* exposes
# operator dashboards. Letting a viewer-role caller read either one is a
# data-leak surface, not just a missing-mutation problem.
#
# WHAT: walks every line of server.ts (override with first arg) that calls
# app.<method>('<path>', ...) where:
#   - method ∈ {post, patch, put, delete}                              (always)
#   - method == get AND path starts with /api/audit-logs or /api/admin (sensitive)
# Fails if the same line is missing requireRole(. Multi-line route signatures
# are not supported — keep the route declaration on one line, which is the
# convention already in use across server.ts.
#
# EXIT: 0 when every flagged route is protected, 1 when any are not, 2 on
# misuse (target file missing).
#
# Usage:
#   bash scripts/lint-rbac-coverage.sh                # default: server.ts
#   bash scripts/lint-rbac-coverage.sh path/to/file   # override

set -euo pipefail

target="${1:-server.ts}"

if [[ ! -f "$target" ]]; then
  echo "lint-rbac-coverage: target file not found: $target" >&2
  exit 2
fi

# Allowlist regex of paths that intentionally need no requireRole.
# Edit with care — every entry should be justified in the comment.
allow_path_regex='^$'  # default: nothing allowlisted

# Sensitive read-path prefixes — GETs under these need requireRole because
# they expose admin, audit, billing, GDPR, or workspace-config data.
# Add new prefixes here as the API grows.
sensitive_get_prefix_re='^/api/(audit-logs|admin|usage|gdpr/export|branding/domain)(/|$)'

unprotected=()

scan_route() {
  local line_with_no="$1"
  local lineno="${line_with_no%%:*}"
  local line="${line_with_no#*:}"

  # Pull the path arg for diagnostics (tolerate either quote style).
  local route_path
  route_path=$(echo "$line" | sed -nE "s/.*app\.[a-z]+\(['\"]([^'\"]*)['\"].*/\1/p")

  if [[ -n "$allow_path_regex" && "$route_path" =~ $allow_path_regex ]]; then
    return
  fi

  if [[ "$line" != *"requireRole("* ]]; then
    unprotected+=("${target}:${lineno}: ${route_path}")
  fi
}

# Mutation routes: always require role.
while IFS= read -r line_with_no; do
  scan_route "$line_with_no"
done < <(grep -nE "^[[:space:]]*app\.(post|patch|put|delete)\(" "$target" || true)

# Sensitive GETs: require role only when path matches the prefix list.
while IFS= read -r line_with_no; do
  line="${line_with_no#*:}"
  route_path=$(echo "$line" | sed -nE "s/.*app\.get\(['\"]([^'\"]*)['\"].*/\1/p")
  if [[ "$route_path" =~ $sensitive_get_prefix_re ]]; then
    scan_route "$line_with_no"
  fi
done < <(grep -nE "^[[:space:]]*app\.get\(" "$target" || true)

if [[ ${#unprotected[@]} -gt 0 ]]; then
  echo "lint-rbac-coverage: routes missing requireRole():" >&2
  for entry in "${unprotected[@]}"; do
    echo "  $entry" >&2
  done
  echo "" >&2
  echo "Add requireRole(<roles>) as the first middleware after the route path." >&2
  echo "Example:" >&2
  echo "  app.post('/api/example', requireRole(Role.OWNER, Role.ADMIN), handler);" >&2
  exit 1
fi

echo "lint-rbac-coverage: all flagged routes in $target are role-guarded."
exit 0
