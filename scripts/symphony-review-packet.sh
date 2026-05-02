#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

issue=""
workspace_root="${SYMPHONY_WORKSPACE_ROOT:-.symphony/workspaces}"
source_worktree="$repo_root"
target_url=""
before_url=""
before_artifact=""
after_artifact=""
walkthrough_artifact=""
fixture_visual="false"
declare -a commands=()

usage(){
  cat <<'USAGE'
Usage:
  scripts/symphony-review-packet.sh create --issue ISSUE [options]

Options:
  --workspace-root PATH       Workspace root (default: .symphony/workspaces)
  --source-worktree PATH      Git worktree to inspect/run commands in (default: repo root)
  --command CMD               Command to run and record; may be repeated
  --target-url URL            URL or local path under review
  --ui-url URL                Alias for --target-url; marks the packet as UI evidence
  --before-artifact PATH      Existing before screenshot/video to copy
  --after-artifact PATH       Existing after screenshot/video to copy
  --walkthrough-artifact PATH Existing walkthrough video/GIF/HTML to copy
  --fixture-visual            Create synthetic visual artifacts for smoke tests

If --target-url/--ui-url is set, the packet must contain visual evidence.
Provide artifacts, set SYMPHONY_BROWSER_CAPTURE_CMD, or use --fixture-visual
in tests. SYMPHONY_BROWSER_CAPTURE_CMD may contain {url} and {output} tokens.
USAGE
}

fail(){
  printf 'symphony-review-packet: %s\n' "$1" >&2
  exit 1
}

sanitize_key(){
  printf '%s' "$1" | sed -E 's/[^A-Za-z0-9._-]+/_/g; s/^_+//; s/_+$//'
}

assert_under_workspace_root(){
  local packet_dir="$1" root_abs packet_abs
  mkdir -p "$workspace_root" "$packet_dir"
  root_abs="$(cd "$workspace_root" && pwd)"
  packet_abs="$(cd "$packet_dir" && pwd)"
  case "$packet_abs/" in
    "$root_abs/"*) ;;
    *) fail "packet path escaped workspace root: $packet_abs" ;;
  esac
}

copy_artifact(){
  local input="$1" output_name="$2" artifacts_dir="$3"
  [[ -n "$input" ]] || return 0
  [[ -f "$input" ]] || fail "artifact not found: $input"
  cp "$input" "$artifacts_dir/$output_name"
  printf 'artifacts/%s\n' "$output_name"
}

artifact_extension(){
  local input="$1" base ext
  base="$(basename "$input")"
  ext="${base##*.}"
  [[ "$base" != "$ext" ]] && printf '.%s' "$ext"
}

write_fixture_svg(){
  local output="$1" label="$2"
  cat > "$output" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <rect width="960" height="540" fill="#f7f5ef"/>
  <rect x="56" y="56" width="848" height="428" rx="8" fill="#ffffff" stroke="#2f4f4f" stroke-width="4"/>
  <text x="96" y="150" font-family="Arial, sans-serif" font-size="42" fill="#16302b">$label</text>
  <text x="96" y="220" font-family="Arial, sans-serif" font-size="24" fill="#425c57">Synthetic review-packet visual fixture</text>
  <text x="96" y="270" font-family="Arial, sans-serif" font-size="20" fill="#425c57">Target: $target_url</text>
</svg>
SVG
}

write_walkthrough_html(){
  local output="$1"
  cat > "$output" <<HTML
<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Review Packet Walkthrough</title>
<body>
<h1>Review Packet Walkthrough</h1>
<p>Issue: $issue</p>
<p>Target: $target_url</p>
<ol>
  <li>Open the before artifact.</li>
  <li>Open the after artifact.</li>
  <li>Compare validator output in the manifest.</li>
</ol>
</body>
</html>
HTML
}

run_capture_cmd(){
  local url="$1" output="$2" capture_cmd="${SYMPHONY_BROWSER_CAPTURE_CMD:-}"
  [[ -n "$capture_cmd" ]] || return 1
  capture_cmd="${capture_cmd//\{url\}/$url}"
  capture_cmd="${capture_cmd//\{output\}/$output}"
  (cd "$source_worktree" && bash -lc "$capture_cmd")
}

run_packet_command(){
  local index="$1" command="$2" logs_dir="$3" log_file rc=0
  log_file="$logs_dir/command-$index.log"
  (cd "$source_worktree" && bash -lc "$command") > "$log_file" 2>&1 || rc=$?
  printf '%s\t%s\t%s\n' "$rc" "logs/command-$index.log" "$command"
}

write_changed_files(){
  local output="$1"
  if git -C "$source_worktree" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    {
      printf '# Changed Files\n\n'
      git -C "$source_worktree" status --short
      printf '\n# Diff Stat\n\n'
      git -C "$source_worktree" diff --stat
    } > "$output"
  else
    printf 'not a git worktree: %s\n' "$source_worktree" > "$output"
  fi
}

create_packet(){
  [[ -n "$issue" ]] || fail "--issue is required"
  [[ -d "$source_worktree" ]] || fail "source worktree not found: $source_worktree"

  local workspace_key packet_dir logs_dir artifacts_dir manifest commands_tmp artifacts_tmp changed_file
  workspace_key="$(sanitize_key "$issue")"
  packet_dir="$workspace_root/$workspace_key/review-packet"
  logs_dir="$packet_dir/logs"
  artifacts_dir="$packet_dir/artifacts"
  manifest="$packet_dir/manifest.md"
  commands_tmp="$packet_dir/.commands.tsv"
  artifacts_tmp="$packet_dir/.artifacts.txt"
  changed_file="$packet_dir/changed-files.md"

  assert_under_workspace_root "$packet_dir"
  mkdir -p "$logs_dir" "$artifacts_dir"
  : > "$commands_tmp"
  : > "$artifacts_tmp"

  local i=1
  for command in "${commands[@]}"; do
    run_packet_command "$i" "$command" "$logs_dir" >> "$commands_tmp"
    i=$((i + 1))
  done
  write_changed_files "$changed_file"

  if [[ -n "$target_url" ]]; then
    if [[ -n "$before_artifact" || -n "$after_artifact" || -n "$walkthrough_artifact" ]]; then
      [[ -n "$before_artifact" && -n "$after_artifact" && -n "$walkthrough_artifact" ]] \
        || fail "UI artifact mode requires --before-artifact, --after-artifact, and --walkthrough-artifact"
      copy_artifact "$before_artifact" "before$(artifact_extension "$before_artifact")" "$artifacts_dir" >> "$artifacts_tmp"
      copy_artifact "$after_artifact" "after$(artifact_extension "$after_artifact")" "$artifacts_dir" >> "$artifacts_tmp"
      copy_artifact "$walkthrough_artifact" "walkthrough$(artifact_extension "$walkthrough_artifact")" "$artifacts_dir" >> "$artifacts_tmp"
    elif [[ "$fixture_visual" == "true" ]]; then
      write_fixture_svg "$artifacts_dir/before.svg" "$issue before"
      write_fixture_svg "$artifacts_dir/after.svg" "$issue after"
      write_walkthrough_html "$artifacts_dir/walkthrough.html"
      printf 'artifacts/before.svg\nartifacts/after.svg\nartifacts/walkthrough.html\n' >> "$artifacts_tmp"
    else
      local before_output="$artifacts_dir/before.png" after_output="$artifacts_dir/after.png"
      if run_capture_cmd "${before_url:-$target_url}" "$before_output" && run_capture_cmd "$target_url" "$after_output"; then
        write_walkthrough_html "$artifacts_dir/walkthrough.html"
        printf 'artifacts/before.png\nartifacts/after.png\nartifacts/walkthrough.html\n' >> "$artifacts_tmp"
      else
        fail "UI packet requested but no visual artifacts were provided and SYMPHONY_BROWSER_CAPTURE_CMD did not run"
      fi
    fi
  fi

  {
    printf '# Review Packet\n\n'
    printf '%s\n' "- Issue: \`$issue\`"
    printf '%s\n' "- Created UTC: \`$(date -u +%Y-%m-%dT%H:%M:%SZ)\`"
    printf '%s\n' "- Source worktree: \`$source_worktree\`"
    printf '%s\n' "- Target URL/path: \`${target_url:-none}\`"
    printf '%s\n\n' "- Changed files: \`changed-files.md\`"
    printf '## Command Results\n\n'
    if [[ -s "$commands_tmp" ]]; then
      printf '| Exit | Log | Command |\n| --- | --- | --- |\n'
      while IFS=$'\t' read -r rc log_path command; do
        printf '| %s | `%s` | `%s` |\n' "$rc" "$log_path" "$command"
      done < "$commands_tmp"
    else
      printf 'No commands recorded.\n'
    fi
    printf '\n## Artifacts\n\n'
    if [[ -s "$artifacts_tmp" ]]; then
      while IFS= read -r artifact; do
        [[ -n "$artifact" ]] && printf '%s\n' "- \`$artifact\`"
      done < "$artifacts_tmp"
    else
      printf 'Text-only packet; no visual artifacts required.\n'
    fi
  } > "$manifest"

  rm -f "$commands_tmp" "$artifacts_tmp"
  printf '%s\n' "$manifest"
}

command_name="${1:-help}"
shift || true
case "$command_name" in
  create)
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --issue) issue="$2"; shift 2 ;;
        --workspace-root) workspace_root="$2"; shift 2 ;;
        --source-worktree) source_worktree="$2"; shift 2 ;;
        --command) commands+=("$2"); shift 2 ;;
        --target-url|--ui-url) target_url="$2"; shift 2 ;;
        --before-url) before_url="$2"; shift 2 ;;
        --before-artifact) before_artifact="$2"; shift 2 ;;
        --after-artifact) after_artifact="$2"; shift 2 ;;
        --walkthrough-artifact) walkthrough_artifact="$2"; shift 2 ;;
        --fixture-visual) fixture_visual="true"; shift ;;
        -h|--help) usage; exit 0 ;;
        *) fail "unknown argument: $1" ;;
      esac
    done
    create_packet
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
