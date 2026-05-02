import Config

config :symphony,
  workflow_path:
    System.get_env("SYMPHONY_WORKFLOW_FILE") ||
      Path.join(File.cwd!(), "WORKFLOW.md"),
  poll_interval_ms: 30_000,
  auto_start_orchestrator?: true,
  # Phoenix LiveView observability dashboard. Default-on for :dev/:prod;
  # explicitly disabled in :test so the existing fast suite isn't slowed
  # by Phoenix endpoint boot.
  dashboard_enabled?: true,
  dashboard_port: 4040,
  dashboard_host: "127.0.0.1",
  dashboard_snapshot_timeout_ms: 15_000

# Spec § 13.3 / § 13.6 dashboard endpoint. We declare the Phoenix endpoint
# at the OTP-app level so `Symphony.Web.Endpoint` can be started by
# `Symphony.HttpServer` without each environment redoing the wiring.
config :symphony, Symphony.Web.Endpoint,
  url: [host: "127.0.0.1"],
  render_errors: [
    formats: [html: Symphony.Web.ErrorHTML, json: Symphony.Web.ErrorJSON],
    layout: false
  ],
  pubsub_server: Symphony.PubSub,
  live_view: [signing_salt: "symphony-live-view"],
  adapter: Bandit.PhoenixAdapter,
  server: false

config :phoenix, :json_library, Jason

import_config "#{config_env()}.exs"
