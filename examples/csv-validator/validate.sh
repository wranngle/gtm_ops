#!/usr/bin/env bash
# CSV validator worker for the orchestrator-as-runtime demo.
#
# Contract:
#   - Argument 1 is the issue identifier (e.g. "CSV-001").
#   - Reads `examples/csv-validator/data/<id>.csv` from the repo root.
#   - Checks: 3 columns (name,email,age), email contains '@',
#     age is a positive integer. Header row required.
#   - Exits 0 on pass, 1 on fail (with stderr explaining why).
#
# This is the entire worker. No LLM, no agent harness, no per-issue
# branching, no PR shepherding. The orchestrator just runs this and
# observes the exit code.

set -euo pipefail

issueIdentifier="${1:?missing issue identifier}"
repoRoot="$(git rev-parse --show-toplevel)"
csvPath="${repoRoot}/examples/csv-validator/data/${issueIdentifier}.csv"

if [[ ! -f "$csvPath" ]]; then
  echo "validator.error: CSV not found: $csvPath" >&2
  exit 1
fi

headerLine=""
rowsValidated=0
rowsFailed=0
failureReasons=()

while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ -z "$headerLine" ]]; then
    headerLine="$line"
    expected="name,email,age"
    if [[ "$headerLine" != "$expected" ]]; then
      echo "validator.error: header mismatch (expected '$expected', got '$headerLine')" >&2
      exit 1
    fi
    continue
  fi

  IFS=',' read -ra fields <<< "$line"
  if [[ ${#fields[@]} -ne 3 ]]; then
    rowsFailed=$((rowsFailed + 1))
    failureReasons+=("row $((rowsValidated + rowsFailed)): expected 3 fields, got ${#fields[@]}")
    continue
  fi

  name="${fields[0]}"
  email="${fields[1]}"
  ageStr="${fields[2]}"

  if [[ -z "$name" ]]; then
    rowsFailed=$((rowsFailed + 1))
    failureReasons+=("row $((rowsValidated + rowsFailed)): empty name")
    continue
  fi

  if [[ "$email" != *"@"* ]]; then
    rowsFailed=$((rowsFailed + 1))
    failureReasons+=("row $((rowsValidated + rowsFailed)): email '$email' missing '@'")
    continue
  fi

  if ! [[ "$ageStr" =~ ^[0-9]+$ ]]; then
    rowsFailed=$((rowsFailed + 1))
    failureReasons+=("row $((rowsValidated + rowsFailed)): age '$ageStr' not a positive integer")
    continue
  fi

  rowsValidated=$((rowsValidated + 1))
done < "$csvPath"

if (( rowsFailed > 0 )); then
  echo "validator.failure: $rowsFailed row(s) failed validation in $csvPath" >&2
  for reason in "${failureReasons[@]}"; do
    echo "  - $reason" >&2
  done
  exit 1
fi

echo "validator.success: $rowsValidated row(s) validated in $csvPath"
exit 0
