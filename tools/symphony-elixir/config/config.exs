import Config

config :symphony,
  workflow_path:
    System.get_env("SYMPHONY_WORKFLOW_FILE") ||
      Path.join(File.cwd!(), "WORKFLOW.md"),
  poll_interval_ms: 30_000,
  auto_start_orchestrator?: true

import_config "#{config_env()}.exs"
