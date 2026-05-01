defmodule Symphony.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children =
      [
        {Symphony.Logging.Sink, [sink: :stderr]}
      ] ++
        if Application.get_env(:symphony, :auto_start_orchestrator?, true) do
          [{Symphony.Orchestrator, []}]
        else
          []
        end

    opts = [strategy: :one_for_one, name: Symphony.Supervisor]
    Supervisor.start_link(children, opts)
  end
end
