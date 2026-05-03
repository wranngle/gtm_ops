#!/usr/bin/env bash
# lint-naming-conventions.sh — enforce schema/type naming pair in
# packages/*/src/{types,config}/. STACK-041.
#
# Custom-lint rule: every Zod schema and the
# type it infers must follow a discoverable naming pair so humans AND agents
# can pattern-match across the codebase without re-learning conventions per
# file:
#
#   export const FooSchema = z.object({ ... });
#   export type Foo = z.infer<typeof FooSchema>;
#
# Once one file diverges (`fooSchema`, `IFoo`, `FooDef`), the next agent
# emits the broken pattern in a second file because the codebase is now
# self-inconsistent — the agent picks whichever style it sees most recently.
# This lint pins the canonical pair so drift is caught at validate time.
#
# Forbidden patterns (in packages/*/src/types/ and packages/*/src/config/):
#   1. `export const X = z.<method>(...)` where X does not match
#      /^[A-Z][A-Za-z0-9]*Schema$/  (PascalCase + Schema suffix).
#   2. `export type X = z.infer<typeof YSchema>` where:
#        (a) X is not PascalCase, OR
#        (b) Y is not PascalCase + Schema suffix, OR
#        (c) X is not equal to Y minus the "Schema" suffix.
#   3. `export interface IFoo` — Hungarian-prefix interfaces.
#
# Each violation prints the renamed identifier so the agent can act on the
# message directly.

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
  local file=$1 lineno=$2 reason=$3 hint=$4
  printf 'lint:naming-conventions: %s:%d\n' "$file" "$lineno" >&2
  printf '  %s\n' "$reason" >&2
  printf '  fix: %s\n' "$hint" >&2
  printf '  see docs/references/layered-domain-architecture.md (section: Naming conventions).\n' >&2
  violations=$((violations + 1))
}

scan_file() {
  local file=$1

  while IFS=$'\t' read -r lineno cleaned; do
    [[ -n "$cleaned" ]] || continue

    # 1. `export const NAME = z.<method>(...)` — NAME must be PascalCase + Schema.
    if [[ "$cleaned" =~ ^[[:space:]]*export[[:space:]]+const[[:space:]]+([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*z\. ]]; then
      local name="${BASH_REMATCH[1]}"
      if ! [[ "$name" =~ ^[A-Z][A-Za-z0-9]*Schema$ ]]; then
        local first_char="${name:0:1}"
        local rest="${name:1}"
        local suggested
        # If the name already carries the Schema suffix, just fix the case;
        # otherwise add the suffix as part of the rename.
        if [[ "$name" == *Schema ]]; then
          suggested="${first_char^^}${rest}"
        else
          suggested="${first_char^^}${rest}Schema"
        fi
        emit_violation "$file" "$lineno" \
          "schema constant \"${name}\" is not PascalCase + Schema suffix" \
          "rename to \"${suggested}\" (export const ${suggested} = z.…)"
      fi
    fi

    # 2. `export type NAME = z.infer<typeof YSchema>` — NAME and YSchema both
    # PascalCase, NAME == YSchema minus the "Schema" suffix.
    if [[ "$cleaned" =~ ^[[:space:]]*export[[:space:]]+type[[:space:]]+([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*z\.infer\<[[:space:]]*typeof[[:space:]]+([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*\> ]]; then
      local type_name="${BASH_REMATCH[1]}"
      local schema_name="${BASH_REMATCH[2]}"

      if ! [[ "$type_name" =~ ^[A-Z][A-Za-z0-9]*$ ]]; then
        local first_char="${type_name:0:1}"
        local rest="${type_name:1}"
        emit_violation "$file" "$lineno" \
          "inferred type \"${type_name}\" is not PascalCase" \
          "rename to \"${first_char^^}${rest}\""
      elif ! [[ "$schema_name" =~ ^[A-Z][A-Za-z0-9]*Schema$ ]]; then
        emit_violation "$file" "$lineno" \
          "z.infer source \"${schema_name}\" is not a PascalCase + Schema-suffixed identifier" \
          "rename the underlying schema to PascalCase + Schema suffix"
      else
        local expected="${schema_name%Schema}"
        if [[ "$type_name" != "$expected" ]]; then
          emit_violation "$file" "$lineno" \
            "inferred type \"${type_name}\" does not match expected \"${expected}\" (schema \"${schema_name}\" minus \"Schema\" suffix)" \
            "rename to \"${expected}\""
        fi
      fi
    fi

    # 3. `export interface IFoo` — Hungarian-prefix forbidden.
    if [[ "$cleaned" =~ ^[[:space:]]*export[[:space:]]+interface[[:space:]]+I([A-Z][A-Za-z0-9]*) ]]; then
      local stripped="${BASH_REMATCH[1]}"
      emit_violation "$file" "$lineno" \
        "interface uses Hungarian prefix: \"I${stripped}\"" \
        "rename to \"${stripped}\" (drop the leading I)"
    fi
  done < <(strip_comments "$file")
}

if [[ ! -d packages ]]; then
  printf 'naming-conventions lint: no packages/ directory; nothing to check\n'
  exit 0
fi

found_any=0
while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  found_any=1
  scan_file "$file"
done < <(find packages -type f \( -name '*.ts' -o -name '*.tsx' \) \
                       \( -path '*/src/types/*' -o -path '*/src/config/*' \) \
         2>/dev/null)

if (( found_any == 0 )); then
  printf 'naming-conventions lint: no packages/*/src/{types,config}/ files found; nothing to check\n'
  exit 0
fi

if (( violations > 0 )); then
  printf '\n%s naming-convention violation(s) found\n' "$violations" >&2
  exit 1
fi

printf 'naming-conventions lint passed\n'
