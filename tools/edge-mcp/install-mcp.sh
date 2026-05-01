#!/usr/bin/env bash
# install-mcp.sh — register the edge-devtools MCP server in the user's
# Claude Code settings, idempotently.
#
# Usage: tools/edge-mcp/install-mcp.sh [--scope user|project]
#   user    (default) — write to ~/.claude/settings.json
#   project           — write to .claude/settings.json
#
# This script merges the edge-devtools entry into the existing
# mcpServers block, preserving any other servers the user has
# configured.

set -uo pipefail

scope=user
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope)
      scope="$2"
      shift 2
      ;;
    -h|--help)
      sed -n '2,15p' "$0"
      exit 0
      ;;
    *)
      printf 'unknown arg: %s\n' "$1" >&2
      exit 2
      ;;
  esac
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
template="$repo_root/edge-mcp/mcp.json"

case "$scope" in
  user)
    target_dir="$HOME/.claude"
    target="$target_dir/settings.json"
    ;;
  project)
    target_dir="$(cd "$repo_root/.." && pwd)/.claude"
    target="$target_dir/settings.json"
    ;;
  *)
    printf 'invalid scope: %s\n' "$scope" >&2
    exit 2
    ;;
esac

mkdir -p "$target_dir"

if [[ ! -s "$target" ]]; then
  printf '{}\n' > "$target"
fi

# Pull just the edge-devtools entry from the template.
edge_entry=$(jq '.mcpServers."edge-devtools"' "$template")

if [[ "$edge_entry" == "null" ]]; then
  printf 'edge-mcp template missing mcpServers."edge-devtools"\n' >&2
  exit 1
fi

# Merge into the target. Existing mcpServers are preserved; existing
# edge-devtools entry is overwritten.
tmp=$(mktemp)
jq --argjson entry "$edge_entry" \
  '.mcpServers = ((.mcpServers // {}) | .["edge-devtools"] = $entry)' \
  "$target" > "$tmp"
mv "$tmp" "$target"

printf 'wrote edge-devtools MCP server registration to %s\n' "$target"
printf 'next steps:\n'
printf '  1. tools/edge-mcp/edge-debug-launch.sh   # start Edge with port 9222\n'
printf '  2. restart Claude Code so it picks up the new MCP server\n'
printf '  3. verify with /mcp inside Claude Code\n'
