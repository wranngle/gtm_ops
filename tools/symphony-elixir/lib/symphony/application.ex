defmodule Symphony.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = build_children()

    opts = [strategy: :one_for_one, name: Symphony.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # Supervision tree (boot order matters; spec §§ 6.2, 7, 8 wiring):
  #
  #   1. Symphony.Logging.Sink           — log sink for ECS-jsonl events
  #   2. Symphony.WorkerSupervisor       — Task.Supervisor for run-attempt workers
  #   3. Symphony.WorkflowStore          — file watcher + cached workflow
  #   4. Symphony.Orchestrator           — scheduling brain
  #   5. Phoenix.PubSub (Symphony.PubSub) — observability fan-out (gated)
  #   6. Symphony.HttpServer             — Phoenix LiveView dashboard endpoint (gated)
  #
  # `auto_start_orchestrator?` = false (test env) skips both the
  # WorkflowStore and the Orchestrator so test helpers can boot
  # them on demand with synthetic fixtures.
  #
  # `dashboard_enabled?` (default true in :dev/:prod, false in :test) gates
  # the optional spec § 13.3 / § 13.6 surface — Phoenix.PubSub +
  # Symphony.HttpServer + Symphony.Web.Endpoint. When off, the dashboard
  # never opens a port and the pubsub broadcaster no-ops gracefully.
  defp build_children do
    # The WorkerSupervisor (a `Task.Supervisor`) is always started, even
    # in test mode where the orchestrator is started on demand. Spawning
    # workers under a fixed-name supervisor decouples the orchestrator's
    # lifecycle from the worker pool: the orchestrator can be restarted
    # without orphaning live worker tasks.
    base = [
      {Symphony.Logging.Sink, [sink: default_sink()]},
      {Task.Supervisor, name: Symphony.WorkerSupervisor}
    ]

    base
    |> Kernel.++(orchestrator_children())
    |> Kernel.++(dashboard_children())
  end

  defp orchestrator_children do
    if Application.get_env(:symphony, :auto_start_orchestrator?, true) do
      workflow_store_children() ++ [{Symphony.Orchestrator, []}]
    else
      []
    end
  end

  defp workflow_store_children do
    if Application.get_env(:symphony, :workflow_store_enabled?, true) do
      [{Symphony.WorkflowStore, []}]
    else
      []
    end
  end

  # Spec § 13.3 / § 13.6 dashboard supervision children. The PubSub server
  # is registered under the well-known name `Symphony.PubSub` so the
  # presenter and the LiveView can subscribe without hardcoding pid lookup.
  defp dashboard_children do
    if dashboard_enabled?() do
      [
        {Phoenix.PubSub, name: Symphony.PubSub},
        {Symphony.HttpServer, []}
      ]
    else
      []
    end
  end

  defp dashboard_enabled? do
    Application.get_env(:symphony, :dashboard_enabled?, false)
  end

  # The default sink is configurable per environment so callers don't have
  # to remember to invoke `Symphony.Logging.Sink.configure/1` on boot. The
  # `:prod` environment defaults to a multi sink that fans out to stderr
  # AND a JSONL file under `.symphony/logs/symphony-elixir.jsonl`, which
  # is the path the local Vector config tails. `:dev` and `:test` keep
  # the historical `:stderr`-only behavior so test capture still works.
  #
  # Override via runtime config:
  #
  #     config :symphony, :logging_sink, {:file, "/var/log/symphony.jsonl"}
  #     config :symphony, :logging_sink, :stderr
  #     config :symphony, :logging_sink, {:multi, [:stderr, {:file, "..."}]}
  #
  # Or via env var: `SYMPHONY_LOG_FILE=/abs/path` upgrades the default
  # sink to `{:multi, [:stderr, {:file, $SYMPHONY_LOG_FILE}]}` regardless
  # of the configured environment.
  defp default_sink do
    explicit = Application.get_env(:symphony, :logging_sink)
    env_file = System.get_env("SYMPHONY_LOG_FILE")

    cond do
      not is_nil(explicit) -> explicit
      is_binary(env_file) and env_file != "" -> {:multi, [:stderr, {:file, env_file}]}
      true -> :stderr
    end
  end
end
