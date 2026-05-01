import Config

config :symphony,
  auto_start_orchestrator?: false,
  poll_interval_ms: 60_000

config :logger, level: :debug
