# dogfood

The self-feeding stack-improvement loop. Each tick:

1. Picks the next unblocked Symphony issue (highest priority, mtime past
   the race-guard window so parallel auditors can finish filing without
   getting stomped on).
2. Dispatches it via `scripts/symphony.sh once --limit 1` with a tight
   LLM chain (Claude Haiku 4.5 → Sonnet 4.6 by default).
3. Runs every validator the harness owns — the bash syntax check,
   knowledge-base validator, layered-architecture lint, Symphony validate
   + dry-run, and the per-language test suites for whatever trees the
   agent touched.
4. If green: commits + pushes to `main`, moves the issue to
   `.symphony/issues/done/`.
   If red: moves the issue to `.symphony/issues/human_review/` with the
   validator log saved next to it.
5. Scans the agent's output for `- TODO(followup): <text>` lines and
   files each as a new `STACK-NNN.md` so the loop stays fed.

## Run

Single tick:

```bash
tools/dogfood/run-tick.sh
```

Dry run (everything except the real LLM dispatch):

```bash
DOGFOOD_DRY_RUN=1 tools/dogfood/run-tick.sh
```

Override the chain or timeout:

```bash
DOGFOOD_LLM_CHAIN=claude:claude-sonnet-4-6 DOGFOOD_LLM_TIMEOUT=300 \
  tools/dogfood/run-tick.sh
```

## Env knobs

| Var | Default | Purpose |
|---|---|---|
| `DOGFOOD_LLM_CHAIN` | `claude:claude-haiku-4-5,claude:claude-sonnet-4-6` | passes through to `scripts/bin/llm.sh` `LLM_CHAIN` |
| `DOGFOOD_LLM_TIMEOUT` | `180` | per-call timeout (seconds) for the chain |
| `DOGFOOD_MIN_AGE_SECONDS` | `300` | minimum mtime age (seconds) before an issue is eligible — race guard against parallel auditors filing fresh STACK-NNN files |
| `DOGFOOD_DRY_RUN` | `0` | if `1`, picks an issue and runs the dry-run path; never invokes the real LLM, never commits |
| `DOGFOOD_FOLLOWUP_PREFIX` | `STACK` | prefix used when filing follow-up issues |
| `SYMPHONY_WORKFLOW_FILE` | repo `WORKFLOW.md` | passed through to `scripts/symphony.sh` |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | tick completed (issue closed and pushed, OR backlog empty) |
| 1 | dirty working tree — refused to dispatch (operator action) |
| 2 | dispatch ran but validators failed; issue moved to `human_review/` |
| 3 | no eligible issue this tick (backlog empty or all too fresh) |

## How the loop compounds

The output of each tick feeds the next:

- **Validator-driven repair**: every commit improves the surface (better
  lint coverage, more tests, stricter docs). The next tick benefits.
- **Follow-up extraction**: agents are encouraged to leave
  `- TODO(followup): <task>` markers in their output for things they
  noticed but couldn't fix in scope. Each marker becomes a new STACK
  issue.
- **Throughput growth**: as the Symphony Elixir daemon's spec coverage
  fills in (TD-007 follow-on slices), dispatch becomes spec-faithful and
  parallelizable. The bash adapter is single-shot; the daemon will
  process many tasks per minute.

## Observability

Each tick emits ECS-jsonl events to `.symphony/logs/dogfood.jsonl`,
which Vector tails into VictoriaLogs. Sample LogsQL:

```bash
curl -fsS 'http://127.0.0.1:9428/select/logsql/query' \
  --data-urlencode 'query=service.name:"wranngle-dogfood" | last 50'
```

## Scheduling

The repo runs the loop via `CronCreate` in the active Claude Code
session (the cron prompt invokes this script). For durable, cross-session
scheduling, use `/schedule` to register a cloud cron that runs
`tools/dogfood/run-tick.sh` against the same repo.

## Stop conditions

- Backlog empty: tick exits 3, cron fires next interval to re-check.
- Tree dirty: tick exits 1; an operator must look at the dirty paths
  before the loop can resume.
- Validators failed: tick exits 2 and moves the issue to `human_review/`
  for triage; loop continues with the next issue.

## Hard rules

- Only acts on issues older than `DOGFOOD_MIN_AGE_SECONDS` (default 5min)
  to avoid colliding with concurrent audit workers filing STACK issues.
- Never `git restore .` or `git reset --hard` to clean up dirty state —
  that would discard owner work. Refuses to dispatch instead.
- Never picks issues whose `blocked=yes`.
- Never picks issues outside `.symphony/issues/todo/`.
- Skip-list: `.symphony/issues/todo/WGTE-001.md` is the showcase project
  task and is owner-blocked; the dogfood runner does not pick it
  (filtered by `STACK-` prefix when sorting; if you want WGTE-001 to be
  picked up, set `DOGFOOD_FOLLOWUP_PREFIX` to `""` and remove the
  prefix-filter).
