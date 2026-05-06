#!/usr/bin/env bash
# lint-rbac-coverage.sh — enforce requireRole on every Express mutation route.
#
# WHY: server.js historically grew several POST/PATCH/PUT/DELETE handlers with
# no role check. The dev-mode auth shim (lib/rbac.js) defaults missing roles
# to "viewer", so any unprotected mutation route silently accepts any caller
# that can hit the API. PRs #98–#99 swept the existing surface; this lint
# stops the regression.
#
# WHAT: walks every line of server.js (override with first arg) that calls
# app.<method>('<path>', ...) where method ∈ {post, patch, put, delete} and
# fails if the same line is missing requireRole(. Multi-line route signatures
# are not supported — keep the route declaration on one line, which is the
# convention already in use across server.js.
#
# EXIT: 0 when every mutation route is protected, 1 when any are not, 2 on
# misuse (target file missing).
#
# Usage:
#   bash scripts/lint-rbac-coverage.sh                # default: server.js
#   bash scripts/lint-rbac-coverage.sh path/to/file   # override

set -euo pipefail

target="${1:-server.js}"

if [[ ! -f "$target" ]]; then
  echo "lint-rbac-coverage: target file not found: $target" >&2
  exit 2
fi

# Allowlist regex of paths that intentionally need no requireRole.
# Edit with care — every entry should be justified in the comment.
allow_path_regex='^$'  # default: nothing allowlisted

unprotected=()

# Match `app.<method>(<args...>)` on a single line. The path argument is the
# first quoted string after the open paren. We only need it for diagnostics.
mutation_re='^[[:space:]]*app\.(post|patch|put|delete)\('
while IFS= read -r line_with_no; do
  lineno="${line_with_no%%:*}"
  line="${line_with_no#*:}"

  if [[ ! "$line" =~ $mutation_re ]]; then
    continue
  fi

  # Pull the path arg out for the error message; tolerate either quote style.
  route_path=$(echo "$line" | sed -nE "s/.*app\.[a-z]+\(['\"]([^'\"]*)['\"].*/\1/p")

  if [[ -n "$allow_path_regex" && "$route_path" =~ $allow_path_regex ]]; then
    continue
  fi

  if [[ "$line" != *"requireRole("* ]]; then
    unprotected+=("${target}:${lineno}: ${route_path}")
  fi
done < <(grep -nE "^[[:space:]]*app\.(post|patch|put|delete)\(" "$target" || true)

if [[ ${#unprotected[@]} -gt 0 ]]; then
  echo "lint-rbac-coverage: mutation routes missing requireRole():" >&2
  for entry in "${unprotected[@]}"; do
    echo "  $entry" >&2
  done
  echo "" >&2
  echo "Add requireRole(<roles>) as the first middleware after the route path." >&2
  echo "Example:" >&2
  echo "  app.post('/api/example', requireRole(Role.OWNER, Role.ADMIN), handler);" >&2
  exit 1
fi

echo "lint-rbac-coverage: all mutation routes in $target are role-guarded."
exit 0
