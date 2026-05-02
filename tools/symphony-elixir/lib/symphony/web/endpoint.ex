defmodule Symphony.Web.Endpoint do
  @moduledoc """
  Phoenix endpoint for Symphony's optional observability UI and API
  (spec § 13.3, § 13.6).

  Configuration is sourced from `:symphony, Symphony.Web.Endpoint, ...`.
  In production / dev `Symphony.HttpServer` boots this endpoint with
  runtime ip/port overrides; in test mode we leave `server: false` so
  `mix test` doesn't open a listening socket unless a test explicitly
  starts it.
  """

  use Phoenix.Endpoint, otp_app: :symphony

  @session_options [
    store: :cookie,
    key: "_symphony_key",
    signing_salt: "symphony-session"
  ]

  socket("/live", Phoenix.LiveView.Socket,
    websocket: [connect_info: [session: @session_options]],
    longpoll: false
  )

  plug(Plug.RequestId)
  plug(Plug.Telemetry, event_prefix: [:phoenix, :endpoint])

  plug(Plug.Parsers,
    parsers: [:urlencoded, :multipart, :json],
    pass: ["*/*"],
    json_decoder: Jason
  )

  plug(Plug.MethodOverride)
  plug(Plug.Head)
  plug(Plug.Session, @session_options)
  plug(Symphony.Web.Router)
end
