# Frontend

The first frontend surface should be an internal ops console.

## Stack Default

Use Streamlit for the first implementation unless FastAPI+Jinja2 is needed.

Reasoning:

- Python-first internal tooling aligns with the target role.
- It keeps setup friction low.
- It can read local fixtures directly.
- It lets agents produce screenshots quickly.

## Validation Target

Once the UI exists, add a repeatable validation loop:

1. Start the app in a clean worktree.
2. Capture a screenshot.
3. Trigger a synthetic workflow path.
4. Capture after-state screenshot.
5. Check logs for errors.
6. Re-run until clean.

## Per-Worktree Boot

The ops console is booted through `tools/ops-console/ops-console.sh`, not by
calling Streamlit directly during agent validation.

```bash
tools/ops-console/ops-console.sh start
tools/ops-console/ops-console.sh status
tools/ops-console/ops-console.sh url
tools/ops-console/ops-console.sh stop
```

Runtime files are worktree-local:

- `.symphony/runtime/ops-console-port`
- `.symphony/runtime/ops-console.json`

The JSON runtime record includes `pid`, `port`, `url`, `results_path`, and
`log_path`. Agents should navigate Edge to `tools/ops-console/ops-console.sh
url` or the `url` field in the runtime file, never to a hardcoded global
Streamlit port.

The default app port range is `8501-8599`; override with
`OPS_CONSOLE_PORT_RANGE` when running several worktrees at once. Set
`OPS_CONSOLE_PYTHON` to a venv interpreter when Streamlit is not installed in
system Python. The local non-GUI concurrency smoke is:

```bash
tools/ops-console/smoke.sh
```
