defmodule Symphony.MixProject do
  use Mix.Project

  def project do
    [
      app: :symphony,
      version: "0.0.1",
      elixir: "~> 1.19",
      compilers: [:phoenix_live_view] ++ Mix.compilers(),
      start_permanent: Mix.env() == :prod,
      test_coverage: [
        summary: [
          threshold: 100
        ],
        ignore_modules: [
          Symphony.Config,
          Symphony.Tracker.Linear.Client,
          Symphony.SpecsCheck,
          Symphony.Orchestrator,
          Symphony.Orchestrator.State,
          Symphony.AgentRunner,
          Symphony.AgentRunner.LocalShell,
          Symphony.AgentRunner.CodexAppServer,
          Symphony.CLI,
          Symphony.Codex.AppServer,
          Symphony.Codex.DynamicTool,
          Symphony.HttpServer,
          Symphony.StatusDashboard,
          Symphony.LogFile,
          Symphony.WorkspaceManager,
          Symphony.Web.DashboardLive,
          Symphony.Web.Endpoint,
          Symphony.Web.ErrorHTML,
          Symphony.Web.ErrorJSON,
          Symphony.Web.Layouts,
          Symphony.Web.ObservabilityApiController,
          Symphony.Web.Presenter,
          Symphony.Web.StaticAssetController,
          Symphony.Web.StaticAssets,
          Symphony.Web.Router,
          Symphony.Web.Router.Helpers
        ]
      ],
      test_ignore_filters: [
        "test/support/snapshot_support.exs",
        "test/support/test_support.exs"
      ],
      dialyzer: [
        plt_add_apps: [:mix]
      ],
      escript: escript(),
      aliases: aliases(),
      deps: deps(),
      elixirc_paths: elixirc_paths(Mix.env())
    ]
  end

  def application do
    [
      mod: {Symphony.Application, []},
      extra_applications: [:crypto, :logger]
    ]
  end

  defp deps do
    [
      {:bandit, "~> 1.8"},
      {:floki, ">= 0.30.0", only: :test},
      {:lazy_html, ">= 0.1.0", only: :test},
      {:phoenix, "~> 1.8.0"},
      {:phoenix_html, "~> 4.2"},
      {:phoenix_live_view, "~> 1.1.0"},
      {:req, "~> 0.5"},
      {:jason, "~> 1.4"},
      {:yaml_elixir, "~> 2.12"},
      {:solid, "~> 1.2"},
      {:ecto, "~> 3.13"},
      {:credo, "~> 1.7", only: [:dev, :test], runtime: false},
      {:dialyxir, "~> 1.4", only: [:dev], runtime: false}
    ]
  end

  defp aliases do
    [
      setup: ["deps.get"],
      build: ["escript.build"],
      lint: ["specs.check", "credo --strict"]
    ]
  end

  defp escript do
    [
      app: nil,
      main_module: Symphony.CLI,
      name: "symphony",
      path: "bin/symphony"
    ]
  end

  defp elixirc_paths(:test), do: ["lib", "test/support"]
  defp elixirc_paths(_), do: ["lib"]
end
