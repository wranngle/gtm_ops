import Config

# Dogfood environment: lights everything up so a single `mix run --no-halt`
# (or `iex -S mix`) boots the orchestrator against the real local-Markdown
# tracker rooted at `.symphony/issues/`. This env exists so we can dogfood
# the daemon on the parked test backlog without polluting the :dev or :test
# defaults; :test stays headless and :dev picks the same port (4040), which
# can collide with a running dashboard. Dogfood deliberately uses 4044.
#
# Usage (from the repo root):
#   export PATH=~/.local/share/mise/shims:$PATH
#   cd tools/symphony-elixir
#   SYMPHONY_WORKFLOW_FILE=$(git rev-parse --show-toplevel)/WORKFLOW.md \
#     MIX_ENV=dogfood mix run --no-halt
#
# `SYMPHONY_WORKFLOW_FILE` is required because `Symphony.Workflow` resolves
# the workflow path relative to `File.cwd!()`, and `mix run` runs from
# `tools/symphony-elixir/`. The repo-root `WORKFLOW.md` is the contract.
config :symphony,
  auto_start_orchestrator?: true,
  poll_interval_ms: 30_000,
  dashboard_enabled?: true,
  dashboard_port: 4044,
  dashboard_host: "127.0.0.1",
  dashboard_snapshot_timeout_ms: 15_000,
  # Foreground dogfooding wants logs on stderr by default so the operator
  # can watch ticks scroll by. Override with `SYMPHONY_LOG_FILE=/abs/path`
  # to also persist to disk; we deliberately avoid a default file sink
  # because `mix run`'s cwd is `tools/symphony-elixir/` (a relative
  # `.symphony/logs/` path would write to a tracked subtree, not the
  # repo-root ignored one).
  logging_sink: :stderr

config :symphony, Symphony.Web.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4044],
  server: true,
  secret_key_base:
    "dogfood-secret-key-base-must-be-at-least-64-bytes-long-symphony-elixir-dogfood-env",
  debug_errors: true,
  check_origin: false

config :logger, level: :info
