import Config

# In :test we keep both the orchestrator AND the dashboard OFF by default.
# Tests that need either boot them on demand with synthetic fixtures.
config :symphony,
  auto_start_orchestrator?: false,
  poll_interval_ms: 60_000,
  dashboard_enabled?: false,
  dashboard_port: 0

config :symphony, Symphony.Web.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 0],
  server: false,
  secret_key_base: "test-secret-key-base-must-be-at-least-64-bytes-long-symphony-elixir-test-env"

config :logger, level: :debug
