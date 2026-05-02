import Config

# Dev environment: keep the orchestrator on by default so plain
# `mix run --no-halt` actually polls and dispatches without extra flags.
# Previously this file was empty and inherited the compile-time default
# from `config.exs`; the explicit setting documents the intent.
config :symphony,
  auto_start_orchestrator?: true,
  poll_interval_ms: 30_000
