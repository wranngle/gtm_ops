---
id: STACK-074
priority: 2
labels: cli,escript,performance,bug
---
# Escript boots the Phoenix endpoint for every subcommand

## Problem

`bin/symphony validate`, `bin/symphony list`, and `bin/symphony once` all boot the full Phoenix LiveView endpoint (Bandit listener on `127.0.0.1:4040`) even though those subcommands have no need for HTTP. Observable side-effects:

1. ~500ms startup overhead per invocation (Phoenix endpoint boot + LiveView compile).
2. Hard failure when port 4040 is already taken — e.g. by a parallel `mix run --no-halt` session, a developer's existing dashboard, or a previous escript invocation that didn't fully release the port:
   ```
   [error] Running Symphony.Web.Endpoint with Bandit 1.11.0 at http failed, port 4040 already in use
   [notice] Application symphony exited: ...failed to start child: Symphony.HttpServer
       ** (EXIT) :eaddrinuse
   ```
   The CLI then refuses to run any subcommand at all, including ones that don't need HTTP.
3. Bind churn — every `symphony list` in a script loop binds and unbinds 4040.

Only `symphony serve` should boot the dashboard.

## Fix sketch

Move the Phoenix endpoint + `Symphony.HttpServer` out of the unconditional supervision tree. `Symphony.Application.start/2` already gates on `:auto_start_orchestrator?` for the orchestrator; do the same for the dashboard:

1. Add a config key `:dashboard_autostart?` (separate from `:dashboard_enabled?`). Default true in `:dev`/`:prod`, false in `:test`.
2. In the escript path, set `Application.put_env(:symphony, :dashboard_autostart?, false)` BEFORE the OTP app starts; only re-enable for the `serve` subcommand.
3. `Symphony.CLI.serve/1` then explicitly starts the endpoint via `Symphony.HttpServer.start_link/1` (or via supervised child spec).

## Acceptance criteria

- `time bin/symphony validate` completes in <300ms on a warm cache.
- `bin/symphony validate` succeeds even when port 4040 is occupied by another process.
- `bin/symphony serve` still boots the dashboard at `127.0.0.1:4040` and renders.
- A test in `test/symphony/cli_test.exs` asserts no Phoenix endpoint is running after `validate`/`list`/`once`.
