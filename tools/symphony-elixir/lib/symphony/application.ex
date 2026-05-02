defmodule Symphony.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children =
      [
        {Symphony.Logging.Sink, [sink: default_sink()]}
      ] ++
        if Application.get_env(:symphony, :auto_start_orchestrator?, true) do
          [{Symphony.Orchestrator, []}]
        else
          []
        end

    opts = [strategy: :one_for_one, name: Symphony.Supervisor]
    Supervisor.start_link(children, opts)
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
