import Config

config :logger, :default_handler,
  formatter: {Logger.Formatter, [colors: [enabled: false]]}

config :symphony,
  workflow_path:
    System.get_env("SYMPHONY_WORKFLOW_FILE") ||
      Path.join(File.cwd!(), "WORKFLOW.md"),
  poll_interval_ms: 30_000
