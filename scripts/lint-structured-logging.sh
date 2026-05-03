#!/usr/bin/env bash
# lint-structured-logging.sh — enforce structured logging across packages/*/src/.
#
# Structured-logging rule: all log emission in
# packages/<name>/src/<layer>/ must go through the structured logger provider
# (packages/<name>/src/providers/logger.ts or equivalent) instead of raw
# `console.log` or `process.{stderr,stdout}.write` calls. Direct stream writes
# drift the log format and make downstream pipelines (Vector → VictoriaLogs →
# ops-console) brittle once enough free-form text accumulates that the schema
# can no longer be reasoned about.
#
# Allowed exceptions:
#   - packages/<name>/src/runtime/  — bootstrap/CLI may emit a startup banner
#     or usage message via process.stdout.write / process.stderr.write directly.
#   - packages/<name>/src/providers/logger.ts (or providers/logger/...) —
#     the logger provider IS the structured emitter; it owns the only direct
#     stderr write the rest of the package is allowed to bypass through.
#
# Forbidden patterns in any other layer:
#   - console.{log,info,warn,error,debug,trace}(...)
#   - process.{stderr,stdout}.write(...)
#
# Each violation prints a remediation hint that names the logger provider and
# points back to docs/references/layered-domain-architecture.md.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

violations=0

# Strip // line comments and /* ... */ block comments (multi-line aware) so
# commented-out console.log lines do not register. Emit one cleaned line per
# input line preserving the original line number for the violation message.
#
# Output format: <line-number>\t<cleaned-text>
strip_comments() {
  awk '
    BEGIN { in_block = 0 }
    {
      line = $0
      out = ""
      i = 1
      n = length(line)
      while (i <= n) {
        c = substr(line, i, 1)
        d = substr(line, i, 2)
        if (in_block) {
          if (d == "*/") { in_block = 0; i += 2; continue }
          i++; continue
        }
        if (d == "//") { break }
        if (d == "/*") { in_block = 1; i += 2; continue }
        out = out c
        i++
      }
      printf "%d\t%s\n", NR, out
    }
  ' "$1"
}

# emit_violation reads $pkg_name from the calling scope (bash dynamic scoping).
emit_violation() {
  local file=$1 lineno=$2 layer=$3 pattern=$4 line_text=$5
  printf 'lint:structured-logging: %s:%d\n' "$file" "$lineno" >&2
  printf '  layer "%s" emits via direct stream write or console call: %s\n' "$layer" "$pattern" >&2
  printf '  offending line: %s\n' "$line_text" >&2
  printf '  fix: route the call through the structured logger at packages/%s/src/providers/logger.ts (or the equivalent provider for this package) — call `logger.info("message", { ...fields })` instead. See docs/references/layered-domain-architecture.md (section: Structured logging).\n' "$pkg_name" >&2
  violations=$((violations + 1))
}

scan_package() {
  local pkg_root=$1
  local pkg_name
  pkg_name=$(basename "$pkg_root")
  local src_root
  src_root=$(realpath -m "$pkg_root/src")
  [[ -d "$src_root" ]] || return 0

  while IFS= read -r src_file; do
    local rel=${src_file#"$src_root"/}
    local layer=${rel%%/*}

    # Allowed exceptions (no scan).
    [[ "$layer" == "runtime" ]] && continue
    case "$rel" in
      providers/logger.ts|providers/logger.tsx) continue ;;
      providers/logger/*) continue ;;
    esac

    while IFS=$'\t' read -r lineno cleaned; do
      [[ -n "$cleaned" ]] || continue

      if [[ "$cleaned" =~ console\.(log|info|warn|error|debug|trace)[[:space:]]*\( ]]; then
        emit_violation "$src_file" "$lineno" "$layer" "console.${BASH_REMATCH[1]}" "$cleaned"
      fi

      if [[ "$cleaned" =~ process\.(stderr|stdout)\.write[[:space:]]*\( ]]; then
        emit_violation "$src_file" "$lineno" "$layer" "process.${BASH_REMATCH[1]}.write" "$cleaned"
      fi
    done < <(strip_comments "$src_file")
  done < <(find "$src_root" -type f \( -name '*.ts' -o -name '*.tsx' \))
}

if [[ ! -d packages ]]; then
  printf 'structured-logging lint: no packages/ directory; nothing to check\n'
  exit 0
fi

found_any=0
for pkg in packages/*/; do
  [[ -d "$pkg/src" ]] || continue
  found_any=1
  scan_package "${pkg%/}"
done

if (( found_any == 0 )); then
  printf 'structured-logging lint: no packages with src/ found; nothing to check\n'
  exit 0
fi

if (( violations > 0 )); then
  printf '\n%s structured-logging violation(s) found\n' "$violations" >&2
  exit 1
fi

printf 'structured-logging lint passed\n'
