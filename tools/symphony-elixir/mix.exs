defmodule Symphony.MixProject do
  use Mix.Project

  def project do
    [
      app: :symphony,
      version: "0.0.1",
      elixir: "~> 1.15",
      start_permanent: Mix.env() == :prod,
      compilers: Mix.compilers(),
      deps: deps(),
      elixirc_paths: elixirc_paths(Mix.env()),
      escript: escript()
    ]
  end

  def application do
    [
      extra_applications: [:crypto, :logger],
      mod: {Symphony.Application, []}
    ]
  end

  defp deps do
    [
      {:yaml_elixir, "~> 2.11"},
      {:jason, "~> 1.4"},
      # Liquid-compatible template engine (Symphony spec § 12)
      {:solid, "~> 1.2"},
      # HTTP client for tracker adapters (Linear GraphQL, gh CLI fallback)
      {:req, "~> 0.5"},
      # Optional Phoenix LiveView observability dashboard (spec § 13.3,
      # § 13.6). Enabled via :symphony, :dashboard_enabled? config (default
      # true in :dev/:prod, false in :test).
      {:phoenix, "~> 1.8.0"},
      {:phoenix_html, "~> 4.2"},
      {:phoenix_live_view, "~> 1.1.0"},
      {:bandit, "~> 1.8"},
      # LiveView 1.1+ requires lazy_html as a test dep for `live/2` mount
      # helpers (tested via Symphony.Web.Live.DashboardLiveTest).
      {:lazy_html, ">= 0.1.0", only: :test}
    ]
  end

  defp escript do
    [
      main_module: Symphony.CLI,
      name: "symphony",
      path: "bin/symphony",
      app: nil
    ]
  end

  defp elixirc_paths(:test), do: ["lib", "test/support"]
  defp elixirc_paths(_), do: ["lib"]
end
