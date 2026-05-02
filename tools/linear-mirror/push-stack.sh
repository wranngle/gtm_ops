#!/usr/bin/env bash
# push-stack.sh — one-way enriched mirror of .symphony/issues/{todo,done}/
# STACK-*.md to the Wranngle Linear workspace (team WRA).
#
# Filesystem stays authoritative — this is a visual surface so an operator
# can browse the backlog and closure history in Linear without losing the
# file-based source of truth. The dogfood loop continues to read from
# .symphony/issues/, not Linear.
#
# Enrichment convention (STACK-NNN.md → Linear issue):
#
#   STACK frontmatter `priority: 1|2|3`   → Linear priority (1=Urgent, 2=High,
#                                            3=Normal); STACK files without
#                                            a priority default to 4=Low.
#   STACK frontmatter `labels: a,b,c`     → Linear labels (auto-created if
#                                            missing) plus `stack` and
#                                            `auto-mirror` always.
#   STACK body (after second `---`)       → Linear description (preserves
#                                            `# Title` + Problem/Fix/Accept
#                                            sections verbatim).
#   Closing git commit (state=done)       → appended to description as
#                                            `_Closed in [SHA](github.com/...)_`
#                                            using `git log --grep=STACK-NNN`.
#
# Idempotency: existing Linear issues with the same `STACK-NNN: ` title
# prefix are updated only when any tracked field (state, priority, labels,
# description) drifts. Untouched issues are skipped.
#
# Usage:
#   tools/linear-mirror/push-stack.sh             mirror all STACK files
#   tools/linear-mirror/push-stack.sh --dry-run   show what would change
#   tools/linear-mirror/push-stack.sh --clean-dupes
#                                                 archive duplicates (kept
#                                                 for legacy mirror runs)

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
  --clean-dupes) CLEAN_DUPES=1 ;;
esac

readonly TEAM_ID="708a094d-8a79-4f59-b19c-bc54f12d44fa"
readonly STATE_TODO="5aa782d7-2b10-4e62-863c-eb63e0be4eff"
readonly STATE_DONE="508031a7-afdb-4b76-bc00-b2e7efb97e0e"
readonly LINEAR_ENDPOINT="https://api.linear.app/graphql"
readonly GH_REPO_URL="https://github.com/wranngle/wranngle-gtm-engine"

linear() {
  curl -sS -X POST "$LINEAR_ENDPOINT" \
    -H "Authorization: $LINEAR_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$1"
}

# ============== Label cache ==============
#
# Fetched once at startup so we can map STACK frontmatter labels to Linear
# label IDs without a per-issue round trip. Missing labels are created on
# demand by ensure_label_id and added to the cache.

declare -A label_id_by_name

prime_label_cache() {
  local payload result
  payload=$(jq -nc --arg team "$TEAM_ID" '{
    query: "query($team:String!){team(id:$team){labels(first:250){nodes{id name}}}}",
    variables: {team: $team}
  }')
  result=$(linear "$payload")
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    local id name
    id=$(echo "$line" | jq -r '.id')
    name=$(echo "$line" | jq -r '.name')
    label_id_by_name["$name"]="$id"
  done < <(echo "$result" | jq -c '.data.team.labels.nodes // [] | .[]')
}

ensure_label_id() {
  local name=$1
  if [[ -n "${label_id_by_name[$name]:-}" ]]; then
    printf '%s' "${label_id_by_name[$name]}"
    return 0
  fi
  if (( DRY_RUN )); then
    printf 'WOULD-CREATE-LABEL:%s' "$name"
    return 0
  fi
  local payload result id
  payload=$(jq -nc --arg team "$TEAM_ID" --arg name "$name" '{
    query: "mutation($team:String!,$name:String!){issueLabelCreate(input:{teamId:$team,name:$name}){success issueLabel{id}}}",
    variables: {team: $team, name: $name}
  }')
  result=$(linear "$payload")
  id=$(echo "$result" | jq -r '.data.issueLabelCreate.issueLabel.id // empty')

  # Most-common cause of empty id: label already exists. Look it up by
  # exact name and add to cache so the next call is a hit.
  if [[ -z "$id" ]]; then
    local lookup
    lookup=$(jq -nc --arg team "$TEAM_ID" --arg name "$name" '{
      query: "query($team:String!,$name:String!){team(id:$team){labels(filter:{name:{eq:$name}},first:1){nodes{id}}}}",
      variables: {team: $team, name: $name}
    }')
    id=$(linear "$lookup" | jq -r '.data.team.labels.nodes[0].id // empty')
    if [[ -n "$id" ]]; then
      label_id_by_name["$name"]="$id"
      printf 'RESOLVED-LABEL %s (%s, was-pre-existing)\n' "$name" "$id" >&2
      printf '%s' "$id"
      return 0
    fi
    printf 'LABEL RESOLVE FAILED %s: %s\n' "$name" "$result" >&2
    return 1
  fi

  label_id_by_name["$name"]="$id"
  printf 'CREATED-LABEL %s (%s)\n' "$name" "$id" >&2
  printf '%s' "$id"
}

# ============== Existing-issue index ==============
#
# Fetches all STACK-prefixed Linear issues with the fields we need to do
# drift-aware idempotency: title, state.id, priority, labels (set), and
# description. The mirror updates only when any of these differs from the
# desired value computed from the .md file.

declare -A existing_id existing_state existing_ident existing_priority \
            existing_description existing_labels

declare -a dupes_to_archive=()

prime_existing_cache() {
  local payload
  payload=$(jq -nc --arg team "$TEAM_ID" '{
    query: "query($team:String!){team(id:$team){issues(filter:{title:{startsWith:\"STACK-\"}},first:250){nodes{id identifier title state{id} priority description labels{nodes{id name}}}}}}",
    variables: {team: $team}
  }')
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    local id ident title state_id priority desc labels stack_id
    id=$(echo "$line" | jq -r '.id')
    ident=$(echo "$line" | jq -r '.identifier')
    title=$(echo "$line" | jq -r '.title')
    state_id=$(echo "$line" | jq -r '.state.id')
    priority=$(echo "$line" | jq -r '.priority // 0')
    desc=$(echo "$line" | jq -r '.description // ""')
    # Sort label IDs so the comparison is order-stable.
    labels=$(echo "$line" | jq -r '[.labels.nodes[].id] | sort | join(",")')
    stack_id=$(printf '%s' "$title" | grep -oE 'STACK-[0-9]+' | head -n1)
    [[ -z "$stack_id" ]] && continue

    if [[ -z "${existing_id[$stack_id]:-}" ]]; then
      existing_id["$stack_id"]="$id"
      existing_ident["$stack_id"]="$ident"
      existing_state["$stack_id"]="$state_id"
      existing_priority["$stack_id"]="$priority"
      existing_description["$stack_id"]="$desc"
      existing_labels["$stack_id"]="$labels"
      continue
    fi

    # Duplicate — keep the lower WRA-NN one, queue the other for archive.
    local cur_num this_num
    cur_num=$(printf '%s' "${existing_ident[$stack_id]}" | grep -oE '[0-9]+$')
    this_num=$(printf '%s' "$ident" | grep -oE '[0-9]+$')
    if (( this_num < cur_num )); then
      dupes_to_archive+=("${existing_id[$stack_id]}")
      existing_id["$stack_id"]="$id"
      existing_ident["$stack_id"]="$ident"
      existing_state["$stack_id"]="$state_id"
      existing_priority["$stack_id"]="$priority"
      existing_description["$stack_id"]="$desc"
      existing_labels["$stack_id"]="$labels"
    else
      dupes_to_archive+=("$id")
    fi
  done < <(linear "$payload" | jq -c '.data.team.issues.nodes // [] | .[]')
}

prime_label_cache
prime_existing_cache

# ============== Pre-resolve all labels ==============
#
# Critical: build_label_ids_csv is called from inside command-substitution
# `$(...)` blocks during mirror_file, which means it runs in a subshell.
# Subshell additions to the global label_id_by_name array do NOT persist
# back to the parent. So we walk every STACK file ONCE in the parent
# shell first, collect the union of labels, and ensure each exists. After
# this pass the cache is fully populated; per-issue lookups just read.

pre_resolve_all_labels() {
  declare -A seen_label
  for f in .symphony/issues/todo/STACK-*.md .symphony/issues/done/STACK-*.md; do
    [[ -f "$f" ]] || continue
    local names
    names=$(extract_labels "$f")
    for name in $names; do
      [[ -z "$name" ]] && continue
      [[ -n "${seen_label[$name]:-}" ]] && continue
      seen_label["$name"]=1
      ensure_label_id "$name" >/dev/null || true
    done
  done
}

# extract_labels is defined later, so we forward-declare via re-source. Simpler
# fix: define a minimal inline parser here that mirrors extract_labels' output.
extract_labels_inline() {
  local file=$1 raw
  raw=$(awk '/^---/{n++;next} n==1 && /^labels:/{sub(/^labels:[[:space:]]*/, ""); print; exit}' "$file")
  raw=$(printf '%s' "$raw" | tr ',' ' ' | tr -s ' \t')
  printf '%s stack auto-mirror' "$raw"
}

# Replace the forward call with the inline version so we don't depend on
# definition order.
declare -A seen_label
for f in .symphony/issues/todo/STACK-*.md .symphony/issues/done/STACK-*.md; do
  [[ -f "$f" ]] || continue
  names=$(extract_labels_inline "$f")
  for name in $names; do
    [[ -z "$name" ]] && continue
    [[ -n "${seen_label[$name]:-}" ]] && continue
    seen_label["$name"]=1
    ensure_label_id "$name" >/dev/null 2>&1 || true
  done
done
unset seen_label

if (( CLEAN_DUPES )); then
  if (( ${#dupes_to_archive[@]} == 0 )); then
    printf 'no duplicates found; nothing to clean\n'
    exit 0
  fi
  printf 'archiving %d duplicate Linear issue(s)\n' "${#dupes_to_archive[@]}"
  for dup_id in "${dupes_to_archive[@]}"; do
    payload=$(jq -nc --arg id "$dup_id" '{
      query: "mutation($id:String!){issueArchive(id:$id){success}}",
      variables: {id: $id}
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

# ============== STACK-file → desired-Linear-fields parsers ==============

extract_priority() {
  # STACK frontmatter `priority: N` → Linear priority (1=Urgent,2=High,3=Normal,4=Low).
  # Symphony STACK files use the same 1=highest convention so the mapping is identity.
  local file=$1 raw
  raw=$(awk '/^---/{n++;next} n==1 && /^priority:/{sub(/^priority:[[:space:]]*/, ""); print; exit}' "$file")
  case "$raw" in
    1|2|3|4) printf '%s' "$raw" ;;
    *) printf '4' ;;
  esac
}

extract_labels() {
  # STACK frontmatter `labels: a,b,c` → space-separated label names, plus
  # `stack` and `auto-mirror` appended to every issue so an operator can
  # filter "all mirrored" issues separately from native Linear ones.
  local file=$1 raw
  raw=$(awk '/^---/{n++;next} n==1 && /^labels:/{sub(/^labels:[[:space:]]*/, ""); print; exit}' "$file")
  # Replace commas with spaces, normalize whitespace.
  raw=$(printf '%s' "$raw" | tr ',' ' ' | tr -s ' \t')
  printf '%s stack auto-mirror' "$raw"
}

extract_full_body() {
  # Everything after the second `---` divider, including the `# Title` line.
  local file=$1
  awk 'BEGIN{p=0} /^---/{n++; if(n==2){p=1;next}} p{print}' "$file" \
    | head -c 60000
}

find_closing_commit_sha() {
  # Look for "STACK-NNN" in any commit subject line (case-insensitive).
  # Returns the most recent matching SHA, or empty if none.
  local stack_id=$1
  git log --grep="$stack_id" -n 1 --pretty=%H 2>/dev/null
}

build_description() {
  local file=$1 desired_state=$2 stack_id=$3
  local body sha link hash
  body=$(extract_full_body "$file")
  if [[ "$desired_state" == "done" ]]; then
    sha=$(find_closing_commit_sha "$stack_id")
    if [[ -n "$sha" ]]; then
      link=$(printf '\n\n---\n_Closed in commit [%s](<%s/commit/%s>)_' "${sha:0:8}" "$GH_REPO_URL" "$sha")
      body="${body}${link}"
    fi
  fi
  # Linear's markdown parser normalizes emphasis tokens (_x_ → *x*) on
  # store, so byte-level desc comparison after a roundtrip always fails.
  # Embed a stable source hash as plain text (no markdown chars) so the
  # marker survives normalization, then compare hashes for idempotency.
  hash=$(printf '%s' "$body" | sha256sum | cut -c1-16)
  body+=$(printf '\n\nmirror-hash: %s' "$hash")
  printf '%s' "$body"
}

extract_mirror_hash() {
  # Pull the embedded hash out of a stored Linear description for the
  # idempotency comparison. Linear may have normalized markdown around it
  # but the bare `mirror-hash: <hex>` line stays intact. awk over grep
  # so a missing marker returns "" (empty) instead of exit 1, which would
  # trip set -e in the calling block.
  printf '%s' "$1" | awk '
    BEGIN { last = "" }
    /mirror-hash:/ {
      if (match($0, /mirror-hash:[[:space:]]*[a-f0-9]+/)) {
        m = substr($0, RSTART, RLENGTH)
        sub(/^mirror-hash:[[:space:]]*/, "", m)
        last = m
      }
    }
    END { if (last != "") print last }
  '
}

build_label_ids_csv() {
  # Resolve each label name to its Linear id (creating if needed). Returns
  # a comma-separated string sorted lexically so it can be diffed against
  # the existing-cache's order-stable representation.
  local names_str=$1
  local ids=()
  for name in $names_str; do
    [[ -z "$name" ]] && continue
    local id
    id=$(ensure_label_id "$name")
    [[ -z "$id" || "$id" == WOULD-CREATE-LABEL:* ]] && continue
    ids+=("$id")
  done
  printf '%s' "$(printf '%s\n' "${ids[@]}" | sort -u | paste -sd, -)"
}

# ============== Mirror ==============

created=0
updated=0
skipped=0

mirror_file() {
  local file=$1 desired_state=$2
  local stack_id title body desired_state_id desired_priority \
        desired_labels_str desired_label_ids full_title

  stack_id=$(basename "$file" .md)
  title=$(grep -m1 '^# ' "$file" | sed 's/^# //' | head -c 200)
  [[ -z "$title" ]] && title="(no title)"
  full_title="${stack_id}: ${title}"

  case "$desired_state" in
    todo) desired_state_id="$STATE_TODO" ;;
    done) desired_state_id="$STATE_DONE" ;;
    *) printf 'unknown desired state: %s\n' "$desired_state" >&2; return 1 ;;
  esac

  desired_priority=$(extract_priority "$file")
  desired_labels_str=$(extract_labels "$file")
  desired_label_ids=$(build_label_ids_csv "$desired_labels_str")
  body=$(build_description "$file" "$desired_state" "$stack_id")

  if [[ -n "${existing_id[$stack_id]:-}" ]]; then
    # Drift detection: compare every tracked field. Description comparison
    # uses the embedded mirror-hash marker because Linear normalizes
    # markdown on store (emphasis tokens, link autolinks).
    local cur_state="${existing_state[$stack_id]}"
    local cur_priority="${existing_priority[$stack_id]}"
    local cur_labels="${existing_labels[$stack_id]}"
    local cur_desc_hash desired_desc_hash
    cur_desc_hash=$(extract_mirror_hash "${existing_description[$stack_id]}")
    desired_desc_hash=$(extract_mirror_hash "$body")

    if [[ "$cur_state" == "$desired_state_id" \
       && "$cur_priority" == "$desired_priority" \
       && "$cur_labels" == "$desired_label_ids" \
       && -n "$cur_desc_hash" \
       && "$cur_desc_hash" == "$desired_desc_hash" ]]; then
      skipped=$((skipped + 1))
      return 0
    fi

    if (( DRY_RUN )); then
      printf 'WOULD UPDATE %s state=%s priority=%s labels=%d-ids\n' \
        "$stack_id" "$desired_state" "$desired_priority" \
        "$(printf '%s' "$desired_label_ids" | tr ',' '\n' | grep -c .)"
      updated=$((updated + 1))
      return 0
    fi

    local payload result label_ids_json
    label_ids_json=$(printf '%s' "$desired_label_ids" \
      | tr ',' '\n' | grep -v '^$' | jq -R . | jq -cs .)
    payload=$(jq -nc \
      --arg id "${existing_id[$stack_id]}" \
      --arg state "$desired_state_id" \
      --arg title "$full_title" \
      --arg desc "$body" \
      --argjson priority "$desired_priority" \
      --argjson labels "$label_ids_json" \
      '{
        query: "mutation($id:String!,$state:String!,$title:String!,$desc:String,$priority:Int,$labels:[String!]){issueUpdate(id:$id,input:{stateId:$state,title:$title,description:$desc,priority:$priority,labelIds:$labels}){success}}",
        variables: {id:$id,state:$state,title:$title,desc:$desc,priority:$priority,labels:$labels}
      }')
    result=$(linear "$payload")
    if echo "$result" | jq -e '.data.issueUpdate.success' >/dev/null; then
      printf 'UPDATED %s -> state=%s pri=%s labels=%d\n' \
        "$stack_id" "$desired_state" "$desired_priority" \
        "$(echo "$label_ids_json" | jq 'length')"
      updated=$((updated + 1))
    else
      printf 'UPDATE FAILED %s: %s\n' "$stack_id" "$result" >&2
    fi
    return 0
  fi

  # Create
  if (( DRY_RUN )); then
    printf 'WOULD CREATE %s state=%s pri=%s labels=%s\n' \
      "$stack_id" "$desired_state" "$desired_priority" "$desired_labels_str"
    created=$((created + 1))
    return 0
  fi
  local payload result label_ids_json
  label_ids_json=$(printf '%s' "$desired_label_ids" \
    | tr ',' '\n' | grep -v '^$' | jq -R . | jq -cs .)
  payload=$(jq -nc \
    --arg team "$TEAM_ID" \
    --arg state "$desired_state_id" \
    --arg title "$full_title" \
    --arg desc "$body" \
    --argjson priority "$desired_priority" \
    --argjson labels "$label_ids_json" \
    '{
      query: "mutation($team:String!,$state:String!,$title:String!,$desc:String,$priority:Int,$labels:[String!]){issueCreate(input:{teamId:$team,stateId:$state,title:$title,description:$desc,priority:$priority,labelIds:$labels}){success issue{identifier}}}",
      variables: {team:$team,state:$state,title:$title,desc:$desc,priority:$priority,labels:$labels}
    }')
  result=$(linear "$payload")
  if echo "$result" | jq -e '.data.issueCreate.success' >/dev/null; then
    local lin_ident
    lin_ident=$(echo "$result" | jq -r '.data.issueCreate.issue.identifier')
    printf 'CREATED %s -> %s pri=%s labels=%d (%s)\n' \
      "$stack_id" "$desired_state" "$desired_priority" \
      "$(echo "$label_ids_json" | jq 'length')" "$lin_ident"
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
