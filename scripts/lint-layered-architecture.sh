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
#   runtime   → types, config, repo, providers, service, ui
#   ui        → types, service          (must not bypass services)
#
# The lint inspects every `.ts(x)` file under packages/<name>/src/<layer>/...
# and flags imports/re-exports/dynamic-import() targets that point into a
# disallowed layer. Cross-domain imports (e.g., packages/a importing packages/b)
# are also flagged until the rule is extended for multi-domain repos.
#
# Recognized statement shapes (handles comments and multi-line forms):
#   import "x"
#   import x from "x"           (default and namespace)
#   import { a, b } from "x"    (named, single- or multi-line)
#   import type { T } from "x"  (type-only)
#   export { a } from "x"       (named re-export)
#   export * from "x"           (star re-export)
#   export type { T } from "x"  (type-only re-export)
#   await import("x")           (dynamic import with a literal path)
#
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
  printf '  allowed targets for "%s": %s\n' "$from_layer" "${allowed:-(none — types is the bottom layer)}" >&2
  printf '  offending statement: %s\n' "$import_line" >&2
  printf '  fix: route the call through an allowed layer (typically `service` or `providers`), or move the imported module into a layer that "%s" is allowed to consume. See docs/references/layered-domain-architecture.md for the allowed-imports table and remediation playbook.\n' "$from_layer" >&2
  violations=$((violations + 1))
}

emit_cross_domain_violation() {
  local file=$1 from_layer=$2 from_pkg=$3 to_pkg=$4 import_line=$5
  printf 'lint:layered-architecture: %s\n' "$file" >&2
  printf '  package "%s" imports across the domain boundary into package "%s"\n' "$from_pkg" "$to_pkg" >&2
  printf '  offending statement: %s\n' "$import_line" >&2
  printf '  fix: cross-domain imports are not yet supported by the lint. Either (1) extract the shared types/contracts into a new shared package and have both domains depend on it, (2) call the other domain through an explicit `providers/` adapter, or (3) update docs/references/layered-domain-architecture.md to define the inter-domain contract before extending this lint to permit it.\n' >&2
  violations=$((violations + 1))
}

packages_root="$(realpath -m "$repo_root/packages")"

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
        "$packages_root"/*/src/*)
          # Relative import that escaped this package's src/ but landed in
          # another package's src/ — that's a forbidden cross-domain import.
          # The lint emits CROSS_DOMAIN so the violation message can name the
          # other package.
          local cross_rel=${resolved#"$packages_root"/}
          printf 'CROSS_DOMAIN:%s\n' "${cross_rel%%/*}"
          ;;
        *)
          printf 'OUT_OF_SRC\n'
          ;;
      esac
      ;;
    @wranngle/*)
      # Workspace-style imports into another internal package. Treat the
      # @wranngle scope as our domain registry; anything under it that is
      # not the importer's own package is a cross-domain import.
      local pkg=${import_path#@wranngle/}
      pkg=${pkg%%/*}
      printf 'CROSS_DOMAIN:%s\n' "$pkg"
      ;;
    *)
      printf 'EXTERNAL\n'
      ;;
  esac
}

# Normalize a TypeScript file into one logical statement per line and strip
# comments so the regex layer can match imports/re-exports reliably even when
# they span multiple lines or share a line with comments.
#
# Output format: one extracted statement per line, in the form
#   <module-spec>\t<original statement text>
# where <module-spec> is the bare string from the `from "..."` clause (or the
# argument to `import("...")` / bare `import "..."`).
extract_module_statements() {
  local file=$1
  awk '
    BEGIN { in_block = 0; buf = ""; out = "" }
    {
      line = $0
      i = 1
      n = length(line)
      while (i <= n) {
        c = substr(line, i, 1)
        d = substr(line, i, 2)
        if (in_block) {
          if (d == "*/") { in_block = 0; i += 2; continue }
          i++; continue
        }
        # Single-line comment terminates the rest of the line.
        if (d == "//") { break }
        # Block comment starts.
        if (d == "/*") { in_block = 1; i += 2; continue }
        out = out c
        i++
      }
      out = out " "
    }
    END {
      # Walk the cleaned text and emit one statement per line whenever we hit
      # a semicolon or a closing-brace-from pattern. We only care about lines
      # that contain `import` or `export ... from`, so a coarse split is fine.
      gsub(/[\t\n\r]+/, " ", out)
      # Insert a newline boundary after every semicolon to split statements.
      gsub(/;[[:space:]]*/, ";\n", out)
      n_lines = split(out, lines, /\n/)
      for (li = 1; li <= n_lines; li++) {
        stmt = lines[li]
        # Trim leading whitespace.
        sub(/^[[:space:]]+/, "", stmt)
        sub(/[[:space:]]+$/, "", stmt)
        if (stmt == "") continue
        spec = ""
        # `import "x"` (side-effect, no clause)
        if (match(stmt, /^import[[:space:]]+["'\''][^"'\'']+["'\'']/)) {
          s = substr(stmt, RSTART, RLENGTH)
          if (match(s, /["'\''][^"'\'']+["'\'']/)) {
            spec = substr(s, RSTART + 1, RLENGTH - 2)
          }
        } else if (match(stmt, /^import[[:space:]].*[[:space:]]from[[:space:]]*["'\''][^"'\'']+["'\'']/)) {
          # `import ... from "x"`
          s = substr(stmt, RSTART, RLENGTH)
          if (match(s, /from[[:space:]]*["'\''][^"'\'']+["'\'']/)) {
            t = substr(s, RSTART, RLENGTH)
            if (match(t, /["'\''][^"'\'']+["'\'']/)) {
              spec = substr(t, RSTART + 1, RLENGTH - 2)
            }
          }
        } else if (match(stmt, /^export[[:space:]].*[[:space:]]from[[:space:]]*["'\''][^"'\'']+["'\'']/)) {
          # `export ... from "x"` (named or `*` re-export)
          s = substr(stmt, RSTART, RLENGTH)
          if (match(s, /from[[:space:]]*["'\''][^"'\'']+["'\'']/)) {
            t = substr(s, RSTART, RLENGTH)
            if (match(t, /["'\''][^"'\'']+["'\'']/)) {
              spec = substr(t, RSTART + 1, RLENGTH - 2)
            }
          }
        } else if (match(stmt, /(^|[^A-Za-z_$])import[[:space:]]*\([[:space:]]*["'\''][^"'\'']+["'\'']/)) {
          # `import("x")` dynamic import with a literal path. Use a leading
          # non-identifier guard since POSIX awk does not support \b reliably.
          s = substr(stmt, RSTART, RLENGTH)
          if (match(s, /["'\''][^"'\'']+["'\'']/)) {
            spec = substr(s, RSTART + 1, RLENGTH - 2)
          }
        }
        if (spec != "") {
          printf "%s\t%s\n", spec, stmt
        }
      }
    }
  ' "$file"
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

    local own_pkg_name
    own_pkg_name=$(basename "$pkg_root")

    while IFS=$'\t' read -r import_path import_line; do
      [[ -n "$import_path" ]] || continue

      local target_layer
      target_layer=$(resolve_import_layer "$(dirname "$src_file")" "$import_path" "$src_root")

      case "$target_layer" in
        EXTERNAL|OUT_OF_SRC) continue ;;
        CROSS_DOMAIN:*)
          local other_pkg=${target_layer#CROSS_DOMAIN:}
          # @wranngle/<self> is allowed (rare; covers package self-reference).
          if [[ "$other_pkg" == "$own_pkg_name" ]]; then
            continue
          fi
          emit_cross_domain_violation "$src_file" "$layer" "$own_pkg_name" "$other_pkg" "$import_line"
          continue
          ;;
      esac

      [[ "$target_layer" == "$layer" ]] && continue

      [[ -v "allowed_imports[$target_layer]" ]] || {
        emit_violation "$src_file" "$layer" "$target_layer" "$allowed" "$import_line"
        continue
      }

      if ! [[ ",$allowed," == *",$target_layer,"* ]]; then
        emit_violation "$src_file" "$layer" "$target_layer" "$allowed" "$import_line"
      fi
    done < <(extract_module_statements "$src_file")
  done < <(find "$src_root" -type f \( -name '*.ts' -o -name '*.tsx' \))
}

# ---------------------------------------------------------------------------
# Flat-layout enforcement — gtm_ops has no packages/ tree (yet). Until domains
# are extracted, the import-direction rules that ARE mechanically checkable in
# the current layout are enforced here (each was verified to hold when this
# section landed — a lint that is red on day one teaches agents to ignore it):
#
#   1. The types layer (lib/schemas/ + src/schemas/) imports only within the
#      schema trees or from external packages — types are the bottom layer.
#   2. lib/ src/ functions/ never import the runtime entrypoints
#      (server.ts / cli.ts) — runtime is the top layer; no back-imports.
#   3. apps/ops-console/ never imports lib/ src/ functions/ — the no-build
#      console (UMD + babel-standalone) is self-contained; a build-time
#      import would silently break at runtime.
#
# When packages/*/src/ appears, the full per-layer scan above also runs.
# ---------------------------------------------------------------------------

emit_flat_violation() {
  local file=$1 rule=$2 detail=$3 fix=$4 import_line=$5
  printf 'lint:layered-architecture: %s\n' "$file" >&2
  printf '  %s\n' "$rule" >&2
  printf '  %s\n' "$detail" >&2
  printf '  offending statement: %s\n' "$import_line" >&2
  printf '  fix: %s See docs/references/layered-domain-architecture.md.\n' "$fix" >&2
  violations=$((violations + 1))
}

scan_flat_types_layer() {
  local root
  for root in lib/schemas src/schemas; do
    [[ -d "$root" ]] || continue
    while IFS= read -r file; do
      while IFS=$'\t' read -r spec stmt; do
        [[ -n "$spec" ]] || continue
        case "$spec" in
          .*)
            local resolved
            resolved=$(realpath -m "$(dirname "$file")/$spec")
            case "$resolved" in
              "$repo_root"/lib/schemas/*|"$repo_root"/src/schemas/*) ;;
              *)
                emit_flat_violation "$file" \
                  'types layer (schemas) imports outside the schema trees' \
                  "resolved target: ${resolved#"$repo_root"/}" \
                  'types are the bottom layer — move the shared value into a schema module, or lift the consumer up a layer.' \
                  "$stmt"
                ;;
            esac
            ;;
        esac
      done < <(extract_module_statements "$file")
    done < <(find "$root" -type f \( -name '*.ts' -o -name '*.tsx' \))
  done
}

scan_flat_runtime_backimports() {
  while IFS= read -r file; do
    while IFS=$'\t' read -r spec stmt; do
      [[ -n "$spec" ]] || continue
      case "$spec" in
        .*)
          local resolved base
          resolved=$(realpath -m "$(dirname "$file")/$spec")
          base=${resolved%.js}
          base=${base%.ts}
          if [[ "$base" == "$repo_root/server" || "$base" == "$repo_root/cli" ]]; then
            emit_flat_violation "$file" \
              'library code imports a runtime entrypoint (server.ts / cli.ts)' \
              "resolved target: ${resolved#"$repo_root"/}" \
              'runtime is the top layer — extract the shared logic into lib/ (or src/) and import it from both sides.' \
              "$stmt"
          fi
          ;;
      esac
    done < <(extract_module_statements "$file")
  done < <(find lib src functions -type f \( -name '*.ts' -o -name '*.tsx' \) \
             -not -path '*/schemas/*' -not -path '*/node_modules/*' 2>/dev/null)
}

scan_flat_console_isolation() {
  [[ -d apps/ops-console ]] || return 0
  while IFS= read -r file; do
    while IFS=$'\t' read -r spec stmt; do
      [[ -n "$spec" ]] || continue
      case "$spec" in
        .*)
          local resolved
          resolved=$(realpath -m "$(dirname "$file")/$spec")
          case "$resolved" in
            "$repo_root"/lib/*|"$repo_root"/src/*|"$repo_root"/functions/*)
              emit_flat_violation "$file" \
                'the no-build console imports backend code (lib/ src/ functions/)' \
                "resolved target: ${resolved#"$repo_root"/}" \
                'the console runs as UMD + babel-standalone with no bundler — talk to the backend over /api/* instead of importing it.' \
                "$stmt"
              ;;
          esac
          ;;
      esac
    done < <(extract_module_statements "$file")
  done < <(find apps/ops-console -type f \( -name '*.ts' -o -name '*.tsx' \) \
             -not -path '*/node_modules/*' 2>/dev/null)
}

scan_flat_types_layer
scan_flat_runtime_backimports
scan_flat_console_isolation

if [[ -d packages ]]; then
  for pkg in packages/*/; do
    [[ -d "$pkg/src" ]] || continue
    scan_package "${pkg%/}"
  done
fi

if (( violations > 0 )); then
  printf '\n%s import-direction violation(s) found\n' "$violations" >&2
  exit 1
fi

printf 'layered-architecture lint passed (flat-layout rules: types isolation, no runtime back-imports, console isolation%s)\n' \
  "$([[ -d packages ]] && printf '; packages/ per-layer scan')"
