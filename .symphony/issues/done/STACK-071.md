---
id: STACK-071
priority: 3
labels: stack,observability,worktree,docker-compose
blocked_by:
---
# Add a per-worktree namespace verification harness for the observability stack

The Harness Engineering post specifies that "Codex works on a fully isolated version of that app — including its logs and metrics, which get torn down once that task is complete." The current `tools/observability/docker-compose.yml` honors `${OBSERVABILITY_PROJECT}` for project name, container names, network names, and volume names — verified manually with `OBSERVABILITY_PROJECT=test-ns docker compose -p test-ns config | grep -E "(name|container_name)"` — but there is no automated test that prevents a future change from regressing one of those four.

## Why now

When agents start working in worktrees, multiple stacks will run in parallel. A regression where one of the four namespacing surfaces silently leaks (e.g., a hardcoded `wranngle-obs-vector` in a new sink config) would cause two stacks to share a single VictoriaLogs volume, with nigh-impossible-to-debug consequences ("my logs are missing" / "I see logs from the other agent's task").

## Acceptance criteria

- New `tools/observability/test-namespace-isolation.sh` that:
  1. Picks two random project names (e.g., `obs-test-a-$$` and `obs-test-b-$$`).
  2. Runs `docker compose -p $a config` and `docker compose -p $b config` for each.
  3. Asserts that EVERY one of these surfaces is namespaced and unique across the two:
     - Compose project `name:`
     - Each service's `container_name:`
     - Every `network` `name:`
     - Every `volume` `name:`
  4. Fails loudly if any name appears in BOTH outputs.
- The script is wired into `scripts/validate-knowledge-base.sh` as a fast-path check (no docker daemon required — `docker compose config` is local).
- A README section in `tools/observability/README.md` documents how to run the script and what it prevents.

## Out of scope

- Actually starting two stacks in parallel and asserting they don't collide at runtime; that requires a docker daemon in CI and is a follow-up. The static `docker compose config`-level check is enough to catch the most common regressions.
- Verifying that bind mounts in the `vector` service also namespace correctly. The bind mount points at the repo root by design (`${REPO_ROOT:-../..}:/repo:ro`), and worktree isolation is provided by the worktree itself, not by docker.

## References

- `tools/observability/docker-compose.yml` — current namespacing surfaces
- `docs/references/openai_harness_engineering_original_spec.txt` lines 49-51 ("ephemeral for any given worktree")

## Completion note

Added `tools/observability/test-namespace-isolation.sh`, documented the
static check, and wired it into `scripts/validate-knowledge-base.sh` when
Docker Compose is available. The full knowledge-base validation now passes
with the generated layer inventory present.
