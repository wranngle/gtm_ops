# Orchestrator as a generic runtime

Status: Active
Owner: wranngle
Last reviewed: 2026-05-02

## Frame

The Symphony Elixir daemon at `tools/symphony-elixir/` is **a generic
work-runner**, not a code-fixing loop. The orchestrator's contract makes
no assumption about what a "work item" is, what a "worker" does, or
where the workspace lives. Whether the worker is a coding agent, a CSV
validator, a `terraform plan`, a database backfill, or a video encoder
is a **configuration concern**, expressed entirely in `WORKFLOW.md`.

This doc separates the abstract runtime from any specific application
of it. `tools/dogfood/` (the LLM-driven self-improvement loop) is one
concrete consumer; the orchestrator does not know `tools/dogfood/`
exists. `examples/csv-validator/` is another concrete consumer that
contains zero LLMs and exercises the same orchestrator.

## The four interchangeable parts

The orchestrator wires together four components, each of which can be
swapped without touching the others.

### 1. Tracker — the work queue

A module implementing the `Symphony.Tracker` behaviour. Its only job is
to return a list of `%Symphony.Tracker.Issue{}` records (spec § 4.1.1)
and to confirm state transitions.

Built-in adapters under `tools/symphony-elixir/lib/symphony/tracker/`:

  - `LocalMarkdown` — reads issues from a directory of Markdown files
    (`<root>/todo/`, `<root>/done/`, `<root>/human_review/`). Default.
  - `GitHubIssues` — reads via the `gh` CLI.
  - `Linear` — reads via Linear's GraphQL API.
  - `Memory` — in-process fixture for tests.
  - `Noop` — always returns an empty list (useful for orchestrator
    smoke tests with no real work).

Anything implementing the three callbacks (`fetch_candidate_issues/1`,
`fetch_issues_by_states/2`, `fetch_issue_states_by_ids/2`) is a valid
tracker. A queue could be a Postgres table, a JSONL file streamed from
Kafka, a directory of YAML files watched by `inotify`, an S3 bucket
with object-lifecycle metadata, anything.

### 2. Worker — the thing that does the work

A shell command, configured as `agent.command:` in `WORKFLOW.md`. The
orchestrator runs this command with the workspace as cwd and the issue
identifier interpolated via `{{issue.identifier}}`. The worker can be
anything that exits 0 on success, non-zero on failure:

  - An LLM session (`scripts/bin/llm.sh codex --prompt {{prompt}}`)
  - A bash script (`./validate.sh {{issue.identifier}}`)
  - A Python invocation (`python -m my_package.run --issue {{issue.identifier}}`)
  - A `terraform plan` (`terraform plan -var=issue={{issue.identifier}}`)
  - A `pytest` (`pytest tests/{{issue.identifier}}.py`)
  - A no-op (`true`) — useful for testing tracker state transitions

The orchestrator captures the worker's exit status and stdout/stderr;
it does not interpret the worker's output beyond that.

### 3. Workspace — where the work happens

A directory under `workspace.root` (configured per `WORKFLOW.md`),
named by the issue identifier. The orchestrator creates it, runs hooks
(`after_create`, `before_run`, `after_run`, `before_remove`) per spec
§ 9.4, and tears it down on terminal-state transitions.

Workspaces don't have to be local filesystem paths. The
`Symphony.SSH` module (ported from upstream in phase 1) lays the
groundwork for SSH-fanout dispatch where each worker runs on a remote
host. Future deployments could use ephemeral docker containers,
git worktrees on a separate machine, or Lambda invocations. The
workspace abstraction is "a directory the worker considers its cwd."

### 4. Result — what success means

A 2-tuple: the worker's exit code AND a tracker state transition.

  - Exit 0 + tracker moves issue to `done/` → success
  - Exit 0 + tracker moves issue to `human_review/` → completed but
    needs human review (e.g., a coding agent finished but wants
    eyeballs on the diff)
  - Exit non-zero → orchestrator schedules a retry per spec § 8.4
    (continuation at +1s for clean exits, exponential backoff for
    abnormal exits)

The orchestrator has no opinion on what makes a workload "successful"
beyond exit code + state transition. Whether success means "tests
green," "PR merged," "report generated," "rows backfilled," or "S3
bucket emptied" is a question the worker answers.

## Three example deployments

### A. Coding agent self-improvement loop (`tools/dogfood/`)

  - Tracker: `LocalMarkdown` rooted at `.symphony/issues/`
  - Worker: `scripts/bin/llm.sh` running Claude/Codex/Gemini against
    the issue body
  - Workspace: `.symphony/workspaces/<issue-id>/` (a git worktree of
    this repo)
  - Result: worker exits 0 if validators pass and a PR is opened;
    orchestrator merges and moves to `done/`

This is the application that originally drove the orchestrator design,
and it's the one most heavily exercised. But it's just one
configuration.

### B. CSV validator (`examples/csv-validator/`)

  - Tracker: `LocalMarkdown` rooted at `examples/csv-validator/queue/`
  - Worker: `examples/csv-validator/validate.sh {{issue.identifier}}`
  - Workspace: `examples/csv-validator/workspaces/<issue-id>/` (just
    a scratch dir for any per-issue artifacts)
  - Result: exit 0 if the CSV passes the schema; exit 1 routes to
    `human_review/` with the validator's stderr captured

This deployment has zero LLMs in the loop and zero coupling to this
repo's source tree. It exists to demonstrate that the orchestrator is
a generic runtime — the "agent" is a 30-line bash script that reads
files and `grep`s them.

### C. SSH-fanout (sketch, not yet implemented)

  - Tracker: `Linear` (real production tickets)
  - Worker: a build/test/deploy command run on a remote host via the
    ported `Symphony.SSH.start_port/3`
  - Workspace: `/var/symphony/workspaces/<issue-id>/` on each host;
    `worker.ssh_hosts` config (spec § 8.3) controls fanout
  - Result: per-host parallelism with cross-host concurrency caps

Documented here as the obvious extension once we wire `Symphony.SSH`
into the worker dispatch path. Currently the SSH module is a leaf
function library, not yet plumbed through `Symphony.Orchestrator`.

## What's NOT the orchestrator's concern

  - **Issue authorship.** Whoever populates the tracker (a human, a
    dogfood agent, a cron job, a Linear webhook handler) is upstream
    of the orchestrator.
  - **Success-criterion semantics.** "Did this work?" is the worker's
    answer, not the orchestrator's. The orchestrator only sees exit
    code + state transition.
  - **PR/merge ceremony.** The dogfood loop's "open a PR, watch CI,
    merge on green" flow is implemented in `tools/dogfood/run-tick.sh`
    AROUND the orchestrator, not inside it. Other deployments don't
    need any of that.
  - **Observability stack.** Vector + VictoriaLogs/Metrics/Traces
    under `tools/observability/` consume the orchestrator's structured
    logs but the orchestrator emits ECS-jsonl regardless of whether
    that stack is present.
  - **Secret management.** API keys, Linear tokens, SSH credentials
    live in environment variables resolved per spec § 6.1. The
    orchestrator just reads `$VAR_NAME` indirections from
    `WORKFLOW.md`.

## Running the orchestration environment

The `:orchestration` mix env (`tools/symphony-elixir/config/orchestration.exs`)
boots the orchestrator outside of `:test` mode against whatever
`WORKFLOW.md` is configured. From the repo root:

```bash
export PATH=~/.local/share/mise/shims:$PATH
cd tools/symphony-elixir
SYMPHONY_WORKFLOW_FILE=$(git rev-parse --show-toplevel)/WORKFLOW.md \
  MIX_ENV=orchestration mix run --no-halt
```

This boots the OTP application supervised tree (Logging.Sink,
WorkerSupervisor, WorkflowStore, Orchestrator, Phoenix.PubSub,
HttpServer, Web.Endpoint), polls the configured tracker every
`polling.interval_ms`, and serves the dashboard at
http://127.0.0.1:4044.

`SYMPHONY_WORKFLOW_FILE` is required because `Symphony.Workflow`
resolves the workflow path relative to `File.cwd!()`, and `mix run`'s
cwd is `tools/symphony-elixir/`. Different deployments point at
different `WORKFLOW.md` files; the orchestration config doesn't bake one in.

## Spec mapping

Every component above maps to a numbered Symphony spec section so
this doc stays anchored to the upstream contract:

  - Tracker behaviour: § 11
  - Issue model: § 4.1.1
  - Worker contract / agent.command: § 10.7 (agent runner) + § 5.3
  - Workspace lifecycle: § 9 (especially § 9.4 hooks, § 9.5 safety)
  - State machine: § 7
  - Polling / dispatch: § 8
  - Retry / backoff: § 8.4
  - Reconciliation: § 8.5
  - Snapshot / dashboard: § 13.3, § 13.6

Intentional deviations from upstream live in
`docs/references/symphony-orchestration.md`.
