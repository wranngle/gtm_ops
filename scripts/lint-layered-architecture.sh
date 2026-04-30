#!/usr/bin/env bash
# lint-layered-architecture.sh — enforce per-domain import direction.
#
# Each business domain under packages/<name>/src/ must follow the layer rule
# from docs/references/layered-domain-architecture.md:
#
#   types     → (no business-layer imports)
#   config    → types
#   repo      → types, config
#   providers → types
#   service   → types, config, repo, providers
#   runtime   → types, config, repo, providers, service
#   ui        → types, service          (must not bypass services)
#
# Cross-domain imports are not yet allowed and are flagged as a violation.
# Errors include a remediation hint that the agent can act on directly.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

declare -A allowed_imports=(
  [types]=""
  [config]="types"
  [repo]="types,config"
  [providers]="types"
  [service]="types,config,repo,providers"
  [runtime]="types,config,repo,providers,service,ui"
  [ui]="types,service"
)

violations=0

emit_violation() {
  local file=$1 from_layer=$2 to_layer=$3 allowed=$4 import_line=$5
  printf 'lint:layered-architecture: %s\n' "$file" >&2
  printf '  layer "%s" imports from layer "%s"\n' "$from_layer" "$to_layer" >&2
  printf '  allowed targets for "%s": %s\n' "$from_layer" "${allowed:-(none)}" >&2
  printf '  offending import: %s\n' "$import_line" >&2
  printf '  fix: route the call through an allowed layer (typically `service` or `providers`), or move the imported module into a layer that "%s" is allowed to consume\n' "$from_layer" >&2
  violations=$((violations + 1))
}

resolve_import_layer() {
  local importer_dir=$1 import_path=$2 src_root=$3
  case "$import_path" in
    .*)
      local resolved
      resolved=$(realpath -m "$importer_dir/$import_path")
      case "$resolved" in
        "$src_root"/*)
          local rel=${resolved#"$src_root"/}
          printf '%s\n' "${rel%%/*}"
          ;;
        *)
          printf 'OUT_OF_SRC\n'
          ;;
      esac
      ;;
    *)
      printf 'EXTERNAL\n'
      ;;
  esac
}

scan_package() {
  local pkg_root=$1
  local src_root
  src_root=$(realpath -m "$pkg_root/src")
  [[ -d "$src_root" ]] || return 0

  while IFS= read -r src_file; do
    local rel=${src_file#"$src_root"/}
    local layer=${rel%%/*}
    [[ -v "allowed_imports[$layer]" ]] || continue

    local allowed=${allowed_imports[$layer]}

    while IFS= read -r import_line; do
      local import_path
      import_path=$(printf '%s\n' "$import_line" \
        | sed -nE 's/.*from[[:space:]]+["'\'']([^"'\'']+)["'\''].*/\1/p; s/^[[:space:]]*import[[:space:]]+["'\'']([^"'\'']+)["'\''].*/\1/p' \
        | head -n 1)
      [[ -n "$import_path" ]] || continue

      local target_layer
      target_layer=$(resolve_import_layer "$(dirname "$src_file")" "$import_path" "$src_root")

      case "$target_layer" in
        EXTERNAL|OUT_OF_SRC) continue ;;
      esac

      [[ "$target_layer" == "$layer" ]] && continue

      [[ -v "allowed_imports[$target_layer]" ]] || {
        emit_violation "$src_file" "$layer" "$target_layer" "$allowed" "$import_line"
        continue
      }

      if ! [[ ",$allowed," == *",$target_layer,"* ]]; then
        emit_violation "$src_file" "$layer" "$target_layer" "$allowed" "$import_line"
      fi
    done < <(grep -E "^[[:space:]]*import\b" "$src_file" 2>/dev/null || true)
  done < <(find "$src_root" -type f \( -name '*.ts' -o -name '*.tsx' \))
}

if [[ ! -d packages ]]; then
  printf 'layered-architecture lint: no packages/ directory; nothing to check\n'
  exit 0
fi

found_any=0
for pkg in packages/*/; do
  [[ -d "$pkg/src" ]] || continue
  found_any=1
  scan_package "${pkg%/}"
done

if (( found_any == 0 )); then
  printf 'layered-architecture lint: no packages with src/ found; nothing to check\n'
  exit 0
fi

if (( violations > 0 )); then
  printf '\n%s import-direction violation(s) found\n' "$violations" >&2
  exit 1
fi

printf 'layered-architecture lint passed\n'
