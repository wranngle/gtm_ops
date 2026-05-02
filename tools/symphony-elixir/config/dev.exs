import Config

# Dev environment: keep the orchestrator on by default so plain
# `mix run --no-halt` actually polls and dispatches without extra flags.
# Previously this file was empty and inherited the compile-time default
# from `config.exs`; the explicit setting documents the intent.
config :symphony,
  auto_start_orchestrator?: true,
  poll_interval_ms: 30_000,
  dashboard_enabled?: true

config :symphony, Symphony.Web.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4040],
  server: true,
  secret_key_base: "dev-secret-key-base-must-be-at-least-64-bytes-long-symphony-elixir-dev",
  debug_errors: true,
  check_origin: false
