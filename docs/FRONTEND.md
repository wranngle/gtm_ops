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

