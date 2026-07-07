#!/usr/bin/env bash
# lint-json-parse-boundary.sh — keep JSON.parse() at the data boundary. STACK-044.
#
# Boundary-parsing rule: untyped data must
# be parsed at the layer that brought it in — `repo/` (filesystem / DB) or
# `config/` (env / settings) — so the rest of the codebase consumes typed
# values. Allowing JSON.parse anywhere lets agents build on guessed shapes
# and silently drift the contract.
#
# Forbidden outside packages/*/src/{repo,config,providers}/:
#   - JSON.parse(...)
#
# `providers/` is allowed because some providers wrap external SDKs that
# return JSON strings (token caches, rate-limit response bodies, etc.).
#
# Inside the allowed layers JSON.parse is expected to be paired immediately
# with a Zod (`*.parse(...)`) or equivalent runtime validation — that
# stricter rule is left to a follow-up because it would produce false
# positives without an AST. This lint covers the layer restriction only.

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
  local file=$1 lineno=$2 layer=$3 line_text=$4
  printf 'lint:json-parse-boundary: %s:%d\n' "$file" "$lineno" >&2
  printf '  layer "%s" calls JSON.parse() outside the data boundary\n' "$layer" >&2
  printf '  offending line: %s\n' "$line_text" >&2
  printf '  fix: move the parse into the layer that brought the bytes in (typically repo/ for filesystem/DB or config/ for env/settings) and immediately follow with a Zod schema parse (e.g., FooSchema.parse(JSON.parse(raw))) so the rest of the codebase consumes a typed value. See docs/references/layered-domain-architecture.md (section: Boundary parsing).\n' >&2
  violations=$((violations + 1))
}

scan_file() {
  local file=$1 layer=$2

  while IFS=$'\t' read -r lineno cleaned; do
    [[ -n "$cleaned" ]] || continue

    if [[ "$cleaned" =~ JSON\.parse[[:space:]]*\( ]]; then
      emit_violation "$file" "$lineno" "$layer" "$cleaned"
    fi
  done < <(strip_comments "$file")
}

if [[ ! -d packages ]]; then
  : # no packages/ yet — the flat-layout scan below still runs
fi

# ---------------------------------------------------------------------------
# Flat-layout enforcement — gtm_ops has no packages/ tree (yet). The types
# layer here is lib/schemas/ + src/schemas/: schema modules declare parsed
# shapes and validate already-parsed values; they must never call JSON.parse
# themselves (raw bytes belong to the layer that brought them in — see
# lib/extract.ts parseLLMJson for the LLM-output boundary convention).
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
      case "$layer" in
        repo|config|providers) continue ;;
      esac
      scan_file "$file" "$layer"
    done < <(find "$src_root" -type f \( -name '*.ts' -o -name '*.tsx' \) 2>/dev/null)
  done
fi

if (( violations > 0 )); then
  printf '\n%s json-parse-boundary violation(s) found\n' "$violations" >&2
  exit 1
fi

printf 'json-parse-boundary lint passed (types layer: lib/schemas + src/schemas)\n'
