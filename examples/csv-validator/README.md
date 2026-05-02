# CSV-validator demo: orchestrator-as-runtime, no LLMs

This directory is a self-contained workload for the Symphony orchestrator
that has **zero coupling to coding agents** and **zero LLMs in the loop**.
It exists to demonstrate that the orchestrator under
`tools/symphony-elixir/` is a generic work-runner, not a self-improvement
loop. The "agent" is a 30-line bash script that reads a CSV file and
checks a schema.

See `docs/references/orchestrator-as-runtime.md` for the broader framing.

## What's here

```
examples/csv-validator/
├── WORKFLOW.md           # tracker + workspace + agent.command config
├── validate.sh           # the worker (a bash script)
├── data/                 # CSV fixtures referenced by issues
│   ├── CSV-001.csv       # clean
│   ├── CSV-002.csv       # bad email
│   └── CSV-003.csv       # bad age
├── queue/                # local_markdown tracker root
│   ├── todo/             # CSV-001..003 markdown issue files
│   ├── in_progress/
│   ├── done/
│   └── human_review/
└── workspaces/           # orchestrator scratch (gitignored)
```

## How it maps to the orchestrator's four parts

| Part | Concrete value here |
|---|---|
| Tracker | `local_markdown` adapter rooted at `examples/csv-validator/queue/` |
| Worker | `bash examples/csv-validator/validate.sh {{issue.identifier}}` |
| Workspace | `examples/csv-validator/workspaces/<id>/` |
| Result | exit 0 → `done/`; exit 1 → `human_review/` |

## Run it

From the repo root:

```bash
export PATH=~/.local/share/mise/shims:$PATH
cd tools/symphony-elixir
SYMPHONY_WORKFLOW_FILE=$(git rev-parse --show-toplevel)/examples/csv-validator/WORKFLOW.md \
  MIX_ENV=orchestration mix run --no-halt
```

The orchestrator boots, polls the queue every 5 seconds, picks up
CSV-001 / CSV-002 / CSV-003, runs `validate.sh` for each, observes the
exit code, and transitions the issue accordingly.

Watch the dashboard at http://127.0.0.1:4044 for live progress, or tail
the structured logs on stderr.

## Try it without booting the orchestrator

`validate.sh` is independently runnable. From the repo root:

```bash
bash examples/csv-validator/validate.sh CSV-001  # exits 0
bash examples/csv-validator/validate.sh CSV-002  # exits 1
bash examples/csv-validator/validate.sh CSV-003  # exits 1
```

This is a useful sanity check before wiring in the orchestrator.

## What this demo proves

- The orchestrator runs **any workload**, not just LLM coding agents.
- The "tracker" is just a directory of Markdown files; nothing about
  the queue's content is orchestrator-specific.
- The "worker" is a 30-line bash script with one argument; nothing
  about how the work gets done is orchestrator-specific.
- Success / failure is purely a worker exit code; the orchestrator
  has no opinion on what success means.
- A non-code workload can run in the same repo without colliding with
  `tools/dogfood/` or `.symphony/issues/` (the issue queue lives
  inside this directory; the workspace root lives inside this
  directory; there's nothing global).
