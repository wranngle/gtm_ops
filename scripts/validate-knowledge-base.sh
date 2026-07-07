#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

required_files=(
  "AGENTS.md"
  ".agents/AGENTS.md"
  "ARCHITECTURE.md"
  "README.md"
  "DESIGN.md"
  "LICENSE"
  ".github/dependabot.yml"
  "docs/index.md"
  "docs/generated/README.md"
  "docs/product-specs/index.md"
  "docs/references/README.md"
  "docs/references/layered-domain-architecture.md"
  ".mise.toml"
  "scripts/lint-layered-architecture.sh"
  "scripts/lint-structured-logging.sh"
  "scripts/lint-naming-conventions.sh"
  "scripts/lint-file-size.sh"
  "scripts/lint-time-in-providers.sh"
  "scripts/lint-json-parse-boundary.sh"
)

missing=0
for path in "${required_files[@]}"; do
  if [[ ! -f "$path" ]]; then
    printf 'missing required knowledge file: %s\n' "$path" >&2
    missing=1
  fi
done
if (( missing )); then
  exit 1
fi

agent_lines="$(wc -l < AGENTS.md | tr -d ' ')"
if (( agent_lines > 120 )); then
  printf 'AGENTS.md is %s lines; keep it at or below 120 lines and move detail into docs/\n' "$agent_lines" >&2
  exit 1
fi

required_agent_links=(
  "ARCHITECTURE.md"
  "DESIGN.md"
  "docs/references/layered-domain-architecture.md"
)

for needle in "${required_agent_links[@]}"; do
  if ! grep -Fq "$needle" AGENTS.md; then
    printf 'AGENTS.md must point to %s\n' "$needle" >&2
    exit 1
  fi
done

# Run lint suite. Each lint script enforces one architectural rule.
for lint in \
  scripts/lint-layered-architecture.sh \
  scripts/lint-structured-logging.sh \
  scripts/lint-naming-conventions.sh \
  scripts/lint-file-size.sh \
  scripts/lint-time-in-providers.sh \
  scripts/lint-json-parse-boundary.sh
do
  if ! "$lint"; then
    printf '%s failed\n' "$lint" >&2
    exit 1
  fi
done

# Markdown link resolution: owned Markdown links of the form ](path) must
# resolve to a file/directory or an allowed external URL. Generated artifacts
# and image references are intentionally excluded.
markdown_link_failed=0
while IFS=$'\t' read -r doc target; do
  [[ -z "$target" ]] && continue
  case "$target" in
    http://*|https://*|mailto:*|''|'#'*) continue ;;
  esac
  case "$target" in
    *' '*)
      printf '%s links to %s; local Markdown links must not contain raw spaces\n' "$doc" "$target" >&2
      markdown_link_failed=1
      continue
      ;;
  esac

  target_path="${target%%#*}"
  [[ -z "$target_path" ]] && continue
  base_dir="$(dirname "$doc")"
  if [[ "$target_path" == /* ]]; then
    resolved_path="$repo_root${target_path}"
  else
    resolved_path="$base_dir/$target_path"
  fi
  resolved_path="$(realpath -m "$resolved_path")"
  case "$resolved_path" in
    "$repo_root"/*|"$repo_root") ;;
    *)
      printf '%s links outside the repository: %s\n' "$doc" "$target" >&2
      markdown_link_failed=1
      continue
      ;;
  esac
  if [[ ! -e "$resolved_path" ]]; then
    printf '%s links to %s but it does not exist on disk\n' "$doc" "$target" >&2
    markdown_link_failed=1
  fi
done < <(
  find AGENTS.md .agents/AGENTS.md README.md ARCHITECTURE.md DESIGN.md docs \
    \( -path 'docs/generated/*' -o -path 'docs/references/*.png' \) -prune \
    -o -type f -name '*.md' -print 2>/dev/null \
    | sort \
    | while IFS= read -r doc; do
        grep -oE '\]\([^)]+\)' "$doc" \
          | sed -E 's/\]\(([^)]+)\)/\1/' \
          | while IFS= read -r target; do
              printf '%s\t%s\n' "$doc" "$target"
            done
      done
)
if (( markdown_link_failed )); then
  exit 1
fi

printf 'knowledge base validation passed (%s required files, AGENTS.md %s lines)\n' "${#required_files[@]}" "$agent_lines"
