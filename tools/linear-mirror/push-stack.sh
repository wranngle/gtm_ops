#!/usr/bin/env bash
# push-stack.sh — one-way mirror of .symphony/issues/{todo,done}/STACK-*.md to Linear.
#
# Idempotent: an existing Linear issue with the same STACK-NNN identifier in
# its title is updated (state, description) instead of duplicated. Discovers
# existing issues via a single GraphQL query that filters by title-prefix.
#
# Filesystem stays authoritative — this is a visual mirror only. The dogfood
# loop continues to read .symphony/issues/, not Linear.
#
# Env: LINEAR_API_KEY (required), sourced from ~/.agents/.env if present.
# Workspace: WRA team (id 708a094d-8a79-4f59-b19c-bc54f12d44fa).
#
# Usage:
#   tools/linear-mirror/push-stack.sh           # mirror all STACK files
#   tools/linear-mirror/push-stack.sh --dry-run # show what would change

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

if [[ -f "$HOME/.agents/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$HOME/.agents/.env"
  set +a
fi

if [[ -z "${LINEAR_API_KEY:-}" ]]; then
  printf 'LINEAR_API_KEY not set; aborting\n' >&2
  exit 2
fi

DRY_RUN=0
CLEAN_DUPES=0
case "${1:-}" in
  --dry-run) DRY_RUN=1 ;;
  --clean-dupes)
    # Delete all but the lowest-WRA-numbered issue per STACK-NNN.
    # Useful when an earlier mirror run created duplicates due to a bug.
    CLEAN_DUPES=1
    ;;
esac

readonly TEAM_ID="708a094d-8a79-4f59-b19c-bc54f12d44fa"
readonly STATE_TODO="5aa782d7-2b10-4e62-863c-eb63e0be4eff"
readonly STATE_DONE="508031a7-afdb-4b76-bc00-b2e7efb97e0e"
readonly LINEAR_ENDPOINT="https://api.linear.app/graphql"

linear() {
  curl -sS -X POST "$LINEAR_ENDPOINT" \
    -H "Authorization: $LINEAR_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$1"
}

# Fetch all existing STACK-prefixed issues so the mirror is idempotent.
fetch_existing() {
  local payload
  payload=$(jq -nc --arg team "$TEAM_ID" '{
    query: "query($team:String!) { team(id:$team) { issues(filter:{title:{startsWith:\"STACK-\"}}, first:100) { nodes { id identifier title state { id name } } } } }",
    variables: { team: $team }
  }')
  # `// empty` so jq emits zero output (instead of erroring) when the team
  # has no STACK-prefixed issues yet — happens on the very first mirror run.
  linear "$payload" | jq -c '.data.team.issues.nodes // [] | .[] | {id, title, state_id: .state.id}'
}

# Build a "STACK-NNN" -> {linear_id, state_id} index from the fetch.
# When duplicates exist, we keep the LOWEST-WRA-numbered one (earliest)
# as the canonical row and queue the rest for cleanup.
declare -A existing_id existing_state existing_ident
declare -a dupes_to_archive=()

# Augment the fetch query for ident sorting.
fetch_existing_with_ident() {
  local payload
  payload=$(jq -nc --arg team "$TEAM_ID" '{
    query: "query($team:String!) { team(id:$team) { issues(filter:{title:{startsWith:\"STACK-\"}}, first:250) { nodes { id identifier title state { id name } } } } }",
    variables: { team: $team }
  }')
  linear "$payload" | jq -c '.data.team.issues.nodes // [] | .[] | {id, identifier, title, state_id: .state.id}'
}

while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  stack_id=$(echo "$line" | jq -r '.title' | grep -oE 'STACK-[0-9]+' | head -n1)
  [[ -z "$stack_id" ]] && continue
  this_id=$(echo "$line" | jq -r '.id')
  this_ident=$(echo "$line" | jq -r '.identifier')
  this_state=$(echo "$line" | jq -r '.state_id')

  if [[ -z "${existing_id[$stack_id]:-}" ]]; then
    existing_id["$stack_id"]="$this_id"
    existing_state["$stack_id"]="$this_state"
    existing_ident["$stack_id"]="$this_ident"
    continue
  fi

  # Compare WRA numbers; keep the lower one.
  cur_num=$(printf '%s' "${existing_ident[$stack_id]}" | grep -oE '[0-9]+$')
  this_num=$(printf '%s' "$this_ident" | grep -oE '[0-9]+$')
  if (( this_num < cur_num )); then
    # The new row is older — archive the previously-kept duplicate.
    dupes_to_archive+=("${existing_id[$stack_id]}")
    existing_id["$stack_id"]="$this_id"
    existing_state["$stack_id"]="$this_state"
    existing_ident["$stack_id"]="$this_ident"
  else
    # Existing row is older — archive this one.
    dupes_to_archive+=("$this_id")
  fi
done < <(fetch_existing_with_ident)

if (( CLEAN_DUPES )); then
  if (( ${#dupes_to_archive[@]} == 0 )); then
    printf 'no duplicates found; nothing to clean\n'
    exit 0
  fi
  printf 'archiving %d duplicate Linear issue(s)\n' "${#dupes_to_archive[@]}"
  for dup_id in "${dupes_to_archive[@]}"; do
    payload=$(jq -nc --arg id "$dup_id" '{
      query: "mutation($id:String!){issueArchive(id:$id){success}}",
      variables: { id: $id }
    }')
    result=$(linear "$payload")
    if echo "$result" | jq -e '.data.issueArchive.success' >/dev/null; then
      printf 'ARCHIVED %s\n' "$dup_id"
    else
      printf 'ARCHIVE FAILED %s: %s\n' "$dup_id" "$result" >&2
    fi
  done
  printf '\ncleanup complete; re-run without --clean-dupes to refresh state\n'
  exit 0
fi

created=0
updated=0
skipped=0

mirror_file() {
  local file=$1 desired_state=$2
  local stack_id title body desired_state_id
  stack_id=$(basename "$file" .md)
  title=$(grep -m1 '^# ' "$file" | sed 's/^# //' | head -c 200)
  [[ -z "$title" ]] && title="(no title)"
  body=$(awk 'BEGIN{p=0} /^---/{n++; if(n==2){p=1;next}} p{print}' "$file" \
         | sed "1,/^# /d" \
         | head -c 60000)
  full_title="${stack_id}: ${title}"

  case "$desired_state" in
    todo) desired_state_id="$STATE_TODO" ;;
    done) desired_state_id="$STATE_DONE" ;;
    *) printf 'unknown desired state: %s\n' "$desired_state" >&2; return 1 ;;
  esac

  if [[ -n "${existing_id[$stack_id]:-}" ]]; then
    # Update if state has drifted; otherwise skip.
    if [[ "${existing_state[$stack_id]}" == "$desired_state_id" ]]; then
      skipped=$((skipped + 1))
      return 0
    fi
    if (( DRY_RUN )); then
      printf 'WOULD UPDATE %s state=%s\n' "$stack_id" "$desired_state"
      updated=$((updated + 1))
      return 0
    fi
    local payload result
    payload=$(jq -nc \
      --arg id "${existing_id[$stack_id]}" \
      --arg state "$desired_state_id" \
      '{
        query: "mutation($id:String!,$state:String!){issueUpdate(id:$id,input:{stateId:$state}){success}}",
        variables: { id: $id, state: $state }
      }')
    result=$(linear "$payload")
    if echo "$result" | jq -e '.data.issueUpdate.success' >/dev/null; then
      printf 'UPDATED %s -> %s\n' "$stack_id" "$desired_state"
      updated=$((updated + 1))
    else
      printf 'UPDATE FAILED %s: %s\n' "$stack_id" "$result" >&2
    fi
    return 0
  fi

  # Create
  if (( DRY_RUN )); then
    printf 'WOULD CREATE %s state=%s title=%s\n' "$stack_id" "$desired_state" "$title"
    created=$((created + 1))
    return 0
  fi
  local payload result
  payload=$(jq -nc \
    --arg team "$TEAM_ID" \
    --arg state "$desired_state_id" \
    --arg title "$full_title" \
    --arg desc "$body" \
    '{
      query: "mutation($team:String!,$state:String!,$title:String!,$desc:String){issueCreate(input:{teamId:$team,stateId:$state,title:$title,description:$desc}){success issue{identifier}}}",
      variables: { team: $team, state: $state, title: $title, desc: $desc }
    }')
  result=$(linear "$payload")
  if echo "$result" | jq -e '.data.issueCreate.success' >/dev/null; then
    local lin_ident
    lin_ident=$(echo "$result" | jq -r '.data.issueCreate.issue.identifier')
    printf 'CREATED %s -> %s (%s)\n' "$stack_id" "$desired_state" "$lin_ident"
    created=$((created + 1))
  else
    printf 'CREATE FAILED %s: %s\n' "$stack_id" "$result" >&2
  fi
}

for f in .symphony/issues/todo/STACK-*.md; do
  [[ -f "$f" ]] && mirror_file "$f" todo
done

for f in .symphony/issues/done/STACK-*.md; do
  [[ -f "$f" ]] && mirror_file "$f" done
done

printf '\nmirror summary: created=%d updated=%d skipped=%d (dry_run=%d)\n' \
  "$created" "$updated" "$skipped" "$DRY_RUN"
