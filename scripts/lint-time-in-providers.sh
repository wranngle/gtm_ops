#!/usr/bin/env bash
# lint-time-in-providers.sh — keep wall-clock time + non-determinism inside
# packages/*/src/providers/. STACK-043.
#
# Per the layered-domain rule, the Providers layer
# is the single explicit cross-cutting boundary for runtime concerns
# (clocks, random, telemetry, feature flags). Layers above MUST receive a
# provider abstraction (e.g., `Clock` with `nowIso()`) and call through it
# instead of sampling time/random directly. That keeps the rest of the
# codebase deterministic and testable without monkey-patching globals.
#
# Forbidden outside packages/*/src/providers/:
#   - Date.now()
#   - new Date(...)         (with or without arguments)
#   - performance.now()
#   - Math.random()
#   - crypto.randomUUID()
#
# Inside providers/ these are allowed — that IS the layer's job.
#
# Each violation names the relevant provider abstraction (Clock, future
# RandomSource, etc.) so the agent's remediation is one rename away.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

violations=0

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

emit_violation() {
  local file=$1 lineno=$2 layer=$3 pattern=$4 hint=$5 line_text=$6
  printf 'lint:time-in-providers: %s:%d\n' "$file" "$lineno" >&2
  printf '  layer "%s" samples non-deterministic time/random directly: %s\n' "$layer" "$pattern" >&2
  printf '  offending line: %s\n' "$line_text" >&2
  printf '  fix: %s. See docs/references/layered-domain-architecture.md (section: Time and randomness in providers).\n' "$hint" >&2
  violations=$((violations + 1))
}

scan_file() {
  local file=$1 layer=$2

  while IFS=$'\t' read -r lineno cleaned; do
    [[ -n "$cleaned" ]] || continue

    if [[ "$cleaned" =~ Date\.now[[:space:]]*\( ]]; then
      emit_violation "$file" "$lineno" "$layer" "Date.now()" \
        "inject a Clock provider (packages/<name>/src/providers/clock.ts) and call clock.nowIso() or clock.nowMillis()" "$cleaned"
    fi

    if [[ "$cleaned" =~ new[[:space:]]+Date[[:space:]]*\( ]]; then
      emit_violation "$file" "$lineno" "$layer" "new Date(...)" \
        "inject a Clock provider and call clock.nowIso() (returns ISO 8601) instead of constructing Date directly" "$cleaned"
    fi

    if [[ "$cleaned" =~ performance\.now[[:space:]]*\( ]]; then
      emit_violation "$file" "$lineno" "$layer" "performance.now()" \
        "inject a Clock provider with a high-resolution method, or move the timing measurement into providers/ where wall-clock sampling is allowed" "$cleaned"
    fi

    if [[ "$cleaned" =~ Math\.random[[:space:]]*\( ]]; then
      emit_violation "$file" "$lineno" "$layer" "Math.random()" \
        "inject a RandomSource provider (e.g., providers/random.ts exposing a seedable RNG) instead of sampling Math.random directly" "$cleaned"
    fi

    if [[ "$cleaned" =~ crypto\.randomUUID[[:space:]]*\( ]]; then
      emit_violation "$file" "$lineno" "$layer" "crypto.randomUUID()" \
        "inject an IdSource / RandomSource provider that wraps crypto.randomUUID, so tests can substitute a deterministic id generator" "$cleaned"
    fi
  done < <(strip_comments "$file")
}

# ---------------------------------------------------------------------------
# Flat-layout enforcement — gtm_ops has no packages/ tree (yet). The types
# layer here is lib/schemas/ + src/schemas/: schema modules must stay
# deterministic (no wall-clock, no randomness) so validation results are
# reproducible in tests without monkey-patching globals. The broader
# providers-only rule applies once domains are extracted into packages/*/src/.
# ---------------------------------------------------------------------------
while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  scan_file "$file" "types (lib/src schemas)"
done < <(find lib/schemas src/schemas -type f \( -name '*.ts' -o -name '*.tsx' \) 2>/dev/null)

if [[ -d packages ]]; then
  for pkg in packages/*/; do
    src_root="$pkg/src"
    [[ -d "$src_root" ]] || continue

    while IFS= read -r file; do
      [[ -z "$file" ]] && continue
      rel="${file#"$src_root"/}"
      layer="${rel%%/*}"
      [[ "$layer" == "providers" ]] && continue
      scan_file "$file" "$layer"
    done < <(find "$src_root" -type f \( -name '*.ts' -o -name '*.tsx' \) 2>/dev/null)
  done
fi

if (( violations > 0 )); then
  printf '\n%s time-in-providers violation(s) found\n' "$violations" >&2
  exit 1
fi

printf 'time-in-providers lint passed (types layer: lib/schemas + src/schemas)\n'
