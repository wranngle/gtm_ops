---
id: STACK-006
priority: 2
labels: stack,demo,dotfiles,hero
blocked_by:
---
# Regenerate demo/cassette.gif and hero.{gif,webp} with the new cassette

`demo/cassette.tape` was upgraded so it now demonstrates the real local validation loop instead of typing one command and freezing. The rendered artifacts (`demo/cassette.gif`, `demo/hero.gif`, `demo/hero.webp`) still reflect the old cassette. They cannot be regenerated from a code-only change because `scripts/hero.sh` shells out to Docker (`ghcr.io/charmbracelet/vhs`) and ffmpeg.

Acceptance criteria:

- A devbox with Docker + ffmpeg available runs `scripts/hero.sh demo/cassette.tape`.
- The resulting `demo/cassette.gif` shows three commands actually executing: `scripts/validate-knowledge-base.sh`, `scripts/symphony.sh once --dry-run --limit 1`, `scripts/symphony.sh list`.
- `demo/hero.gif` <= 5 MB (the script warns above 5 MB), `demo/hero.webp` exists.
- Confirm `.gitignore` is keeping the rendered binaries out of git unless we deliberately commit a small static hero asset for the README.
- If we keep the rendered output as an in-repo asset, decide on a single canonical filename and reference it from `README.md`.
- `scripts/validate-knowledge-base.sh` continues to pass.
