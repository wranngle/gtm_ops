defmodule Symphony.Web.Router do
  @moduledoc """
  Router for Symphony's observability dashboard (spec § 13.3, § 13.6).
  """

  use Phoenix.Router
  import Phoenix.LiveView.Router

  pipeline :browser do
    plug(:fetch_session)
    plug(:fetch_live_flash)
    plug(:put_root_layout, html: {Symphony.Web.Layouts, :root})
    plug(:protect_from_forgery)
    plug(:put_secure_browser_headers)
  end

  scope "/", Symphony.Web do
    get("/dashboard.css", StaticAssetController, :dashboard_css)
    get("/vendor/phoenix_html/phoenix_html.js", StaticAssetController, :phoenix_html_js)
    get("/vendor/phoenix/phoenix.js", StaticAssetController, :phoenix_js)

    get(
      "/vendor/phoenix_live_view/phoenix_live_view.js",
      StaticAssetController,
      :phoenix_live_view_js
    )
  end

  scope "/", Symphony.Web do
    pipe_through(:browser)

    live("/", Live.DashboardLive, :index)
  end

  scope "/api", Symphony.Web do
    get("/snapshot", ObservabilityApiController, :snapshot)
    match(:*, "/snapshot", ObservabilityApiController, :method_not_allowed)
    get("/v1/state", ObservabilityApiController, :snapshot)
    match(:*, "/v1/state", ObservabilityApiController, :method_not_allowed)
    post("/v1/refresh", ObservabilityApiController, :refresh)
    match(:*, "/v1/refresh", ObservabilityApiController, :method_not_allowed)
    get("/v1/:issue_identifier", ObservabilityApiController, :issue)
    match(:*, "/v1/:issue_identifier", ObservabilityApiController, :method_not_allowed)
    match(:*, "/*path", ObservabilityApiController, :not_found)
  end

  # Catch non-GET methods on `/` (the LiveView dashboard handles GET) and
  # return the upstream-compatible 405 JSON body instead of Phoenix's
  # default not-found page (per spec § 13.3 + upstream extensions_test).
  scope "/", Symphony.Web do
    match(:*, "/", ObservabilityApiController, :method_not_allowed)
  end
end
